import type { ReactNode } from "react";
import Link from "next/link";
import LegalBackButton from "@/components/legal/LegalBackButton";

const LINKS = [
  { href: "/legal/kullanim-sartlari", label: "Kullanım Şartları" },
  { href: "/legal/gizlilik", label: "Gizlilik ve KVKK" },
  { href: "/legal/topluluk-kurallari", label: "Topluluk Kuralları" },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <LegalBackButton />
          <span className="text-lg font-bold tracking-tight text-white">Shovrum</span>
        </div>
      </header>
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        {children}
        <nav aria-label="Diğer yasal metinler" className="mt-10 pt-6 border-t border-zinc-900 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-zinc-400 underline underline-offset-2 hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
