import { stringToPath } from "@cosmjs/crypto";
import { fromHex } from "@cosmjs/encoding";
import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from "@cosmjs/proto-signing";

const databaseName = "soundfaith-wallet";
const storeName = "vaults";
const activeWalletKey = "soundfaith-active-wallet";
const chainId = import.meta.env.VITE_COREUM_CHAIN_ID ?? "coreum-testnet-1";
const prefix = import.meta.env.VITE_COREUM_NETWORK === "mainnet" ? "core" : "testcore";
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

type PasskeyEnvelope = { credentialId: string; salt: string; iv: string; data: string; walletKind?: "mnemonic" | "private-key"; wallet: string };
type PasswordEnvelope = { salt: string; iv: string; data: string; walletKind?: "mnemonic" | "private-key"; wallet: string };
let sessionWallet: { id: string; wallet: DirectSecp256k1HdWallet | DirectSecp256k1Wallet; address: string } | null = null;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function randomSecret() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
}

async function withPasskeyTimeout<T>(operation: Promise<T>) {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new DOMException("The passkey prompt did not open or finish within 20 seconds.", "TimeoutError")), 20000);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

async function passkeySecret(salt: Uint8Array, create = false, credentialIdOverride?: string) {
  if (!window.isSecureContext) throw new Error("Passkey wallets require a secure HTTPS connection. Open the deployed app using its HTTPS Vercel URL.");
  if (!window.PublicKeyCredential || !navigator.credentials) throw new Error("This browser does not support passkey wallet unlock.");
  const storedCredentialId = credentialIdOverride ?? window.localStorage.getItem(biometricCredentialKey);
  let credentialId = storedCredentialId;
  if (create || !storedCredentialId) {
    const credential = await withPasskeyTimeout(navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)) as unknown as BufferSource,
        rp: { id: window.location.hostname, name: "SoundFaith" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)) as unknown as BufferSource, name: "soundfaith-wallet", displayName: "SoundFaith wallet" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        timeout: 60000,
      },
    }));
    if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey verification was not completed.");
    credentialId = base64Url(new Uint8Array(credential.rawId));
  }
  if (!credentialId) throw new Error("Passkey registration did not return a credential.");
  {
    const base64 = credentialId.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const id = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const credential = await withPasskeyTimeout(navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)) as unknown as BufferSource,
        allowCredentials: [{ id: id as unknown as BufferSource, type: "public-key" }],
        userVerification: "required",
        extensions: { prf: { eval: { first: salt as unknown as BufferSource } } },
        timeout: 60000,
      },
    }));
    if (!(credential instanceof PublicKeyCredential)) throw new Error("Passkey verification was not completed.");
    window.localStorage.setItem(biometricCredentialKey, credentialId);
    const result = (credential.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf?.results?.first;
    if (!result) throw new Error("This device completed passkey verification, but its passkey provider does not support secure wallet storage (PRF). Try Chrome on Android, update the browser and screen lock, or import a recovery phrase instead.");
    return new Uint8Array(result);
  }
}

async function wrapWalletSecret(secret: string, passkeyKey: Uint8Array, credentialId: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", passkeyKey as unknown as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(secret));
  return `passkey-v1:${JSON.stringify({ credentialId, salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) })}`;
}

async function encryptWalletPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(payload));
  return `payload-v1:${JSON.stringify({ iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) })}`;
}

async function decryptWalletPayload(payload: string, secret: string) {
  const parsed = JSON.parse(payload.slice("payload-v1:".length)) as { iv: string; data: string };
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "AES-GCM" }, false, ["decrypt"]);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(parsed.iv) as unknown as BufferSource }, key, base64ToBytes(parsed.data) as unknown as BufferSource);
  return new TextDecoder().decode(data);
}

async function passwordKey(password: string, salt: Uint8Array, usage: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, usage);
}

async function encryptWithPassword(payload: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, ["encrypt"]);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(payload));
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) };
}

async function decryptWithPassword(envelope: { salt: string; iv: string; data: string }, password: string) {
  const key = await passwordKey(password, base64ToBytes(envelope.salt), ["decrypt"]);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) as unknown as BufferSource }, key, base64ToBytes(envelope.data) as unknown as BufferSource);
  return new TextDecoder().decode(data);
}

