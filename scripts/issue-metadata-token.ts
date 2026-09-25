import process from 'node:process'
import { stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { GasPrice, SigningStargateClient } from '@cosmjs/stargate'
import { FT, coreumRegistry } from 'coreum-js'
import { Registry } from '@cosmjs/proto-signing'

const mnemonic = process.env.COREUM_MNEMONIC
const prefix = process.env.COREUM_BECH32_PREFIX ?? 'testcore'
const derivationPath = process.env.COREUM_DERIVATION_PATH ?? "m/44'/990'/0'/0/0"
const expectedAddress = process.env.COREUM_EXPECTED_ADDRESS
const network = process.env.COREUM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const symbol = process.env.COREUM_METADATA_SYMBOL ?? 'SFAITH'
const subunit = process.env.COREUM_METADATA_SUBUNIT ?? 'sfaith'
const description = process.env.COREUM_METADATA_DESCRIPTION ?? 'SoundFaith public church project metadata'
const uri = process.env.COREUM_METADATA_URI ?? 'https://soundfaith.app/metadata'

if (!mnemonic) throw new Error('COREUM_MNEMONIC is missing')
if (!/^[A-Z][A-Z0-9]{2,15}$/.test(symbol)) throw new Error('COREUM_METADATA_SYMBOL must be 3-16 uppercase letters/numbers')
if (!/^[a-z][a-z0-9]{2,15}$/.test(subunit)) throw new Error('COREUM_METADATA_SUBUNIT must be 3-16 lowercase letters/numbers')

const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
  prefix,
  hdPaths: [stringToPath(derivationPath)],
})
const [account] = await wallet.getAccounts()
if (expectedAddress && account.address !== expectedAddress) throw new Error(`Derived ${account.address}, expected ${expectedAddress}`)

const message = FT.Issue({
  issuer: account.address,
  symbol,
  subunit,
  precision: 0,
  initialAmount: '0',
  description,
  features: [],
  burnRate: '0',
  sendCommissionRate: '0',
  uri,
  uriHash: '',
})

console.log(`Issuing ${symbol} from ${account.address} on Coreum ${network}...`)
const client = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
  registry: new Registry(coreumRegistry as unknown as ConstructorParameters<typeof Registry>[0]),
  gasPrice: GasPrice.fromString(`0.05${process.env.COREUM_FEE_DENOM ?? (process.env.COREUM_NETWORK === 'mainnet' ? 'ucore' : 'utestcore')}`),
})
const result = await client.signAndBroadcast(account.address, [message], 'auto', 'SoundFaith metadata token')
console.log(`Transaction: ${result.transactionHash}`)
const tokenEvent = result.events.find((event) => event.type === 'issued' || event.type === 'coreum.asset.ft.v1.EventIssued')
const attributes = tokenEvent?.attributes ?? []
const denom = attributes.find((attribute) => attribute.key === 'denom')?.value
console.log(`Metadata token denom: ${denom ?? 'Inspect the transaction event for the issued denom'}`)
console.log('Store this denom in metadata_token_id for each project. This token is metadata only; project funds remain in the CosmWasm vault.')
client.disconnect()
