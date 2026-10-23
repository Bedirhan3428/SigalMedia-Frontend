// [START] CREATED BY Bedirhan
"use client";

import { Music, Repeat, Scissors, Trash2, X } from "lucide-react";
import { StoryAudioMeta } from "@/lib/canvas-editor";

export interface MusicSettingsPanelProps {
  music: StoryAudioMeta;
  volume: number;
  onChangeVolume: (volume: number) => void;
  onChangeMusic: (music: StoryAudioMeta) => void;
  onReplace: () => void;
  onTrim: () => void;
  onRemove: () => void;
  onClose: () => void;
  // Fade değişikliğinden önce geri al geçmişine kayıt için
  onBeforeChange?: () => void;
}

const FADE_OPTIONS = [0, 1, 2, 3];

export default function MusicSettingsPanel({
  music,
  volume,
  onChangeVolume,
  onChangeMusic,
  onReplace,
  onTrim,
  onRemove,
  onClose,
  onBeforeChange,
}: MusicSettingsPanelProps) {
  const volumePct = Math.round(volume * 100);

  const setFade = (key: "fadeIn" | "fadeOut", value: number) => {
    if ((music[key] || 0) === value) return;
    onBeforeChange?.();
    onChangeMusic({ ...music, [key]: value });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Şarkı Bilgisi */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
          {music.thumbnail ? (
            <img
              src={music.thumbnail}
              alt={music.title}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <Music className="w-4 h-4 text-pink-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{music.title}</p>
          <p className="text-[11px] text-zinc-400 truncate">{music.artist}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-300 flex items-center justify-center shrink-0 active:scale-90 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Aksiyonlar */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onReplace}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1c1c1e] hover:bg-[#26262a] border border-white/5 text-xs font-semibold text-white active:scale-95 transition-all"
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Değiştir</span>
        </button>
        <button
          type="button"
          onClick={onTrim}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1c1c1e] hover:bg-[#26262a] border border-white/5 text-xs font-semibold text-white active:scale-95 transition-all"
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Kırp</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-xs font-semibold text-red-300 active:scale-95 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Kaldır</span>
        </button>
      </div>

      {/* Ses */}
      <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2">
        <span className="text-[11px] font-medium text-zinc-400 w-12 shrink-0">Ses</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volumePct}
          onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
          className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
        />
        <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
          {volumePct}%
        </span>
      </div>

      {/* Giriş / Çıkış Yumuşatma */}
      {(["fadeIn", "fadeOut"] as const).map((key) => (
        <div key={key} className="flex items-center gap-3 px-1">
          <span className="text-[11px] font-medium text-zinc-400 w-12 shrink-0">
            {key === "fadeIn" ? "Giriş" : "Çıkış"}
          </span>
          <div className="flex-1 grid grid-cols-4 gap-1.5">
            {FADE_OPTIONS.map((sec) => {
              const active = (music[key] || 0) === sec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setFade(key, sec)}
                  className={`py-1 rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${
                    active
                      ? "bg-white text-black border-white"
                      : "bg-[#1c1c1e] text-zinc-300 border-white/5 hover:bg-[#26262a]"
                  }`}
                >
                  {sec === 0 ? "Kapalı" : `${sec} sn`}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
// [END] CREATED BY Bedirhan
