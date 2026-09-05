import process from 'node:process'
import { stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate'

const mnemonic = process.env.COREUM_MNEMONIC
const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const chainId = process.env.COREUM_CHAIN_ID ?? 'coreum-testnet-1'
const prefix = process.env.COREUM_BECH32_PREFIX ?? 'testcore'
const derivationPath = process.env.COREUM_DERIVATION_PATH ?? "m/44'/990'/0'/0/0"
const contractAddress = process.env.COREUM_DONATION_CONTRACT
const projectId = process.env.COREUM_PROJECT_ID
const goalTx = Number(process.env.COREUM_PROJECT_GOAL_TX)
const beneficiary = process.env.COREUM_PROJECT_BENEFICIARY
const nativeDenom = process.env.COREUM_NATIVE_DENOM ?? 'utestcore'

if (!mnemonic || !contractAddress || !projectId || !beneficiary || !Number.isFinite(goalTx) || goalTx <= 0) throw new Error('COREUM_MNEMONIC, COREUM_DONATION_CONTRACT, COREUM_PROJECT_ID, COREUM_PROJECT_GOAL_TX, and COREUM_PROJECT_BENEFICIARY are required')
const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix, hdPaths: [stringToPath(derivationPath)] })
const [account] = await wallet.getAccounts()
const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)
const result = await client.execute(account.address, contractAddress, { register_project: { project: { id: projectId, goal_micro_tx: String(Math.round(goalTx * 1_000_000)), status: 'active', metadata_token_id: '', beneficiary } } }, { amount: [{ denom: nativeDenom, amount: '50000' }], gas: '1000000' }, 'SoundFaith register project')
console.log(`Registered ${projectId} on ${chainId}: ${result.transactionHash}`)
