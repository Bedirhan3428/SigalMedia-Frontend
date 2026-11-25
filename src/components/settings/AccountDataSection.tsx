"use client";

import { useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/** KVKK: data export + account deletion. Rendered only when NEXT_PUBLIC_BACKEND_AUTH=supabase (see settings page). */
export default function AccountDataSection() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const username = profile?.username ?? "";
  const confirmed = username.length > 0 && typed.trim().replace(/^@/, "").toLowerCase() === username.toLowerCase();

  const exportData = async () => {
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "shovrum-verilerim.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Veriler indirilemedi. Lütfen tekrar deneyin.");
    }
  };

  const deleteAccount = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmUsername: username }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await signOut();
    } catch {
      setError("Hesap silinemedi. Lütfen tekrar deneyin.");
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2" data-testid="account-data-section">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Hesap ve veriler</h2>
      <div className="bg-zinc-900/60 border border-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-900">
        <button
          type="button"
          onClick={exportData}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-900 text-zinc-100 text-sm font-medium text-left btn-press-subtle"
        >
          <Download className="w-5 h-5 text-zinc-400" />
          <span>Verilerimi indir</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-900 text-red-400 hover:text-red-300 text-sm font-medium text-left btn-press-subtle"
        >
          <Trash2 className="w-5 h-5" />
          <span>Hesabı sil</span>
        </button>
        {open && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Hesabın, gönderilerin, mesajların ve tüm verilerin kalıcı olarak silinir. Bu işlem geri alınamaz. Onaylamak için
              kullanıcı adını (<span className="text-zinc-200 font-medium">@{username}</span>) yaz.
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Kullanıcı adın"
              autoComplete="off"
              className="w-full h-12 px-4 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={deleteAccount}
              disabled={!confirmed || busy}
              className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Hesabımı kalıcı olarak sil"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="px-1 text-xs text-rose-400 font-medium">{error}</p>}
    </section>
  );
}
