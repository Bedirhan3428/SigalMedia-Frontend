"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { LogOut, User as UserIcon } from "lucide-react";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const { profile, loading, signOut } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Üst Bar (Durum Çubuğu / Çentik Güvenli Alanı) */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md sticky top-0 z-50 pt-safe">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/icons/MainLogo.svg"
              alt="SigalMedia"
              className="w-7 h-7 object-contain"
            />
            <span className="text-xl font-bold tracking-tight text-white">
              SigalMedia
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {profile?.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName || "Avatar"}
                  className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-zinc-400" />
                </div>
              )}
              <span className="text-sm font-medium hidden sm:inline text-zinc-200">
                @{profile?.username}
              </span>
            </div>

            <button
              onClick={signOut}
              title="Çıkış Yap"
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Ana İçerik (Alt Gösterge / Home Bar Güvenli Alanı) */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 text-center shadow-xl">
          <div className="relative inline-block mb-4">
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName || "Avatar"}
                className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500/50 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700">
                <UserIcon className="w-8 h-8 text-zinc-400" />
              </div>
            )}
          </div>

          <h1 className="text-xl font-bold text-white mb-0.5">
            {profile?.displayName || "Kullanıcı"}
          </h1>
          <p className="text-sm text-emerald-400 font-medium mb-6">
            @{profile?.username}
          </p>

          <div className="grid grid-cols-3 gap-2 border-t border-zinc-800 pt-4 text-center">
            <div>
              <div className="text-base font-bold text-white">
                {profile?.stats?.postsCount ?? 0}
              </div>
              <div className="text-xs text-zinc-500">Gönderi</div>
            </div>
            <div>
              <div className="text-base font-bold text-white">
                {profile?.stats?.followersCount ?? 0}
              </div>
              <div className="text-xs text-zinc-500">Takipçi</div>
            </div>
            <div>
              <div className="text-base font-bold text-white">
                {profile?.stats?.followingCount ?? 0}
              </div>
              <div className="text-xs text-zinc-500">Takip</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
