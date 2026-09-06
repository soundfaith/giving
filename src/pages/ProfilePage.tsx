import { useEffect, useState, type ChangeEvent } from "react";
import { Copy, Download, Eye, RefreshCw, Wallet } from "lucide-react";
import { formatMoney } from "../lib/projects";
import { identityRepository, type DonationRecord } from "../lib/supabase";
import { getCoreumBalances } from "../lib/wallet";
import { createBrowserWallet, exportBrowserWallet, getBrowserWalletAddress, getBrowserWallets, hasBiometricUnlock, importBrowserWallet, registerBiometricUnlock, revealBrowserWalletMnemonic, switchBrowserWallet, verifyBiometricUnlock } from "../lib/walletVault";

export function ProfilePage() {
  const [profile, setProfile] = useState<{ email?: string | null; wallet_address?: string | null; handle?: string | null } | null>(null);
  const [handleDraft, setHandleDraft] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [mnemonicRevealed, setMnemonicRevealed] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [mnemonicPassword, setMnemonicPassword] = useState("");
  const [ownedProjects, setOwnedProjects] = useState<Array<{ id: string; title: string; status: string; goal_tx: number }>>([]);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<Array<{ id: string; name: string; address: string }>>([]);
  const [walletName, setWalletName] = useState("");
  const [walletCreatePassword, setWalletCreatePassword] = useState("");

  const refresh = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [dashboard, localAddress, localWallets] = await Promise.all([identityRepository.getDashboard(), getBrowserWalletAddress(), getBrowserWallets()]);
      setProfile(dashboard.profile);
      setHandleDraft(dashboard.profile?.handle ?? "");
      setOwnedProjects(dashboard.ownedProjects);
      setDonations(dashboard.donations);
      setWallets(localWallets);
      const address = dashboard.profile?.wallet_address ?? localAddress;
      const balances = address ? await getCoreumBalances(address) : null;
      setBalance(balances?.native ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const syncBiometricState = () => setBiometricEnabled(hasBiometricUnlock());
    syncBiometricState();
    window.addEventListener("focus", syncBiometricState);
    document.addEventListener("visibilitychange", syncBiometricState);
    return () => {
      window.removeEventListener("focus", syncBiometricState);
      document.removeEventListener("visibilitychange", syncBiometricState);
    };
  }, []);
  const revealMnemonic = async () => {
    try {
      if (biometricEnabled) await verifyBiometricUnlock();
      setMnemonic(await revealBrowserWalletMnemonic(mnemonicPassword));
      setMnemonicRevealed(false);
      setMnemonicPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to unlock mnemonic");
    }
  };
  const enableBiometric = async () => {
    try {
      await registerBiometricUnlock();
      setBiometricEnabled(true);
      setMessage("Biometric verification enabled for this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to enable biometric verification");
    }
  };
  const copyMnemonic = async () => {
    if (mnemonic && mnemonicRevealed) await navigator.clipboard.writeText(mnemonic);
  };
  const updateHandle = async () => {
    try {
      const updated = await identityRepository.updateProfileHandle(handleDraft);
      setProfile((current) => ({ ...(current ?? {}), handle: updated?.handle ?? handleDraft }));
      setHandleDraft(updated?.handle ?? handleDraft);
      setMessage("Handle updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update handle");
    }
  };
  const deleteProfile = async () => {
    try {
      await identityRepository.deleteProfile();
      setProfile((current) => ({ ...(current ?? {}), email: null, wallet_address: current?.wallet_address ?? null, handle: null }));
      setMessage("Profile removed. Your linked wallet is still preserved for future sign-ins.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete profile");
    }
  };
  const switchWallet = async (id: string) => {
    try {
      const next = await switchBrowserWallet(id);
      setWallets((current) => current.map((wallet) => wallet.id === next.id ? { ...wallet, name: next.name, address: next.address } : wallet));
      setProfile((current) => ({ ...(current ?? {}), wallet_address: next.address }));
      await identityRepository.syncProfile(next.address);
      const balances = await getCoreumBalances(next.address);
      setBalance(balances.native);
      setMessage(`Using ${next.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to switch wallet");
    }
  };
  const createAdditionalWallet = async () => {
    try {
      const created = await createBrowserWallet(walletCreatePassword, walletName);
      setWalletName("");
      setWalletCreatePassword("");
      setMessage(`Created and selected ${walletName.trim() || "Coreum wallet"}.`);
      await refresh();
      void created;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create wallet");
    }
  };
  const importAdditionalWallet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importBrowserWallet(file, null, walletName);
      setWalletName("");
      setMessage("Wallet imported and selected.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import wallet");
    } finally {
      event.target.value = "";
    }
  };

  return <main className="profile-page section-wrap">
    <div className="profile-page-heading"><div><p className="eyebrow">Your SoundFaith identity</p><h1>Giving with <em>intention.</em></h1></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh profile" title="Refresh profile"><RefreshCw size={16} /></button></div>
    {message && <p className="modal-footnote profile-message">{message}</p>}
    <section className="profile-overview">
      <div className="profile-overview-item"><span>Handle</span><strong>{profile?.handle ?? (loading ? "Loading..." : "Not assigned")}</strong></div>
      <div className="profile-overview-item"><span>Email</span><strong>{profile?.email ?? (loading ? "Loading..." : "Not available")}</strong></div>
      <div className="profile-overview-item"><span>Wallet name</span><strong>{wallets.find((wallet) => wallet.address === profile?.wallet_address)?.name ?? "Coreum wallet"}</strong></div><div className="profile-overview-item"><span>Coreum wallet</span><strong className="account-wallet-address">{profile?.wallet_address ?? "Not configured"}</strong></div><div className="profile-overview-item"><span>TX balance</span><strong>{balance === null ? (loading ? "Loading..." : "--") : `${balance.toFixed(6)} TX`}</strong></div>
    </section>
    <div className="profile-page-actions"><button className="button button-coral" onClick={() => void exportBrowserWallet()}><Download size={15} /> Export encrypted wallet</button><button className="button button-dark" onClick={() => void deleteProfile()}>Delete profile</button><span><Wallet size={15} /> Wallet secrets stay on your device</span></div>
    <section className="mnemonic-section"><div><p className="eyebrow">Wallets on this device</p><h2>Choose a wallet</h2><p>Your last selected wallet is used automatically when you return on this device.</p></div><div className="wallet-switcher">{wallets.map((wallet) => <button className={wallet.address === profile?.wallet_address ? "wallet-option active" : "wallet-option"} key={wallet.id} onClick={() => void switchWallet(wallet.id)}><strong>{wallet.name}</strong><small>{wallet.address}</small></button>)}</div><div className="mnemonic-controls"><input placeholder="Wallet name" value={walletName} onChange={(event) => setWalletName(event.target.value)} /><input type="password" placeholder="New wallet password" value={walletCreatePassword} onChange={(event) => setWalletCreatePassword(event.target.value)} /><button className="button button-dark" onClick={() => void createAdditionalWallet()} disabled={!walletCreatePassword || walletCreatePassword.length < 12}>Add wallet</button><label className="wallet-import">Import wallet backup<input type="file" accept="application/json" onChange={importAdditionalWallet} /></label></div></section>
    <section className="mnemonic-section"><div><p className="eyebrow">Public handle</p><h2>Choose your display name</h2><p>Your handle is public and is used in project discussions. It is generated automatically when you first sign in, and you can choose your own anytime.</p></div><div className="mnemonic-controls"><input placeholder="kind-shepherd" value={handleDraft} onChange={(event) => setHandleDraft(event.target.value)} /><button className="button button-dark" onClick={() => void updateHandle()} disabled={!handleDraft.trim()} >Save handle</button></div></section>
    <section className="mnemonic-section"><div><p className="eyebrow">Wallet recovery</p><h2>Reveal mnemonic</h2><p>Enter your wallet password to decrypt it locally. The words stay blurred until you explicitly choose to show them.</p></div><div className="mnemonic-controls"><input type="password" placeholder="Wallet password" value={mnemonicPassword} onChange={(event) => setMnemonicPassword(event.target.value)} /><button className="button button-dark" onClick={() => void revealMnemonic()} disabled={!mnemonicPassword}><Eye size={15} /> Unlock</button></div><div className="mnemonic-controls"><button className="button button-dark" onClick={() => void enableBiometric()} disabled={biometricEnabled}>{biometricEnabled ? "Biometric verification enabled" : "Enable device biometrics"}</button></div>{mnemonic && <div className="mnemonic-reveal"><div className={mnemonicRevealed ? "mnemonic-words revealed" : "mnemonic-words"}>{mnemonic.split(/\s+/).map((word, index) => <span className="mnemonic-word" key={`${word}-${index}`}><small>{index + 1}</small><b>{word}</b></span>)}</div><div className="mnemonic-reveal-actions">{!mnemonicRevealed && <button className="button button-dark" onClick={() => setMnemonicRevealed(true)}><Eye size={15} /> Show mnemonic</button>}{mnemonicRevealed && <button className="icon-button" onClick={() => void copyMnemonic()} aria-label="Copy mnemonic" title="Copy mnemonic"><Copy size={15} /></button>}<button className="button button-dark" onClick={() => { setMnemonic(null); setMnemonicRevealed(false); }}>Hide</button></div></div>}</section>
    <section className="profile-page-section"><div className="profile-section-heading"><p className="eyebrow">Projects you own</p><span>{ownedProjects.length}</span></div>{ownedProjects.length ? <div className="profile-page-list">{ownedProjects.map((project) => <article className="profile-page-row" key={project.id}><div><h2>{project.title}</h2><span>{project.status}</span></div><strong>Goal {formatMoney(Number(project.goal_tx))}</strong></article>)}</div> : <p className="profile-empty">No submitted projects yet.</p>}</section>
    <section className="profile-page-section"><div className="profile-section-heading"><p className="eyebrow">Donation history</p><span>{donations.length}</span></div>{donations.length ? <div className="profile-page-list">{donations.map((donation) => <article className="profile-page-row" key={donation.id}><div><h2>{donation.project?.title ?? donation.project_id}</h2><span>{new Date(donation.created_at).toLocaleDateString()} · {donation.network}</span><small>{donation.tx_hash}</small></div><strong>{formatMoney(Number(donation.amount_tx))} TX</strong></article>)}</div> : <p className="profile-empty">No indexed donations yet.</p>}</section>
  </main>;
}
