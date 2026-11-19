"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { EditorPortal } from "./EditorPortal";
import { EDITOR_Z } from "./layers";
import { useBackLayer } from "./hooks/useEditorBackStack";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { useVisualViewport, useVisualViewportFrameStyle } from "./hooks/useVisualViewport";

/** Maximum caption length (Instagram parity). */
export const CAPTION_MAX_LENGTH = 2200;

/** Props of {@link PublishScreen}. */
export interface PublishScreenProps {
  /** Shows the screen. */
  open: boolean;
  /** Header title (default "Yeni gönderi"; e.g. "Yeni Reels"). */
  title?: string;
  /**
   * Preview slot (an `<img>`, `<video>` or `<canvas>` that fills its box with `object-cover`).
   * Rendered in a rounded box at most ~42% of the viewport tall.
   */
  preview: ReactNode;
  /** Width / height of the preview box (e.g. `4 / 5`, `9 / 16`). Omit to let `preview` size itself. */
  previewAspect?: number;
  /** Optional slot under the preview, e.g. the Reels cover-frame scrub strip. */
  coverPicker?: ReactNode;
  /** Label above `coverPicker` (default "Kapak"). */
  coverPickerLabel?: string;
  /** Controlled caption. Omit (with `onCaptionChange`) to let the screen keep it internally. */
  caption?: string;
  /** Caption change (already clamped to {@link CAPTION_MAX_LENGTH}). */
  onCaptionChange?: (caption: string) => void;
  /** Initial caption for uncontrolled use. */
  defaultCaption?: string;
  /**
   * Share button. Receives the trimmed caption. Called at most once per tap burst: further taps
   * are ignored while the returned promise is pending, or for 1 s for sync handlers, and always
   * while `busy`. Errors should be surfaced with a toast by the caller.
   */
  onShare: (caption: string) => void | Promise<unknown>;
  /** Back chevron and Back gesture. Disabled while busy. */
  onBack: () => void;
  /** Upload/export in progress: button shows a spinner, inputs and back are disabled. */
  busy?: boolean;
  /** Optional 0..1 progress shown in the button while busy. */
  busyProgress?: number;
  /** Share button label (default "Paylaş"). */
  shareLabel?: string;
  /** Busy label (default "Paylaşılıyor…"). */
  busyLabel?: string;
  /** Caption placeholder (default "Açıklama ekle…"). */
  captionPlaceholder?: string;
}

/**
 * Final step for Post and Reels: preview, optional cover picker, caption (≤ 2200 with counter)
 * and the Share button. Full-screen at `--z-modal`, keyboard aware, safe-area padded.
 */
export function PublishScreen(props: PublishScreenProps) {
  if (!props.open) return null;
  return <PublishPanel {...props} />;
}

