"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AuthServiceError, getAuthService } from "@/services/auth";

const rules = (pwd: string) => [
  { label: "En az 8 karakter", valid: pwd.length >= 8 },
  { label: "Büyük harf (A-Z)", valid: /[A-Z]/.test(pwd) },
  { label: "Küçük harf (a-z)", valid: /[a-z]/.test(pwd) },
  { label: "Rakam (0-9)", valid: /[0-9]/.test(pwd) },
];

/** Supabase recovery landing page: /auth/callback has already created a temporary session. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const valid = rules(password).every((r) => r.valid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await getAuthService().updatePassword(password);
      setDone(true);
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      const code = err instanceof AuthServiceError ? err.code : "unknown";
      setError(code === "weak-password" ? "Şifre yeterince güçlü değil." : "Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir.");
    } finally {
      setSaving(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 bg-black text-white">
      <div className="w-full max-w-[420px] p-6 sm:p-8 bg-zinc-950/80 border border-zinc-900 rounded-3xl shadow-2xl">{children}</div>
    </main>
  );

  if (authLoading) return shell(<div className="w-8 h-8 mx-auto border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />);

  if (!user) {
    return shell(
      <div className="text-center" data-testid="reset-invalid">
        <h1 className="text-2xl font-extrabold mb-2">Bağlantı geçersiz</h1>
        <p className="text-zinc-400 text-sm mb-6">Şifre sıfırlama bağlantısının süresi dolmuş veya daha önce kullanılmış.</p>
        <Link href="/auth/forgot-password" className="text-sm font-medium text-white underline underline-offset-4">
          Yeni bağlantı iste
        </Link>
      </div>,
    );
  }

  if (done) {
    return shell(
      <div className="text-center" data-testid="reset-done">
        <Check className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <h1 className="text-2xl font-extrabold mb-1">Şifren güncellendi</h1>
        <p className="text-zinc-400 text-sm">Yönlendiriliyorsun…</p>
      </div>,
    );
  }

  return shell(
    <form onSubmit={handleSubmit}>
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">Yeni şifre belirle</h1>
      <p className="text-zinc-400 text-sm mb-6">{user.email} hesabı için yeni bir şifre seç.</p>
      <input
        type="password"
        autoFocus
        required
        autoComplete="new-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (error) setError(null);
        }}
        placeholder="Yeni şifre"
        className="w-full h-14 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
      />
      <div className="space-y-1.5 pt-3 px-1">
        {rules(password).map((r) => (
          <div key={r.label} className={`flex items-center gap-2 text-xs ${r.valid ? "text-emerald-400 font-medium" : "text-zinc-500"}`}>
            {r.valid ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
            <span>{r.label}</span>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-rose-400 px-1 pt-3 font-medium">{error}</p>}
      <button
        type="submit"
        disabled={!valid || saving}
        className="mt-6 w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 btn-press"
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Şifreyi Güncelle"}
      </button>
    </form>,
  );
}
