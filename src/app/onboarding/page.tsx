"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  Check,
  X,
  Camera,
  ArrowLeft,
  Loader2,
  User,
  LogOut,
} from "lucide-react";
import DatePickerWheel from "@/components/DatePickerWheel";

export default function OnboardingPage() {
  const [mounted, setMounted] = useState(false);
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Adım 3 (Onboarding Step 1): Doğum Tarihi & Yaş
  const [birthDate, setBirthDate] = useState("2005-06-15");
  const [calculatedAge, setCalculatedAge] = useState<number | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);

  // Adım 4 (Onboarding Step 2): Kullanıcı Adı (@username)
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Adım 5 (Onboarding Step 3): Profil Belirleme (Fotoğraf & Ad Soyad)
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user?.photoURL && !avatarPreview) {
      setAvatarPreview(user.photoURL);
    }
    if (user?.displayName && !displayName) {
      setDisplayName(user.displayName);
    }
  }, [user]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const sanitized = rawValue
      .toLowerCase()
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9_]/g, ""); // Sadece a-z, 0-9 ve alt çizgi kalır

    setUsername(sanitized);
  };

  // Username validation & availability debounce (300ms)
  useEffect(() => {
    if (!username) {
      setUsernameStatus("idle");
      setUsernameError(null);
      return;
    }

    const regex = /^[a-z0-9_]{3,15}$/;
    if (!regex.test(username)) {
      setUsernameStatus("invalid");
      setUsernameError("Kullanıcı adı 3-15 karakter ve sadece küçük harf, rakam, alt tire içerebilir.");
      return;
    }

    setUsernameStatus("checking");
    setUsernameError(null);

    const timer = setTimeout(async () => {
      try {
        const usernameRef = doc(db, "usernames", username.toLowerCase());
        const snap = await getDoc(usernameRef);

        if (snap.exists()) {
          setUsernameStatus("taken");
          setUsernameError("Bu kullanıcı adı zaten alınmış.");
        } else {
          setUsernameStatus("available");
          setUsernameError(null);
        }
      } catch (err) {
        console.error("Kullanıcı adı kontrol hatası:", err);
        setUsernameStatus("idle");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleComplete = async (skipPhoto: boolean = false) => {
    if (!user || calculatedAge === null) return;
    setSubmitting(true);

    try {
      let finalPhotoURL = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

      if (!skipPhoto && avatarFile) {
        const fileExt = avatarFile.name.split(".").pop() || "jpg";
        const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}.${fileExt}`);
        const snapshot = await uploadBytes(storageRef, avatarFile);
        finalPhotoURL = await getDownloadURL(snapshot.ref);
      }

      const finalDisplayName = displayName.trim() || user.displayName || username;

      // Firestore Atomik writeBatch (İki tabloya tek işlemde kayıt)
      const batch = writeBatch(db);
      const userRef = doc(db, "users", user.uid);
      const usernameRef = doc(db, "usernames", username.toLowerCase());

      batch.set(userRef, {
        uid: user.uid,
        email: user.email,
        username: username,
        username_lowercase: username.toLowerCase(),
        displayName: finalDisplayName,
        photoURL: finalPhotoURL,
        bio: "",
        birthDate: birthDate,
        age: calculatedAge,
        isVerified: false,
        emailVerified: true,
        role: "user",
        onboardingCompleted: true,
        stats: {
          postsCount: 0,
          followersCount: 0,
          followingCount: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(usernameRef, {
        uid: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      await refreshProfile();
      router.replace("/");
    } catch (err) {
      console.error("Onboarding kaydetme hatası:", err);
      setSubmitting(false);
    }
  };

  if (!mounted || loading) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-4 pt-safe pb-safe bg-black text-white">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] bg-black text-white">
      <div className="w-full max-w-[420px] flex flex-col justify-between min-h-[580px] p-6 sm:p-8 bg-zinc-950/80 border border-zinc-900 rounded-3xl shadow-2xl backdrop-blur-2xl">
        {/* ÜST BAR (Geri Butonu, Adım Çizgileri ve Çıkış Butonu) */}
        <div className="flex items-center justify-between h-10 mb-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((prev) => (prev - 1) as 1 | 2)}
              className="w-10 h-10 rounded-full bg-zinc-900/90 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-10" />
          )}

          {/* Adım Çizgileri */}
          <div className="flex items-center gap-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                step === 1 ? "w-6 bg-white" : "w-2 bg-zinc-800"
              }`}
            />
            <div
              className={`h-1.5 rounded-full transition-all ${
                step === 2 ? "w-6 bg-white" : "w-2 bg-zinc-800"
              }`}
            />
            <div
              className={`h-1.5 rounded-full transition-all ${
                step === 3 ? "w-6 bg-white" : "w-2 bg-zinc-800"
              }`}
            />
          </div>

          <button
            type="button"
            onClick={signOut}
            title="Çıkış Yap"
            className="w-10 h-10 rounded-full bg-zinc-900/90 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* ADIM 3: DOĞUM TARİHİ VE YAŞ */}
        {step === 1 && (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                Doğum tarihinizi girin
              </h1>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                SigalMedia topluluğuna katılmak için en az 13 yaşında olmalısınız.
              </p>

              <div className="space-y-4">
                <DatePickerWheel
                  value={birthDate}
                  onChange={(dateStr, age) => {
                    setBirthDate(dateStr);
                    setCalculatedAge(age);
                    if (age < 13) {
                      setAgeError("SigalMedia'yı kullanabilmek için en az 13 yaşında olmalısınız.");
                    } else {
                      setAgeError(null);
                    }
                  }}
                />

                {ageError && (
                  <p className="text-xs text-rose-400 px-1 font-medium text-center">{ageError}</p>
                )}

                {calculatedAge !== null && calculatedAge >= 13 && (
                  <p className="text-xs text-emerald-400 px-1 font-medium text-center">
                    {calculatedAge} yaşındasınız.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={calculatedAge === null || calculatedAge < 13}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                Devam Et
              </button>
            </div>
          </div>
        )}

        {/* ADIM 4: KULLANICI ADI SEÇİMİ */}
        {step === 2 && (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                Kullanıcı adı seçin
              </h1>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                Profiliniz için benzersiz bir kullanıcı adı belirleyin.
              </p>

              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-4 top-4 text-zinc-500 font-semibold text-base">
                    @
                  </span>
                  <input
                    type="text"
                    autoFocus
                    autoComplete="off"
                    maxLength={15}
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="kullanici_adi"
                    className="w-full h-14 pl-10 pr-12 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
                  />
                  <div className="absolute right-4 top-4">
                    {usernameStatus === "checking" && (
                      <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                    )}
                    {usernameStatus === "available" && (
                      <Check className="w-5 h-5 text-emerald-400" />
                    )}
                    {(usernameStatus === "taken" || usernameStatus === "invalid") && (
                      <X className="w-5 h-5 text-rose-400" />
                    )}
                  </div>
                </div>

                {usernameError && (
                  <p className="text-xs text-rose-400 px-1 font-medium">{usernameError}</p>
                )}

                {usernameStatus === "available" && (
                  <p className="text-xs text-emerald-400 px-1 font-medium">
                    Bu kullanıcı adı kullanılabilir.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={usernameStatus !== "available"}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              >
                Devam Et
              </button>
            </div>
          </div>
        )}

        {/* ADIM 5: PROFİL BELİRLEME (FOTOĞRAF & İSİM) */}
        {step === 3 && (
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
                Profilinizi tamamlayın
              </h1>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                Adınızı ve profil fotoğrafınızı belirleyin.
              </p>

              {/* Fotoğraf Seçimi */}
              <div className="flex flex-col items-center justify-center mb-6">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative group cursor-pointer w-28 h-28 rounded-full border-2 border-dashed border-zinc-700 hover:border-zinc-500 flex items-center justify-center overflow-hidden transition-all bg-zinc-900"
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Profil Önizleme"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  )}

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-xs text-zinc-400 hover:text-white font-medium transition-colors"
                >
                  {avatarPreview ? "Fotoğrafı Değiştir" : "Fotoğraf Seç"}
                </button>
              </div>

              {/* Görünen Ad Girişi */}
              <div className="space-y-1.5 text-left">
                <label className="text-sm font-medium text-zinc-300">
                  Görünen Ad
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Örn: Bedirhan veya Takma Adın"
                  maxLength={30}
                  autoComplete="off"
                  className="w-full h-14 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-base text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
                />
                <p className="text-xs text-zinc-500">
                  Profilinde ve gönderilerinde bu ad gösterilir. Daha sonra değiştirebilirsin.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-6">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleComplete(false)}
                className="w-full h-14 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                    Kaydediliyor...
                  </>
                ) : (
                  "Kaydet ve Başla"
                )}
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleComplete(true)}
                className="w-full h-12 rounded-2xl text-zinc-400 hover:text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                Şimdilik Geç
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
