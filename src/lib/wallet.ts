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

export function friendlyWalletError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.startsWith("this donation is larger than the project's remaining goal")) return message;
  if (normalized.includes("donation would exceed the project goal") || normalized.includes("goal_exceeded")) return "This donation is larger than the project's remaining goal. Please choose a smaller amount.";
  if (normalized.includes("project is not active") || normalized.includes("project is not accepting donations")) return "This project is not accepting donations right now.";
  if (normalized.includes("donation must contain exactly one configured native coin") || normalized.includes("invalid funds")) return "The donation amount could not be sent in the expected TX format. Please try again.";
  if (normalized.includes("contract is paused")) return "Donations are temporarily paused while the project vault is updated. Please try again shortly.";
  if (normalized.includes("insufficient funds") || normalized.includes("insufficient balance")) return "This wallet does not have enough TX to cover the donation and network fee.";
  if (normalized.includes("rejected") || normalized.includes("request rejected") || normalized.includes("user denied")) return "The wallet request was cancelled.";
  if (normalized.includes("account sequence") || normalized.includes("incorrect account sequence")) return "This wallet has a pending transaction. Please wait a moment and try again.";
  if (normalized.includes("out of gas") || normalized.includes("gas wanted") || normalized.includes("gas limit")) return "The network could not process this donation. Please try again with the current app version.";
  if (normalized.includes("timeout") || normalized.includes("network") || normalized.includes("fetch")) return "The network did not respond. Check your connection and try again.";
  const chainReason = message.match(/message index:\s*\d+:\s*(.*?)\s*:\s*execute wasm contract failed/i)?.[1];
  if (chainReason) return `The TX network rejected this donation: ${chainReason}.`;
  return "We could not complete the donation right now. Please try again.";
}

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
  let onChainProject: OnChainProject;
  try {
    onChainProject = await getProjectOnChain(projectId);
  } catch {
    throw new Error("This project is not registered on-chain yet. Please try again after the project has been approved and registered.");
  }
  if (!(["active", "funded"] as const).includes(onChainProject.status as "active" | "funded")) {
    throw new Error(`This project is not accepting donations on-chain (status: ${onChainProject.status}).`);
  }
  const requestedAmount = Math.round(amountTx * 1_000_000);
  const { address, client } = password
    ? await connectBrowserWallet(password)
    : await connectCoreumWallet();
    const chainClient = await StargateClient.connect(rpcUrl);
    const donationBalance = await chainClient.getBalance(address, donationDenom);
    if (BigInt(donationBalance.amount) < BigInt(requestedAmount)) {
      throw new Error(`This wallet has ${Number(donationBalance.amount) / 1_000_000} ${donationDenom}. Fund it with the network's native ${donationDenom} before donating.`);
    }
    try {
      const result = await client.execute(address, contractAddress, { donate: { project_id: projectId } }, { amount: [{ denom: feeDenom, amount: '50000' }], gas: '1000000' }, 'SoundFaith donation', [{ denom: donationDenom, amount: String(requestedAmount) }]);
      return { address, txHash: result.transactionHash };
    } catch (error) {
      throw new Error(friendlyWalletError(error));
    }
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
