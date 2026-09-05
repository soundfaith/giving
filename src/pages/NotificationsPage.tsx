import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { identityRepository, type Notification } from "../lib/supabase";

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [message, setMessage] = useState("Loading notifications...");

  const refresh = async () => {
    try {
      const next = await identityRepository.getNotifications();
      setItems(next);
      setMessage(next.length ? "" : "No events yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load notifications");
    }
  };

  useEffect(() => { void refresh(); }, []);

  const markRead = async (item: Notification) => {
    if (item.read_at) return;
    await identityRepository.markNotificationRead(item.id);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
  };

  return <main className="profile-page section-wrap"><p className="eyebrow"><Bell size={13} /> Your events</p><h1>What is <em>happening.</em></h1><section className="profile-page-section">{message && <p className="profile-empty">{message}</p>}{items.map((item) => <article className="profile-page-row" key={item.id} onClick={() => void markRead(item)}><div><h2>{item.title}</h2><span>{new Date(item.created_at).toLocaleString()}</span><p className="profile-empty">{item.message}</p></div>{item.read_at ? <Check size={16} /> : <Bell size={16} color="var(--coral)" />}</article>)}</section></main>;
}