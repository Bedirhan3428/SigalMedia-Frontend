// [START] CREATED BY Bedirhan
"use client";

import type { CSSProperties } from "react";
import { Music, Repeat, Scissors, Trash2, X } from "lucide-react";
import type { StoryAudioMeta } from "@/lib/canvas-editor/types";

export interface MusicSettingsPanelProps {
  /** Selected song. */
  music: StoryAudioMeta;
  /** Music volume 0..1. */
  volume: number;
  onChangeVolume: (volume: number) => void;
  /** Original video audio volume 0..1 (0 = muted). Omit when there is no video audio to control. */
  videoVolume?: number;
  onChangeVideoVolume?: (volume: number) => void;
  /** Fade in/out changes (returns the updated meta). */
  onChangeMusic: (music: StoryAudioMeta) => void;
  /** "Değiştir": open the picker to choose another song. */
  onReplace: () => void;
  /** "Kırp": open the picker's trimmer for the current song. */
  onTrim: () => void;
  /** "Kaldır": remove the music (the caller also removes any music sticker). */
  onRemove: () => void;
  /** X button. Back gesture / backdrop are handled by the hosting `Sheet`. */
  onClose: () => void;
  // Fade değişikliğinden önce geri al geçmişine kayıt için
  onBeforeChange?: () => void;
  /** Hide the X button when the host (e.g. a `Sheet`) already shows one. Default false. */
  hideCloseButton?: boolean;
}

const FADE_OPTIONS = [0, 1, 2, 3];

/**
 * Song settings content (no own container): replace / trim / remove, volume, fade in/out.
 * Host it in a `Sheet` (or a bottom strip); all targets are ≥ 44 px.
 */
export default function MusicSettingsPanel({
  music,
  volume,
  onChangeVolume,
  videoVolume,
  onChangeVideoVolume,
  onChangeMusic,
  onReplace,
  onTrim,
  onRemove,
  onClose,
  onBeforeChange,
  hideCloseButton = false,
}: MusicSettingsPanelProps) {
  const volumePct = Math.round(Math.max(0, Math.min(1, volume)) * 100);
  const videoPct = Math.round(Math.max(0, Math.min(1, videoVolume ?? 1)) * 100);

  const setFade = (key: "fadeIn" | "fadeOut", value: number) => {
    if ((music[key] || 0) === value) return;
    onBeforeChange?.();
    onChangeMusic({ ...music, [key]: value });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Şarkı Bilgisi */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[var(--ed-bg3,#232932)] overflow-hidden shrink-0 flex items-center justify-center">
          {music.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={music.thumbnail}
              alt=""
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
              draggable={false}
            />
          ) : (
            <Music className="w-4 h-4 text-[var(--ed-ac,#38d5c8)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{music.title}</p>
          <p className="text-xs text-[var(--ed-tx2,#98a2b3)] truncate">{music.artist}</p>
        </div>
        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-11 h-11 -mr-1.5 rounded-full text-[var(--ed-tx,#e8ecf1)] flex items-center justify-center shrink-0 active:scale-90 active:bg-white/10 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Aksiyonlar */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onReplace}
          className="min-h-11 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--ed-bg2,#1a1e25)] active:bg-[var(--ed-bg3,#232932)] border border-[var(--ed-line,#2a303a)] text-xs font-semibold text-white active:scale-95 transition-transform"
        >
          <Repeat className="w-4 h-4" />
          <span>Değiştir</span>
        </button>
        <button
          type="button"
          onClick={onTrim}
          className="min-h-11 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--ed-bg2,#1a1e25)] active:bg-[var(--ed-bg3,#232932)] border border-[var(--ed-line,#2a303a)] text-xs font-semibold text-white active:scale-95 transition-transform"
        >
          <Scissors className="w-4 h-4" />
          <span>Kırp</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="min-h-11 flex items-center justify-center gap-1.5 rounded-xl bg-red-500/15 active:bg-red-500/25 border border-red-500/25 text-xs font-semibold text-red-300 active:scale-95 transition-transform"
        >
          <Trash2 className="w-4 h-4" />
          <span>Kaldır</span>
        </button>
      </div>

      {/* Orijinal video sesi */}
      {onChangeVideoVolume && (
        <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 min-h-12">
          <span className="text-xs font-medium text-[var(--ed-tx2,#98a2b3)] w-12 shrink-0">Video</span>
          <input
            type="range"
            min={0}
            max={100}
            value={videoPct}
            onChange={(e) => onChangeVideoVolume(Number(e.target.value) / 100)}
            aria-label="Orijinal video sesi"
            className="editor-range flex-1 min-w-0"
            style={{ "--range-pct": `${videoPct}%` } as CSSProperties}
          />
          <span className="text-xs font-semibold text-white w-10 text-right tabular-nums">
            {videoPct}%
          </span>
        </div>
      )}

      {/* Müzik sesi */}
      <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 min-h-12">
        <span className="text-xs font-medium text-[var(--ed-tx2,#98a2b3)] w-12 shrink-0">Müzik</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volumePct}
          onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
          aria-label="Müzik sesi"
          className="editor-range flex-1 min-w-0"
          style={{ "--range-pct": `${volumePct}%` } as CSSProperties}
        />
        <span className="text-xs font-semibold text-white w-10 text-right tabular-nums">
          {volumePct}%
        </span>
      </div>

      {/* Giriş / Çıkış Yumuşatma */}
      {(["fadeIn", "fadeOut"] as const).map((key) => (
        <div key={key} className="flex items-center gap-3 px-1">
          <span className="text-xs font-medium text-[var(--ed-tx2,#98a2b3)] w-12 shrink-0">
            {key === "fadeIn" ? "Giriş" : "Çıkış"}
          </span>
          <div className="flex-1 grid grid-cols-4 gap-1.5" role="group" aria-label={key === "fadeIn" ? "Giriş yumuşatma" : "Çıkış yumuşatma"}>
            {FADE_OPTIONS.map((sec) => {
              const active = (music[key] || 0) === sec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setFade(key, sec)}
                  aria-pressed={active}
                  className={`min-h-11 rounded-xl text-xs font-bold border transition-transform active:scale-95 ${
                    active
                      ? "bg-white text-black border-white"
                      : "bg-[var(--ed-bg2,#1a1e25)] text-[var(--ed-tx,#e8ecf1)] border-[var(--ed-line,#2a303a)] active:bg-[var(--ed-bg3,#232932)]"
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
