import { stringToPath } from "@cosmjs/crypto";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

const databaseName = "soundfaith-wallet";
const storeName = "vaults";
const activeWalletKey = "soundfaith-active-wallet";
const chainId = import.meta.env.VITE_COREUM_CHAIN_ID ?? "coreum-testnet-1";
const prefix = "testcore";
const hdPath = stringToPath("m/44'/990'/0'/0/0");
const biometricCredentialKey = "soundfaith-biometric-credential";

type StoredVault = {
  id: string;
  name?: string;
  address: string;
  serialization: string;
  createdAt: string;
};

function openVaultDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local wallet storage"));
  });
}

async function readVault(id?: string) {
  const database = await openVaultDatabase();
  return new Promise<StoredVault | null>((resolve, reject) => {
    const objectStore = database.transaction(storeName, "readonly").objectStore(storeName);
    const requestedId = id ?? window.localStorage.getItem(activeWalletKey);
    if (!requestedId) {
      resolve(null);
      return;
    }
    if (!id && requestedId === "coreum-testnet") {
      window.localStorage.removeItem(activeWalletKey);
      resolve(null);
      return;
    }
    const request = objectStore.get(requestedId);
    request.onsuccess = () => {
      const result = request.result as StoredVault | undefined;
      resolve(result ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to read local wallet storage"));
  });
}

async function listVaults() {
  const database = await openVaultDatabase();
  return new Promise<StoredVault[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result as StoredVault[]).filter((vault) => vault.id !== "coreum-testnet").map((vault) => ({ ...vault, name: vault.name ?? "TX wallet" })));
    request.onerror = () => reject(request.error ?? new Error("Unable to read local wallet storage"));
  });
}

async function writeVault(vault: StoredVault) {
  const database = await openVaultDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, "readwrite").objectStore(storeName).put(vault);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to save local wallet storage"));
  });
}

function walletOptions() {
  return { prefix, hdPaths: [hdPath] };
}

function setActiveWallet(id: string) {
  window.localStorage.setItem(activeWalletKey, id);
}

export type BrowserWallet = { id: string; name: string; address: string; createdAt: string };

export async function getBrowserWallets(): Promise<BrowserWallet[]> {
  return (await listVaults()).map((wallet) => ({ id: wallet.id, name: wallet.name ?? "Coreum wallet", address: wallet.address, createdAt: wallet.createdAt }));
}

export async function switchBrowserWallet(id: string) {
  const wallet = await readVault(id);
  if (!wallet) throw new Error("That wallet is not available on this device.");
  setActiveWallet(wallet.id);
  return { id: wallet.id, name: wallet.name ?? "Coreum wallet", address: wallet.address };
}

export async function getActiveBrowserWallet() {
  const wallet = await readVault();
  return wallet ? { id: wallet.id, name: wallet.name ?? "Coreum wallet", address: wallet.address } : null;
}

export async function hasBrowserWallet() {
  return Boolean(await readVault());
}

export async function getBrowserWalletAddress() {
  return (await readVault())?.address ?? null;
}

export async function createBrowserWallet(password: string, name = "Coreum wallet") {
  if (password.length < 12) throw new Error("Use a wallet password with at least 12 characters.");
  const wallet = await DirectSecp256k1HdWallet.generate(12, walletOptions());
  const [{ address }] = await wallet.getAccounts();
  const serialization = await wallet.serialize(password);
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name.trim() || "Coreum wallet", address, serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address };
}

export async function unlockBrowserWallet(password: string) {
  const vault = await readVault();
  if (!vault) throw new Error("No local wallet is configured on this device.");
  const wallet = await DirectSecp256k1HdWallet.deserialize(vault.serialization, password);
  return { wallet, address: vault.address };
}

export async function revealBrowserWalletMnemonic(password: string) {
  const { wallet } = await unlockBrowserWallet(password);
  return wallet.mnemonic;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function hasBiometricUnlock() {
  return typeof window !== "undefined" && Boolean(window.PublicKeyCredential && window.localStorage.getItem(biometricCredentialKey));
}

export async function registerBiometricUnlock() {
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("This browser does not support passkeys or biometric verification.");
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)) as unknown as BufferSource,
      rp: { name: "SoundFaith" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)) as unknown as BufferSource, name: "soundfaith-wallet", displayName: "SoundFaith wallet" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("The device did not create a biometric credential.");
  window.localStorage.setItem(biometricCredentialKey, base64Url(new Uint8Array(credential.rawId)));
}

export async function verifyBiometricUnlock() {
  const credentialId = window.localStorage.getItem(biometricCredentialKey);
  if (!credentialId || !navigator.credentials) throw new Error("Biometric unlock is not configured on this device.");
  const binary = atob(credentialId.replace(/-/g, "+").replace(/_/g, "/"));
  const id = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)) as unknown as BufferSource,
      allowCredentials: [{ id: id as unknown as BufferSource, type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("Biometric verification was not completed.");
}

export async function exportBrowserWallet() {
  const vault = await readVault();
  if (!vault) throw new Error("No local wallet is configured on this device.");
  const blob = new Blob([JSON.stringify({ format: "soundfaith-coreum-wallet-v1", chainId, name: vault.name ?? "Coreum wallet", address: vault.address, serialization: vault.serialization }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "soundfaith-coreum-wallet.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importBrowserWallet(file: File, expectedAddress?: string | null, name?: string) {
  const parsed = JSON.parse(await file.text()) as { format?: string; name?: string; address?: string; serialization?: string };
  if (parsed.format !== "soundfaith-coreum-wallet-v1" || !parsed.address || !parsed.serialization) throw new Error("This is not a SoundFaith wallet backup.");
  if (expectedAddress && parsed.address !== expectedAddress) throw new Error("This backup belongs to a different wallet. Select the backup for the remembered Coreum address.");
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name?.trim() || parsed.name || "Imported wallet", address: parsed.address, serialization: parsed.serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address: parsed.address };
}

export async function importBrowserWalletMnemonic(mnemonic: string, password: string, expectedAddress?: string | null, name = "Recovered wallet") {
  if (password.length < 12) throw new Error("Use a wallet password with at least 12 characters.");
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic.trim(), walletOptions());
  const [{ address }] = await wallet.getAccounts();
  if (expectedAddress && address !== expectedAddress) throw new Error("This mnemonic belongs to a different wallet. Check the remembered Coreum address and try again.");
  const serialization = await wallet.serialize(password);
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name.trim() || "Recovered wallet", address, serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address };
}

export { chainId, walletOptions };
