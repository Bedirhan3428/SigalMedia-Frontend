// [START] CREATED BY Bedirhan
"use client";

import { ChevronLeft } from "lucide-react";
import { MdHistoryEdu } from "react-icons/md";
import { FaPhotoFilm } from "react-icons/fa6";
import { IoCamera } from "react-icons/io5";
import { ShareMode } from "@/lib/canvas-editor";

export interface ModeSelectorModalProps {
  isOpen: boolean;
  activeMode: ShareMode | null;
  onSelectMode: (mode: ShareMode) => void;
  onBack: () => void;
}

export default function ModeSelectorModal({
  isOpen,
  activeMode,
  onSelectMode,
  onBack,
}: ModeSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-2xl flex flex-col justify-between p-6 pt-safe pb-safe select-none animate-in fade-in duration-150">
      <div className="h-12 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white active:scale-90 transition-all flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold tracking-wide text-white">Oluştur</span>
        <div className="w-10" />
      </div>

      <div className="w-full max-w-sm mx-auto flex flex-col gap-3.5 my-auto">
        <button
          type="button"
          onClick={() => onSelectMode("story")}
          className={`w-full flex items-center gap-4 p-4 rounded-3xl border transition-all active:scale-[0.98] text-left group ${
            activeMode === "story"
              ? "bg-emerald-500/15 border-emerald-400/50 text-white"
              : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
          }`}
        >
          <div className="w-13 h-13 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <MdHistoryEdu className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-white">Hikaye</span>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
                9:16
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("reels")}
          className={`w-full flex items-center gap-4 p-4 rounded-3xl border transition-all active:scale-[0.98] text-left group ${
            activeMode === "reels"
              ? "bg-pink-500/15 border-pink-400/50 text-white"
              : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
          }`}
        >
          <div className="w-13 h-13 rounded-2xl bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <FaPhotoFilm className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-white">Reels</span>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
                Video / 5sn Klip
              </span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("post")}
          className={`w-full flex items-center gap-4 p-4 rounded-3xl border transition-all active:scale-[0.98] text-left group ${
            activeMode === "post"
              ? "bg-cyan-500/15 border-cyan-400/50 text-white"
              : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
          }`}
        >
          <div className="w-13 h-13 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <IoCamera className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-white">Gönderi</span>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
                4:3 Stüdyo
              </span>
            </div>
          </div>
        </button>
      </div>

      <div className="h-6" />
    </div>
  );
}
// [END] CREATED BY Bedirhan
