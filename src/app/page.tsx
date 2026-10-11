"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Plus, Flame, User as UserIcon } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const { profile, loading } = useAuth();

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

  // Örnek diğer hikaye kullanıcıları
  const sampleStories = [
    { id: 1, username: "ahmet.y", hasUnseen: true },
    { id: 2, username: "selin_k", hasUnseen: true },
    { id: 3, username: "can.dev", hasUnseen: true },
    { id: 4, username: "zeynep.m", hasUnseen: false },
    { id: 5, username: "mert_oz", hasUnseen: false },
  ];

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Üst Bar: Sol (+) | Orta (SigalMedia - logosuz yazı) | Sağ (Alev Bildirim İkonu) */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          {/* Sol: Gönderi Ekleme Butonu (+) -> /share sayfasına yönlendirir */}
          <Link
            href="/share"
            title="Gönderi Paylaş"
            aria-label="Gönderi Paylaş"
            className="p-2 -ml-2 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <Plus className="w-6 h-6" />
          </Link>

          {/* Orta: Sadece SigalMedia Yazısı (Logo yok) */}
          <span className="text-xl font-bold tracking-tight text-white select-none">
            SigalMedia
          </span>

          {/* Sağ: Bildirimler (Alev İkonu) */}
          <button
            type="button"
            title="Bildirimler"
            aria-label="Bildirimler"
            className="p-2 -mr-2 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <Flame className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Hikayeler Çubuğu */}
      <section className="border-b border-zinc-900 bg-zinc-950/60 overflow-hidden">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden select-none">
          {/* En başta sabit: Kendi Profili ve Yanında Küçük Artı Butonu */}
          <button
            type="button"
            className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none"
          >
            <div className="relative">
              {/* Profil Resmi */}
              <div className="w-16 h-16 rounded-full bg-zinc-900 border-2 border-zinc-800 p-0.5 flex items-center justify-center overflow-hidden">
                {profile?.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName || "Sen"}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <UserIcon className="w-7 h-7 text-zinc-500" />
                )}
              </div>

              {/* Sağ altta küçük yuvarlak artı rozeti */}
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white text-zinc-950 flex items-center justify-center shadow-md ring-2 ring-zinc-950 group-hover:scale-110 transition-transform">
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </div>

            <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[64px]">
              Hikayen
            </span>
          </button>

          {/* Diğer Yuvarlak Hikayeler */}
          {sampleStories.map((story) => (
            <button
              key={story.id}
              type="button"
              className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none"
            >
              {/* Hikaye Çerçevesi (Görülmemişse renkli gradyan halka, görülmüşse sade gri) */}
              <div
                className={`w-16 h-16 rounded-full p-[2px] transition-transform group-hover:scale-105 ${
                  story.hasUnseen
                    ? "bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400"
                    : "bg-zinc-800"
                }`}
              >
                <div className="w-full h-full rounded-full bg-zinc-950 p-0.5 flex items-center justify-center">
                  <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400">
                    <UserIcon className="w-6 h-6 text-zinc-600" />
                  </div>
                </div>
              </div>

              <span className="text-[11px] text-zinc-400 font-normal truncate max-w-[64px]">
                {story.username}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Ana İçerik / Akış Alanı */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col items-center justify-center text-center">
        <p className="text-sm text-zinc-500">Akış yakında burada olacak.</p>
      </main>

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
