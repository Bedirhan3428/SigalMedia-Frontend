import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/config/site";

export const metadata: Metadata = { title: "Sayfa bulunamadı" };

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-100 px-6 text-center pt-safe pb-safe">
      <span className="fd-brand select-none">{SITE_NAME}</span>
      <p className="text-6xl font-bold tracking-tight text-zinc-700" aria-hidden="true">404</p>
      <h1 className="text-xl font-bold text-white">Sayfa bulunamadı</h1>
      <p className="text-sm text-zinc-400 max-w-xs">
        Aradığın sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.
      </p>
      <Link
        href="/"
        className="mt-2 h-12 px-6 rounded-2xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition-colors flex items-center justify-center btn-press"
      >
        Ana sayfaya dön
      </Link>
    </main>
  );
}
