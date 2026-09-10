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

async function indexDonations() {
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

    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
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
    const onChainProject = await chain.queryContractSmart(configuredContractAddress, { project: { project_id: projectId } }) as { goal_micro_tx?: string; raised_micro_tx?: string }
    if (BigInt(onChainProject.raised_micro_tx ?? '0') >= BigInt(onChainProject.goal_micro_tx ?? '0')) {
      const { error: projectStatusError } = await supabase.from('projects').update({ status: 'funded' }).eq('id', projectId).eq('status', 'active')
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
