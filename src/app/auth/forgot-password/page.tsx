"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { AuthServiceError, getAuthService } from "@/services/auth";

const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }
    setLoading(true);
    try {
      await getAuthService().sendPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      const code = err instanceof AuthServiceError ? err.code : "unknown";
      if (code === "invalid-email") setError("Lütfen geçerli bir e-posta adresi girin.");
      else if (code === "rate-limited") setError("Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.");
      else setSent(true); // kayıtlı olmayan adresleri ifşa etmemek için aynı yanıt
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 bg-black text-white">
      <div className="w-full max-w-[420px] flex flex-col min-h-[420px] p-6 sm:p-8 bg-zinc-950/80 border border-zinc-900 rounded-3xl shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center h-10 mb-4">
          <Link
            href="/login"
            aria-label="Geri"
            className="w-10 h-10 rounded-full bg-zinc-900/90 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors btn-press-subtle"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>

        {sent ? (
          <div className="flex-1 flex flex-col justify-center text-center" data-testid="forgot-sent">
            <MailCheck className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold tracking-tight mb-2">E-postanı kontrol et</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              <span className="text-zinc-200 font-medium">{email.trim()}</span> adresi bir hesaba bağlıysa şifre
              sıfırlama bağlantısı gönderildi. Gelen kutusunu ve spam klasörünü kontrol et.
            </p>
            <Link href="/login" className="mt-6 text-sm font-medium text-zinc-300 hover:text-white">
              Giriş ekranına dön
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between" noValidate>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Şifreni sıfırla</h1>
              <p className="text-zinc-400 text-sm mb-6">
                Hesabına bağlı e-posta adresini yaz, sana yeni şifre belirleme bağlantısı gönderelim.
              </p>
              <input
                type="email"
                autoFocus
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="E-posta adresin"
                className="w-full h-14 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              {error && <p className="text-xs text-rose-400 px-1 pt-3 font-medium">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={loading || !isValidEmail(email)}
              className="mt-6 w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 btn-press"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Bağlantı Gönder"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-black" />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
