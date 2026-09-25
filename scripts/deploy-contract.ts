import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate'

const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const chainId = process.env.COREUM_CHAIN_ID ?? 'coreum-testnet-1'
const bech32Prefix = process.env.COREUM_BECH32_PREFIX ?? (process.env.COREUM_NETWORK === 'mainnet' ? 'core' : 'testcore')
const derivationPath = process.env.COREUM_DERIVATION_PATH ?? "m/44'/990'/0'/0/0"
const expectedAddress = process.env.COREUM_EXPECTED_ADDRESS
const mnemonic = process.env.COREUM_MNEMONIC
const checkOnly = process.argv.includes('--check-only')
const uploadOnly = process.argv.includes('--upload-only')
const wasmPath = process.argv[process.argv.indexOf('--wasm') + 1]
const instantiateMessage = JSON.parse(process.env.COREUM_INSTANTIATE_MSG ?? '{"admin":null}')

if (!mnemonic) throw new Error('COREUM_MNEMONIC is missing. Load it from a local secret manager; never commit or share it.')
if (!wasmPath || wasmPath === '--wasm') throw new Error('Pass a compiled contract with --wasm path/to/donation.wasm')
if (instantiateMessage.projects?.some((project: { metadata_token_id?: string }) => project.metadata_token_id?.startsWith('REPLACE_WITH_'))) throw new Error('Instantiate message still has a smart-token metadata placeholder')
if (!Array.isArray(instantiateMessage.projects) || instantiateMessage.projects.length === 0) throw new Error('Instantiate message must include at least one project')
if (instantiateMessage.projects.some((project: { beneficiary?: string }) => !project.beneficiary)) throw new Error('Every project must define a beneficiary')

const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
	prefix: bech32Prefix,
	hdPaths: [stringToPath(derivationPath)],
})
const [account] = await wallet.getAccounts()
if (bech32Prefix === 'testcore' && !account.address.startsWith('testcore1')) {
	throw new Error(`Expected a Coreum testnet address with prefix testcore, received ${account.address}`)
}
if (expectedAddress && account.address !== expectedAddress) {
	throw new Error(`Derived address ${account.address} does not match COREUM_EXPECTED_ADDRESS`)
}
if (checkOnly) {
	console.log(`Derived ${account.address} with ${derivationPath}`)
	process.exit(0)
}
const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)
const wasm = await readFile(wasmPath)
const feeDenom = process.env.COREUM_FEE_DENOM ?? (process.env.COREUM_NETWORK === 'mainnet' ? 'ucore' : 'utestcore')
const uploadFee = { amount: [{ denom: feeDenom, amount: process.env.COREUM_UPLOAD_FEE_AMOUNT ?? '250000' }], gas: process.env.COREUM_UPLOAD_GAS ?? '5000000' }
const instantiateFee = { amount: [{ denom: feeDenom, amount: process.env.COREUM_INSTANTIATE_FEE_AMOUNT ?? '50000' }], gas: process.env.COREUM_INSTANTIATE_GAS ?? '1000000' }

console.log(`Uploading from ${account.address} to ${chainId}...`)
const upload = await client.upload(account.address, wasm, uploadFee)
console.log(`Uploaded code id ${upload.codeId} in ${upload.transactionHash}`)

if (uploadOnly) process.exit(0)

const instantiate = await client.instantiate(account.address, upload.codeId, { native_denom: process.env.COREUM_NATIVE_DENOM ?? (process.env.COREUM_NETWORK === 'mainnet' ? 'ucore' : 'utestcore'), projects: instantiateMessage.projects }, 'SoundFaith donation contract', instantiateFee, { admin: account.address })
console.log(`Contract: ${instantiate.contractAddress}`)
console.log(`Transaction: ${instantiate.transactionHash}`)
console.log('Set COREUM_DONATION_CONTRACT and VITE_COREUM_DONATION_CONTRACT to this address after reviewing it.')
