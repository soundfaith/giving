import { Check, CircleAlert, Info, X } from "lucide-react";
import { useEffect } from "react";

export type NoticeTone = "success" | "error" | "info";
export type Notice = { tone: NoticeTone; message: string };

export function showNotice(message: string, tone: NoticeTone = "info") {
  window.dispatchEvent(new CustomEvent<Notice>("soundfaith-notice", { detail: { message, tone } }));
}

export function Toast({ notice, close }: { notice: Notice | null; close: () => void }) {
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(close, 6000);
    return () => window.clearTimeout(timeout);
  }, [notice, close]);

  if (!notice) return null;
  const Icon = notice.tone === "success" ? Check : notice.tone === "error" ? CircleAlert : Info;
  return (
    <div className={`toast toast-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <Icon size={17} aria-hidden="true" />
      <span>{notice.message}</span>
      <button className="toast-close" onClick={close} aria-label="Dismiss message" title="Dismiss message"><X size={15} /></button>
    </div>
  );
}
