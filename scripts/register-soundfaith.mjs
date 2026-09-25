import { stringToPath } from '@cosmjs/crypto';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningCosmWasmClient, CosmWasmClient } from '@cosmjs/cosmwasm-stargate';

const rpcUrl = process.env.COREUM_RPC_URL ?? 'https://rpc.testnet-1.tx.org:443';
const chainId = process.env.COREUM_CHAIN_ID ?? 'coreum-testnet-1';
const prefix = process.env.COREUM_BECH32_PREFIX ?? 'testcore';
const derivationPath = process.env.COREUM_DERIVATION_PATH ?? "m/44'/990'/0'/0/0";
const contractAddress = process.env.COREUM_CONTRACT_ADDRESS ?? 'testcore1kwvadmyvz986c6tnwh4axgqc97klhugq0ewckf86m53tg5xug2gsgwxc7p';
const mnemonic = process.env.COREUM_MNEMONIC;

if (!mnemonic) {
  throw new Error('COREUM_MNEMONIC is required. Read it from Windows Credential Manager in the deploy script before running this registration script.');
}

const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
  prefix,
  hdPaths: [stringToPath(derivationPath)],
});

const [account] = await wallet.getAccounts();
const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet);
const queryClient = await CosmWasmClient.connect(rpcUrl);

const partnerId = 'soundfaith';
const projectId = 'soundfaith:campaign-1';
const now = Math.floor(Date.now() / 1000);

async function maybeQueryProject(projectIdValue) {
  try {
    return await queryClient.queryContractSmart(contractAddress, { project: { project_id: projectIdValue } });
  } catch {
    return null;
  }
}

async function maybeQueryPartner(partnerIdValue) {
  try {
    return await queryClient.queryContractSmart(contractAddress, { partner: { partner_id: partnerIdValue } });
  } catch {
    return null;
  }
}

const existingPartner = await maybeQueryPartner(partnerId);
if (!existingPartner || !existingPartner.partner) {
  const partnerTx = await client.execute(
    account.address,
    contractAddress,
    {
      register_partner: {
        partner: {
          id: partnerId,
          active: true,
          kyb_approved: true,
          approved_wallets: [account.address],
          metadata: 'SoundFaith partner registry entry',
        },
      },
    },
    { amount: [{ denom: 'utestcore', amount: '50000' }], gas: '1000000' },
    'SoundFaith register partner'
  );
  console.log(JSON.stringify({ step: 'register_partner', owner: account.address, chainId, txHash: partnerTx.transactionHash }, null, 2));
} else {
  console.log(JSON.stringify({ step: 'register_partner', owner: account.address, chainId, status: 'already_registered' }, null, 2));
}

const existingProject = await maybeQueryProject(projectId);
if (!existingProject || !existingProject.project) {
  const projectTx = await client.execute(
    account.address,
    contractAddress,
    {
      register_project: {
        project: {
          id: projectId,
          beneficiary: account.address,
          goal: '50000000',
          metadata_uri: 'ipfs://soundfaith/campaign-1',
          platform_id: partnerId,
          fee_bps: 0,
          expires_at: now + (365 * 24 * 60 * 60),
          status: 'active',
        },
      },
    },
    { amount: [{ denom: 'utestcore', amount: '50000' }], gas: '1000000' },
    'SoundFaith register project'
  );
  console.log(JSON.stringify({ step: 'register_project', projectId, chainId, txHash: projectTx.transactionHash }, null, 2));
} else {
  console.log(JSON.stringify({ step: 'register_project', projectId, chainId, status: 'already_registered' }, null, 2));
}
