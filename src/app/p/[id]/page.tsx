"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { feedService } from "@/lib/feed/feedService";

/**
 * Evrensel paylaşım bağlantısı: /p/<id> (sohbet kartları, kopyalanan ve eski bağlantılar). Tek gönderi sayfası değildir; çözümleyicidir:
 * Reels türü /reels?id=<id> (o reel ilk, akış devam eder), diğerleri /?p=<id> (ana akışta en üstte sabit, akış devam eder).
 * Bulunamayan gönderiyi ana akış uyarıyla karşılar. replace kullanılır: geri düğmesi bağlantının geldiği yere (örn. sohbet) döner.
 */
export default function PostLinkResolver() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  useEffect(() => {
    if (!id) return;
    let off = false;
    void feedService.getPost(id).then((p) => {
      if (off) return;
      if (p?.kind === "reels") router.replace(`/reels?id=${encodeURIComponent(id)}`);
      else router.replace(`/?p=${encodeURIComponent(id)}`);
    });
    return () => { off = true; };
  }, [id, router]);
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-zinc-950 text-zinc-300 pt-safe pb-safe" role="status" aria-live="polite">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <p className="text-sm">Gönderi açılıyor…</p>
    </div>
  );
}