async function unwrapWalletSecret(serialization: string) {
  const envelope = JSON.parse(serialization.slice("passkey-v1:".length)) as PasskeyEnvelope;
  const salt = base64ToBytes(envelope.salt);
  const decrypt = async (credentialId?: string) => {
    const passkeyKey = await passkeySecret(salt, false, credentialId);
    const key = await crypto.subtle.importKey("raw", passkeyKey as unknown as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
    const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) as unknown as BufferSource }, key, base64ToBytes(envelope.data) as unknown as BufferSource);
    return new TextDecoder().decode(data);
  };
  try {
    return await decrypt(envelope.credentialId);
  } catch (error) {
    const currentCredentialId = window.localStorage.getItem(biometricCredentialKey);
    if (!currentCredentialId || currentCredentialId === envelope.credentialId) throw error;
    return decrypt(currentCredentialId);
  }
}

function openVaultDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open local wallet storage"));
  });
}

async function purgeUnsupportedVaults(database: IDBDatabase) {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.getAll();
    request.onsuccess = () => {
      const activeId = window.localStorage.getItem(activeWalletKey);
      (request.result as StoredVault[]).filter((vault) => vault.id === "coreum-testnet" || (!vault.serialization.startsWith("passkey-v1:") && !vault.serialization.startsWith("password-v1:"))).forEach((vault) => {
        objectStore.delete(vault.id);
        if (vault.id === activeId) clearActiveBrowserWallet();
      });
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to reset local wallet storage"));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to reset local wallet storage"));
  });
}

