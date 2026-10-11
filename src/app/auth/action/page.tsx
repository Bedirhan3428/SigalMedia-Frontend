"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  applyActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, AlertCircle, Loader2, KeyRound, Check } from "lucide-react";

function AuthActionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();

  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");

  // State
  const [status, setStatus] = useState<"loading" | "success" | "error" | "reset-password">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Şifre sıfırlama durumları
  const [newPassword, setNewPassword] = useState("");
  const [resetAccountEmail, setResetAccountEmail] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setStatus("error");
      setErrorMessage("Geçersiz veya eksik işlem kodu.");
      return;
    }

    let isMounted = true;

    // 1. E-POSTA DOĞRULAMA (verifyEmail)
    if (mode === "verifyEmail") {
      setStatus("loading");
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
          }, 2000);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error("Action verifyEmail hatası:", err);
          setStatus("error");
          setErrorMessage("Doğrulama bağlantısı geçersiz veya süresi dolmuş.");
        });
    }
    // 2. ŞİFRE SIFIRLAMA (resetPassword)
    else if (mode === "resetPassword") {
      verifyPasswordResetCode(auth, oobCode)
        .then((email) => {
          if (!isMounted) return;
          setResetAccountEmail(email);
          setStatus("reset-password");
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error("Action resetPassword hatası:", err);
          setStatus("error");
          setErrorMessage("Şifre sıfırlama bağlantısının süresi dolmuş veya geçersiz.");
        });
    }
    // 3. E-POSTA KURTARMA (recoverEmail)
    else if (mode === "recoverEmail") {
      applyActionCode(auth, oobCode)
        .then(() => {
          if (!isMounted) return;
          setStatus("success");
          setTimeout(() => router.push("/login"), 2500);
        })
        .catch((err) => {
          if (!isMounted) return;
          setStatus("error");
          setErrorMessage("E-posta kurtarma işlemi başarısız oldu.");
        });
    } else {
      // Bilinmeyen veya eksik mod
      setStatus("error");
      setErrorMessage("Desteklenmeyen işlem türü.");
    }

    return () => {
      isMounted = false;
    };
  }, [mode, oobCode, profile, refreshProfile, router]);

  const isPasswordValid = (pwd: string) => {
    return pwd.length >= 8 && /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd);
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode) return;
    if (newPassword.length < 8) {
      setErrorMessage("Şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setErrorMessage("Şifre en az bir küçük harf içermelidir.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setErrorMessage("Şifre en az bir büyük harf içermelidir.");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setErrorMessage("Şifre en az bir rakam içermelidir.");
      return;
    }

    setResetting(true);
    setErrorMessage(null);

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setStatus("success");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      console.error("Şifre sıfırlama onayı hatası:", err);
      setErrorMessage("Şifre güncellenirken bir sorun oluştu.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] bg-black text-white">
      <div className="w-full max-w-[420px] flex flex-col justify-between min-h-[500px] p-6 sm:p-8 bg-zinc-950/80 border border-zinc-900 rounded-3xl shadow-2xl backdrop-blur-2xl text-center animate-auth-scale">
        {/* Üst Logo */}
        <div className="flex justify-center mb-6">
          <img
            src="/icons/MainLogo.svg"
            alt="SigalMedia"
            className="w-12 h-12 object-contain"
          />
        </div>

        {/* 1. YÜKLENİYOR / İŞLENİYOR */}
        {status === "loading" && (
          <div key="loading" className="flex-1 flex flex-col items-center justify-center py-6 animate-auth-fade">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">
              İşlem Doğrulanıyor
            </h1>
            <p className="text-sm text-zinc-400">
              Lütfen bekleyin, hesabınız güncelleniyor...
            </p>
          </div>
        )}

        {/* 2. BAŞARILI */}
        {status === "success" && (
          <div key="success" className="flex-1 flex flex-col items-center justify-center py-6 animate-auth-fade">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">
              {mode === "resetPassword"
                ? "Şifreniz Güncellendi"
                : "E-posta Doğrulandı"}
            </h1>
            <p className="text-sm text-zinc-400 mb-6">
              {mode === "resetPassword"
                ? "Yeni şifreniz başarıyla kaydedildi. Giriş ekranına yönlendiriliyorsunuz..."
                : "Hesabınız başarıyla doğrulandı. Yönlendiriliyorsunuz..."}
            </p>
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* 3. HATA */}
        {status === "error" && (
          <div key="error" className="flex-1 flex flex-col items-center justify-center py-6 animate-auth-fade">
            <AlertCircle className="w-12 h-12 text-rose-400 mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">İşlem Başarısız</h1>
            <p className="text-sm text-zinc-400 mb-6">
              {errorMessage || "Bağlantının süresi dolmuş veya geçersiz."}
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full h-12 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition-colors flex items-center justify-center btn-press"
            >
              Giriş Ekranına Dön
            </button>
          </div>
        )}

        {/* 4. ŞİFRE SIFIRLAMA FORMU */}
        {status === "reset-password" && (
          <form
            key="reset"
            onSubmit={handlePasswordResetSubmit}
            className="flex-1 flex flex-col justify-between animate-auth-fade"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4 text-emerald-400">
                <KeyRound className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">
                Yeni Şifre Belirleyin
              </h1>
              {resetAccountEmail && (
                <p className="text-xs text-zinc-400 mb-4">
                  {resetAccountEmail} hesabı için yeni bir şifre girin.
                </p>
              )}

              <input
                type="password"
                required
                autoFocus
                placeholder="En az 8 karakter, büyük/küçük harf, rakam"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                className="w-full h-14 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
              />

              <div className="grid grid-cols-2 gap-2 pt-2 px-1 text-left">
                {[
                  { label: "En az 8 karakter", valid: newPassword.length >= 8 },
                  { label: "Büyük harf (A-Z)", valid: /[A-Z]/.test(newPassword) },
                  { label: "Küçük harf (a-z)", valid: /[a-z]/.test(newPassword) },
                  { label: "Rakam (0-9)", valid: /[0-9]/.test(newPassword) },
                ].map((rule, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${
                      rule.valid ? "text-emerald-400 font-medium" : "text-zinc-500"
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all ${
                        rule.valid
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-600"
                      }`}
                    >
                      {rule.valid ? (
                        <Check className="w-2.5 h-2.5" />
                      ) : (
                        <div className="w-1 h-1 rounded-full bg-zinc-600" />
                      )}
                    </div>
                    <span className="truncate">{rule.label}</span>
                  </div>
                ))}
              </div>

              {errorMessage && (
                <p className="text-xs text-rose-400 mt-2 font-medium">
                  {errorMessage}
                </p>
              )}
            </div>

            <div className="pt-6">
              <button
                type="submit"
                disabled={resetting || !isPasswordValid(newPassword)}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 btn-press"
              >
                {resetting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Şifreyi Güncelle"
                )}
              </button>
            </div>
          </form>
        )}

        <div className="text-xs text-zinc-600">SigalMedia Güvenli Kimlik Doğrulama</div>
      </div>
    </main>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-4 bg-black text-white">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <AuthActionContent />
    </Suspense>
  );
}
