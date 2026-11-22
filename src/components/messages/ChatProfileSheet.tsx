"use client";

import { useEffect, useRef } from "react";
import { User as UserIcon, X } from "lucide-react";

// Karşı tarafın büyük profil fotoğrafı + görünen adı + "Özelleştir" / "Profil" düğmeleri.
export function ChatProfileSheet({
  displayName,
  photoURL,
  onCustomize,
  onProfile,
  onClose,
}: {
  displayName: string;
  photoURL: string;
  onCustomize: () => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab" && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" data-testid="chat-profile-root">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-profile-name"
        tabIndex={-1}
        data-testid="chat-profile-sheet"
        className="relative w-full max-w-sm bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-t-[22px] sm:rounded-[22px] px-5 pt-3 pb-6 outline-none flex flex-col items-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute top-2 right-2 w-11 h-11 grid place-items-center rounded-xl text-zinc-300 hover:bg-zinc-800"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <div className="w-10 h-1 rounded-full bg-zinc-700 mb-4 sm:hidden" aria-hidden="true" />
        <div
          data-testid="chat-profile-photo"
          className="w-[min(60vw,240px)] aspect-square rounded-full overflow-hidden bg-zinc-800 grid place-items-center mt-2"
        >
          {photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-1/3 h-1/3 text-zinc-400" strokeWidth={1.25} />
          )}
        </div>
        <h2 id="chat-profile-name" data-testid="chat-profile-name" className="mt-4 text-xl font-semibold text-center break-words max-w-full">
          {displayName}
        </h2>
        <div className="mt-4 w-full grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="chat-profile-customize"
            onClick={onCustomize}
            className="min-h-12 rounded-xl border border-zinc-700 bg-zinc-900 font-medium hover:bg-zinc-800"
          >
            Özelleştir
          </button>
          <button
            type="button"
            data-testid="chat-profile-open"
            onClick={onProfile}
            className="min-h-12 rounded-xl bg-[#38D5C8] text-[#04201E] font-semibold"
          >
            Profil
          </button>
        </div>
      </div>
    </div>
  );
}
