"use client";

import { useEffect } from "react";
import { BarChart3, X } from "lucide-react";
import { feedService } from "@/lib/feed/feedService";
import type { Post } from "@/lib/feed/types";
import { Art } from "@/components/feed/Art";

const AC = "#a99bff";
const box = "fixed left-4 right-[68px] top-[68px] z-40 h-11 pointer-events-auto rounded-2xl bg-black/65 backdrop-blur-md border border-white/10 flex items-center gap-2 pl-2 pr-1 text-white";

/**
 * WP-27: editörde "zincire yanıt" bandı. Akıştaki bağlayıcı ile aynı ince kıvrık ok + üst gönderi küçük görseli,
 * "@kullanıcı'a yanıt", anketle yanıtlama kısayolu ve yanıt modunu iptal eden "×".
 */
export function ReplyBanner({ parent, onCancel, onPoll, disabled }: { parent: Post; onCancel: () => void; onPoll: () => void; disabled?: boolean }) {
  const u = feedService.getUser(parent.authorId);
  return (
    <div className={box} data-testid="reply-banner" role="group" aria-label="Yanıt modu">
      <svg viewBox="0 0 22 30" width="14" height="20" aria-hidden="true" style={{ flex: "none", fill: "none", stroke: AC, strokeWidth: 1.6, strokeLinecap: "round" }}>
        <path d="M2 0 V12 Q2 22 12 22 H18" />
        <path d="M13 17 L19 22 L13 27" />
      </svg>
      <span className="relative w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center" data-testid="reply-banner-thumb">
        {parent.type === "poll" ? (
          <BarChart3 className="w-4 h-4" style={{ color: AC }} />
        ) : (parent.type === "video" ? parent.posterUrl : parent.mediaUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(parent.type === "video" ? parent.posterUrl : parent.mediaUrl) as string} alt="" className="w-full h-full object-cover" />
        ) : (
          <Art k={parent.art} />
        )}
      </span>
      <span className="flex-1 min-w-0 truncate text-xs font-semibold">
        <span style={{ color: AC }}>↳</span> @{u.username}&apos;a yanıt
      </span>
      <button
        type="button"
        onClick={onPoll}
        disabled={disabled}
        data-testid="reply-banner-poll"
        className="h-8 px-2 rounded-full text-[11px] font-bold shrink-0 border border-white/15 hover:bg-white/10 active:scale-95 disabled:opacity-50"
        style={{ color: AC }}
      >
        Anketle yanıtla
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        aria-label="Yanıt modunu iptal et"
        data-testid="reply-banner-cancel"
        className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 disabled:opacity-50"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Üst gönderi bulunamadıysa kısa bilgi; birkaç saniye sonra kendiliğinden kapanır. */
export function ReplyMissingNotice({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`${box} pr-3`} role="status" data-testid="reply-missing">
      <span className="text-xs font-medium">Yanıt verilecek gönderi bulunamadı. Normal gönderi olarak devam ediyorsun.</span>
    </div>
  );
}
