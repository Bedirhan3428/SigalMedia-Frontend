// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
// [MODIFIED BY Umut]
"use client";

import { Film, Loader2 } from "lucide-react";
import { EditorPortal } from "./common/EditorPortal";
import { EDITOR_Z } from "./common/layers";
import { useBackLayer } from "./common/hooks/useEditorBackStack";
import { useBodyScrollLock } from "./common/hooks/useBodyScrollLock";

export interface ExportProgressProps {
  /** Shows the blocking overlay. */
  isOpen: boolean;
  /** 0..1 */
  progress: number;
  /** Number of clips (shows "Klip n / m" when > 1). */
  clipCount?: number;
  /** "İptal" button, Back gesture and Escape. */
  onCancel: () => void;
  /** Phase label (default "Video hazırlanıyor"), e.g. "Ses hazırlanıyor". */
  label?: string;
  /** Cancellation in progress (pipeline still stopping): disables the button, shows a spinner. */
  cancelling?: boolean;
}

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Blocking export progress at `--z-blocking`. Always cancellable (button, Back gesture,
 * Escape); the caller resolves cancellation and closes it.
 */
export default function ExportProgress({
  isOpen,
  progress,
  clipCount = 1,
  onCancel,
  label = "Video hazırlanıyor",
  cancelling = false,
}: ExportProgressProps) {
  useBodyScrollLock(isOpen);
  useBackLayer(isOpen, () => {
    if (!cancelling) onCancel();
  });

  if (!isOpen) return null;

  const clampedProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const pct = Math.round(clampedProgress * 100);
  const activeClipIdx = Math.min(clipCount, Math.max(1, Math.ceil(clampedProgress * clipCount)));

  return (
    <EditorPortal>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={label}
        aria-busy="true"
        className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 px-safe select-none editor-anim-fade-in"
        style={{ zIndex: EDITOR_Z.blocking, touchAction: "none" }}
      >
        <div className="w-full max-w-[300px] rounded-3xl bg-neutral-900/95 border border-white/10 p-6 flex flex-col items-center gap-4 shadow-2xl editor-anim-pop-in">
          <div
            className="relative w-20 h-20 flex items-center justify-center"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <svg viewBox="0 0 72 72" className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="36" cy="36" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
              <circle
                cx="36"
                cy="36"
                r={RING_R}
                fill="none"
                stroke="url(#export-ring)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - clampedProgress)}
                style={{ transition: "stroke-dashoffset 120ms linear" }}
              />
              <defs>
                <linearGradient id="export-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f472b6" />
                  <stop offset="100%" stopColor="#fb7185" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-sm font-bold text-white tabular-nums">{pct}%</span>
          </div>

          <p className="text-sm font-semibold text-white">{cancelling ? "İptal ediliyor…" : label}</p>

          {clipCount > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-zinc-300 tabular-nums">
              <Film className="w-3.5 h-3.5 text-pink-400" />
              <span>
                Klip {activeClipIdx} / {clipCount}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="w-full min-h-12 rounded-2xl bg-white/10 active:bg-white/15 active:scale-[0.97] transition-transform text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}
            İptal
          </button>
        </div>
      </div>
    </EditorPortal>
  );
}
// [END] CREATED BY Bedirhan
