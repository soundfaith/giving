import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing'
import { CosmWasmClient, SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const contractAddress = process.env.COREUM_DONATION_CONTRACT
const ownerMnemonic = process.env.COREUM_OWNER_MNEMONIC
const donorMnemonics = JSON.parse(process.env.MVP_DONOR_MNEMONICS ?? '[]') as string[]
const validator = process.env.COREUM_STAKING_VALIDATOR
const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443'
const nativeDenom = 'utestcore'
const fee = { amount: [{ denom: nativeDenom, amount: '50000' }], gas: '1000000' }
const exteriorDir = 'C:\\Users\\Public\\project\\church_images\\exterior'
const interiorDir = 'C:\\Users\\Public\\project\\church_images\\interior'

if (!supabaseUrl || !serviceRoleKey || !contractAddress || !ownerMnemonic || !validator || donorMnemonics.length !== 5) {
  throw new Error('MVP seed configuration is incomplete.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const ownerWallet = await DirectSecp256k1HdWallet.fromMnemonic(ownerMnemonic, { prefix: 'testcore', hdPaths: [stringToPath("m/44'/990'/0'/0/0")] })
const ownerAccount = (await ownerWallet.getAccounts())[0]
const ownerClient = await SigningCosmWasmClient.connectWithSigner(rpcUrl, ownerWallet)
const queryClient = await CosmWasmClient.connect(rpcUrl)

const donorWallets = await Promise.all(donorMnemonics.map((mnemonic) => DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'testcore', hdPaths: [stringToPath("m/44'/990'/0'/0/0")] })))
const donorAccounts = await Promise.all(donorWallets.map(async (wallet) => (await wallet.getAccounts())[0]))
const donorClients = await Promise.all(donorWallets.map((wallet) => SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)))

const projectDefinitions = [
  ['Harbor Light Church', 'Tacoma, WA', 'A clearer sound for Sunday', 'Sound & AV', 1, 0],
  ['New Hope Chapel', 'Boise, ID', 'Safe steps into the gathering hall', 'Facilities & Maintenance', 1, 1],
  ['Grace Community Church', 'Austin, TX', 'A welcoming worship space', 'Worship & Gathering', 2, 2],
  ['St. Mark Fellowship', 'Cleveland, OH', 'Repair the community room roof', 'Facilities & Maintenance', 2, 3],
  ['Riverside Church', 'Portland, OR', 'Project the words for every voice', 'Sound & AV', 3, 4],
  ['Open Door Parish', 'Raleigh, NC', 'A table for neighborhood meals', 'Community & Outreach', 5, 0],
  ['Cedar Grove Church', 'Madison, WI', 'Lights for the gathering room', 'Worship & Gathering', 7, 1],
  ['Beacon Hill Church', 'Denver, CO', 'Accessible entry improvements', 'Facilities & Maintenance', 10, 2],
  ['Common Ground Chapel', 'Richmond, VA', 'A stronger room for youth nights', 'Community & Outreach', 25, 3],
  ['Good Shepherd Church', 'Savannah, GA', 'Replace the aging sound console', 'Sound & AV', 50, 4],
] as const

const goalAmounts = projectDefinitions.map(([, , , , goal]) => goal)
const donationAmounts = [20, 20, 20, 20, 50, 50, 50, 50, 50, 50]
const donationWalletIndexes = [0, 1, 2, 3, 4, 4, 4, 4, 4, 4]
const seedRun = BigInt(Date.now()).toString(16).slice(-12).padStart(12, '0')
const projectIds = projectDefinitions.map((_, index) => `70000000-0000-4000-8000-${(BigInt(`0x${seedRun}`) + BigInt(index)).toString(16).padStart(12, '0')}`)

async function listFiles(directory: string) {
  return (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name))
}

async function removeStorageObjects(folder = ''): Promise<void> {
  const { data, error } = await supabase.storage.from('project-photos').list(folder, { limit: 1000 })
  if (error) throw error
  for (const item of data ?? []) {
    const itemPath = folder ? `${folder}/${item.name}` : item.name
    if (item.id) {
      const { error: deleteError } = await supabase.storage.from('project-photos').remove([itemPath])
      if (deleteError) throw deleteError
    } else {
      await removeStorageObjects(itemPath)
    }
  }
}

