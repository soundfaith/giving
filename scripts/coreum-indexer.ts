import process from 'node:process'
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { createClient } from '@supabase/supabase-js'

const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const contractAddress = process.env.COREUM_DONATION_CONTRACT
const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const cursorId = `coreum-${process.env.COREUM_NETWORK ?? 'testnet'}-donations`
const pollMs = Number(process.env.COREUM_INDEXER_POLL_MS ?? 10_000)
const runOnce = process.env.COREUM_INDEXER_ONCE === '1'

if (!contractAddress) throw new Error('COREUM_DONATION_CONTRACT is missing')
if (!supabaseUrl || !serviceRoleKey) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
const configuredContractAddress = contractAddress

const chain = await CosmWasmClient.connect(rpcUrl)
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

type ChainEvent = { type: string; attributes: Array<{ key: string; value: string }> }
type IndexedTransaction = { hash: string; height: number; events: ChainEvent[] }

function value(events: ChainEvent[], key: string) {
  for (const event of events) {
    const attribute = event.attributes.find((item) => item.key === key)
    if (attribute) return attribute.value
  }
  return undefined
}

async function readCursor() {
  const { data, error } = await supabase.from('indexer_state').select('last_height').eq('id', cursorId).maybeSingle()
  if (error) throw error
  return Number(data?.last_height ?? process.env.COREUM_INDEXER_START_HEIGHT ?? 0)
}

async function saveCursor(height: number) {
  const { error } = await supabase.from('indexer_state').upsert({ id: cursorId, last_height: height, updated_at: new Date().toISOString() })
  if (error) throw error
}

async function notifyReadyClaims() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, chain_project_id, submitted_by, title')
    .not('submitted_by', 'is', null)
  if (error) throw error
  const now = Math.floor(Date.now() / 1000)
  for (const project of projects ?? []) {
    const response = await chain.queryContractSmart(configuredContractAddress, { project: { project_id: project.chain_project_id ?? `soundfaith:${project.id}` } }) as { project?: { status?: string; unstaking_started_at?: number | null; unbonding_seconds?: number } }
    const onChain = response.project
    if (onChain?.status?.toLowerCase() !== 'unstaking' || onChain.unstaking_started_at == null) continue
    const readyAt = Number(onChain.unstaking_started_at) + Number(onChain.unbonding_seconds ?? 0)
    if (now < readyAt) continue
    const { data: existing, error: existingError } = await supabase.from('notifications').select('id').eq('user_id', project.submitted_by).eq('project_id', project.id).eq('kind', 'claim_ready').limit(1)
    if (existingError) throw existingError
    if (existing?.length) continue
    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: project.submitted_by,
      kind: 'claim_ready',
      project_id: project.id,
      title: 'Your funds are ready',
      message: `${project.title} is ready to claim. Open the project and select Claim funds.`,
    })
    if (notificationError) throw notificationError
  }
}

async function indexDonations() {
  await notifyReadyClaims()
  const lastHeight = await readCursor()
  const transactions = await chain.searchTx([{ key: 'wasm._contract_address', value: configuredContractAddress }]) as unknown as IndexedTransaction[]
  const candidates = transactions
    .filter((tx) => tx.height > lastHeight)
    .sort((left, right) => left.height - right.height)

  for (const transaction of candidates) {
    const donationEvent = transaction.events.find((event) => event.type === 'wasm' && value([event], 'action') === 'donation_received')
    if (!donationEvent) {
      await saveCursor(transaction.height)
      continue
    }

    const projectId = value([donationEvent], 'project_id')
    const donorAddress = value([donationEvent], 'donor_address')
    const amountMicroTx = value([donationEvent], 'amount_microtx') ?? value([donationEvent], 'amount')
    if (!projectId || !donorAddress || !amountMicroTx) throw new Error(`Donation event ${transaction.hash} is missing required attributes`)

    const { data: project } = await supabase.from('projects').select('id, chain_project_id').or(`id.eq.${projectId},chain_project_id.eq.${projectId}`).maybeSingle()
    if (!project) {
      console.warn(`Skipping donation ${transaction.hash}: project ${projectId} no longer exists`)
      await saveCursor(transaction.height)
      continue
    }

    const { data: profile } = await supabase.from('profiles').select('id').eq('wallet_address', donorAddress).maybeSingle()
    const { data: walletProfile } = profile
      ? { data: null }
      : await supabase.from('profile_wallets').select('user_id').eq('wallet_address', donorAddress).maybeSingle()
    const { data: rate, error: rateError } = await supabase.from('tx_exchange_rates').select('tx_usd_rate').eq('id', true).single()
    if (rateError) throw rateError
    const amountTx = Number(amountMicroTx) / 1_000_000
    const txUsdRate = Number(rate.tx_usd_rate)

    const { error } = await supabase.from('donations').upsert({
      project_id: projectId,
      profile_id: profile?.id ?? walletProfile?.user_id ?? null,
      wallet_address: donorAddress,
      amount_tx: amountTx,
      tx_usd_rate: txUsdRate,
      amount_usd: amountTx * txUsdRate,
      tx_hash: transaction.hash,
      network: process.env.COREUM_NETWORK === 'mainnet' ? 'coreum-mainnet' : 'coreum-testnet',
    }, { onConflict: 'tx_hash' })
    if (error) throw error
    const onChainResponse = await chain.queryContractSmart(configuredContractAddress, { project: { project_id: project.chain_project_id ?? projectId } }) as { project?: { goal?: string; raised?: string; goal_micro_tx?: string; raised_micro_tx?: string } } | { goal?: string; raised?: string; goal_micro_tx?: string; raised_micro_tx?: string }
    const onChainProject = ('project' in onChainResponse && onChainResponse.project ? onChainResponse.project : onChainResponse) as { goal?: string; raised?: string; goal_micro_tx?: string; raised_micro_tx?: string }
    if (BigInt(onChainProject.raised ?? onChainProject.raised_micro_tx ?? '0') >= BigInt(onChainProject.goal ?? onChainProject.goal_micro_tx ?? '0')) {
      const { error: projectStatusError } = await supabase.from('projects').update({ status: 'funded' }).eq('id', project.id).eq('status', 'active')
      if (projectStatusError) throw projectStatusError
    }
    await saveCursor(transaction.height)
    console.log(`Indexed ${transaction.hash} for ${projectId}`)
  }
}

console.log(`SoundFaith Coreum indexer watching ${configuredContractAddress}`)
if (runOnce) {
  await indexDonations()
  process.exit(0)
}

while (true) {
  try {
    await indexDonations()
  } catch (error) {
    console.error(error)
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs))
}
