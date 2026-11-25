import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED } from "@/lib/config/site";

export function LegalDoc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-zinc-300 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-emerald-400 [&_a]:underline [&_strong]:text-zinc-100 [&_table]:w-full [&_td]:align-top [&_td]:py-1.5 [&_td]:pr-3 [&_th]:text-left [&_th]:py-1.5 [&_th]:pr-3 [&_th]:text-zinc-100 [&_p]:break-words">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        <p className="text-xs text-zinc-500">Son güncelleme: {LEGAL_LAST_UPDATED}</p>
      </header>
      {children}
    </article>
  );
}