const exterior = await listFiles(exteriorDir)
const interior = await listFiles(interiorDir)
if (exterior.length < 10 || interior.length < 20) throw new Error('Not enough church image assets were found.')

const { data: currentRate, error: currentRateError } = await supabase.from('tx_exchange_rates').select('tx_usd_rate').eq('id', true).single()
if (currentRateError) throw currentRateError
const txUsdRate = Number(currentRate.tx_usd_rate)
if (!Number.isFinite(txUsdRate) || txUsdRate <= 0) throw new Error('The current TX/USD rate is invalid.')

await removeStorageObjects()
const projects = []
for (let index = 0; index < projectDefinitions.length; index += 1) {
  const [churchName, location, title, category, goalTx, ownerIndex] = projectDefinitions[index]
  const projectId = projectIds[index]
  const imageFiles = [exterior[index], interior[index * 2], interior[index * 2 + 1]]
  const imageUrls: string[] = []
  for (let imageIndex = 0; imageIndex < imageFiles.length; imageIndex += 1) {
    const source = imageFiles[imageIndex]
    const objectPath = `${projectId}/${imageIndex}-${path.basename(source)}`
    const { error } = await supabase.storage.from('project-photos').upload(objectPath, await fs.readFile(source), { upsert: true, contentType: 'image/jpeg' })
    if (error) throw error
    imageUrls.push(`${supabaseUrl}/storage/v1/object/public/project-photos/${objectPath}`)
  }
  projects.push({
    id: projectId,
    church_name: churchName,
    location,
    title,
    description: `Help ${churchName} make this practical improvement for its congregation and neighbors. Every TX goes directly toward this small MVP goal.`,
    category,
    goal_tx: goalTx,
    metadata_token_id: '',
    image_urls: imageUrls,
    status: 'active',
    owner_wallet_address: donorAccounts[ownerIndex].address,
  })
}

const { error: projectError } = await supabase.from('projects').insert(projects)
if (projectError) throw projectError

if (validator) {
  try {
    await ownerClient.execute(ownerAccount.address, contractAddress, { configure_staking: { validator } }, fee, 'SoundFaith MVP staking configuration')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('already')) throw error
  }
}

for (let index = 0; index < projects.length; index += 1) {
  const project = projects[index]
  try {
    const result = await ownerClient.execute(ownerAccount.address, contractAddress, {
      register_project: { project: { id: project.id, goal_micro_tx: String(Math.ceil((goalAmounts[index] / txUsdRate) * 1_000_000)), status: 'active', metadata_token_id: '', beneficiary: project.owner_wallet_address } },
    }, fee, 'SoundFaith MVP project registration')
    console.log(`Registered project ${index + 1}/10: ${result.transactionHash}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.toLowerCase().includes('already exists')) throw error
  }
}

for (let index = 0; index < projects.length; index += 1) {
  const amount = donationAmounts[index]
  const donorIndex = donationWalletIndexes[index]
  const donor = donorAccounts[donorIndex]
  const result = await donorClients[donorIndex].execute(donor.address, contractAddress, { donate: { project_id: projectIds[index] } }, fee, 'SoundFaith MVP donation', [{ denom: nativeDenom, amount: String(amount * 1_000_000) }])
  const { error: donationError } = await supabase.from('donations').upsert({ project_id: projectIds[index], wallet_address: donor.address, amount_tx: amount, tx_usd_rate: txUsdRate, amount_usd: amount * txUsdRate, tx_hash: result.transactionHash, network: 'coreum-testnet' }, { onConflict: 'tx_hash' })
  if (donationError) throw donationError
  console.log(`Donated ${amount} TX to project ${index + 1}/10: ${result.transactionHash}`)
}

for (let index = 0; index < projectIds.length; index += 1) {
  const onChain = await queryClient.queryContractSmart(contractAddress, { project: { project_id: projectIds[index] } }) as { raised_micro_tx: string; status: string }
  console.log(`Verified project ${index + 1}/10: ${Number(onChain.raised_micro_tx) / 1_000_000} TX, ${onChain.status}`)
}