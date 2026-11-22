"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getExistingSubscription, isPushSupported } from "@/lib/push/pushClient";

export default function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    void getExistingSubscription().then((s) => {
      setSupported(true);
      setOn(Boolean(s) && Notification.permission === "granted");
    });
  }, []);

  if (!supported) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        setOn((await enablePush()) === "granted");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Bildirimler</h2>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={toggle}
        className="w-full flex items-center justify-between rounded-2xl border border-zinc-900 bg-zinc-900/60 px-4 py-3.5 text-sm font-medium text-zinc-100"
      >
        <span>Mesaj bildirimleri</span>
        <span className={`h-6 w-11 rounded-full p-0.5 transition-colors ${on ? "bg-emerald-500" : "bg-zinc-700"}`}>
          <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
        </span>
      </button>
    </section>
  );
}
