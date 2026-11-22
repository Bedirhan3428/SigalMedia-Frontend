"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { REACTION_EMOJIS } from "@/lib/chat/chatThemes";
import { formatFullTime, placeMenu } from "@/lib/chat/menuPlacement";

export { formatFullTime, placeMenu };

// Uzun basma menüsü: arka plan bulanır ve kararır; yalnızca basılan mesajın kopyası (yerinde) ve menü net kalır.
export function ChatMessageMenu({
  rect,
  mine,
  timestamp,
  myReaction,
  canReact,
  bubble,
  onReact,
  onCopy,
  onClose,
}: {
  rect: { left: number; top: number; width: number; height: number };
  mine: boolean;
  timestamp?: number;
  myReaction?: string;
  canReact: boolean;
  bubble: ReactNode;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openedAt = useRef(0);
  const [pos, setPos] = useState<{ left: number; top: number; side: "above" | "below" } | null>(null);

  useLayoutEffect(() => {
    openedAt.current = performance.now();
    const m = menuRef.current;
    if (!m) return;
    setPos(
      placeMenu(
        { left: rect.left, right: rect.left + rect.width, top: rect.top, bottom: rect.top + rect.height },
        { w: m.offsetWidth, h: m.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
        mine
      )
    );
  }, [rect, mine]);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // Basılı tutma bırakıldığında doğan sahte tıklama menüyü hemen kapatmasın
  const backdropClose = () => {
    if (performance.now() - openedAt.current < 350) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 select-none" data-testid="msg-menu-root">
      <div
        className="msg-menu-backdrop absolute inset-0 bg-black/45 backdrop-blur-md"
        onClick={backdropClose}
        onContextMenu={(e) => {
          e.preventDefault();
          backdropClose();
        }}
        aria-hidden="true"
        data-testid="msg-menu-backdrop"
      />
      <div
        data-testid="msg-menu-clone"
        className="absolute pointer-events-none"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      >
        {bubble}
      </div>
      <div
        ref={menuRef}
        role="menu"
        aria-label="Mesaj işlemleri"
        data-testid="msg-menu"
        data-side={pos?.side ?? ""}
        className="msg-menu-pop absolute w-[272px] max-w-[calc(100vw-20px)] rounded-2xl border shadow-[0_12px_40px_rgba(0,0,0,.45)] overflow-hidden"
        style={{
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          visibility: pos ? "visible" : "hidden",
          background: "var(--panel)",
          color: "var(--panel-t)",
          borderColor: "var(--panel-line)",
          transformOrigin: pos?.side === "above" ? (mine ? "bottom right" : "bottom left") : mine ? "top right" : "top left",
        }}
      >
        <div data-testid="msg-menu-time" className="px-4 pt-3 pb-1 text-[12.5px] text-[var(--sub)]">
          {formatFullTime(timestamp)}
        </div>
        <div className="flex items-center justify-between px-2 pb-1" role="group" aria-label="Tepki">
          {REACTION_EMOJIS.map((emo) => (
            <button
              key={emo}
              type="button"
              role="menuitemradio"
              aria-checked={myReaction === emo}
              aria-label={`Tepki ${emo}`}
              data-emoji={emo}
              disabled={!canReact}
              onClick={() => onReact(emo)}
              className={`w-11 h-11 rounded-full text-[24px] leading-none grid place-items-center transition-transform active:scale-90 disabled:opacity-40 ${
                myReaction === emo ? "bg-[var(--panel-line)] ring-2 ring-[var(--acc)]" : "hover:bg-[var(--panel-line)]"
              }`}
            >
              {emo}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="menuitem"
          data-testid="msg-menu-copy"
          onClick={onCopy}
          className="w-full min-h-12 px-4 flex items-center gap-3 text-[15px] border-t hover:bg-[var(--panel-line)]"
          style={{ borderColor: "var(--panel-line)" }}
        >
          <Copy className="w-[18px] h-[18px]" strokeWidth={1.5} />
          Kopyala
        </button>
      </div>
    </div>
  );
}
