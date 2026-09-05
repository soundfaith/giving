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

  return <main className="review-page section-wrap"><div className="review-heading"><div><p className="eyebrow"><ShieldCheck size={13} /> Reviewer council</p><h1>Keep the signal <em>honest.</em></h1><p className="hero-description">Projects are reviewed by independent, wallet-identified council members. Three distinct approvals publish a project; three rejections close it.</p></div></div>{applicationMessage && <p className="modal-footnote review-feedback">{applicationMessage}</p>}{message && <p className="modal-footnote review-feedback">{message}</p>}{!queue.length && <section className="review-application"><p className="eyebrow">Join the council</p><h2>Become a reviewer</h2><p>Reviewers are activated by the council, not by the project submitter. Your public wallet address is used for accountability; private wallet material never leaves your device.</p><input value={expertise} onChange={(event) => setExpertise(event.target.value)} placeholder="Areas of expertise" disabled={applying} /><button className="button button-coral" onClick={() => void apply} disabled={applying || walletLoading}>{applying ? "Submitting application..." : walletLoading ? "Checking wallet..." : "Apply as reviewer"}</button></section>}{loading ? <p className="profile-empty">Loading review queue...</p> : queue.length ? <section className="review-queue">{queue.map((project) => { const existing = project.project_reviews ?? []; return <article className="review-card" key={project.id}><div className="card-meta"><span className="category-label">{project.category}</span><span>{project.location}</span></div><p className="card-church">{project.church_name}</p><h2>{project.title}</h2><p>{project.description}</p><div className="review-votes"><span>{existing.filter((vote) => vote.decision === "approve").length} approvals</span><span>{existing.filter((vote) => vote.decision === "reject").length} rejections</span><span>{project.review_rounds[0]?.required_reviews ?? 3} needed</span></div><textarea value={notes[project.id] ?? ""} onChange={(event) => setNotes({ ...notes, [project.id]: event.target.value })} placeholder="Reason for your decision (optional)" /><div className="review-actions"><button className="button button-coral" onClick={() => void review(project.id, "approve")}><Check size={15} /> Approve</button><button className="button button-dark" onClick={() => void review(project.id, "reject")}><X size={15} /> Reject</button></div></article>; })}</section> : <p className="profile-empty">No projects are waiting for council review.</p>}</main>;
}
