"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { enablePush, isPushSupported, syncPush } from "@/lib/push/pushClient";

const DISMISS_KEY = "push-prompt-dismissed";

/** Polite banner: never prompts on load; asks only after the user taps the button. */
export default function PushPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || !isPushSupported()) return;
    if (Notification.permission === "granted") {
      void syncPush();
      return;
    }
    if (Notification.permission === "denied") return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    void Promise.resolve().then(() => setVisible(!dismissed));
  }, [user]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Bildirimler"
      data-testid="push-prompt"
      className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3"
    >
      <Bell className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
      <p className="flex-1 text-sm text-zinc-300">Yeni mesajlardan haberdar ol.</p>
      <button
        type="button"
        onClick={async () => {
          const r = await enablePush();
          if (r !== "default") setVisible(false);
        }}
        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950"
      >
        Bildirimleri aç
      </button>
      <button type="button" onClick={dismiss} aria-label="Kapat" className="p-1 text-zinc-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
