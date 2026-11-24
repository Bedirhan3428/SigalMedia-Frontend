"use client";
import { useState } from "react";
import type { Post } from "@/lib/feed/types";
import { useFeedActions, type PostMenuItem } from "./FeedContext";
import { useFeedUser } from "./UserParts";
import { Sheet } from "./Sheet";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** "Gönderi ayarları": varsayılan öğeler + sayfanın eklediği öğeler (onay gerektirenler için küçük onay adımı). */
export function PostMenuSheet({ post, opener, onClose, onDone }: { post: Post; opener?: HTMLElement | null; onClose: () => void; onDone: () => void }) {
  const { postMenu, toast } = useFeedActions();
  const author = useFeedUser(post.authorId);
  const [pending, setPending] = useState<PostMenuItem | null>(null);

  const items: PostMenuItem[] = [
    {
      label: "Bağlantıyı kopyala",
      onSelect: () => {
        void copyText(`${window.location.origin}/p/${post.id}`).then((ok) => toast(ok ? "Bağlantı kopyalandı" : "Bağlantı kopyalanamadı"));
      },
    },
    ...(author.isMe ? [] : [{ label: "Şikayet et", danger: true, onSelect: () => toast("Yakında.") }]),
    ...(postMenu?.(post) ?? []),
  ];

  const run = (it: PostMenuItem) => {
    onDone();
    it.onSelect();
  };

  return (
    <Sheet titleId="fd-menu-t" title="Gönderi ayarları" onClose={onClose} opener={opener}>
      {pending ? (
        <div className="fd-mc" data-testid="fd-menu-confirm">
          <p>{pending.confirm}</p>
          <div className="fd-mcb">
            <button type="button" className="fd-mb" data-first onClick={() => setPending(null)}>Vazgeç</button>
            <button type="button" className={`fd-mb${pending.danger ? " fd-dng" : ""}`} data-testid="fd-menu-confirm-yes" onClick={() => run(pending)}>{pending.label}</button>
          </div>
        </div>
      ) : (
        <ul className="fd-ml" role="list">
          {items.map((it) => (
            <li key={it.label}>
              <button type="button" className={`fd-mi${it.danger ? " fd-dng" : ""}`} onClick={() => (it.confirm ? setPending(it) : run(it))}>{it.label}</button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
