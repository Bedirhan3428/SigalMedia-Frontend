"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import BottomNav from "@/components/BottomNav";

export default function ReelsPage() {
  const [mounted, setMounted] = useState(false);
  const { loading } = useAuth();

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
      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-white">
            Reels
          </span>
        </div>
      </header>

      {/* Ana İçerik */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col items-center justify-center text-center">
        <h1 className="text-xl font-bold text-white mb-1">Reels</h1>
        <p className="text-sm text-zinc-500">Kısa videolar yakında burada olacak.</p>
      </main>

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
