import { stringToPath } from "@cosmjs/crypto";
import { fromHex } from "@cosmjs/encoding";
import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from "@cosmjs/proto-signing";

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
  ownerEmail?: string;
  address: string;
  serialization: string;
  createdAt: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptPrivateKey(privateKey: Uint8Array, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 120000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, privateKey as unknown as BufferSource);
  return `private-v1:${JSON.stringify({ salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) })}`;
}

async function decryptPrivateKey(serialization: string, password: string) {
  const parsed = JSON.parse(serialization.slice("private-v1:".length)) as { salt: string; iv: string; data: string };
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: base64ToBytes(parsed.salt) as unknown as BufferSource, iterations: 120000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(parsed.iv) as unknown as BufferSource }, key, base64ToBytes(parsed.data) as unknown as BufferSource);
  return new Uint8Array(decrypted);
}

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

function displayWalletName(name?: string) {
  return name === "Coreum wallet" ? "TX wallet" : name ?? "TX wallet";
}

export function clearActiveBrowserWallet() {
  window.localStorage.removeItem(activeWalletKey);
}

export type BrowserWallet = { id: string; name: string; address: string; createdAt: string };

export async function getBrowserWallets(ownerEmail?: string): Promise<BrowserWallet[]> {
  return (await listVaults())
    .filter((wallet) => !ownerEmail || wallet.ownerEmail === ownerEmail)
    .map((wallet) => ({ id: wallet.id, name: displayWalletName(wallet.name), address: wallet.address, createdAt: wallet.createdAt }));
}

export async function switchBrowserWallet(id: string) {
  const wallet = await readVault(id);
  if (!wallet) throw new Error("That wallet is not available on this device.");
  setActiveWallet(wallet.id);
  return { id: wallet.id, name: displayWalletName(wallet.name), address: wallet.address };
}

export async function activateBrowserWalletForAddress(address: string) {
  const wallet = (await listVaults()).find((item) => item.address === address);
  if (!wallet) return null;
  setActiveWallet(wallet.id);
  return { id: wallet.id, name: displayWalletName(wallet.name), address: wallet.address };
}

export async function claimBrowserWalletForEmail(address: string, ownerEmail: string) {
  const database = await openVaultDatabase();
  return new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.getAll();
    request.onsuccess = () => {
      const wallet = (request.result as StoredVault[]).find((item) => item.address === address);
      if (!wallet || (wallet.ownerEmail && wallet.ownerEmail !== ownerEmail)) {
        resolve(false);
        return;
      }
      objectStore.put({ ...wallet, ownerEmail });
      resolve(true);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to update local wallet storage"));
  });
}

export async function removeBrowserWallet(id: string) {
  const database = await openVaultDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, "readwrite").objectStore(storeName).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to remove local wallet"));
  });
  if (window.localStorage.getItem(activeWalletKey) === id) clearActiveBrowserWallet();
}

export async function getActiveBrowserWallet() {
  const wallet = await readVault();
  return wallet ? { id: wallet.id, name: displayWalletName(wallet.name), address: wallet.address } : null;
}

export async function hasBrowserWallet() {
  return Boolean(await readVault());
}

export async function getBrowserWalletAddress() {
  return (await readVault())?.address ?? null;
}

export async function createBrowserWallet(password: string, name = "TX wallet", ownerEmail?: string) {
  if (password.length < 12) throw new Error("Use a wallet password with at least 12 characters.");
  const wallet = await DirectSecp256k1HdWallet.generate(12, walletOptions());
  const [{ address }] = await wallet.getAccounts();
  const serialization = await wallet.serialize(password);
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name.trim() || "TX wallet", ownerEmail, address, serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address };
}

export async function unlockBrowserWallet(password: string) {
  const vault = await readVault();
  if (!vault) throw new Error("No local wallet is configured on this device.");
  if (vault.serialization.startsWith("private-v1:")) {
    const wallet = await DirectSecp256k1Wallet.fromKey(await decryptPrivateKey(vault.serialization, password), prefix);
    return { wallet, address: vault.address };
  }
  const wallet = await DirectSecp256k1HdWallet.deserialize(vault.serialization, password);
  return { wallet, address: vault.address };
}

export async function revealBrowserWalletMnemonic(password: string) {
  const { wallet } = await unlockBrowserWallet(password);
  if (!("mnemonic" in wallet)) throw new Error("This imported private-key wallet does not have a recovery mnemonic.");
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
  const blob = new Blob([JSON.stringify({ format: "soundfaith-coreum-wallet-v1", chainId, name: displayWalletName(vault.name), address: vault.address, serialization: vault.serialization }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "soundfaith-coreum-wallet.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importBrowserWallet(file: File, expectedAddress?: string | null, name?: string, ownerEmail?: string) {
  const parsed = JSON.parse(await file.text()) as { format?: string; name?: string; address?: string; serialization?: string };
  if (parsed.format !== "soundfaith-coreum-wallet-v1" || !parsed.address || !parsed.serialization) throw new Error("This is not a SoundFaith wallet backup.");
  if (expectedAddress && parsed.address !== expectedAddress) throw new Error("This backup belongs to a different wallet. Select the backup for the remembered TX address.");
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name?.trim() || parsed.name || "Imported wallet", ownerEmail, address: parsed.address, serialization: parsed.serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address: parsed.address };
}

export async function importBrowserWalletMnemonic(mnemonic: string, password: string, expectedAddress?: string | null, name = "Recovered wallet", ownerEmail?: string) {
  if (password.length < 12) throw new Error("Use a wallet password with at least 12 characters.");
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic.trim(), walletOptions());
  const [{ address }] = await wallet.getAccounts();
  if (expectedAddress && address !== expectedAddress) throw new Error("This mnemonic belongs to a different wallet. Check the remembered TX address and try again.");
  const serialization = await wallet.serialize(password);
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name.trim() || "Recovered wallet", ownerEmail, address, serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address };
}

export async function importBrowserWalletPrivateKey(privateKey: string, password: string, name = "Imported wallet", ownerEmail?: string) {
  if (password.length < 12) throw new Error("Use a wallet password with at least 12 characters.");
  const normalized = privateKey.trim().replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(normalized)) throw new Error("Enter a 32-byte private key as 64 hexadecimal characters.");
  const wallet = await DirectSecp256k1Wallet.fromKey(fromHex(normalized), prefix);
  const [{ address }] = await wallet.getAccounts();
  const serialization = await encryptPrivateKey(fromHex(normalized), password);
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name.trim() || "Imported wallet", ownerEmail, address, serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address };
}

export { chainId, walletOptions };
