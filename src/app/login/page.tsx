"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";

type AuthView =
  | "welcome"
  | "login-email"
  | "login-password"
  | "register-email"
  | "register-password";

export default function LoginPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<AuthView>("welcome");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isValidEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const isPasswordValid = (pwd: string) => {
    const hasMinLength = pwd.length >= 8;
    const hasLowerCase = /[a-z]/.test(pwd);
    const hasUpperCase = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    return hasMinLength && hasLowerCase && hasUpperCase && hasNumber;
  };

  const getPasswordValidationError = (pwd: string): string | null => {
    if (pwd.length < 8) return "Şifre en az 8 karakter olmalıdır.";
    if (!/[a-z]/.test(pwd)) return "Şifre en az bir küçük harf içermelidir.";
    if (!/[A-Z]/.test(pwd)) return "Şifre en az bir büyük harf içermelidir.";
    if (!/[0-9]/.test(pwd)) return "Şifre en az bir rakam içermelidir.";
    return null;
  };

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Google ile giriş yapılırken bir sorun oluştu.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }
    setError(null);
    if (view === "login-email") {
      setView("login-password");
    } else if (view === "register-email") {
      setView("register-password");
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (view === "register-password") {
      const pwdErr = getPasswordValidationError(password);
      if (pwdErr) {
        setError(pwdErr);
        return;
      }
    } else {
      if (!password) {
        setError("Lütfen şifrenizi girin.");
        return;
      }
    }

    setLoading(true);

    try {
      if (view === "login-password") {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

        // Profil veya yerel doğrulama durumunu kontrol et
        const userDocRef = doc(db, "users", cred.user.uid);
        const userSnap = await getDoc(userDocRef).catch(() => null);
        const isProfileDone = userSnap?.exists() && userSnap.data()?.onboardingCompleted;
        const isLocallyVerified = localStorage.getItem(`email_verified_${cred.user.uid}`) === "true";

        if (!cred.user.emailVerified && !isProfileDone && !isLocallyVerified) {
          const cleanEmail = email.trim().toLowerCase();
          const now = Date.now();
          const expires = now + 3 * 60 * 1000; // 3 dakika

          // 1. Oturum kilitlerini ağ isteğinden önce anında yaz
          sessionStorage.setItem("verify_email", cleanEmail);
          sessionStorage.setItem("pending_email", cleanEmail);
          sessionStorage.setItem("last_code_sent", now.toString());
          sessionStorage.setItem("code_expires_at", expires.toString());
          localStorage.setItem(
            "pending_verification",
            JSON.stringify({ email: cleanEmail, expiresAt: expires, sentAt: now })
          );

          // 2. Doğrulama kodunu gönder
          try {
            await fetch("/api/auth/send-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: cleanEmail }),
            });
          } catch (resErr) {
            console.warn("Kod gönderim hatası:", resErr);
          }

          router.replace("/auth/verify-email");
          return;
        }
      } else if (view === "register-password") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

        const cleanEmail = email.trim().toLowerCase();
        const now = Date.now();
        const expires = now + 3 * 60 * 1000; // 3 dakika

        // 1. Oturum kilitlerini ağ isteğinden önce anında yaz
        sessionStorage.setItem("verify_email", cleanEmail);
        sessionStorage.setItem("pending_email", cleanEmail);
        sessionStorage.setItem("last_code_sent", now.toString());
        sessionStorage.setItem("code_expires_at", expires.toString());
        localStorage.setItem(
          "pending_verification",
          JSON.stringify({ email: cleanEmail, expiresAt: expires, sentAt: now })
        );

        // 2. Doğrulama kodunu gönder
        try {
          await fetch("/api/auth/send-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail }),
          });
        } catch (resendErr) {
          console.warn("Resend doğrulama kodu hatası:", resendErr);
        }

        router.replace("/auth/verify-email");
        return;
      }
    } catch (err: any) {
      switch (err.code) {
        case "auth/invalid-email":
          setError("Geçersiz e-posta adresi.");
          break;
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          setError("E-posta veya şifre hatalı.");
          break;
        case "auth/email-already-in-use":
          setError("Bu e-posta adresi zaten kullanımda.");
          break;
        case "auth/weak-password":
          setError("Şifre en az 6 karakter olmalıdır.");
          break;
        default:
          setError("İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-4 pt-safe pb-safe bg-black text-white">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] bg-black text-white">
      <div className="w-full max-w-[420px] flex flex-col justify-between min-h-[580px] p-6 sm:p-8 bg-zinc-950/80 border border-zinc-900 rounded-3xl shadow-2xl backdrop-blur-2xl animate-auth-scale">
        {/* ÜST BAR (Geri Butonu ve Küçük Logo) */}
        <div className="flex items-center justify-between h-10 mb-4">
          {view !== "welcome" ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (view === "login-password") {
                  setPassword("");
                  setView("login-email");
                } else if (view === "register-password") {
                  setPassword("");
                  setView("register-email");
                } else {
                  setEmail("");
                  setPassword("");
                  setView("welcome");
                }
              }}
              className="w-10 h-10 rounded-full bg-zinc-900/90 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors btn-press-subtle"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div />
          )}

          {view !== "welcome" && (
            <img
              src="/icons/MainLogo.svg"
              alt="SigalMedia"
              className="w-7 h-7 object-contain opacity-80"
            />
          )}
        </div>

        {/* 1. GİRİŞ/KAYIT SEÇİM EKRANI (INPUTSUZ BAŞLANGIÇ) */}
        {view === "welcome" && (
          <div key="welcome" className="flex-1 flex flex-col justify-between animate-auth-fade">
            <div className="pt-6">
              <div className="mb-6">
                <img
                  src="/icons/MainLogo.svg"
                  alt="SigalMedia Logo"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
                SigalMedia
              </h1>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Sosyal deneyiminizi keşfedin, arkadaşlarınızla bağlantıda kalın.
              </p>
            </div>

            <div className="space-y-3 pt-8">
              <button
                type="button"
                onClick={() => {
                  setEmail("");
                  setPassword("");
                  setError(null);
                  setView("register-email");
                }}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors flex items-center justify-center btn-press"
              >
                Hesap Oluştur
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmail("");
                  setPassword("");
                  setError(null);
                  setView("login-email");
                }}
                className="w-full h-14 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-semibold text-base transition-colors flex items-center justify-center btn-press"
              >
                Giriş Yap
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-900" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-950 px-3 text-zinc-600 font-medium">veya</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-white font-medium text-sm transition-colors flex items-center justify-center gap-3 disabled:opacity-50 btn-press"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Google ile Devam Et
              </button>
            </div>
          </div>
        )}

        {/* 2. ADIM: E-POSTA ADIMI (GİRİŞ VEYA KAYIT) */}
        {(view === "login-email" || view === "register-email") && (
          <form
            key={view}
            onSubmit={handleEmailContinue}
            autoComplete="off"
            className="flex-1 flex flex-col justify-between animate-auth-fade"
          >
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                {view === "login-email" ? "Tekrar hoş geldin" : "E-postanızı girin"}
              </h1>
              <p className="text-zinc-400 text-sm mb-6">
                {view === "login-email"
                  ? "SigalMedia hesabınıza bağlı e-posta adresinizi yazın."
                  : "Yeni hesap oluşturmak için e-posta adresinizi yazın."}
              </p>

              <div className="space-y-3">
                <input
                  type="email"
                  autoFocus
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="E-postanızı girin"
                  className="w-full h-14 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
                />

                {error && (
                  <p className="text-xs text-rose-400 px-1 font-medium">{error}</p>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-6">
              <button
                type="submit"
                disabled={!isValidEmail(email)}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center btn-press"
              >
                Devam Et
              </button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-900" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-950 px-3 text-zinc-600 font-medium">veya</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-14 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-white font-medium text-sm transition-colors flex items-center justify-center gap-3 disabled:opacity-50 btn-press"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Google ile Devam Et
              </button>
            </div>
          </form>
        )}

        {/* 3. ADIM: ŞİFRE ADIMI (GİRİŞ VEYA KAYIT) */}
        {(view === "login-password" || view === "register-password") && (
          <form
            key={view}
            onSubmit={handleAuthSubmit}
            autoComplete="off"
            className="flex-1 flex flex-col justify-between animate-auth-fade"
          >
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                {view === "login-password" ? "Şifrenizi girin" : "Şifre belirleyin"}
              </h1>
              <p className="text-zinc-400 text-sm mb-6">
                <span className="text-zinc-200 font-medium">{email}</span>{" "}
                {view === "login-password"
                  ? "hesabınızın şifresini yazın."
                  : "için en az 8 karakterli, büyük/küçük harf ve rakam içeren şifre belirleyin."}
              </p>

              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoFocus
                    required
                    autoComplete={view === "register-password" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Şifreniz"
                    className="w-full h-14 pl-4 pr-12 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-4 text-zinc-500 hover:text-zinc-300 transition-colors btn-press-subtle"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {error && (
                  <p className="text-xs text-rose-400 px-1 font-medium">{error}</p>
                )}
              </div>
            </div>

            <div className="pt-6">
              <button
                type="submit"
                disabled={loading || (view === "register-password" ? !isPasswordValid(password) : !password)}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 btn-press"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : view === "login-password" ? (
                  "Giriş Yap"
                ) : (
                  "Hesap Oluştur"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
