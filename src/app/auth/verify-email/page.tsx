"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyActionCode,
  sendEmailVerification,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, AlertCircle, Mail, ArrowRight, Loader2, RefreshCw } from "lucide-react";

interface PendingVerification {
  email: string;
  expiresAt: number;
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();

  const oobCode = searchParams.get("oobCode");

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error" | "expired">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // 1. oobCode varsa doğrulamayı uygula
  useEffect(() => {
    if (!oobCode) return;

    let isMounted = true;
    setStatus("verifying");

    applyActionCode(auth, oobCode)
      .then(async () => {
        if (!isMounted) return;
        localStorage.removeItem("pending_verification");
        setStatus("success");

        if (auth.currentUser) {
          await auth.currentUser.reload();
          await refreshProfile();
        }

        setTimeout(() => {
          if (auth.currentUser) {
            router.push(profile?.onboardingCompleted ? "/" : "/onboarding");
          } else {
            router.push("/login");
          }
        }, 2500);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Email verification error:", err);
        setStatus("error");
        setErrorMessage("Doğrulama bağlantısı geçersiz veya süresi dolmuş.");
      });

    return () => {
      isMounted = false;
    };
  }, [oobCode, profile, refreshProfile, router]);

  // 2. oobCode yoksa, localStorage ve 10dk geri sayım kontrolü
  useEffect(() => {
    if (oobCode) return;

    const raw = localStorage.getItem("pending_verification");
    if (!raw && !user) {
      router.push("/login");
      return;
    }

    let parsed: PendingVerification | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }

    const email = parsed?.email || user?.email || "";
    setPendingEmail(email);

    const expiresAt = parsed?.expiresAt || Date.now() + 10 * 60 * 1000;

    const updateRemaining = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(diff);

      if (diff <= 0) {
        localStorage.removeItem("pending_verification");
        setStatus("expired");
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [oobCode, user, router]);

  const handleResend = async () => {
    if (!auth.currentUser) {
      router.push("/login");
      return;
    }

    try {
      setResending(true);
      setResendSuccess(false);

      // 1. Önce Resend ile doğrudan SigalMedia e-postası göndermeyi dene
      let sentViaResend = false;
      try {
        const res = await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: pendingEmail }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          sentViaResend = true;
        }
      } catch (resendErr) {
        console.warn("Resend bağlantı hatası, Firebase servisine geçiliyor:", resendErr);
      }

      // 2. Resend hata verdiyse veya anahtar yoksa Firebase varsayılanına geç
      if (!sentViaResend && auth.currentUser) {
        const actionCodeSettings = {
          url: `${window.location.origin}/auth/action`,
          handleCodeInApp: true,
        };
        await sendEmailVerification(auth.currentUser, actionCodeSettings);
      }

      const newExpiresAt = Date.now() + 10 * 60 * 1000;
      localStorage.setItem(
        "pending_verification",
        JSON.stringify({ email: pendingEmail, expiresAt: newExpiresAt })
      );
      setTimeLeft(600);
      setStatus("idle");
      setResendSuccess(true);
    } catch (err: any) {
      console.error("Resend error:", err);
      if (err?.code === "auth/too-many-requests") {
        setErrorMessage("Çok fazla deneme yapıldı. Lütfen 1-2 dakika bekleyip tekrar deneyin.");
      } else {
        setErrorMessage("Doğrulama e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin.");
      }
    } finally {
      setResending(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] bg-black text-white">
      <div className="w-full max-w-[420px] flex flex-col justify-between min-h-[520px] p-6 sm:p-8 bg-zinc-950/80 border border-zinc-900 rounded-3xl shadow-2xl backdrop-blur-2xl text-center">
        {status === "verifying" && (
          <div className="py-8">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">E-posta Doğrulanıyor</h1>
            <p className="text-sm text-zinc-400">Lütfen bekleyin...</p>
          </div>
        )}

        {status === "success" && (
          <div className="py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">E-posta Doğrulandı</h1>
            <p className="text-sm text-zinc-400 mb-6">
              Hesabınız başarıyla doğrulandı. Yönlendiriliyorsunuz...
            </p>
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {status === "error" && (
          <div className="py-6">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Doğrulama Başarısız</h1>
            <p className="text-sm text-zinc-400 mb-6">
              {errorMessage || "Bağlantının süresi dolmuş veya geçersiz."}
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm transition-colors"
            >
              Giriş Ekranına Dön
            </button>
          </div>
        )}

        {status === "expired" && (
          <div className="py-6">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Süre Doldu</h1>
            <p className="text-sm text-zinc-400 mb-6">
              10 dakikalık doğrulama süresi doldu. Lütfen tekrar kayıt olun veya giriş yapın.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm transition-colors"
            >
              Giriş Ekranına Dön
            </button>
          </div>
        )}

        {status === "idle" && (
          <div>
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-emerald-400">
              <Mail className="w-6 h-6" />
            </div>

            <h1 className="text-xl font-bold text-white mb-2">Doğrulama Bağlantısı Gönderildi</h1>
            <p className="text-sm text-zinc-400 mb-4">
              <span className="text-zinc-200 font-medium">{pendingEmail}</span> adresine bir onay bağlantısı gönderdik.
            </p>

            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 mb-6">
              <span className="text-xs text-zinc-500 block mb-1">Kalan Süre</span>
              <span className="text-lg font-mono font-semibold text-emerald-400">
                {formatTime(timeLeft)}
              </span>
            </div>

            {resendSuccess && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 mb-4">
                Yeni doğrulama bağlantısı gönderildi.
              </p>
            )}

            {errorMessage && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mb-4">
                {errorMessage}
              </p>
            )}

            <div className="space-y-3 pt-4">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || timeLeft === 0}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Tekrar Gönder
              </button>

              <button
                type="button"
                onClick={async () => {
                  await firebaseSignOut(auth);
                  router.push("/login");
                }}
                className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium transition-colors"
              >
                Giriş Ekranına Dön
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-4 bg-zinc-950 text-zinc-100">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
