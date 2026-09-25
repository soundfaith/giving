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
const projectId = process.env.COREUM_PROJECT_ID ?? '33333333-3333-4333-8333-333333333333'
const nativeDenom = process.env.COREUM_NATIVE_DENOM ?? 'utestcore'

if (!mnemonic || !contractAddress) throw new Error('COREUM_MNEMONIC and COREUM_DONATION_CONTRACT are required.')
const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix, hdPaths: [stringToPath(derivationPath)] })
const [account] = await wallet.getAccounts()
const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)
const queryClient = await CosmWasmClient.connect(rpcUrl)
const project = await queryClient.queryContractSmart(contractAddress, { project: { project_id: projectId } }) as { beneficiary: string; raised_micro_tx: string; goal_micro_tx: string; status: string }
if (project.beneficiary !== account.address) throw new Error(`Signer ${account.address} is not the project beneficiary ${project.beneficiary}.`)
if (BigInt(project.raised_micro_tx) < BigInt(project.goal_micro_tx)) throw new Error('The project has not reached its funding goal.')
const result = await client.execute(account.address, contractAddress, { claim_project_funds: { project_id: projectId } }, { amount: [{ denom: nativeDenom, amount: '50000' }], gas: '1000000' }, 'SoundFaith project claim')
console.log(`Claim submitted on ${chainId}: ${result.transactionHash}`)
console.log(`Project ${projectId} was ${project.status}. If it was staked, run this command again after the validator unbonding period.`)
