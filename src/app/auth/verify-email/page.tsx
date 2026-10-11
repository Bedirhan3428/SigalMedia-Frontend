"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, MailCheck, Edit3 } from "lucide-react";

const CODE_LIFETIME_SECONDS = 3 * 60; // 3 dakika (180 saniye)
const COOLDOWN_SECONDS = 60; // 60 saniye tekrar gönderim kilidi

function VerifyEmailContent() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Durumlar: 'active' (Durum A) | 'expired' (Durum B) | 'verifying' | 'success'
  const [status, setStatus] = useState<"active" | "expired" | "verifying" | "success">("active");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(CODE_LIFETIME_SECONDS);
  const [resending, setResending] = useState(false);

  // 1. Sayfa Açılışı: SessionStorage okuma ve Durum Tespiti (Asla otomatik istek atmaz)
  useEffect(() => {
    const sessionEmail = typeof window !== "undefined" ? sessionStorage.getItem("pending_email") : null;
    const lastSentStr = typeof window !== "undefined" ? sessionStorage.getItem("last_code_sent") : null;
    const expiresStr = typeof window !== "undefined" ? sessionStorage.getItem("code_expires_at") : null;

    const email = sessionEmail || user?.email || "";
    setPendingEmail(email);

    const now = Date.now();
    const lastSent = Number(lastSentStr || 0);
    const expiresAt = Number(expiresStr || 0);

    // Eğer e-posta yoksa veya 3 dakikalık süre dolmuşsa doğrudan Durum B (expired)
    if (!email || !expiresAt || now >= expiresAt) {
      setStatus("expired");
      setTimeLeft(0);
      setCooldown(0);
      return;
    }

    // Aktif Durum (Durum A)
    const remainingTime = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const currentCooldown =
      lastSent > 0 ? Math.max(0, COOLDOWN_SECONDS - Math.floor((now - lastSent) / 1000)) : 0;

    setTimeLeft(remainingTime);
    setCooldown(currentCooldown);
    setStatus("active");

    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 150);
  }, [user]);

  // 2. Canlı Zamanlayıcı (F5 ve Otomatik Durum B Geçişi)
  useEffect(() => {
    if (status !== "active" && status !== "verifying") return;

    const timer = setInterval(() => {
      const now = Date.now();
      const lastSentStr = sessionStorage.getItem("last_code_sent");
      const expiresStr = sessionStorage.getItem("code_expires_at");

      if (lastSentStr) {
        const lastSent = Number(lastSentStr);
        setCooldown(Math.max(0, COOLDOWN_SECONDS - Math.floor((now - lastSent) / 1000)));
      }

      if (expiresStr) {
        const expiresAt = Number(expiresStr);
        const rem = Math.max(0, Math.floor((expiresAt - now) / 1000));
        setTimeLeft(rem);

        // 3 dakika bittiğinde sayfa otomatik olarak Durum B'ye kayar
        if (rem <= 0) {
          setStatus("expired");
          setDigits(["", "", "", ""]);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

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
      setStatus("expired");
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
        setStatus("active");
        setErrorMessage(data.error || "Girdiğiniz 4 haneli kod hatalı.");
        return;
      }

      // Başarılı doğrulama: Tüm oturum kilitlerini temizle
      sessionStorage.removeItem("last_code_sent");
      sessionStorage.removeItem("code_expires_at");
      sessionStorage.removeItem("pending_email");
      localStorage.removeItem("pending_verification");

      if (user?.uid) {
        localStorage.setItem(`email_verified_${user.uid}`, "true");
      }
      if (email) {
        localStorage.setItem(`email_verified_${email}`, "true");
      }

      setStatus("success");
      await refreshProfile();

      setTimeout(() => {
        router.push(profile?.onboardingCompleted ? "/" : "/onboarding");
      }, 1500);
    } catch (err: any) {
      console.error("Doğrulama hatası:", err);
      setStatus("active");
      setErrorMessage("Bağlantı hatası oluştu. Lütfen tekrar deneyin.");
    }
  };

  // 4. Yeni / Tekrar Kod Gönder (Durum B -> Durum A ve Tekrar Gönder)
  const handleSendCode = async () => {
    if (resending) return;

    const email = pendingEmail.trim() || user?.email?.trim();
    if (!email || !email.includes("@")) {
      setErrorMessage("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }

    try {
      setResending(true);
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

      const now = Date.now();
      const expiresAt = now + CODE_LIFETIME_SECONDS * 1000;

      sessionStorage.setItem("last_code_sent", now.toString());
      sessionStorage.setItem("code_expires_at", expiresAt.toString());
      sessionStorage.setItem("pending_email", email);

      setPendingEmail(email);
      setCooldown(COOLDOWN_SECONDS);
      setTimeLeft(CODE_LIFETIME_SECONDS);
      setDigits(["", "", "", ""]);
      setIsEditingEmail(false);
      setStatus("active");

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      console.error("Kod gönderim hatası:", err);
      setErrorMessage("Doğrulama kodu gönderilemedi. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setResending(false);
    }
  };

  // 5. Giriş Ekranına Dön (Hafızayı temizler)
  const handleReturnHome = async () => {
    sessionStorage.removeItem("last_code_sent");
    sessionStorage.removeItem("code_expires_at");
    sessionStorage.removeItem("pending_email");
    localStorage.removeItem("pending_verification");
    try {
      await firebaseSignOut(auth);
    } catch {}
    router.push("/login");
  };

  // OTP Klavye & Input Yönetimi
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
          /* BAŞARILI ONAY EKRANI */
          <div className="py-12 my-auto">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4 animate-in zoom-in duration-300" />
            <h1 className="text-2xl font-bold text-white mb-2">E-posta Doğrulandı</h1>
            <p className="text-sm text-zinc-400 mb-6">
              Hesabınız başarıyla onaylandı. Yönlendiriliyorsunuz...
            </p>
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : status === "expired" ? (
          /* DURUM B: status === 'expired' (Yenileme Ekranı) */
          <div className="flex flex-col justify-between flex-1 py-2">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 text-amber-400">
                <AlertCircle className="w-7 h-7" />
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">Kodun Süresi Doldu</h1>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Güvenliğin için doğrulama kodunun süresi doldu veya henüz bir kod oluşturulmadı.
              </p>

              {/* E-posta Alanı: Hafızada yoksa veya düzenleniyorsa input, varsa şık gösterim */}
              {!pendingEmail || isEditingEmail ? (
                <div className="mb-6">
                  <input
                    type="email"
                    value={pendingEmail}
                    onChange={(e) => {
                      setPendingEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="E-posta adresiniz"
                    autoComplete="off"
                    autoFocus
                    className="w-full h-14 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white text-center placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              ) : (
                <div className="mb-6 flex items-center justify-center gap-2 p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl">
                  <span className="text-sm font-medium text-zinc-200 truncate max-w-[240px]">
                    {pendingEmail}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingEmail(true)}
                    className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors ml-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Değiştir
                  </button>
                </div>
              )}

              {errorMessage && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mb-4">
                  {errorMessage}
                </p>
              )}
            </div>

            {/* Ortada Kocaman Yeşil/Mavi Aktif Buton */}
            <div className="space-y-3 pt-4">
              <button
                type="button"
                onClick={handleSendCode}
                disabled={resending || !pendingEmail.trim()}
                className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-base transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                    Kod Gönderiliyor...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Yeni Kod Gönder
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleReturnHome}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-colors"
              >
                Giriş Ekranına Dön
              </button>
            </div>
          </div>
        ) : (
          /* DURUM A: status === 'active' (Doğrulama Ekranı) */
          <div className="flex flex-col justify-between flex-1 py-2">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4 text-emerald-400">
                <MailCheck className="w-7 h-7" />
              </div>

              <h1 className="text-2xl font-bold text-white mb-2">Doğrulama Kodunu Gir</h1>
              <p className="text-sm text-zinc-400 mb-6">
                <span className="text-zinc-200 font-medium">{pendingEmail}</span> adresine gönderilen 4 haneli kodu yaz.
              </p>

              {/* 4 Haneli OTP Input Kutuları */}
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
                    autoComplete="off"
                    className="w-14 h-16 sm:w-16 sm:h-18 text-2xl sm:text-3xl font-mono font-bold text-center bg-zinc-900/90 border border-zinc-800 rounded-2xl text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all disabled:opacity-50"
                  />
                ))}
              </div>

              {/* Kalan Süre Rozeti */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800/80 mb-3">
                <span className="text-xs text-zinc-400">Kalan Süre:</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {formatTime(timeLeft)}
                </span>
              </div>

              {errorMessage && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mb-3">
                  {errorMessage}
                </p>
              )}
            </div>

            {/* Aksiyon Butonları & Pasif Cooldown Sayacı */}
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
                  "Kodu Doğrula"
                )}
              </button>

              {/* Cooldown Sayacı / Tekrar Gönder Butonu */}
              {cooldown > 0 ? (
                <div className="w-full h-12 rounded-2xl bg-zinc-900/60 border border-zinc-800/60 text-zinc-500 text-sm font-medium flex items-center justify-center select-none">
                  Tekrar göndermek için {cooldown}s bekleyin
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSendCode}
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
              )}

              <button
                type="button"
                onClick={handleReturnHome}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-colors"
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
