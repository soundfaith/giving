import process from 'node:process'
import { stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { CosmWasmClient, SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate'

const mnemonic = process.env.COREUM_MNEMONIC
const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const chainId = process.env.COREUM_CHAIN_ID ?? 'coreum-testnet-1'
const prefix = process.env.COREUM_BECH32_PREFIX ?? 'testcore'
const derivationPath = process.env.COREUM_DERIVATION_PATH ?? "m/44'/990'/0'/0/0"
const contractAddress = process.env.COREUM_DONATION_CONTRACT
const beneficiary = process.env.COREUM_PROJECT_BENEFICIARY ?? 'testcore1hzt8gdqgvhxut95sn4cy9c2xh0t9m2uamwy726'
const nativeDenom = process.env.COREUM_NATIVE_DENOM ?? 'utestcore'
const fee = { amount: [{ denom: nativeDenom, amount: '50000' }], gas: '1000000' }

const projects = [
  { id: '11111111-1111-4111-8111-111111111111', goal: 2 },
  { id: '22222222-2222-4222-8222-222222222222', goal: 3 },
  { id: '33333333-3333-4333-8333-333333333333', goal: 1 },
]

if (!mnemonic || !contractAddress) {
  throw new Error('COREUM_MNEMONIC and COREUM_DONATION_CONTRACT are required. The mnemonic is read only from the local environment.')
}

const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix, hdPaths: [stringToPath(derivationPath)] })
const [account] = await wallet.getAccounts()
const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)
const queryClient = await CosmWasmClient.connect(rpcUrl)

const validator = process.env.COREUM_STAKING_VALIDATOR
if (!validator) {
  throw new Error('COREUM_STAKING_VALIDATOR is required so sample donations are staked immediately.')
}
const configured = await client.execute(account.address, contractAddress, { configure_staking: { validator } }, fee, 'SoundFaith configure staking')
console.log(`Configured staking: ${configured.transactionHash}`)

for (const project of projects) {
  try {
    await client.execute(account.address, contractAddress, {
      register_project: {
        project: {
          id: project.id,
          goal_micro_tx: String(project.goal * 1_000_000),
          status: 'active',
          metadata_token_id: '',
          beneficiary,
        },
      },
    }, fee, 'SoundFaith sample project registration')
    console.log(`Registered ${project.id}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('already exists')) throw error
    console.log(`Already registered ${project.id}`)
  }
}

const fundedId = projects[2].id
const fundedProject = await queryClient.queryContractSmart(contractAddress, { project: { project_id: fundedId } }) as { raised_micro_tx: string }
if (BigInt(fundedProject.raised_micro_tx ?? '0') < 1_000_000n) {
  const result = await client.execute(account.address, contractAddress, { donate: { project_id: fundedId } }, fee, 'SoundFaith fully funded sample donation', [{ denom: nativeDenom, amount: '1000000' }])
  console.log(`Fully funded ${fundedId}: ${result.transactionHash}`)
} else {
  console.log(`Already fully funded ${fundedId}`)
}

console.log(`Seed complete on ${chainId} using ${account.address}; beneficiary is ${beneficiary}`)
