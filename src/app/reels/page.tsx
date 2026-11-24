"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import BottomNav from "@/components/BottomNav";
import { FeedProvider } from "@/components/feed";
import { ReelsFeed } from "@/components/feed/ReelsFeed";

export default function ReelsPage() {
  const [mounted, setMounted] = useState(false);
  const { loading } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-zinc-100 overflow-hidden">
      <FeedProvider testId="fd-reels-root">
        <ReelsFeed />
      </FeedProvider>

      {/* Üst Bar: akışın üstünde yarı saydam */}
      <header className="fixed top-0 left-0 right-0 z-40 pt-safe pointer-events-none bg-gradient-to-b from-black/60 to-transparent">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center">
          <h1 className="text-lg font-bold tracking-tight text-white drop-shadow">Reels</h1>
        </div>
      </header>

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