function PublishPanel({
  title = "Yeni gönderi",
  preview,
  previewAspect,
  coverPicker,
  coverPickerLabel = "Kapak",
  caption: controlledCaption,
  onCaptionChange,
  defaultCaption = "",
  onShare,
  onBack,
  busy = false,
  busyProgress,
  shareLabel = "Paylaş",
  busyLabel = "Paylaşılıyor…",
  captionPlaceholder = "Açıklama ekle…",
}: PublishScreenProps) {
  const [innerCaption, setInnerCaption] = useState(defaultCaption.slice(0, CAPTION_MAX_LENGTH));
  const caption = controlledCaption ?? innerCaption;
  const [locked, setLocked] = useState(false);
  const lockRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const vv = useVisualViewport();
  const frameStyle = useVisualViewportFrameStyle();
  useBodyScrollLock(true);
  useBackLayer(true, () => {
    if (!busy && !lockRef.current) onBack();
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    };
  }, []);

  const setCaption = (next: string) => {
    const clamped = next.slice(0, CAPTION_MAX_LENGTH);
    if (controlledCaption === undefined) setInnerCaption(clamped);
    onCaptionChange?.(clamped);
  };

  const unlock = () => {
    lockRef.current = false;
    if (mountedRef.current) setLocked(false);
  };

  const handleShare = () => {
    if (busy || lockRef.current) return;
    lockRef.current = true;
    setLocked(true);
    let result: void | Promise<unknown>;
    try {
      result = onShare(caption.trim());
    } catch (err) {
      unlock();
      throw err;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(unlock, unlock);
    } else {
      unlockTimerRef.current = setTimeout(unlock, 1000);
    }
  };

  const disabled = busy || locked;
  const count = caption.length;
  const nearLimit = count >= CAPTION_MAX_LENGTH - 100;
  const progress =
    busy && typeof busyProgress === "number" ? Math.max(0, Math.min(1, busyProgress)) : null;

  const previewBox: CSSProperties | undefined = previewAspect
    ? { aspectRatio: String(previewAspect), height: "min(42dvh, 460px)", maxWidth: "100%" }
    : undefined;

  return (
    <EditorPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 flex flex-col bg-neutral-950 text-white px-safe editor-anim-push-in"
        style={{ zIndex: EDITOR_Z.modal, ...frameStyle }}
      >
        {/* Başlık */}
        <div className="shrink-0 pt-safe border-b border-white/5">
          <div className="h-14 px-2 flex items-center">
            <button
              type="button"
              onClick={onBack}
              disabled={disabled}
              aria-label="Geri"
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 active:bg-white/10 transition-transform disabled:opacity-40"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="flex-1 text-center text-[15px] font-semibold truncate">{title}</h2>
            <div className="w-11" />
          </div>
        </div>

        {/* İçerik */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar">
          <div className="px-4 pt-4 pb-4 flex flex-col gap-4 max-w-lg mx-auto">
            <div
              className="mx-auto rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl"
              style={previewBox}
            >
              {preview}
            </div>

            {coverPicker && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-zinc-300">{coverPickerLabel}</span>
                {coverPicker}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={CAPTION_MAX_LENGTH}
                placeholder={captionPlaceholder}
                disabled={busy}
                rows={4}
                aria-label="Açıklama"
                className="w-full min-h-28 resize-none rounded-2xl bg-white/5 border border-white/10 p-4 text-[15px] leading-relaxed text-white placeholder:text-zinc-500 outline-none focus:border-white/25 select-text disabled:opacity-60"
              />
              <span
                aria-live="polite"
                className={`self-end text-[11px] tabular-nums ${
                  nearLimit ? "text-rose-400 font-semibold" : "text-zinc-500"
                }`}
              >
                {count}/{CAPTION_MAX_LENGTH}
              </span>
            </div>
          </div>
        </div>

        {/* Paylaş */}
        <div
          className="shrink-0 px-4 pt-3 border-t border-white/5 bg-neutral-950"
          style={{ paddingBottom: vv?.keyboardOpen ? 10 : "calc(var(--sab) + 12px)" }}
        >
          <button
            type="button"
            onClick={handleShare}
            disabled={disabled}
            aria-busy={busy}
            className="relative w-full max-w-lg mx-auto h-12 rounded-full bg-white text-black font-bold text-[15px] flex items-center justify-center gap-2 overflow-hidden active:scale-[0.98] transition-transform disabled:active:scale-100"
          >
            {progress !== null && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-black/10 origin-left transition-transform duration-150"
                style={{ width: "100%", transform: `scaleX(${progress})` }}
              />
            )}
            {busy ? (
              <>
                <Loader2 className="relative w-5 h-5 animate-spin" />
                <span className="relative">
                  {busyLabel}
                  {progress !== null ? ` ${Math.round(progress * 100)}%` : ""}
                </span>
              </>
            ) : (
              <span className="relative">{shareLabel}</span>
            )}
          </button>
        </div>
      </div>
    </EditorPortal>
  );
}
