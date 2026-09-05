import process from 'node:process'
import { stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate'

const mnemonic = process.env.COREUM_MNEMONIC
const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const chainId = process.env.COREUM_CHAIN_ID ?? 'coreum-testnet-1'
const prefix = process.env.COREUM_BECH32_PREFIX ?? 'testcore'
const derivationPath = process.env.COREUM_DERIVATION_PATH ?? "m/44'/990'/0'/0/0"
const expectedAddress = process.env.COREUM_EXPECTED_ADDRESS
const contractAddress = process.env.COREUM_DONATION_CONTRACT
const codeId = Number(process.env.COREUM_MIGRATE_CODE_ID)

if (!mnemonic) throw new Error('COREUM_MNEMONIC is missing')
if (!contractAddress) throw new Error('COREUM_DONATION_CONTRACT is missing')
if (!Number.isInteger(codeId) || codeId <= 0) throw new Error('COREUM_MIGRATE_CODE_ID must be a positive integer')

const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix, hdPaths: [stringToPath(derivationPath)] })
const [account] = await wallet.getAccounts()
if (expectedAddress && account.address !== expectedAddress) throw new Error(`Derived ${account.address}, expected ${expectedAddress}`)
const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)
const nativeDenom = process.env.COREUM_NATIVE_DENOM ?? (process.env.COREUM_NETWORK === 'mainnet' ? 'ucore' : 'utestcore')
const fee = { amount: [{ denom: process.env.COREUM_FEE_DENOM ?? nativeDenom, amount: '50000' }], gas: '1000000' }
console.log(`Migrating ${contractAddress} to code ${codeId} from ${account.address} on ${chainId}...`)
const result = await client.migrate(account.address, contractAddress, codeId, { native_denom: nativeDenom }, fee)
console.log(`Migration transaction: ${result.transactionHash}`)
console.log('The new pause, metadata-update, and versioned migration controls are now live.')
