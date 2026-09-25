import { ArrowUpRight, CircleDollarSign, FolderKanban } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "../lib/projects";
import { identityRepository, type DonationRecord } from "../lib/supabase";

type OwnedProject = { id: string; title: string; status: string; goal_tx: number; created_at: string };
const explorerBase = import.meta.env.VITE_COREUM_NETWORK === "mainnet" ? "https://explorer.tx.org/tx/transactions" : "https://explorer.testnet-1.tx.org/tx/transactions";

export function ActivitiesPage() {
  const [projects, setProjects] = useState<OwnedProject[]>([]);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [message, setMessage] = useState("Loading activity...");

  useEffect(() => {
    const load = () => void identityRepository.getDashboard().then((dashboard) => { setProjects(dashboard.ownedProjects as OwnedProject[]); setDonations(dashboard.donations); setMessage(""); }).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load activity"));
    load();
    window.addEventListener("soundfaith-data-changed", load);
    window.addEventListener("focus", load);
    return () => { window.removeEventListener("soundfaith-data-changed", load); window.removeEventListener("focus", load); };
  }, []);

  return <main className="profile-page section-wrap"><p className="eyebrow">On-chain record</p><h1>Your <em>activity.</em></h1><p className="page-intro">Projects you have submitted and every indexed donation connected to your account.</p>{message && <p className="profile-empty">{message}</p>}<section className="profile-page-section activity-list"><div className="profile-section-heading"><p className="eyebrow">All events</p><span>{projects.length + donations.length}</span></div>{projects.map((project) => <article className="activity-card" key={`project-${project.id}`}><div className="activity-card-icon"><FolderKanban size={18} /></div><div className="activity-card-body"><strong>{project.title}</strong><span>Project submitted · {new Date(project.created_at).toLocaleString()}</span></div><span className="event-pill">{project.status}</span></article>)}{donations.map((donation) => <article className="activity-card" key={`donation-${donation.id}`}><div className="activity-card-icon donation"><CircleDollarSign size={18} /></div><div className="activity-card-body"><strong>Donation to {donation.project?.title ?? "project"}</strong><span>Donation recorded · {new Date(donation.created_at).toLocaleString()}</span><a className="activity-hash" href={`${explorerBase}/${donation.tx_hash}`} target="_blank" rel="noreferrer">{donation.tx_hash} <ArrowUpRight size={12} /></a></div><b className="activity-amount">{formatMoney(Number(donation.amount_tx))} TX</b></article>)}{!message && !projects.length && !donations.length && <p className="profile-empty">No activity yet.</p>}</section></main>;
}