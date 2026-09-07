import { useEffect, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";
import { getBrowserWalletAddress } from "../lib/walletVault";
import { applyAsReviewer, getReviewerQueue, submitProjectReview, type ReviewQueueItem } from "../lib/reviews";

export function ReviewPage() {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [message, setMessage] = useState("");
  const [expertise, setExpertise] = useState("Sound & AV, Spaces, Access");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [walletLoading, setWalletLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setQueue(await getReviewerQueue()); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load review queue"); } finally { setLoading(false); }
  };
  useEffect(() => { getBrowserWalletAddress().then(setWalletAddress).finally(() => setWalletLoading(false)); void refresh(); }, []);
  const apply = async () => {
    setApplicationMessage("");
    if (walletLoading) { setApplicationMessage("Checking your local wallet..."); return; }
    if (!walletAddress) { setApplicationMessage("Create a local wallet before applying as a reviewer."); return; }
    setApplying(true);
    try { await applyAsReviewer(walletAddress, expertise.split(",").map((item) => item.trim()).filter(Boolean)); setApplicationMessage("Application submitted. A council steward must activate your reviewer account."); } catch (error) { setApplicationMessage(error instanceof Error ? error.message : "Unable to apply"); } finally { setApplying(false); }
  };
  const review = async (projectId: string, decision: "approve" | "reject") => {
    try { await submitProjectReview(projectId, decision, notes[projectId] ?? ""); setQueue((items) => items.filter((item) => item.id !== projectId)); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit review"); }
  };

  return <main className="review-page section-wrap"><div className="review-heading"><div><p className="eyebrow"><ShieldCheck size={13} /> Reviewer council</p><h1>Keep the signal <em>honest.</em></h1><p className="hero-description">Wallet-identified reviewers attest to projects or flag suspected fraud. Attestations are weighted by reputation and recorded publicly.</p></div></div>{applicationMessage && <p className="modal-footnote review-feedback">{applicationMessage}</p>}{message && <p className="modal-footnote review-feedback">{message}</p>}{!queue.length && <section className="review-application"><p className="eyebrow">Join the council</p><h2>Become a reviewer</h2><p>Reviewers require an approved KYC identity. Your public wallet address is used for accountability; private wallet material never leaves your device.</p><input value={expertise} onChange={(event) => setExpertise(event.target.value)} placeholder="Areas of expertise" disabled={applying} /><button className="button button-coral" onClick={() => void apply} disabled={applying || walletLoading}>{applying ? "Submitting application..." : walletLoading ? "Checking wallet..." : "Apply as reviewer"}</button></section>}{loading ? <p className="profile-empty">Loading attestation queue...</p> : queue.length ? <section className="review-queue">{queue.map((project) => { const existing = project.project_attestations ?? []; return <article className="review-card" key={project.id}><div className="card-meta"><span className="category-label">{project.category}</span><span>{project.location}</span></div><p className="card-church">{project.church_name}</p><h2>{project.title}</h2><p>{project.description}</p><div className="review-votes"><span>{existing.filter((vote) => vote.decision === "attest").length} attestations</span><span>{existing.filter((vote) => vote.decision === "flag").length} flags</span><span>{project.required_attestations} needed</span></div><textarea value={notes[project.id] ?? ""} onChange={(event) => setNotes({ ...notes, [project.id]: event.target.value })} placeholder="Reason for your decision (optional)" /><div className="review-actions"><button className="button button-coral" onClick={() => void review(project.id, "approve")}><Check size={15} /> Attest</button><button className="button button-dark" onClick={() => void review(project.id, "reject")}><X size={15} /> Flag</button></div></article>; })}</section> : <p className="profile-empty">No projects are awaiting attestation.</p>}</main>;
}
