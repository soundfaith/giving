import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleDollarSign, FolderKanban } from "lucide-react";
import { identityRepository, type Notification } from "../lib/supabase";

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "project" | "donation">("all");
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState("Loading notifications...");

  const refresh = async () => {
    try {
      const next = await identityRepository.getNotifications(0, 20);
      setItems(next);
      setHasMore(next.length === 20);
      setMessage(next.length ? "" : "No events yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load notifications");
    }
  };

  useEffect(() => {
    void refresh();
    window.addEventListener("soundfaith-data-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("soundfaith-data-changed", refresh); window.removeEventListener("focus", refresh); };
  }, []);

  const loadMore = async () => {
    try {
      const next = await identityRepository.getNotifications(items.length, 20);
      setItems((current) => [...current, ...next]);
      setHasMore(next.length === 20);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load more notifications");
    }
  };

  const markRead = async (item: Notification) => {
    if (item.read_at) return;
    await identityRepository.markNotificationRead(item.id);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
  };

  const visibleItems = items.filter((item) => filter === "all" || (filter === "project" ? item.kind === "project_status" : item.kind.startsWith("donation")));
    return <main className="profile-page section-wrap"><p className="eyebrow">Your events</p><h1>What is<br /><em>happening.</em></h1><div className="notification-filters" role="group" aria-label="Notification filters">{([["all", "All"], ["project", "Projects"], ["donation", "Donations"]] as const).map(([value, label]) => <button key={value} className={filter === value ? "notification-filter active" : "notification-filter"} onClick={() => setFilter(value)}>{label}</button>)}</div><section className="profile-page-section notification-list">{message && <p className="profile-empty">{message}</p>}{visibleItems.map((item) => { const isDonation = item.kind.startsWith("donation"); const amount = item.message.match(/of ([\d.,]+ TX)/i)?.[1]; return <article className="notification-card" key={item.id} onClick={() => void markRead(item)}><div className="notification-card-icon">{isDonation ? <CircleDollarSign size={18} /> : <FolderKanban size={18} />}</div><div className="notification-card-body"><strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString()}</span><p>{item.message}</p></div><div className="notification-card-meta">{isDonation && amount ? <b>{amount}</b> : <span className="event-pill">Milestone</span>}</div></article>; })}{!message && !visibleItems.length && <p className="profile-empty">No notifications in this category.</p>}{hasMore && <button className="button button-outline load-more-button" onClick={() => void loadMore()}>Load more <ChevronDown size={15} /></button>}</section></main>;
}