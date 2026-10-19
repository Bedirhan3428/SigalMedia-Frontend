// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
// [MODIFIED BY Umut]
"use client";

import { Loader2, Film } from "lucide-react";

export interface ExportProgressProps {
  isOpen: boolean;
  progress: number;
  clipCount?: number;
  onCancel: () => void;
}

export default function ExportProgress({
  isOpen,
  progress,
  clipCount = 1,
  onCancel,
}: ExportProgressProps) {
  if (!isOpen) return null;

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const pct = Math.max(0, Math.min(100, Math.round(clampedProgress * 100)));
  const activeClipIdx = Math.min(
    clipCount,
    Math.max(1, Math.ceil((pct / 100) * clipCount))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-100 pointer-events-auto select-none">
      <div className="w-full max-w-xs rounded-3xl bg-neutral-900/95 border border-white/10 p-6 flex flex-col items-center gap-4 shadow-2xl">
        <div className="relative w-16 h-16 flex items-center justify-center">
          <Loader2 className="w-16 h-16 text-emerald-400 animate-spin" />
          <span className="absolute text-xs font-bold text-white tabular-nums">
            {pct}%
          </span>
        </div>

        {clipCount > 1 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-zinc-300 tabular-nums">
            <Film className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Klip {activeClipIdx} / {clipCount}
            </span>
          </div>
        )}

        {/* [MODIFIED BY Umut] */}
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="w-full h-full bg-emerald-400 origin-left transition-transform duration-75 ease-out will-change-transform"
            style={{ transform: `scaleX(${clampedProgress})` }}
          />
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-white text-xs font-semibold"
        >
          İptal
        </button>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
