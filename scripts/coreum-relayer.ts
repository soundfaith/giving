import process from 'node:process'
import { stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { createClient } from '@supabase/supabase-js'

const mnemonic = process.env.COREUM_MNEMONIC
const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const chainId = process.env.COREUM_CHAIN_ID ?? 'coreum-testnet-1'
const prefix = process.env.COREUM_BECH32_PREFIX ?? 'testcore'
const derivationPath = process.env.COREUM_DERIVATION_PATH ?? "m/44'/990'/0'/0/0"
const contractAddress = process.env.COREUM_DONATION_CONTRACT
const nativeDenom = process.env.COREUM_NATIVE_DENOM ?? 'utestcore'
const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const pollMs = Number(process.env.COREUM_RELAYER_POLL_MS ?? 10_000)
const runOnce = process.env.COREUM_RELAYER_ONCE === '1'

if (!mnemonic || !contractAddress || !supabaseUrl || !serviceRoleKey) {
  throw new Error('COREUM_MNEMONIC, COREUM_DONATION_CONTRACT, VITE_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required')
}
const configuredContractAddress = contractAddress

const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix, hdPaths: [stringToPath(derivationPath)] })
const [account] = await wallet.getAccounts()
const chain = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

type PendingProject = { id: string; goal_tx: number; owner_wallet_address: string | null }

async function registerProject(project: PendingProject) {
  if (!project.owner_wallet_address) {
    console.error(`Skipping ${project.id}: owner wallet is missing`)
    return
  }

  const result = await chain.execute(
    account.address,
    configuredContractAddress,
    {
      register_project: {
        project: {
          id: project.id,
          goal_micro_tx: String(Math.round(Number(project.goal_tx) * 1_000_000)),
          status: 'active',
          metadata_token_id: '',
          beneficiary: project.owner_wallet_address,
        },
      },
    },
    { amount: [{ denom: nativeDenom, amount: '50000' }], gas: '1000000' },
    'SoundFaith relayer registration',
  )

  const { error } = await supabase.rpc('relayer_activate_project', { target_project_id: project.id })
  if (error) throw error
  console.log(`Registered ${project.id} on ${chainId}: ${result.transactionHash}`)
}

async function relayPendingProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, goal_tx, owner_wallet_address')
    .eq('status', 'approved_pending_chain')
    .order('created_at', { ascending: true })

  if (error) throw error
  for (const project of (data ?? []) as PendingProject[]) {
    try {
      await registerProject(project)
    } catch (error) {
      console.error(`Registration failed for ${project.id}:`, error)
    }
  }
}

console.log(`SoundFaith Coreum relayer running as ${account.address}`)
if (runOnce) {
  await relayPendingProjects()
  process.exit(0)
}

while (true) {
  try {
    await relayPendingProjects()
  } catch (error) {
    console.error(error)
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs))
}