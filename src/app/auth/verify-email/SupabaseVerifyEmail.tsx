"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AuthServiceError, getAuthService } from "@/services/auth";

const COOLDOWN_SECONDS = 60;

/** Supabase mode: the account is confirmed by clicking the emailed link (no 4-digit code). */
export default function SupabaseVerifyEmail() {
  const router = useRouter();
  const { loading } = useAuth();
  // sessionStorage is client-only: server snapshot is "" and the real value is read after hydration
  const email = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem("verify_email") || sessionStorage.getItem("pending_email") || "",
    () => "",
  );
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) router.replace("/login");
  }, [email, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setMessage(null);
    try {
      await getAuthService().resendVerificationEmail(email);
      setMessage("Doğrulama bağlantısı tekrar gönderildi.");
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(
        err instanceof AuthServiceError && err.code === "rate-limited"
          ? "Çok fazla istek. Lütfen biraz bekleyin."
          : "E-posta gönderilemedi. Lütfen tekrar deneyin.",
      );
    } finally {
      setResending(false);
    }
  };

  if (loading || !email) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 bg-black text-white">
      <div className="w-full max-w-[420px] p-6 sm:p-8 bg-zinc-950/80 border border-zinc-900 rounded-3xl shadow-2xl text-center">
        <MailCheck className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
        <h1 className="text-2xl font-extrabold tracking-tight mb-2">E-postanı doğrula</h1>
        <p className="text-zinc-400 text-sm leading-relaxed mb-6">
          <span className="text-zinc-200 font-medium">{email}</span> adresine bir doğrulama bağlantısı gönderdik. Bağlantıya
          tıkladığında hesabın açılır.
        </p>
        {message && <p className="text-xs text-emerald-400 font-medium mb-3">{message}</p>}
        {error && <p className="text-xs text-rose-400 font-medium mb-3">{error}</p>}
        <button
          type="button"
          onClick={resend}
          disabled={resending || cooldown > 0}
          className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-40 btn-press"
        >
          {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {cooldown > 0 ? `Tekrar gönder (${cooldown})` : "Bağlantıyı tekrar gönder"}
        </button>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="w-full py-3 text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-colors"
        >
          Giriş Ekranına Dön
        </button>
      </div>
    </main>
  );
}
