import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Check, CircleHelp, Wallet, X } from "lucide-react";
import {
  attachProjectPhotos,
  createChurchOrganization,
  getProjectPhotoUrl,
  submitChurchProject,
  uploadProjectPhoto,
} from "../lib/churches";
import { identityRepository, type DonationRecord } from "../lib/supabase";
import type { Project } from "../lib/supabase";
import { formatExchangeRate, formatMoney } from "../lib/projects";
import { projectCategories } from "../lib/projects";
import { Progress, ProjectVisual } from "./ProjectPrimitives";
import {
  createBrowserWallet,
  exportBrowserWallet,
  getBrowserWalletAddress,
  importBrowserWallet,
  importBrowserWalletMnemonic,
} from "../lib/walletVault";
import { donateWithWallet, friendlyWalletError, getCoreumBalance } from "../lib/wallet";

export type Modal =
  | { type: "wallet" }
  | { type: "wallet-setup"; walletAddress?: string | null }
  | { type: "account" }
  | { type: "church" }
  | { type: "project"; project: Project }
  | { type: "donate"; project: Project };

export function ModalLayer({
  modal,
  close,
  onDonate,
  ownerEmail,
}: {
  modal: Modal;
  close: () => void;
  onDonate: (project: Project) => void;
  ownerEmail?: string | null;
}) {
  const [amount, setAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState("50");
  const [txUsdRate, setTxUsdRate] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [transactionHash, setTransactionHash] = useState("");
  const [donationPassword, setDonationPassword] = useState("");
  const [localWalletAvailable, setLocalWalletAvailable] = useState(false);
  const [profile, setProfile] = useState<{
    email?: string | null;
    wallet_address?: string | null;
  } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [ownedProjects, setOwnedProjects] = useState<
    Array<{ id: string; title: string; status: string; goal_tx: number }>
  >([]);
  const [walletExists, setWalletExists] = useState(false);
  const [walletPassword, setWalletPassword] = useState("");
  const [walletPasswordConfirmation, setWalletPasswordConfirmation] =
    useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [walletSetupMode, setWalletSetupMode] = useState<
    "choices" | "import" | "mnemonic" | "create"
  >("choices");
  const [churchSubmitted, setChurchSubmitted] = useState(false);
  const [churchLoading, setChurchLoading] = useState(false);
  const [churchForm, setChurchForm] = useState({
    name: "",
    churchName: "",
    title: "",
    location: "",
    country: "United States",
    description: "",
    goalTx: "",
    category: "Sound & AV" as (typeof projectCategories)[number],
  });
  const [churchPhotos, setChurchPhotos] = useState<File[]>([]);
  const [churchPhotoUrls, setChurchPhotoUrls] = useState<string[]>([]);
  const [churchStep, setChurchStep] = useState(1);
  const [churchPrimaryPhoto, setChurchPrimaryPhoto] = useState(0);
  const [closing, setClosing] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchDeltaY = useRef(0);
  useEffect(() => {
    const urls = churchPhotos.map((photo) => URL.createObjectURL(photo));
    setChurchPhotoUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [churchPhotos]);
  useEffect(() => {
    if (modal.type === "donate") {
      setTxUsdRate(null);
      Promise.all([getBrowserWalletAddress(), identityRepository.getTxExchangeRate()]).then(([address, rate]) => {
        setLocalWalletAvailable(Boolean(address));
        setTxUsdRate(rate.tx_usd_rate);
      }).catch(() => setMessage("We could not load the current TX rate. Please try again."));
    }
    if (modal.type !== "account") return;
    Promise.all([
      identityRepository.getProfile(),
      identityRepository.getDashboard(),
      getBrowserWalletAddress(),
    ])
      .then(async ([currentProfile, dashboard, address]) => {
        setProfile(currentProfile);
        setOwnedProjects(dashboard.ownedProjects);
        setDonations(dashboard.donations);
        setWalletExists(Boolean(address));
        const walletAddress = address ?? currentProfile?.wallet_address;
        if (walletAddress) setBalance(await getCoreumBalance(walletAddress));
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Unable to load profile",
        ),
      );
  }, [modal.type]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && modal.type !== "wallet-setup") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close, modal.type]);
  const connect = async (provider: "google" | "apple" | "email") => {
    setMessage("");
    try {
      if (provider === "email") {
        await identityRepository.connect(provider, email);
        setMessage("Check your email for the secure sign-in link.");
        return;
      }
      setMessage(
        `Opening ${provider === "apple" ? "Apple" : "Google"} sign-in...`,
      );
      await identityRepository.connect(provider, email);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to start sign-in",
      );
    }
  };
  const donate = async () => {
    setMessage("");
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a donation amount greater than 0 TX.");
      return;
    }
    setLoading(true);
    try {
      const result = await donateWithWallet(
        modal.type === "donate" ? modal.project.id : "",
        amount,
        localWalletAvailable ? donationPassword : undefined,
      );
      await identityRepository.syncProfile(result.address);
      setTransactionHash(result.txHash);
      setConfirmed(true);
      window.dispatchEvent(new CustomEvent("soundfaith-data-changed"));
    } catch (error) {
      setMessage(
        friendlyWalletError(error),
      );
    } finally {
      setLoading(false);
    }
  };
  const updateChurchPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedPhotos = Array.from(event.target.files ?? []);
    if (selectedPhotos.length > 3) {
      setMessage("Choose up to three images.");
      return;
    }
    if (selectedPhotos.some((photo) => !photo.type.startsWith("image/"))) {
      setMessage("Choose image files only.");
      return;
    }
    setMessage("");
    setChurchPhotos(selectedPhotos);
    setChurchPrimaryPhoto(0);
  };
  const advanceChurchStep = () => {
    setMessage("");
    setChurchStep((current) => Math.min(3, current + 1));
  };
  const selectChurchStep = (targetStep: number) => {
    setMessage("");
    setChurchStep(targetStep);
  };
  const submitChurch = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!churchForm.name.trim() || !churchForm.churchName.trim() || !churchForm.title.trim() || !churchForm.location.trim() || !churchForm.country.trim() || !churchForm.description.trim() || !churchForm.goalTx || Number(churchForm.goalTx) <= 0) {
      setMessage("Complete all project fields before submitting.");
      return;
    }
    setChurchLoading(true);
    try {
      const ownerWalletAddress = await getBrowserWalletAddress();
      if (!ownerWalletAddress)
        throw new Error(
          "Create or import a wallet before submitting a project.",
        );
      const organization = await createChurchOrganization(
        churchForm.name.trim(),
      );
      const project = await submitChurchProject({
        organizationId: organization.id,
        title: churchForm.title.trim(),
        churchName: churchForm.churchName.trim(),
        location: churchForm.location.trim(),
        country: churchForm.country.trim(),
        description: churchForm.description.trim(),
        category: churchForm.category,
        goalTx: Number(churchForm.goalTx),
        ownerWalletAddress,
      });
      const orderedPhotos = churchPhotos.length
        ? [churchPhotos[churchPrimaryPhoto], ...churchPhotos.filter((_, index) => index !== churchPrimaryPhoto)]
        : [];
      const photoPaths = await Promise.all(
        orderedPhotos.map((photo) => uploadProjectPhoto(project.id, photo)),
      );
      await attachProjectPhotos(project.id, photoPaths.map(getProjectPhotoUrl));
      setChurchSubmitted(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to submit project",
      );
    } finally {
      setChurchLoading(false);
    }
  };
  const createWallet = async () => {
    setMessage("");
    try {
      if (walletPassword !== walletPasswordConfirmation)
        throw new Error("Wallet passwords do not match.");
      const { address } = await createBrowserWallet(walletPassword, "TX wallet", ownerEmail ?? undefined);
      await identityRepository.syncProfile(address);
      setProfile((current) => ({
        ...(current ?? {}),
        wallet_address: address,
      }));
      setWalletExists(true);
      setWalletPassword("");
      setWalletPasswordConfirmation("");
      close();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create wallet",
      );
    }
  };
  const importWallet = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    try {
      const { address } = await importBrowserWallet(
        file,
        rememberedWalletAddress,
        undefined,
        ownerEmail ?? undefined,
      );
      await identityRepository.syncProfile(address);
      setProfile((current) => ({
        ...(current ?? {}),
        wallet_address: address,
      }));
      setWalletExists(true);
      close();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to import wallet",
      );
    }
  };
  const importMnemonic = async () => {
    setMessage("");
    try {
      const { address } = await importBrowserWalletMnemonic(
        mnemonic,
        walletPassword,
        null,
        "Recovered wallet",
        ownerEmail ?? undefined,
      );
      await identityRepository.syncProfile(address);
      setProfile((current) => ({
        ...(current ?? {}),
        wallet_address: address,
      }));
      setWalletExists(true);
      setMnemonic("");
      setWalletPassword("");
      close();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to import mnemonic",
      );
    }
  };
  const signOut = async () => {
    await identityRepository.signOut();
    close();
    window.location.hash = "#/";
    window.scrollTo(0, 0);
  };
  const isWalletSetupModal = modal.type === "wallet-setup";
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  const rememberedWalletAddress =
    profile?.wallet_address ??
    (isWalletSetupModal ? modal.walletAddress : null);
  const isWalletSetup = isWalletSetupModal && !rememberedWalletAddress;
  const swipeClose = () => {
    if (isWalletSetupModal) return;
    setClosing(true);
    window.setTimeout(close, 220);
  };
  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!isWalletSetupModal && event.target === event.currentTarget)
          close();
      }}
    >
      <section
        className={`${isWalletSetupModal ? "modal wallet-setup-modal" : "modal"}${closing ? " modal-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onTouchStart={(event) => { touchStartY.current = event.touches[0]?.clientY ?? null; touchDeltaY.current = 0; }}
        onTouchMove={(event) => { if (touchStartY.current !== null) { touchDeltaY.current = Math.max(0, (event.touches[0]?.clientY ?? touchStartY.current) - touchStartY.current); } }}
        onTouchEnd={() => { if (touchDeltaY.current > 80) swipeClose(); touchStartY.current = null; touchDeltaY.current = 0; }}
      >
        {!isWalletSetupModal && (
          <button
            className="modal-close"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        )}
        {isWalletSetupModal && rememberedWalletAddress && (
          <div className="wallet-onboarding">
            <p className="eyebrow">Reconnect your TX wallet</p>
            <h2 id="modal-title">
              Choose how to <em>continue.</em>
            </h2>
            <p className="modal-copy">
              Your existing wallet is linked to this account. Choose one option;
              recovery data stays on this device.
            </p>
            {walletSetupMode === "choices" && (
              <div className="wallet-choice-list">
                <button
                  className="button button-dark modal-action"
                  onClick={() => setWalletSetupMode("import")}
                >
                  1. Import from backup
                </button>
                <button
                  className="button button-dark modal-action"
                  onClick={() => setWalletSetupMode("mnemonic")}
                >
                  2. Import from mnemonic
                </button>
                <button
                  className="button button-coral modal-action"
                  onClick={() => setWalletSetupMode("create")}
                >
                  3. Create new wallet
                </button>
                <button
                  className="button button-dark modal-action"
                  onClick={() => void signOut()}
                >
                  Browse as guest
                </button>
              </div>
            )}
            {walletSetupMode === "import" && (
              <div className="wallet-create-form">
                <label className="wallet-import">
                  Choose encrypted backup
                  <input
                    type="file"
                    accept="application/json"
                    onChange={importWallet}
                  />
                </label>
                <button
                  className="button button-dark modal-action"
                  onClick={() => setWalletSetupMode("choices")}
                >
                  Back
                </button>
              </div>
            )}
            {walletSetupMode === "mnemonic" && (
              <div className="wallet-create-form">
                <textarea
                  placeholder="Enter your 12-word recovery phrase"
                  value={mnemonic}
                  onChange={(event) => setMnemonic(event.target.value)}
                />
                <input
                  type="password"
                  minLength={12}
                  placeholder="New local wallet password (12+ characters)"
                  value={walletPassword}
                  onChange={(event) => setWalletPassword(event.target.value)}
                />
                <button
                  className="button button-dark modal-action"
                  onClick={() => void importMnemonic()}
                  disabled={!mnemonic.trim() || walletPassword.length < 12}
                >
                  Restore wallet
                </button>
                <button
                  className="button button-dark modal-action"
                  onClick={() => setWalletSetupMode("choices")}
                >
                  Back
                </button>
              </div>
            )}
            {walletSetupMode === "create" && (
              <div className="wallet-create-form">
                <input
                  type="password"
                  minLength={12}
                  placeholder="Wallet password (12+ characters)"
                  value={walletPassword}
                  onChange={(event) => setWalletPassword(event.target.value)}
                />
                <input
                  type="password"
                  minLength={12}
                  placeholder="Repeat wallet password"
                  value={walletPasswordConfirmation}
                  onChange={(event) =>
                    setWalletPasswordConfirmation(event.target.value)
                  }
                />
                <button
                  className="button button-coral modal-action"
                  onClick={createWallet}
                  disabled={!walletPassword || walletPassword.length < 12}
                >
                  Create wallet
                </button>
                <button
                  className="button button-dark modal-action"
                  onClick={() => setWalletSetupMode("choices")}
                >
                  Back
                </button>
              </div>
            )}
            {message && <p className="modal-footnote">{message}</p>}
          </div>
        )}
        {isWalletSetup && (
          <div className="wallet-onboarding">
            <p className="eyebrow">
              {rememberedWalletAddress ? "Wallet found" : "One last step"}
            </p>
            <h2 id="modal-title">
              {rememberedWalletAddress ? (
                <>
                  Reconnect your <em>TX wallet.</em>
                </>
              ) : (
                <>
                  Create your <em>TX wallet.</em>
                </>
              )}
            </h2>
            <p className="modal-copy">
              {rememberedWalletAddress
                ? "This account already has a wallet linked to it. Import an encrypted backup or enter the mnemonic from your other laptop. The recovery data stays in this browser."
                : "Your social login is ready. Create or import a wallet before continuing. The encrypted backup stays on your device; SoundFaith never receives your mnemonic or password."}
            </p>
            {rememberedWalletAddress && (
              <p className="modal-footnote account-wallet-address">
                Remembered wallet: {rememberedWalletAddress}
              </p>
            )}
            {!rememberedWalletAddress && (
              <>
                <input
                  type="password"
                  minLength={12}
                  placeholder="Wallet password (12+ characters)"
                  value={walletPassword}
                  onChange={(event) => setWalletPassword(event.target.value)}
                />
                <input
                  type="password"
                  minLength={12}
                  placeholder="Repeat wallet password"
                  value={walletPasswordConfirmation}
                  onChange={(event) =>
                    setWalletPasswordConfirmation(event.target.value)
                  }
                />
                <button
                  className="button button-coral modal-action"
                  onClick={createWallet}
                  disabled={!walletPassword || walletPassword.length < 12}
                >
                  Create wallet <Wallet size={15} />
                </button>
              </>
            )}
            <label className="wallet-import">
              Import encrypted backup
              <input
                type="file"
                accept="application/json"
                onChange={importWallet}
              />
            </label>
            {rememberedWalletAddress && (
              <div className="wallet-mnemonic-import">
                <p className="eyebrow">Or enter mnemonic</p>
                <textarea
                  placeholder="Enter your 12-word recovery phrase"
                  value={mnemonic}
                  onChange={(event) => setMnemonic(event.target.value)}
                />
                <input
                  type="password"
                  minLength={12}
                  placeholder="New local wallet password (12+ characters)"
                  value={walletPassword}
                  onChange={(event) => setWalletPassword(event.target.value)}
                />
                <button
                  className="button button-dark modal-action"
                  onClick={() => void importMnemonic()}
                  disabled={!mnemonic.trim() || walletPassword.length < 12}
                >
                  Restore from mnemonic <Wallet size={15} />
                </button>
              </div>
            )}
            {message && <p className="modal-footnote">{message}</p>}
          </div>
        )}
        {modal.type === "project" && (
          <div className="project-detail-panel">
            <ProjectVisual project={modal.project} featured />
            <div className="project-detail-copy">
              <div className="feature-panel-top">
                <span className="category-label">{modal.project.category}</span>
                <span className="feature-location">
                  {modal.project.location}
                </span>
              </div>
              <p className="feature-church">{modal.project.church}</p>
              <h2 id="modal-title">{modal.project.title}</h2>
              <p className="modal-copy">{modal.project.description}</p>
              <Progress project={modal.project} />
              <div className="funding-footer">
                <span>
                  <b>
                    {Math.round(
                      (modal.project.raised / modal.project.goal) * 100,
                    )}
                    %
                  </b>{" "}
                  funded
                </span>
                <span>{modal.project.donors} neighbors have given</span>
              </div>
              <button
                className="button button-coral modal-action"
                onClick={() => onDonate(modal.project)}
              >
                Support this project <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        )}
        {modal.type === "account" && (
          <div className="account-panel">
            <p className="eyebrow">Your SoundFaith identity</p>
            <h2 id="modal-title">
              Giving with <em>intention.</em>
            </h2>
            <div className="account-details">
              <span>Email</span>
              <strong>{profile?.email ?? "Loading..."}</strong>
              <span>TX wallet</span>
              <strong className="account-wallet-address">
                {profile?.wallet_address ?? "Not configured"}
              </strong>
              <span>TX balance</span>
              <strong>
                {balance === null ? "--" : `${balance.toFixed(6)} TX`}
              </strong>
            </div>
            {message && <p className="modal-footnote">{message}</p>}
            {!walletExists && (
              <div className="wallet-setup">
                <p className="eyebrow">Create your local wallet</p>
                <p className="modal-copy">
                  The encrypted wallet stays in this browser. SoundFaith never
                  receives your mnemonic or password.
                </p>
                <input
                  type="password"
                  minLength={12}
                  placeholder="Wallet password (12+ characters)"
                  value={walletPassword}
                  onChange={(event) => setWalletPassword(event.target.value)}
                />
                <input
                  type="password"
                  minLength={12}
                  placeholder="Repeat wallet password"
                  value={walletPasswordConfirmation}
                  onChange={(event) =>
                    setWalletPasswordConfirmation(event.target.value)
                  }
                />
                <button
                  className="button button-coral modal-action"
                  onClick={createWallet}
                  disabled={!walletPassword || walletPassword.length < 12}
                >
                  Create TX wallet <Wallet size={15} />
                </button>
                <label className="wallet-import">
                  Import encrypted backup
                  <input
                    type="file"
                    accept="application/json"
                    onChange={importWallet}
                  />
                </label>
              </div>
            )}
            {walletExists && (
              <div className="wallet-actions">
                <button
                  className="button button-coral modal-action"
                  onClick={exportBrowserWallet}
                >
                  Export encrypted backup
                </button>
                <button
                  className="button button-dark modal-action"
                  onClick={async () => {
                    if (profile?.wallet_address)
                      setBalance(
                        await getCoreumBalance(profile.wallet_address),
                      );
                  }}
                >
                  Refresh balance
                </button>
              </div>
            )}
            <section className="profile-section">
              <p className="eyebrow">Projects you own</p>
              {ownedProjects.length ? (
                ownedProjects.map((item) => (
                  <div className="profile-list-item" key={item.id}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.status} · goal {formatMoney(Number(item.goal_tx))}
                    </span>
                  </div>
                ))
              ) : (
                <p className="modal-footnote">No submitted projects yet.</p>
              )}
            </section>
            <section className="profile-section">
              <p className="eyebrow">Donation history</p>
              {donations.length ? (
                donations.map((donation) => (
                  <div className="profile-list-item" key={donation.id}>
                    <strong>
                      {formatMoney(Number(donation.amount_tx))} TX
                    </strong>
                    <span>
                      {donation.project?.title ?? donation.project_id} ·{" "}
                      {new Date(donation.created_at).toLocaleDateString()}
                    </span>
                    <small>{donation.tx_hash}</small>
                  </div>
                ))
              ) : (
                <p className="modal-footnote">No indexed donations yet.</p>
              )}
            </section>
            <button
              className="button button-dark modal-action"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        )}
        {modal.type === "church" &&
          (churchSubmitted ? (
            <div className="confirmation">
              <div className="confirmation-icon">
                <Check size={27} />
              </div>
              <p className="eyebrow">Project submitted</p>
              <h2 id="modal-title">
                We’ll review <em>your project.</em>
              </h2>
              <p className="modal-copy">
                Your church improvement plan is saved for review.
              </p>
              <button
                className="button button-dark modal-action"
                onClick={close}
              >
                Done
              </button>
            </div>
          ) : (
            <form className="church-project-form" onSubmit={(event) => {
              if (churchStep !== 3) {
                event.preventDefault();
                advanceChurchStep();
                return;
              }
              void submitChurch(event);
            }}>
              <div className="church-project-form-header">
                <div className="church-step-tabs" aria-label="Project submission steps">
                  {["Project details", "Description", "Upload images"].map((label, index) => <button type="button" className={churchStep === index + 1 ? "church-step active" : churchStep > index + 1 ? "church-step complete" : "church-step"} onClick={() => selectChurchStep(index + 1)} key={label}><b>{index + 1}</b>{label}</button>)}
                </div>
                <h2 id="modal-title">Make room <em>for more.</em></h2>
                <p className="modal-copy">Submit a church improvement plan for your community. Explain the project in detail. Clear context, goals, and expected impact help the review team understand and assess your plan.</p>
              </div>
              <div className="church-modal-content">
              {churchStep === 1 && <div className="church-form">
                <input
                  placeholder="Organization name"
                  value={churchForm.name}
                  onChange={(event) =>
                    setChurchForm({ ...churchForm, name: event.target.value })
                  }
                />
                <input
                  placeholder="Church name"
                  value={churchForm.churchName}
                  onChange={(event) =>
                    setChurchForm({
                      ...churchForm,
                      churchName: event.target.value,
                    })
                  }
                />
                <input
                  placeholder="Project title"
                  value={churchForm.title}
                  onChange={(event) =>
                    setChurchForm({ ...churchForm, title: event.target.value })
                  }
                />
                <input
                  placeholder="City, State"
                  value={churchForm.location}
                  onChange={(event) =>
                    setChurchForm({
                      ...churchForm,
                      location: event.target.value,
                    })
                  }
                />
                <input
                  placeholder="Country"
                  value={churchForm.country}
                  onChange={(event) => setChurchForm({ ...churchForm, country: event.target.value })}
                />
                <fieldset className="church-category-options"><legend>Project type</legend>{projectCategories.map((category) => <label className={churchForm.category === category ? "church-category-option selected" : "church-category-option"} key={category}><input type="radio" name="project-category" value={category} checked={churchForm.category === category} onChange={() => setChurchForm({ ...churchForm, category })} /><span>{category}</span></label>)}</fieldset>
                <input
                  className="goal-input"
                  type="number"
                  min="1"
                  placeholder="Goal in USD"
                  value={churchForm.goalTx}
                  onChange={(event) =>
                    setChurchForm({ ...churchForm, goalTx: event.target.value })
                  }
                />
              </div>}
              {churchStep === 2 && <div className="church-step-panel"><textarea className="church-description-large" placeholder="Describe what you want to improve, why it matters, and what this funding will make possible." value={churchForm.description} onChange={(event) => setChurchForm({ ...churchForm, description: event.target.value })} /></div>}
              {churchStep === 3 && <div className="church-step-panel"><p className="modal-copy">Upload up to three images and choose which image appears first in the catalog and project detail view.</p><label className="church-upload-card"><span>Choose up to 3 images</span><small>JPG, PNG, or WebP</small><input type="file" accept="image/*" multiple onChange={updateChurchPhotos} /></label>{churchPhotos.length > 0 && <><div className="church-photo-previews">{churchPhotos.map((photo, index) => <button type="button" className={index === churchPrimaryPhoto ? "church-photo-preview selected" : "church-photo-preview"} key={`${photo.name}-${index}`} onClick={() => setChurchPrimaryPhoto(index)}><img src={churchPhotoUrls[index]} alt={`Project preview ${index + 1}`} /><span>{index === churchPrimaryPhoto ? "Selected image" : "Use this image"}</span></button>)}</div><div className="church-image-previews"><div><p className="eyebrow">Catalog preview</p><article className="church-catalog-preview"><img src={churchPhotoUrls[churchPrimaryPhoto]} alt="Selected project catalog preview" /><div><strong>{churchForm.title || "Your project title"}</strong><span>{churchForm.churchName || "Your church"}</span></div></article></div><div><p className="eyebrow">Project detail preview</p><article className="church-detail-preview"><img src={churchPhotoUrls[churchPrimaryPhoto]} alt="Selected project detail preview" /><strong>{churchForm.title || "Your project title"}</strong><span>{churchForm.description || "Your project description will appear here."}</span></article></div></div></>}</div>}
              {message && <p className="modal-footnote">{message}</p>}
              </div>
              <div className="church-step-actions">{churchStep > 1 && <button type="button" className="church-step-back" onClick={() => { setMessage(""); setChurchStep((current) => current - 1); }}>Back</button>}{churchStep < 3 ? <button type="button" className="button button-coral" onClick={advanceChurchStep}>Continue <ArrowUpRight size={16} /></button> : <button className="button button-coral" type="submit" disabled={churchLoading}>{churchLoading ? "Submitting..." : "Submit for review"} <ArrowUpRight size={16} /></button>}</div>
            </form>
          ))}
        {modal.type === "wallet" && (
          <>
            <p className="eyebrow">Your giving wallet</p>
            <h2 id="modal-title">
              Connect to <em>continue.</em>
            </h2>
            <p className="modal-copy">
              Use Google, Apple, or email to create your SoundFaith profile.
              Wallet signing is added after a secure wallet backup is
              configured.
            </p>
            <div className="social-options">
              <button type="button" onClick={() => connect("google")}>
                <span className="social-icon google">G</span> Continue with
                Google <ArrowUpRight size={15} />
              </button>
              <button type="button" onClick={() => connect("apple")}>
                <span className="social-icon apple">&#x2022;</span> Continue
                with Apple <ArrowUpRight size={15} />
              </button>
              <div className="email-auth">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                />
                <button type="button" onClick={() => connect("email")}>
                  <span className="social-icon email">@</span> Email me a
                  sign-in link <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
            {message && <p className="modal-footnote">{message}</p>}
            <div className="modal-network">
              <span className="status-orbit">
                <span />
              </span>
              <span>
                <strong>TX testnet</strong> ready for local demo giving
              </span>
              <CircleHelp size={15} />
            </div>
          </>
        )}
        {modal.type === "donate" &&
          (confirmed ? (
            <div className="confirmation">
              <div className="confirmation-icon">
                <Check size={27} />
              </div>
              <p className="eyebrow">Contribution staged</p>
              <h2 id="modal-title">
                You just made <em>room for more.</em>
              </h2>
              <p className="modal-copy">
                Your {amount.toFixed(6)} TX gift (about {formatMoney(amount * (txUsdRate ?? 0))}) to {modal.project.church} was
                submitted to the TX vault.
              </p>
              {transactionHash && (
                <p className="modal-footnote">Transaction: {transactionHash}</p>
              )}
              <button
                className="button button-dark modal-action"
                onClick={close}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="eyebrow">Support a project</p>
              <h2 id="modal-title">
                Give to <em>{modal.project.church}.</em>
              </h2>
              <p className="modal-copy">
                Choose an amount in TX to help “{modal.project.title}”.
              </p>
              <div className="amount-grid">
                {[25, 50, 100, 250].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={
                      amount === value
                        ? "amount-option selected"
                        : "amount-option"
                    }
                    onClick={() => {
                      setAmount(value);
                      setCustomAmount(String(value));
                    }}
                  >
                    {value} TX
                  </button>
                ))}
              </div>
              <label className="custom-amount">
                <span>Donation amount</span>
                <input
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCustomAmount(value);
                    setAmount(Number(value));
                  }}
                  aria-label="Custom donation amount in TX"
                />
                <span>TX</span>
              </label>
              <p className="modal-footnote">{txUsdRate === null ? "Loading current TX rate..." : `1 TX = ${formatExchangeRate(txUsdRate)} · Estimated value: ${formatExchangeRate(amount * txUsdRate)}`}</p>
              {localWalletAvailable && (
                <input
                  className="wallet-signing-password"
                  type="password"
                  placeholder="Wallet password"
                  value={donationPassword}
                  onChange={(event) => setDonationPassword(event.target.value)}
                />
              )}
              <button
                className="button button-coral modal-action"
                onClick={donate}
                disabled={
                  loading ||
                  txUsdRate === null ||
                  (localWalletAvailable && !donationPassword) ||
                  !Number.isFinite(amount) ||
                  amount <= 0
                }
              >
                  {loading
                    ? "Preparing contribution..."
                    : `Continue with ${Number.isFinite(amount) && amount > 0 ? `${amount} TX` : "custom amount"}`}{" "}
                <ArrowUpRight size={16} />
              </button>
              {message && <p className="modal-footnote">{message}</p>}
              <p className="modal-footnote">
                Native TX · funds remain in the project vault
              </p>
            </>
          ))}
      </section>
    </div>,
    document.body,
  );
}
