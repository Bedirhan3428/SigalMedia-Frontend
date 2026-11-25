"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Plus, User as UserIcon } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import FeedList from "@/components/feed/FeedList";
import { useDocumentTitle } from "@/lib/ui/useDocumentTitle";

export default function HomePage() {
  useDocumentTitle("Ana sayfa");
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

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Üst Bar: Sol (+) | Orta (Shovrum - logosuz yazı) | Sağ (Alev Bildirim İkonu) */}
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

          {/* Orta: Shovrum yazısı (logo yok) */}
          <span className="fd-brand select-none">Shovrum</span>

          {/* Sağ: bildirimler gelene kadar boş (Shovrum yazısı ortada kalsın diye sol butonla aynı genişlik) */}
          <div className="w-10 -mr-2" aria-hidden="true" />
        </div>
      </header>

      {/* Hikayeler Çubuğu */}
      <section className="border-b border-zinc-900 bg-zinc-950/60 overflow-hidden">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden select-none">
          {/* En başta sabit: Kendi Profili ve Yanında Küçük Artı Butonu */}
          <Link
            href="/share?mode=story"
            aria-label="Hikaye ekle"
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
          </Link>
        </div>
      </section>

      {/* Ana İçerik / Akış Alanı */}
      <main className="flex-1 max-w-md w-full mx-auto min-w-0">
        <Suspense fallback={null}>
          <FeedList />
        </Suspense>
      </main>

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
