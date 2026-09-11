import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, CircleDollarSign, FolderKanban } from "lucide-react";
import { formatMoney } from "../lib/projects";
import { identityRepository, type DonationRecord, type Notification } from "../lib/supabase";

type OwnedProject = { id: string; title: string; status: string; goal_tx: number; created_at: string };
type InboxTab = "notifications" | "history";

const explorerBase = import.meta.env.VITE_COREUM_NETWORK === "mainnet" ? "https://explorer.tx.org/tx/transactions" : "https://explorer.testnet-1.tx.org/tx/transactions";

export function InboxPage() {
  const [tab, setTab] = useState<InboxTab>("notifications");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [projects, setProjects] = useState<OwnedProject[]>([]);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "project" | "donation">("all");
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState("Loading inbox...");

  const load = async () => {
    try {
      const [nextNotifications, dashboard] = await Promise.all([
        identityRepository.getNotifications(0, 20),
        identityRepository.getDashboard(),
      ]);
      setNotifications(nextNotifications);
      setProjects(dashboard.ownedProjects as OwnedProject[]);
      setDonations(dashboard.donations);
      setHasMore(nextNotifications.length === 20);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load inbox");
    }
  };

  useEffect(() => {
    void load();
    window.addEventListener("soundfaith-data-changed", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("soundfaith-data-changed", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  const loadMore = async () => {
    try {
      const next = await identityRepository.getNotifications(notifications.length, 20);
      setNotifications((current) => [...current, ...next]);
      setHasMore(next.length === 20);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load more notifications");
    }
  };

  const markRead = async (notification: Notification) => {
    if (notification.read_at) return;
    await identityRepository.markNotificationRead(notification.id);
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    window.dispatchEvent(new Event("soundfaith-notifications-changed"));
  };

  const visibleNotifications = notifications.filter((item) => notificationFilter === "all" || (notificationFilter === "project" ? item.kind === "project_status" : item.kind.startsWith("donation")));
  const hasHistory = projects.length > 0 || donations.length > 0;

  return <main className="profile-page section-wrap">
    <p className="eyebrow">Your inbox</p>
    <h1>Stay in<br /><em>the loop.</em></h1>
    <div className="inbox-tabs" role="tablist" aria-label="Inbox views">
      <button className={tab === "notifications" ? "inbox-tab active" : "inbox-tab"} onClick={() => setTab("notifications")} role="tab" aria-selected={tab === "notifications"}>Notifications</button>
      <button className={tab === "history" ? "inbox-tab active" : "inbox-tab"} onClick={() => setTab("history")} role="tab" aria-selected={tab === "history"}>History</button>
    </div>
    {message && <p className="profile-empty">{message}</p>}
    {!message && tab === "notifications" && <section className="profile-page-section notification-list">
      <div className="notification-filters" role="group" aria-label="Notification filters">{([['all', 'All'], ['project', 'Projects'], ['donation', 'Donations']] as const).map(([value, label]) => <button key={value} className={notificationFilter === value ? "notification-filter active" : "notification-filter"} onClick={() => setNotificationFilter(value)}>{label}</button>)}</div>
      {visibleNotifications.map((item) => { const isDonation = item.kind.startsWith("donation"); const amount = item.message.match(/of ([\d.,]+ TX)/i)?.[1]; return <article className={item.read_at ? "notification-card" : "notification-card unread"} key={item.id} onClick={() => void markRead(item)}><div className="notification-card-icon">{isDonation ? <CircleDollarSign size={18} /> : <FolderKanban size={18} />}</div><div className="notification-card-body"><strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString()}</span><p>{item.message}</p></div><div className="notification-card-meta">{isDonation && amount ? <b>{amount}</b> : !item.read_at ? <span>Unread</span> : <Check size={15} />}</div></article>; })}
      {!visibleNotifications.length && <p className="profile-empty">No notifications in this category.</p>}
      {hasMore && <button className="button button-outline load-more-button" onClick={() => void loadMore()}>Load more <ChevronDown size={15} /></button>}
    </section>}
    {!message && tab === "history" && <section className="profile-page-section activity-list">
      <div className="profile-section-heading"><p className="eyebrow">All history</p><span>{projects.length + donations.length}</span></div>
      {projects.map((project) => <article className="activity-card" key={`project-${project.id}`}><div className="activity-card-icon"><FolderKanban size={18} /></div><div className="activity-card-body"><strong>{project.title}</strong><span>Project submitted · {new Date(project.created_at).toLocaleString()}</span></div><span className="event-pill">{project.status}</span></article>)}
      {donations.map((donation) => <article className="activity-card" key={`donation-${donation.id}`}><div className="activity-card-icon donation"><CircleDollarSign size={18} /></div><div className="activity-card-body"><strong>Donation to {donation.project?.title ?? "project"}</strong><span>Donation recorded · {new Date(donation.created_at).toLocaleString()}</span><a className="activity-hash" href={`${explorerBase}/${donation.tx_hash}`} target="_blank" rel="noreferrer">{donation.tx_hash} <ArrowUpRight size={12} /></a></div><b className="activity-amount">{formatMoney(Number(donation.amount_tx))} TX</b></article>)}
      {!hasHistory && <p className="profile-empty">No history yet.</p>}
    </section>}
  </main>;
}
