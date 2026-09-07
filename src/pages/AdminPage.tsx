import { useEffect, useState } from "react";
import { Check, RefreshCw, Shield, X } from "lucide-react";
import { getAdminData, getAdminStatus, getRelayerStatus, overrideAttestation, resolveProject, setReviewerStatus, setReviewThresholds, type AdminProject, type AdminReviewer, type RelayerStatus } from "../lib/admin";

export function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reviewers, setReviewers] = useState<AdminReviewer[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [relayer, setRelayer] = useState<RelayerStatus>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setMessage("");
    try {
      if (!(await getAdminStatus())) {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      const [data, relayerStatus] = await Promise.all([getAdminData(), getRelayerStatus()]);
      setReviewers(data.reviewers);
      setProjects(data.projects);
      setRelayer(relayerStatus);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load admin controls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const updateReviewer = async (reviewer: AdminReviewer, status: AdminReviewer["status"]) => {
    try {
      await setReviewerStatus(reviewer.profile_id, status);
      setReviewers((items) => items.map((item) => item.profile_id === reviewer.profile_id ? { ...item, status } : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update reviewer"); }
  };

  const updateProject = async (project: AdminProject, status: "approve" | "closed") => {
    try {
      await resolveProject(project.id, status);
      const nextStatus = status === "approve" ? "approved_pending_chain" : "closed";
      setProjects((items) => items.map((item) => item.id === project.id ? { ...item, status: nextStatus } : item));
      setMessage(status === "approve" ? "Review bypassed. The private chain relayer will register the project on TX." : "Project closed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to resolve project"); }
  };

  const overrideProject = async (project: AdminProject, status: "active" | "rejected") => {
    try {
      await overrideAttestation(project.id, status);
      setProjects((items) => items.map((item) => item.id === project.id ? { ...item, status } : item));
      setMessage("Attestation overridden by admin.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update project"); }
  };

  const thresholds = async (project: AdminProject, approvals: string, rejections: string) => {
    try {
      const nextApprovals = Math.max(1, Number(approvals));
      const nextRejections = Math.max(1, Number(rejections));
      await setReviewThresholds(project.id, nextApprovals, nextRejections);
      setProjects((items) => items.map((item) => item.id === project.id ? { ...item, approval_threshold: nextApprovals, rejection_threshold: nextRejections } : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update thresholds"); }
  };

  if (loading) return <main className="admin-page section-wrap"><p className="profile-empty">Loading admin controls...</p></main>;
  if (!authorized) return <main className="admin-page section-wrap"><p className="eyebrow"><Shield size={13} /> MVP admin</p><h1>Access <em>denied.</em></h1><p className="hero-description">This page is protected by the configured admin wallet.</p></main>;

  const relayerIsRunning = relayer ? Date.now() - new Date(relayer.last_seen_at).getTime() < 45_000 : false;
  return <main className="admin-page section-wrap">
    <div className="admin-heading"><div><p className="eyebrow"><Shield size={13} /> MVP admin</p><h1>Keep the council <em>moving.</em></h1></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh admin data" title="Refresh"><RefreshCw size={16} /></button></div>
    {message && <p className="modal-footnote admin-message">{message}</p>}
    <section className="admin-section admin-relayer-status"><div className="admin-section-heading"><p className="eyebrow">Chain relayer</p><b className={relayerIsRunning ? "admin-status active" : "admin-status review"}>{relayerIsRunning ? "Running" : "Offline"}</b></div><p className="admin-relayer-copy">{relayer ? `Last seen ${new Date(relayer.last_seen_at).toLocaleString()}.` : "No relayer heartbeat has been recorded."}{relayer?.last_error ? ` Last error: ${relayer.last_error}` : ""}</p></section>
    <section className="admin-section"><div className="admin-section-heading"><p className="eyebrow">Reviewer applications</p><span>{reviewers.length}</span></div><div className="admin-list">{reviewers.length ? reviewers.map((reviewer) => <article className="admin-row" key={reviewer.profile_id}><div><strong>{reviewer.email ?? "No email"}</strong><span>{reviewer.wallet_address}</span><small>{reviewer.expertise.join(" · ")}</small></div><div className="admin-row-actions"><b className={`admin-status ${reviewer.status}`}>{reviewer.status}</b>{reviewer.status !== "active" && <button className="icon-button" onClick={() => void updateReviewer(reviewer, "active")} aria-label="Activate reviewer" title="Activate reviewer"><Check size={15} /></button>}{reviewer.status === "active" && <button className="icon-button" onClick={() => void updateReviewer(reviewer, "suspended")} aria-label="Suspend reviewer" title="Suspend reviewer"><X size={15} /></button>}</div></article>) : <p className="profile-empty">No reviewer applications.</p>}</div></section>
    <section className="admin-section"><div className="admin-section-heading"><p className="eyebrow">Projects and moderation</p><span>{projects.length}</span></div><div className="admin-list">{projects.map((project) => <article className="admin-project" key={project.id}><div className="admin-row"><div><strong>{project.title}</strong><span>{project.church_name} · {project.location}</span></div><b className={`admin-status ${project.status}`}>{project.status}</b></div><div className="admin-project-actions">{project.status === "review" && <><button className="button button-coral" onClick={() => void updateProject(project, "approve")}><Check size={15} /> Approve review</button><button className="button button-dark" onClick={() => void updateProject(project, "closed")}><X size={15} /> Close</button></>}{project.status === "approved_pending_chain" && <span className="admin-status review">Waiting for relayer</span>}{project.status === "active" && <button className="button button-outline" onClick={() => void overrideProject(project, "rejected")}>Pause project</button>}{project.status === "rejected" && <button className="button button-coral" onClick={() => void overrideProject(project, "active")}>Restore project</button>}</div>{project.status === "review" && <div className="threshold-controls"><label>Approvals<input type="number" min="1" defaultValue={project.approval_threshold} onBlur={(event) => void thresholds(project, event.target.value, String(project.rejection_threshold))} /></label><label>Rejections<input type="number" min="1" defaultValue={project.rejection_threshold} onBlur={(event) => void thresholds(project, String(project.approval_threshold), event.target.value)} /></label><span>{project.approvals} approve · {project.rejections} reject</span></div>}</article>)}</div></section>
  </main>;
}
