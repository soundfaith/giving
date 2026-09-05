import { CosmWasmClient, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";
import { unlockBrowserWallet } from "./walletVault";

const chainId = import.meta.env.VITE_COREUM_CHAIN_ID ?? "coreum-testnet-1";
const rpcUrl =
  import.meta.env.VITE_COREUM_RPC_URL ??
  "https://rpc.testnet-1.tx.org:443";
const contractAddress = import.meta.env.VITE_COREUM_DONATION_CONTRACT ?? "";
const network = import.meta.env.VITE_COREUM_NETWORK ?? "testnet";
const nativeDenom = network === "mainnet" ? "ucore" : "utestcore";
const feeDenom = nativeDenom;
const donationDenom = nativeDenom;

const coreumTestnet = {
  chainId,
  chainName: "Coreum Testnet",
  rpc: rpcUrl,
  rest:
    import.meta.env.VITE_COREUM_REST_URL ??
    "https://rest.testnet-1.tx.org:443",
  bip44: { coinType: 990 },
  bech32Config: {
    bech32PrefixAccAddr: "testcore",
    bech32PrefixAccPub: "testcorepub",
    bech32PrefixValAddr: "testcorevaloper",
    bech32PrefixValPub: "testcorevaloperpub",
    bech32PrefixConsAddr: "testcorevalcons",
    bech32PrefixConsPub: "testcorevalconspub",
  },
  currencies: [{ coinDenom: "TX", coinMinimalDenom: nativeDenom, coinDecimals: 6 }],
  feeCurrencies: [
    {
      coinDenom: "TX",
      coinMinimalDenom: feeDenom,
      coinDecimals: 6,
      gasPriceStep: { low: 0.025, average: 0.05, high: 0.1 },
    },
  ],
  stakeCurrency: { coinDenom: "TX", coinMinimalDenom: nativeDenom, coinDecimals: 6 },
};

type KeplrWindow = Window & {
  keplr?: {
    experimentalSuggestChain: (chain: typeof coreumTestnet) => Promise<void>;
    enable: (chainId: string) => Promise<void>;
    getOfflineSigner: (chainId: string) => OfflineSigner;
  };
};

export type WalletSession = { address: string; client: SigningCosmWasmClient };

export async function connectBrowserWallet(password: string): Promise<WalletSession> {
  const { wallet, address } = await unlockBrowserWallet(password);
  const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet);
  return { address, client };
}

export async function connectCoreumWallet(): Promise<WalletSession> {
  const walletWindow = window as KeplrWindow;
  if (!walletWindow.keplr)
    throw new Error(
      "Install a Cosmos wallet extension such as Keplr, then try again.",
    );
  await walletWindow.keplr.experimentalSuggestChain(coreumTestnet);
  await walletWindow.keplr.enable(chainId);
  const signer = walletWindow.keplr.getOfflineSigner(chainId);
  const [{ address }] = await signer.getAccounts();
  const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, signer);
  return { address, client };
}

export async function donateWithWallet(projectId: string, amountTx: number, password?: string) {
  if (!contractAddress)
    throw new Error("VITE_COREUM_DONATION_CONTRACT is not configured");
  const { address, client } = password
    ? await connectBrowserWallet(password)
    : await connectCoreumWallet();
    const chainClient = await StargateClient.connect(rpcUrl);
    const donationBalance = await chainClient.getBalance(address, donationDenom);
    const requestedAmount = Math.round(amountTx * 1_000_000);
    if (BigInt(donationBalance.amount) < BigInt(requestedAmount)) {
      throw new Error(`This wallet has ${Number(donationBalance.amount) / 1_000_000} ${donationDenom}. Fund it with the network's native ${donationDenom} before donating.`);
    }
    const result = await client.execute(address, contractAddress, { donate: { project_id: projectId } }, { amount: [{ denom: feeDenom, amount: '50000' }], gas: '1000000' }, 'SoundFaith donation', [{ denom: donationDenom, amount: String(requestedAmount) }]);
  return { address, txHash: result.transactionHash };
}

export type OnChainProject = {
  id: string;
  goal_micro_tx: string;
  raised_micro_tx: string;
  donor_count: number;
  status: string;
  metadata_token_id: string;
  beneficiary: string;
};

export async function getProjectOnChain(projectId: string): Promise<OnChainProject> {
  if (!contractAddress) throw new Error("VITE_COREUM_DONATION_CONTRACT is not configured");
  const client = await CosmWasmClient.connect(rpcUrl);
  return client.queryContractSmart(contractAddress, {
    project: { project_id: projectId },
  }) as Promise<OnChainProject>;
}

export async function claimProjectFunds(projectId: string, password?: string) {
  if (!contractAddress)
    throw new Error("VITE_COREUM_DONATION_CONTRACT is not configured");
  const { address, client } = password ? await connectBrowserWallet(password) : await connectCoreumWallet();
    const result = await client.execute(address, contractAddress, { claim_project_funds: { project_id: projectId } }, { amount: [{ denom: feeDenom, amount: '50000' }], gas: '1000000' }, 'SoundFaith project claim');
  return { address, txHash: result.transactionHash };
}

export async function getCoreumBalance(address: string) {
  return (await getCoreumBalances(address)).native;
}

export async function getCoreumBalances(address: string) {
  const client = await StargateClient.connect(rpcUrl);
  const [donationToken, testnetGasToken] = await Promise.all([
    client.getBalance(address, nativeDenom),
    client.getBalance(address, feeDenom),
  ]);
  return {
    native: Number(donationToken.amount) / 1_000_000,
    fee: Number(testnetGasToken.amount) / 1_000_000,
  };
}