async function readVault(id?: string) {
  const database = await openVaultDatabase();
  await purgeUnsupportedVaults(database);
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
  await purgeUnsupportedVaults(database);
  return new Promise<StoredVault[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = async () => {
      const vaults = (request.result as StoredVault[]).filter((vault) => vault.id !== "coreum-testnet");
      const supported = vaults.filter((vault) => vault.serialization.startsWith("passkey-v1:") || vault.serialization.startsWith("password-v1:"));
      resolve(supported.map((vault) => ({ ...vault, name: vault.name ?? "TX wallet" })));
    };
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
  sessionWallet = null;
}

export function clearWalletSession() {
  sessionWallet = null;
}

export type BrowserWallet = { id: string; name: string; address: string; createdAt: string };

export async function getBrowserWallets(ownerEmail?: string): Promise<BrowserWallet[]> {
  const seenAddresses = new Set<string>();
  return (await listVaults())
    .filter((wallet) => !ownerEmail || wallet.ownerEmail === ownerEmail)
    .filter((wallet) => {
      if (seenAddresses.has(wallet.address)) return false;
      seenAddresses.add(wallet.address);
      return true;
    })
    .map((wallet) => ({ id: wallet.id, name: displayWalletName(wallet.name), address: wallet.address, createdAt: wallet.createdAt }));
}

export async function switchBrowserWallet(id: string) {
  const wallet = await readVault(id);
  if (!wallet) throw new Error("That wallet is not available on this device.");
  if (sessionWallet?.id !== wallet.id) sessionWallet = null;
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
  if (sessionWallet?.id === id) sessionWallet = null;
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

async function storePasskeyWallet(wallet: string, address: string, name: string, ownerEmail: string | undefined, walletKind: PasskeyEnvelope["walletKind"] = "mnemonic", walletSecret = randomSecret()) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const passkeyKey = await passkeySecret(salt);
  const credentialId = window.localStorage.getItem(biometricCredentialKey) ?? "";
  const wrapped = await wrapWalletSecret(walletSecret, passkeyKey, credentialId, salt);
  if (walletKind === "private-key") {
    const restoredKey = fromHex(await decryptWalletPayload(await encryptWalletPayload(wallet, walletSecret), walletSecret));
    const restoredWallet = await DirectSecp256k1Wallet.fromKey(restoredKey, prefix);
    const [{ address: restoredAddress }] = await restoredWallet.getAccounts();
    if (restoredAddress !== address) throw new Error("Passkey wallet integrity check failed. The wallet was not saved.");
  } else {
    const restoredWallet = await DirectSecp256k1HdWallet.deserialize(wallet, walletSecret);
    const [{ address: restoredAddress }] = await restoredWallet.getAccounts();
    if (restoredAddress !== address) throw new Error("Passkey wallet integrity check failed. The wallet was not saved.");
  }
  const id = `wallet-${crypto.randomUUID()}`;
  const storedWallet = walletKind === "private-key" ? await encryptWalletPayload(wallet, walletSecret) : wallet;
  await writeVault({ id, name: name.trim() || "TX wallet", ownerEmail, address, serialization: `passkey-v1:${JSON.stringify({ ...JSON.parse(wrapped.slice("passkey-v1:".length)), wallet: storedWallet, walletKind })}`, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address };
}

async function storePasswordWallet(wallet: string, address: string, name: string, password: string | undefined, ownerEmail: string | undefined, walletKind: PasswordEnvelope["walletKind"] = "mnemonic", walletSecret = randomSecret()) {
  if (!password?.trim()) throw new Error("A wallet password is required.");
  const encryptedSecret = await encryptWithPassword(walletSecret, password);
  const storedWallet = walletKind === "private-key" ? await encryptWalletPayload(wallet, walletSecret) : wallet;
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name.trim() || "TX wallet", ownerEmail, address, serialization: `password-v1:${JSON.stringify({ ...encryptedSecret, wallet: storedWallet, walletKind })}`, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address };
}

export async function createPasskeyBrowserWallet(name = "TX wallet", ownerEmail?: string) {
  const wallet = await DirectSecp256k1HdWallet.generate(12, walletOptions());
  const [{ address }] = await wallet.getAccounts();
  const walletSecret = randomSecret();
  const serialization = await wallet.serialize(walletSecret);
  return storePasskeyWallet(serialization, address, name, ownerEmail, "mnemonic", walletSecret);
}

export async function createPasswordBrowserWallet(name = "TX wallet", password?: string, ownerEmail?: string) {
  const wallet = await DirectSecp256k1HdWallet.generate(12, walletOptions());
  const [{ address }] = await wallet.getAccounts();
  const walletSecret = randomSecret();
  const serialization = await wallet.serialize(walletSecret);
  return storePasswordWallet(serialization, address, name, password, ownerEmail, "mnemonic", walletSecret);
}

export async function hasPasskeyWallet() {
  const serialization = (await readVault())?.serialization;
  return serialization?.startsWith("passkey-v1:") || false;
}

export async function getActiveBrowserWalletSecurity(): Promise<"passkey" | "password" | null> {
  const serialization = (await readVault())?.serialization;
  if (serialization?.startsWith("passkey-v1:")) return "passkey";
  if (serialization?.startsWith("password-v1:")) return "password";
  return null;
}

export function isPasskeyFallbackError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("prf") || name === "NotSupportedError" || name === "SecurityError" || name === "TimeoutError";
}

export function describePasskeyError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "UnknownError";
  const detail = error instanceof Error ? error.message : String(error);
  const context = [
    `error=${name}`,
    `secure=${window.isSecureContext}`,
    `origin=${window.location.origin}`,
    `userAgent=${navigator.userAgent}`,
  ].join(" | ");
  return `${detail || "The passkey request did not complete."} (${context})`;
}

