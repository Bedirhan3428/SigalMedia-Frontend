"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, MailCheck } from "lucide-react";

interface PendingVerification {
  email: string;
  expiresAt: number;
  sentAt?: number;
}

function VerifyEmailContent() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const initialSendRef = useRef(false);

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "expired">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // 1. Sayfa açıldığında veriyi yükle ve tek bir kez yönet
  useEffect(() => {
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

    const now = Date.now();
    let targetExpiresAt = parsed?.expiresAt;

    if (!targetExpiresAt || targetExpiresAt <= now) {
      if (targetExpiresAt && targetExpiresAt <= now) {
        setStatus("expired");
        setTimeLeft(0);
        setExpiresAt(targetExpiresAt);
        return;
      }
      targetExpiresAt = now + 10 * 60 * 1000;
    }

    setExpiresAt(targetExpiresAt);
    setTimeLeft(Math.max(0, Math.floor((targetExpiresAt - now) / 1000)));

    // Eğer daha önce hiç kod gönderilmemişse ve ilk kez giriliyorsa tek sefer gönder
    if (!parsed?.sentAt && email && !initialSendRef.current) {
      initialSendRef.current = true;
      fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
        .then((res) => res.json())
        .then((data) => {
          const newExp = data.expiresAt || targetExpiresAt;
          setExpiresAt(newExp);
          localStorage.setItem(
            "pending_verification",
            JSON.stringify({ email, expiresAt: newExp, sentAt: Date.now() })
          );
        })
        .catch((err) => console.error("İlk kod gönderim hatası:", err));
    }

    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 150);
  }, [user, router]);

  // 2. Geri sayım sayacı
  useEffect(() => {
    if (!expiresAt || status === "expired") return;

    const updateRemaining = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(diff);

      if (diff <= 0) {
        setStatus("expired");
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, status]);

  // 3. 4 Haneli Kodu Doğrulama
  const handleVerify = async (codeToVerify?: string) => {
    const fullCode = codeToVerify || digits.join("");
    if (fullCode.length !== 4) {
      setErrorMessage("Lütfen 4 haneli kodu eksiksiz girin.");
      return;
    }

    const email = pendingEmail || user?.email || "";
    if (!email) {
      setErrorMessage("E-posta adresi bulunamadı.");
      return;
    }

    try {
      setStatus("verifying");
      setErrorMessage(null);

      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: fullCode,
          uid: user?.uid,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setStatus("idle");
        setErrorMessage(data.error || "Girdiğiniz 4 haneli kod hatalı.");
        return;
      }

      // Başarılı doğrulama
      if (user?.uid) {
        localStorage.setItem(`email_verified_${user.uid}`, "true");
      }
      if (email) {
        localStorage.setItem(`email_verified_${email}`, "true");
      }
      localStorage.removeItem("pending_verification");

      setStatus("success");
      await refreshProfile();

      setTimeout(() => {
        router.push(profile?.onboardingCompleted ? "/" : "/onboarding");
      }, 1500);
    } catch (err: any) {
      console.error("Doğrulama hatası:", err);
      setStatus("idle");
      setErrorMessage("Bağlantı hatası oluştu. Lütfen tekrar deneyin.");
    }
  };

  // 4. Tekrar Kod Gönder (Süreyi 10 dakikaya baştan kurar)
  const handleResend = async () => {
    const email = pendingEmail || user?.email;
    if (!email) {
      handleReturnHome();
      return;
    }

    try {
      setResending(true);
      setResendSuccess(false);
      setErrorMessage(null);

      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Kod gönderilemedi. Lütfen tekrar deneyin.");
        return;
      }

      const newExpiresAt = data.expiresAt || Date.now() + 10 * 60 * 1000;

      localStorage.setItem(
        "pending_verification",
        JSON.stringify({
          email,
          expiresAt: newExpiresAt,
          sentAt: Date.now(),
        })
      );

      setExpiresAt(newExpiresAt);
      setTimeLeft(600);
      setDigits(["", "", "", ""]);
      setStatus("idle");
      setResendSuccess(true);

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      console.error("Resend hatası:", err);
      setErrorMessage("Doğrulama kodu gönderilemedi. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setResending(false);
    }
  };

  // 5. Ana Ekrana Dön (Hafızayı temizleyip çıkış yapar)
  const handleReturnHome = async () => {
    localStorage.removeItem("pending_verification");
    setExpiresAt(0);
    setTimeLeft(0);
    setDigits(["", "", "", ""]);
    setStatus("idle");
    try {
      await firebaseSignOut(auth);
    } catch {}
    router.push("/login");
  };

  // Klavye & Input Yönetimi
  const handleDigitChange = (index: number, val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, "");

    if (cleanVal.length <= 1) {
      const nextDigits = [...digits];
      nextDigits[index] = cleanVal;
      setDigits(nextDigits);
      if (errorMessage) setErrorMessage(null);

      if (cleanVal && index < 3) {
        inputRefs.current[index + 1]?.focus();
      }

      if (cleanVal && index === 3) {
        const fullCode = nextDigits.join("");
        if (fullCode.length === 4) {
          handleVerify(fullCode);
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 3) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === "Enter") {
      const fullCode = digits.join("");
      if (fullCode.length === 4) {
        handleVerify(fullCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 4);
    if (!pasteData) return;

    const nextDigits = ["", "", "", ""];
    for (let i = 0; i < pasteData.length; i++) {
      nextDigits[i] = pasteData[i];
    }
    setDigits(nextDigits);

    if (pasteData.length === 4) {
      inputRefs.current[3]?.focus();
      handleVerify(pasteData);
    } else {
      inputRefs.current[pasteData.length]?.focus();
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
        {status === "success" ? (
          <div className="py-12 my-auto">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4 animate-in zoom-in duration-300" />
            <h1 className="text-2xl font-bold text-white mb-2">E-posta Doğrulandı</h1>
            <p className="text-sm text-zinc-400 mb-6">
              Hesabınız başarıyla onaylandı. Yönlendiriliyorsunuz...
            </p>
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : status === "expired" ? (
          <div className="py-6 my-auto">
            <AlertCircle className="w-14 h-14 text-amber-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Süre Doldu</h1>
            <p className="text-sm text-zinc-400 mb-6">
              10 dakikalık doğrulama süresi doldu. Yeni bir 4 haneli kod alabilir veya ana ekrana dönebilirsiniz.
            </p>

            {errorMessage && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mb-4">
                {errorMessage}
              </p>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {resending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Yeni Kod Gönder
              </button>

              <button
                type="button"
                onClick={handleReturnHome}
                className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium transition-colors"
              >
                Ana Ekrana Dön
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-between flex-1">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-emerald-400">
                <MailCheck className="w-7 h-7" />
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">Doğrulama Kodu</h1>
              <p className="text-sm text-zinc-400 mb-6">
                <span className="text-zinc-200 font-medium">{pendingEmail}</span> adresinize gönderilen 4 haneli kodu girin.
              </p>

              {/* 4 Haneli OTP Giriş Alanları */}
              <div className="flex justify-center items-center gap-3 sm:gap-4 my-6">
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    disabled={status === "verifying"}
                    className="w-14 h-16 sm:w-16 sm:h-18 text-2xl sm:text-3xl font-mono font-bold text-center bg-zinc-900/90 border border-zinc-800 rounded-2xl text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all disabled:opacity-50"
                  />
                ))}
              </div>

              {/* Kalan Süre */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800/80 mb-4">
                <span className="text-xs text-zinc-400">Kalan Süre:</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {formatTime(timeLeft)}
                </span>
              </div>

              {resendSuccess && (
                <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 mb-3">
                  Yeni 4 haneli kod e-postanıza gönderildi.
                </p>
              )}

              {errorMessage && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mb-3">
                  {errorMessage}
                </p>
              )}
            </div>

            {/* Butonlar */}
            <div className="space-y-3 pt-4">
              <button
                type="button"
                onClick={() => handleVerify()}
                disabled={status === "verifying" || digits.join("").length !== 4}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === "verifying" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                    Doğrulanıyor...
                  </>
                ) : (
                  "Doğrula"
                )}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="w-full h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {resending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Tekrar Kod Gönder
              </button>

              <button
                type="button"
                onClick={handleReturnHome}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-colors"
              >
                Ana Ekrana Dön
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
