export type DonationAmount = 25 | 50 | 100 | 250;

export type DonationRequest = {
  projectId: string;
  amount: DonationAmount | number;
  network: "coreum-testnet";
};

export type TokenMetadata = {
  symbol: string;
  denom: string;
  network: string;
  decimals: number;
};

export const coreumTestnet: TokenMetadata = {
  symbol: "TX",
  denom: "utestcore",
  network: "Coreum testnet",
  decimals: 6,
};

export const donationContractAddress =
  import.meta.env.VITE_COREUM_DONATION_CONTRACT ?? "";

export const coreumRpcUrl = import.meta.env.VITE_COREUM_RPC_URL ?? "";

export type DonationEvent = {
  txHash: string;
  projectId: string;
  donorAddress: string;
  amountMicroTx: string;
  height: number;
};

export async function createDonationTransaction(request: DonationRequest) {
  return {
    ...request,
    status: "awaiting_wallet" as const,
    txHash: undefined as string | undefined,
  };
}
