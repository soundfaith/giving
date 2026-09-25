const baseUrl = process.env.TX_KYC_BASE_URL ?? "https://com-be-kyc-service-zk6dps4acq-uc.a.run.app";
const network = process.env.TX_NETWORK ?? "testnet";
const externalUserId = process.env.TX_EXTERNAL_USER_ID;
const authorization = process.env.TX_AUTHORIZATION;

if (!externalUserId || !authorization) {
  throw new Error("Set TX_EXTERNAL_USER_ID and TX_AUTHORIZATION for this one-time diagnostic.");
}

const response = await fetch(`${baseUrl}/kyc/get?external_user_id=${encodeURIComponent(externalUserId)}`, {
  headers: {
    "Content-Type": "application/json",
    Authorization: authorization.startsWith("Bearer ") ? authorization : `Bearer ${authorization}`,
    Network: network,
  },
});

const body = await response.json().catch(() => null) as { ExternalUserID?: string; Status?: number | string } | null;
console.log(JSON.stringify({
  httpStatus: response.status,
  ok: response.ok,
  externalUserId: body?.ExternalUserID ?? externalUserId,
  status: body?.Status ?? null,
}, null, 2));

if (!response.ok) process.exitCode = 1;
