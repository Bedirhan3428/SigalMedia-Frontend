"use client";

// [START] NexusAI
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Lock,
  UserCheck,
  Ban,
  Check,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  setAccountPrivacy,
  getBlockedUsers,
  getFollowRequests,
} from "@/services/privacyService";

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile, signOut } = useAuth();

  const [isPrivate, setIsPrivate] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [requestsCount, setRequestsCount] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (profile) {
      setIsPrivate(Boolean(profile.isPrivate));
    }
  }, [profile]);

  useEffect(() => {
    if (!profile?.uid) return;
    let active = true;

    Promise.all([
      getBlockedUsers(profile.uid),
      getFollowRequests(profile.uid),
    ]).then(([blockedList, reqList]) => {
      if (!active) return;
      setBlockedCount(blockedList.length);
      setRequestsCount(reqList.length);
    });

    return () => {
      active = false;
    };
  }, [profile?.uid]);

  const handleTogglePrivacy = async () => {
    if (togglingPrivacy || !profile) return;
    const nextValue = !isPrivate;
    setIsPrivate(nextValue);
    setTogglingPrivacy(true);

    try {
      await setAccountPrivacy(nextValue);
      await refreshProfile();
      showToast(nextValue ? "Hesap gizli yapıldı" : "Hesap herkese açık yapıldı");
    } catch {
      setIsPrivate(!nextValue);
      showToast("Güncellenemedi");
    } finally {
      setTogglingPrivacy(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Toast Bildirimi */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-zinc-700 flex items-center gap-2 select-none animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            title="Geri"
            aria-label="Geri"
            className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold tracking-tight text-white">
            Ayarlar
          </h1>
        </div>
      </header>

      {/* Kaydırılabilir Liste Alanı */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 overflow-y-auto space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        {/* Bölüm 1: Hesap & Profil */}
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Hesap
          </h2>
          <div className="bg-zinc-900/60 border border-zinc-900 rounded-2xl overflow-hidden">
            <Link
              href="/profile/edit"
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-900 transition-colors text-sm font-medium text-zinc-100 btn-press-subtle"
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-zinc-400" />
                <span>Profili Düzenle</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            </Link>
          </div>
        </section>

        {/* Bölüm 2: Gizlilik ve Güvenlik */}
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Gizlilik ve Güvenlik
          </h2>
          <div className="bg-zinc-900/60 border border-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-900">
            {/* Gizli Hesap Toggle */}
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-100">
                  Gizli Hesap
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                disabled={togglingPrivacy}
                onClick={handleTogglePrivacy}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isPrivate ? "bg-emerald-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isPrivate ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Takip İstekleri */}
            <Link
              href="/settings/follow-requests"
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-900 transition-colors text-sm font-medium text-zinc-100 btn-press-subtle"
            >
              <div className="flex items-center gap-3">
                <UserCheck className="w-5 h-5 text-zinc-400" />
                <span>Takip İstekleri</span>
              </div>
              <div className="flex items-center gap-2">
                {requestsCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {requestsCount}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              </div>
            </Link>

            {/* Engellenen Hesaplar */}
            <Link
              href="/settings/blocked"
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-900 transition-colors text-sm font-medium text-zinc-100 btn-press-subtle"
            >
              <div className="flex items-center gap-3">
                <Ban className="w-5 h-5 text-zinc-400" />
                <span>Engellenen Hesaplar</span>
              </div>
              <div className="flex items-center gap-2">
                {blockedCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-zinc-800 text-zinc-300">
                    {blockedCount}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              </div>
            </Link>
          </div>
        </section>

        {/* Bölüm 3: Oturum */}
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Oturum
          </h2>
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-900 rounded-2xl text-red-400 hover:text-red-300 transition-all font-medium text-sm text-left btn-press-subtle"
          >
            <LogOut className="w-5 h-5 text-red-400" />
            <span>Çıkış Yap</span>
          </button>
        </section>
      </main>
    </div>
  );
}
// [END] NexusAI
