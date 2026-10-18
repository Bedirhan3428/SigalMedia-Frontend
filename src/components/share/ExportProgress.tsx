// [START] CREATED BY Bedirhan
"use client";

import { Loader2 } from "lucide-react";

export interface ExportProgressProps {
  isOpen: boolean;
  progress: number;
  onCancel: () => void;
}

export default function ExportProgress({
  isOpen,
  progress,
  onCancel,
}: ExportProgressProps) {
  if (!isOpen) return null;

  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150 pointer-events-auto select-none">
      <div className="w-full max-w-xs rounded-3xl bg-neutral-900/95 border border-white/10 p-6 flex flex-col items-center gap-4 shadow-2xl">
        <div className="relative w-16 h-16 flex items-center justify-center">
          <Loader2 className="w-16 h-16 text-emerald-400 animate-spin" />
          <span className="absolute text-xs font-bold text-white tabular-nums">
            {pct}%
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all duration-150"
            style={{ width: `${pct}%` }}
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
