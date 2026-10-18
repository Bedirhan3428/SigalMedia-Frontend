// [START] CREATED BY Bedirhan
"use client";

import { useState } from "react";
import {
  Scissors,
  CaseSensitive,
  Sparkles,
  Music,
  Gauge,
  Palette,
  Volume2,
  VolumeX,
  CircleChevronRight,
  Loader2,
} from "lucide-react";
import {
  FILTER_PRESETS,
  REELS_EFFECT_PRESETS,
  ReelsEffectId,
  StoryAudioMeta,
  VideoState,
} from "@/lib/canvas-editor";
import VideoTimeline from "./VideoTimeline";

export interface ReelsEditorProps {
  videoState: VideoState;
  thumbnails: string[];
  selectedMusic: StoryAudioMeta | null;
  musicVolume: number;
  activeFilterIndex: number;
  activeReelsEffect: ReelsEffectId;
  isPublishing: boolean;
  onChangeTrim: (start: number, end: number) => void;
  onChangeSpeed: (rate: number) => void;
  onChangeVolume: (volume: number, muted?: boolean) => void;
  onChangeMusicVolume: (volume: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onOpenTextEditor: () => void;
  onOpenMusicPicker: () => void;
  onSelectFilterIndex: (index: number) => void;
  onSelectReelsEffect: (effect: ReelsEffectId) => void;
  onPublish: () => void;
}

type ActiveToolStrip = "none" | "effects" | "audio" | "speed" | "filters";

const SPEED_OPTIONS = [0.5, 1.0, 1.5, 2.0];

export default function ReelsEditor({
  videoState,
  thumbnails,
  selectedMusic,
  musicVolume,
  activeFilterIndex,
  activeReelsEffect,
  isPublishing,
  onChangeTrim,
  onChangeSpeed,
  onChangeVolume,
  onChangeMusicVolume,
  onSeek,
  onTogglePlay,
  onOpenTextEditor,
  onOpenMusicPicker,
  onSelectFilterIndex,
  onSelectReelsEffect,
  onPublish,
}: ReelsEditorProps) {
  const [activeStrip, setActiveStrip] = useState<ActiveToolStrip>("none");

  const toggleStrip = (strip: ActiveToolStrip) => {
    setActiveStrip((prev) => (prev === strip ? "none" : strip));
  };

  const handleSplitAtPlayhead = () => {
    const cur = videoState.currentTime;
    const start = videoState.trimStart;
    const end = videoState.trimEnd || videoState.duration;
    if (cur > start + 0.4 && cur < end - 0.4) {
      const mid = (start + end) / 2;
      if (cur <= mid) {
        onChangeTrim(cur, end);
      } else {
        onChangeTrim(start, cur);
      }
    }
  };

  const effectiveVolume = videoState.muted ? 0 : Math.round(videoState.volume * 100);
  const effectiveMusicVolume = Math.round(musicVolume * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-zinc-950/92 backdrop-blur-2xl border-t border-white/10 px-4 pt-3 pb-5 flex flex-col gap-3 pointer-events-auto select-none animate-in slide-in-from-bottom duration-200">
      {/* Dinamik Alt Şerit (Efektler / Ses / Hız / Filtreler) */}
      {activeStrip === "effects" && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {REELS_EFFECT_PRESETS.map((eff) => {
            const active = activeReelsEffect === eff.id;
            return (
              <button
                key={eff.id}
                type="button"
                onClick={() => onSelectReelsEffect(eff.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 border transition-all active:scale-95 ${
                  active
                    ? "bg-pink-500 text-white border-pink-400 shadow-lg shadow-pink-500/25"
                    : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                }`}
              >
                {eff.name}
              </button>
            );
          })}
        </div>
      )}

      {activeStrip === "speed" && (
        <div className="grid grid-cols-4 gap-2 py-1">
          {SPEED_OPTIONS.map((rate) => {
            const active = Math.abs(videoState.playbackRate - rate) < 0.01;
            return (
              <button
                key={rate}
                type="button"
                onClick={() => onChangeSpeed(rate)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                  active
                    ? "bg-emerald-500 text-black border-emerald-400"
                    : "bg-white/5 text-white border-white/10 hover:bg-white/10"
                }`}
              >
                {rate}x
              </button>
            );
          })}
        </div>
      )}

      {activeStrip === "filters" && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {FILTER_PRESETS.map((preset, idx) => {
            const active = activeFilterIndex === idx;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectFilterIndex(idx)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 border transition-all active:scale-95 ${
                  active
                    ? "bg-white text-black border-white"
                    : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                }`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
      )}

      {activeStrip === "audio" && (
        <div className="flex flex-col gap-2.5 py-1">
          {!videoState.isMotionPhoto && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onChangeVolume(
                    videoState.muted && videoState.volume === 0 ? 1 : videoState.volume,
                    !videoState.muted
                  )
                }
                className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0"
              >
                {videoState.muted || effectiveVolume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
              <span className="text-[11px] font-semibold text-zinc-300 w-16 shrink-0">
                Orijinal
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={effectiveVolume}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  onChangeVolume(val, val === 0);
                }}
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <span className="text-[11px] font-bold text-white w-9 text-right tabular-nums">
                {effectiveVolume}%
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenMusicPicker}
              className="px-3 py-1.5 rounded-lg bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs font-bold shrink-0 active:scale-95 transition-all"
            >
              {selectedMusic ? selectedMusic.title.slice(0, 14) : "Müzik Seç"}
            </button>
            {selectedMusic && (
              <>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={effectiveMusicVolume}
                  onChange={(e) => onChangeMusicVolume(Number(e.target.value) / 100)}
                  className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-pink-400"
                />
                <span className="text-[11px] font-bold text-white w-9 text-right tabular-nums">
                  {effectiveMusicVolume}%
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 1. Doğrudan Görünür CapCut Tarzı Timeline Şeridi */}
      <VideoTimeline
        duration={videoState.duration}
        trimStart={videoState.trimStart}
        trimEnd={videoState.trimEnd}
        currentTime={videoState.currentTime}
        isPlaying={videoState.isPlaying}
        thumbnails={thumbnails}
        onChangeTrim={onChangeTrim}
        onSeek={onSeek}
        onTogglePlay={onTogglePlay}
      />

      {/* 2. Tek Dokunuşlu Hızlı Aksiyon Barı + Paylaş CTA */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={handleSplitAtPlayhead}
            className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 active:scale-95 transition-all shrink-0"
          >
            <Scissors className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-semibold">Böl/Kırp</span>
          </button>

          <button
            type="button"
            onClick={onOpenTextEditor}
            className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 active:scale-95 transition-all shrink-0"
          >
            <CaseSensitive className="w-4 h-4 text-white" />
            <span className="text-[10px] font-semibold">Metin</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStrip("effects")}
            className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border active:scale-95 transition-all shrink-0 ${
              activeStrip === "effects" || activeReelsEffect !== "none"
                ? "bg-pink-500/20 border-pink-400/40 text-white"
                : "bg-white/5 border-transparent hover:bg-white/10 text-zinc-200"
            }`}
          >
            <Sparkles className="w-4 h-4 text-pink-400" />
            <span className="text-[10px] font-semibold">Efektler</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStrip("audio")}
            className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border active:scale-95 transition-all shrink-0 ${
              activeStrip === "audio" || selectedMusic
                ? "bg-purple-500/20 border-purple-400/40 text-white"
                : "bg-white/5 border-transparent hover:bg-white/10 text-zinc-200"
            }`}
          >
            <Music className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-semibold">Ses/Müzik</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStrip("speed")}
            className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border active:scale-95 transition-all shrink-0 ${
              activeStrip === "speed" || Math.abs(videoState.playbackRate - 1) > 0.01
                ? "bg-emerald-500/20 border-emerald-400/40 text-white"
                : "bg-white/5 border-transparent hover:bg-white/10 text-zinc-200"
            }`}
          >
            <Gauge className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-semibold">Hız</span>
          </button>

          <button
            type="button"
            onClick={() => toggleStrip("filters")}
            className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl border active:scale-95 transition-all shrink-0 ${
              activeStrip === "filters" || activeFilterIndex > 0
                ? "bg-cyan-500/20 border-cyan-400/40 text-white"
                : "bg-white/5 border-transparent hover:bg-white/10 text-zinc-200"
            }`}
          >
            <Palette className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-semibold">Filtreler</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing}
          className="flex items-center gap-1.5 pl-3.5 pr-1.5 py-1.5 rounded-full bg-white text-black font-bold text-xs shadow-xl active:scale-95 transition-all shrink-0 disabled:opacity-50"
        >
          {isPublishing ? (
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : (
            <>
              <span>Paylaş</span>
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center">
                <CircleChevronRight className="w-4 h-4" />
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
