import { useEffect, useMemo, useState } from "react";
import type { DonationRecord, Project, ProjectComment } from "../lib/supabase";
import { identityRepository, projectRepository } from "../lib/supabase";
import { ArrowUpRight, MessagesSquare, Send, ShieldCheck } from "lucide-react";
import { Progress, ProjectVisual } from "../components/ProjectPrimitives";
import { claimProjectFunds, getProjectOnChain } from "../lib/wallet";
import { getBrowserWalletAddress } from "../lib/walletVault";

const chainExplorerBase =
  import.meta.env.VITE_COREUM_NETWORK === "mainnet"
    ? "https://explorer.coreum.com"
    : "https://explorer.testnet-1.coreum.dev";

const contractAddress = import.meta.env.VITE_COREUM_DONATION_CONTRACT ?? "";

type DiscussionComment = {
  id: string;
  author: string;
  message: string;
  createdAt: string;
};

export function ProjectPage({ project, onDonate }: { project: Project; onDonate: () => void }) {
  const [details, setDetails] = useState<Project>(project);
  const [contractState, setContractState] = useState<{
    beneficiary: string;
    metadata_token_id: string;
    status: string;
    donor_count: number;
    raised_micro_tx: string;
  } | null>(null);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [author, setAuthor] = useState("Community supporter");
  const [message, setMessage] = useState("");
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [ownerWallet, setOwnerWallet] = useState<string | null>(null);
  const [claimPassword, setClaimPassword] = useState("");
  const [claimMessage, setClaimMessage] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const nextProject = await projectRepository.getById(project.id);
        if (nextProject && active) setDetails(nextProject);
      } catch {
        // Keep the page on the known static project payload when Supabase is not available.
      }

      try {
        const onChain = await getProjectOnChain(project.id);
        if (active) setContractState(onChain);
      } catch {
        if (active) setContractState(null);
      }

      try {
        const history = await projectRepository.getDonationHistory(project.id);
        if (active) setDonations(history);
      } catch {
        if (active) setDonations([]);
      }

      try {
        const profile = await identityRepository.getProfile();
        if (profile?.handle && active) {
          setProfileHandle(profile.handle);
          setAuthor(profile.handle);
        }
        const localWallet = await getBrowserWalletAddress();
        if (active) setOwnerWallet(localWallet ?? profile?.wallet_address ?? null);
      } catch {
        // Ignore profile load failures for guest visitors.
      }

      try {
        const nextComments = await projectRepository.getComments(project.id);
        if (active) setComments(nextComments);
      } catch {
        if (active) setComments([]);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [project.id]);

  const explorerTx = (hash: string) => `${chainExplorerBase}/transactions/${hash}`;
  const explorerAddress = (value: string) => `${chainExplorerBase}/accounts/${value}`;

  const donationTotal = useMemo(() => {
    const fromChain = contractState ? Number(contractState.raised_micro_tx ?? "0") / 1_000_000 : details.raised;
    return Number.isFinite(fromChain) ? fromChain : details.raised;
  }, [contractState, details.raised]);

  const submitComment = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    try {
      const created = await projectRepository.postComment(project.id, trimmed, profileHandle ?? author);
      setComments((current) => [created, ...current]);
      setMessage("");
    } catch (error) {
      console.error(error);
      setMessage("Unable to post comment right now.");
    }
  };

  const canClaim = Boolean(contractState?.beneficiary && ownerWallet && contractState.beneficiary === ownerWallet && ["funded", "unstaking"].includes(contractState.status.toLowerCase()));
  const claim = async () => {
    setClaimMessage("");
    try {
      const result = await claimProjectFunds(project.id, claimPassword);
      setClaimMessage(`Claim submitted: ${result.txHash}. If unstaking started, return after the validator's unbonding period to release the funds.`);
      setClaimPassword("");
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : "Unable to claim project funds");
    }
  };

  const imageUrls = details.image_urls ?? [];
  return <main className="project-route section-wrap"><a className="text-link route-back" href="#/projects">← Back to projects</a><section className="feature-layout"><div className="project-detail-gallery"><ProjectVisual project={details} featured />{imageUrls.length > 1 && <div className="project-gallery-thumbnails">{imageUrls.map((imageUrl, index) => <img key={`${imageUrl}-${index}`} src={imageUrl} alt={`${details.title} project photo ${index + 1}`} />)}</div>}</div><article className="feature-panel"><div className="feature-panel-top"><span className="category-label">{details.category}</span><span className="feature-location">{details.location}</span></div><p className="feature-church">{details.church}</p><h1>{details.title}</h1><p className="feature-description">{details.description}</p><div className="funding-detail"><div className="funding-numbers"><span><strong>${donationTotal.toLocaleString()}</strong> raised</span><span>of ${details.goal.toLocaleString()}</span></div><Progress project={details} large /><div className="funding-footer"><span><b>{Math.round((donationTotal / details.goal) * 100)}%</b> funded</span><span>{contractState?.donor_count ?? details.donors} neighbors have given</span></div></div><button className="button button-coral feature-donate" onClick={onDonate}>Support this project <ArrowUpRight size={16} /></button></article></section>
    <section className="project-detail-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", marginTop: "40px" }}>
      <div className="project-detail-card" style={{ border: "1px solid var(--line)", background: "var(--white)", padding: "24px" }}>
        <p className="eyebrow" style={{ marginBottom: "12px" }}><MessagesSquare size={12} style={{ marginRight: "6px", verticalAlign: "middle" }} /> Project discussion</p>
        <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
          <input value={profileHandle ?? author} onChange={(event) => { setAuthor(event.target.value); setProfileHandle(null); }} placeholder="Your handle" readOnly={Boolean(profileHandle)} style={{ border: "1px solid var(--line)", background: "transparent", padding: "10px 12px", color: "var(--ink)", cursor: profileHandle ? "default" : "text" }} />
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Share an update, prayer, or encouragement for this project..." style={{ minHeight: "100px", border: "1px solid var(--line)", background: "transparent", padding: "10px 12px", color: "var(--ink)", resize: "vertical" }} />
          <button className="button button-coral" onClick={() => void submitComment()} style={{ justifySelf: "end" }}><Send size={15} /> Post comment</button>
        </div>
        {canClaim && <div className="claim-box"><p className="eyebrow">Owner claim</p><p className="profile-empty">The project is fully funded. The first claim starts validator unstaking; submit this again after the seven-day unbonding period to release the funds.</p><input type="password" value={claimPassword} onChange={(event) => setClaimPassword(event.target.value)} placeholder="Local wallet password" /><button className="button button-coral" onClick={() => void claim()} disabled={!claimPassword}>Claim / release funds</button>{claimMessage && <p className="modal-footnote">{claimMessage}</p>}</div>}
        <div style={{ display: "grid", gap: "12px" }}>
          {comments.length ? comments.map((comment) => <article key={comment.id} style={{ borderTop: "1px solid var(--line)", paddingTop: "12px" }}><div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "6px", fontSize: "10px", color: "var(--muted)" }}><strong style={{ color: "var(--ink)" }}>{comment.author_handle}</strong><span>{new Date(comment.created_at).toLocaleDateString()}</span></div><p style={{ margin: 0, lineHeight: 1.6, color: "var(--ink)" }}>{comment.message}</p></article>) : <p className="profile-empty">No comments yet. Start the conversation.</p>}
        </div>
      </div>
      <div className="project-detail-card" style={{ border: "1px solid var(--line)", background: "var(--white)", padding: "24px" }}>
        <p className="eyebrow" style={{ marginBottom: "12px" }}><ShieldCheck size={12} style={{ marginRight: "6px", verticalAlign: "middle" }} /> On-chain record</p>
        <div style={{ display: "grid", gap: "14px", fontSize: "11px" }}>
          {contractAddress && <div><strong style={{ display: "block", marginBottom: "4px" }}>Donation vault</strong><a href={explorerAddress(contractAddress)} target="_blank" rel="noreferrer" className="text-link" style={{ display: "inline-block", wordBreak: "break-all" }}>{contractAddress}</a></div>}
          {contractState?.beneficiary && <div><strong style={{ display: "block", marginBottom: "4px" }}>Beneficiary</strong><a href={explorerAddress(contractState.beneficiary)} target="_blank" rel="noreferrer" className="text-link" style={{ display: "inline-block", wordBreak: "break-all" }}>{contractState.beneficiary}</a></div>}
          {contractState?.metadata_token_id && <div><strong style={{ display: "block", marginBottom: "4px" }}>Metadata token</strong><span style={{ wordBreak: "break-all" }}>{contractState.metadata_token_id}</span></div>}
          {contractState?.status && <div><strong style={{ display: "block", marginBottom: "4px" }}>Status</strong><span>{contractState.status}</span></div>}
        </div>
        <div style={{ borderTop: "1px solid var(--line)", marginTop: "20px", paddingTop: "20px" }}>
          <p className="eyebrow" style={{ marginBottom: "12px" }}>Donation history</p>
          <div style={{ display: "grid", gap: "10px" }}>
            {donations.length ? donations.map((donation) => <div key={donation.id} style={{ border: "1px solid var(--line)", padding: "10px", fontSize: "10px" }}><div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}><strong>${Number(donation.amount_tx ?? 0).toLocaleString()}</strong><span>{new Date(donation.created_at).toLocaleDateString()}</span></div><a href={explorerTx(donation.tx_hash)} target="_blank" rel="noreferrer" className="text-link" style={{ wordBreak: "break-all" }}>{donation.tx_hash}</a></div>) : <p className="profile-empty">No on-chain donations yet.</p>}
          </div>
        </div>
      </div>
    </section>
  </main>;
}