export async function unlockBrowserWallet() {
  const vault = await readVault();
  if (!vault) throw new Error("No local wallet is configured on this device.");
  if (vault.serialization.startsWith("passkey-v1:")) {
    const envelope = JSON.parse(vault.serialization.slice("passkey-v1:".length)) as PasskeyEnvelope;
    const walletSecret = await unwrapWalletSecret(vault.serialization);
    const wallet = envelope.walletKind === "private-key"
      ? await DirectSecp256k1Wallet.fromKey(fromHex(await decryptWalletPayload(envelope.wallet, walletSecret)), prefix)
      : await DirectSecp256k1HdWallet.deserialize(envelope.wallet, walletSecret);
    const [{ address }] = await wallet.getAccounts();
    if (address !== vault.address) throw new Error("Passkey wallet integrity check failed. Re-import the recovery phrase for this wallet.");
    return { wallet, address: vault.address };
  }
  if (vault.serialization.startsWith("password-v1:")) {
    const envelope = JSON.parse(vault.serialization.slice("password-v1:".length)) as PasswordEnvelope;
    if (sessionWallet?.id === vault.id) {
      if (hasBiometricUnlock()) await verifyBiometricUnlock();
      return { wallet: sessionWallet.wallet, address: sessionWallet.address };
    }
    const password = window.prompt("Enter your wallet password to unlock it on this device.");
    if (!password) throw new Error("Wallet unlock was cancelled.");
    let walletSecret: string;
    try {
      walletSecret = await decryptWithPassword(envelope, password);
    } catch {
      throw new Error("Incorrect wallet password.");
    }
    const wallet = envelope.walletKind === "private-key"
      ? await DirectSecp256k1Wallet.fromKey(fromHex(await decryptWalletPayload(envelope.wallet, walletSecret)), prefix)
      : await DirectSecp256k1HdWallet.deserialize(envelope.wallet, walletSecret);
    const [{ address }] = await wallet.getAccounts();
    if (address !== vault.address) throw new Error("Wallet integrity check failed. Restore the wallet from its recovery phrase.");
    if (hasBiometricUnlock()) await verifyBiometricUnlock();
    sessionWallet = { id: vault.id, wallet, address: vault.address };
    return { wallet, address: vault.address };
  }
  throw new Error("This wallet is not supported. Import its recovery phrase again to create a passkey wallet.");
}

export async function revealBrowserWalletMnemonic() {
  const { wallet } = await unlockBrowserWallet();
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
  await passkeySecret(crypto.getRandomValues(new Uint8Array(32)), true);
}

export async function verifyBiometricUnlock() {
  const credentialId = window.localStorage.getItem(biometricCredentialKey);
  if (!credentialId || !navigator.credentials) throw new Error("Biometric unlock is not configured on this device.");
  const base64 = credentialId.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
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
  if (vault.serialization.startsWith("passkey-v1:") || vault.serialization.startsWith("password-v1:")) await unlockBrowserWallet();
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
  if (parsed.format !== "soundfaith-coreum-wallet-v1" || !parsed.address || !parsed.serialization || (!parsed.serialization.startsWith("passkey-v1:") && !parsed.serialization.startsWith("password-v1:"))) throw new Error("This wallet backup is not supported.");
  if (expectedAddress && parsed.address !== expectedAddress) throw new Error("This backup belongs to a different wallet. Select the backup for the remembered TX address.");
  const id = `wallet-${crypto.randomUUID()}`;
  await writeVault({ id, name: name?.trim() || parsed.name || "Imported wallet", ownerEmail, address: parsed.address, serialization: parsed.serialization, createdAt: new Date().toISOString() });
  setActiveWallet(id);
  return { id, address: parsed.address };
}

export async function importBrowserWalletMnemonic(mnemonic: string, expectedAddress?: string | null, name = "Recovered wallet", ownerEmail?: string) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic.trim(), walletOptions());
  const [{ address }] = await wallet.getAccounts();
  if (expectedAddress && address !== expectedAddress) throw new Error("This mnemonic belongs to a different wallet. Check the remembered TX address and try again.");
  const walletSecret = randomSecret();
  return storePasskeyWallet(await wallet.serialize(walletSecret), address, name, ownerEmail, "mnemonic", walletSecret);
}

export async function importBrowserWalletMnemonicWithPassword(mnemonic: string, password: string, expectedAddress?: string | null, name = "Recovered wallet", ownerEmail?: string) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic.trim(), walletOptions());
  const [{ address }] = await wallet.getAccounts();
  if (expectedAddress && address !== expectedAddress) throw new Error("This mnemonic belongs to a different wallet. Check the remembered TX address and try again.");
  const walletSecret = randomSecret();
  return storePasswordWallet(await wallet.serialize(walletSecret), address, name, password, ownerEmail, "mnemonic", walletSecret);
}

export async function importBrowserWalletPrivateKey(privateKey: string, name = "Imported wallet", ownerEmail?: string) {
  const normalized = privateKey.trim().replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(normalized)) throw new Error("Enter a 32-byte private key as 64 hexadecimal characters.");
  const wallet = await DirectSecp256k1Wallet.fromKey(fromHex(normalized), prefix);
  const [{ address }] = await wallet.getAccounts();
  return storePasskeyWallet(bytesToBase64(fromHex(normalized)), address, name, ownerEmail, "private-key");
}

export { chainId, walletOptions };
