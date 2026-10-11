"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function SharePage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
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
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-safe">
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
            Paylaş
          </h1>
        </div>
      </header>

      {/* İçerik Alanı (İçi boş temiz yer tutucu) */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col items-center justify-center text-center">
        <p className="text-sm text-zinc-500">Paylaşım ekranı yakında burada olacak.</p>
      </main>
    </div>
  );
}
