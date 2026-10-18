// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import { useEffect, useRef, useState } from "react";
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
  Plus,
  Trash2,
  Maximize2,
} from "lucide-react";
import {
  FILTER_PRESETS,
  REELS_EFFECT_PRESETS,
  ReelsEffectClip,
  ReelsEffectId,
  StoryAudioMeta,
  VideoState,
} from "@/lib/canvas-editor";
import VideoTimeline, { formatTimelineTime } from "./VideoTimeline";

export interface ReelsEditorProps {
  videoState: VideoState;
  thumbnails: string[];
  selectedMusic: StoryAudioMeta | null;
  musicVolume: number;
  activeFilterIndex: number;
  activeReelsEffect: ReelsEffectId;
  effectClips?: ReelsEffectClip[];
  isPublishing: boolean;
  getCurrentTime?: () => number;
  onChangeTrim: (start: number, end: number) => void;
  onChangeSpeed: (rate: number) => void;
  onChangeVolume: (volume: number, muted?: boolean) => void;
  onChangeMusicVolume: (volume: number) => void;
  onChangeMusicMeta?: (music: StoryAudioMeta | null) => void;
  onChangeEffectClips?: (clips: ReelsEffectClip[]) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onOpenTextEditor: () => void;
  onOpenMusicPicker: () => void;
  onSelectFilterIndex: (index: number) => void;
  onSelectReelsEffect: (effect: ReelsEffectId) => void;
  onPublish: () => void;
}

type ActiveToolStrip = "none" | "effects" | "audio" | "speed" | "filters";

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0];

export default function ReelsEditor({
  videoState,
  thumbnails,
  selectedMusic,
  musicVolume,
  activeFilterIndex,
  activeReelsEffect,
  effectClips = [],
  isPublishing,
  getCurrentTime,
  onChangeTrim,
  onChangeSpeed,
  onChangeVolume,
  onChangeMusicVolume,
  onChangeMusicMeta,
  onChangeEffectClips,
  onSeek,
  onTogglePlay,
  onOpenTextEditor,
  onOpenMusicPicker,
  onSelectFilterIndex,
  onSelectReelsEffect,
  onPublish,
}: ReelsEditorProps) {
  const [activeStrip, setActiveStrip] = useState<ActiveToolStrip>("none");
  const [selectedEffectClipId, setSelectedEffectClipId] = useState<string | null>(null);

  // Playhead (scrubber) hareketi React useState yerine useRef + doğrudan DOM style.transform ile 60 FPS güncellenir
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const currentTimeRef = useRef<number>(videoState.currentTime);

  const safeDuration = Math.max(0.1, Math.min(videoState.duration || 0.1, 60));
  const safeStart = Math.max(0, Math.min(videoState.trimStart, safeDuration - 0.1));
  const safeEnd = Math.max(
    safeStart + 0.1,
    Math.min(videoState.trimEnd || safeDuration, safeDuration)
  );

  useEffect(() => {
    const updateScrubberTransform = () => {
      const rawTime = getCurrentTime ? getCurrentTime() : currentTimeRef.current;
      currentTimeRef.current = rawTime;
      const clamped = Math.max(safeStart, Math.min(rawTime, safeEnd));
      const trackEl = trackRef.current;
      const playheadEl = playheadRef.current;

      if (trackEl && playheadEl) {
        const trackW = trackEl.clientWidth || 1;
        const xPx = (clamped / safeDuration) * trackW;
        playheadEl.style.transform = `translate3d(${xPx.toFixed(2)}px, 0, 0)`;
      }
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatTimelineTime(clamped - safeStart);
      }
    };

    updateScrubberTransform();

    if (!videoState.isPlaying) return;
    let rafId: number | null = null;
    const tick = () => {
      updateScrubberTransform();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [
    getCurrentTime,
    safeDuration,
    safeEnd,
    safeStart,
    videoState.isPlaying,
  ]);

  const toggleStrip = (strip: ActiveToolStrip) => {
    setActiveStrip((prev) => (prev === strip ? "none" : strip));
  };

  const getPlayheadTime = () => {
    const raw = getCurrentTime ? getCurrentTime() : currentTimeRef.current;
    return Math.max(safeStart, Math.min(safeEnd, raw));
  };

  const selectedEffectClip =
    effectClips.find((c) => c.id === selectedEffectClipId) || null;

  const addEffectClipAtPlayhead = (effectId: Exclude<ReelsEffectId, "none">) => {
    if (!onChangeEffectClips) {
      onSelectReelsEffect(effectId);
      return;
    }
    const cur = getPlayheadTime();
    const defaultSpan = Math.min(2.5, Math.max(0.6, (safeEnd - safeStart) * 0.35));
    let clipStart = cur;
    let clipEnd = Math.min(safeEnd, clipStart + defaultSpan);
    if (clipEnd - clipStart < 0.4) {
      clipStart = Math.max(safeStart, safeEnd - defaultSpan);
      clipEnd = safeEnd;
    }
    const newClip: ReelsEffectClip = {
      id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      effect: effectId,
      startTime: Number(clipStart.toFixed(2)),
      endTime: Number(clipEnd.toFixed(2)),
      intensity: 100,
    };
    onSelectReelsEffect("none");
    onChangeEffectClips([...effectClips, newClip]);
    setSelectedEffectClipId(newClip.id);
  };

  const handleSelectEffectPreset = (effectId: ReelsEffectId) => {
    if (!onChangeEffectClips) {
      onSelectReelsEffect(effectId);
      return;
    }
    if (effectId === "none") {
      if (selectedEffectClip) {
        onChangeEffectClips(effectClips.filter((c) => c.id !== selectedEffectClip.id));
        setSelectedEffectClipId(null);
      } else {
        onChangeEffectClips([]);
        onSelectReelsEffect("none");
      }
      return;
    }

    if (selectedEffectClip) {
      onChangeEffectClips(
        effectClips.map((c) =>
          c.id === selectedEffectClip.id ? { ...c, effect: effectId } : c
        )
      );
    } else {
      addEffectClipAtPlayhead(effectId);
    }
  };

  const handleSplitAtPlayhead = () => {
    const cur = getPlayheadTime();
    if (selectedEffectClip && onChangeEffectClips) {
      if (
        cur > selectedEffectClip.startTime + 0.2 &&
        cur < selectedEffectClip.endTime - 0.2
      ) {
        const leftClip: ReelsEffectClip = {
          ...selectedEffectClip,
          endTime: Number(cur.toFixed(2)),
        };
        const rightClip: ReelsEffectClip = {
          ...selectedEffectClip,
          id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          startTime: Number((cur + 0.02).toFixed(2)),
        };
        onChangeEffectClips(
          effectClips.flatMap((c) =>
            c.id === selectedEffectClip.id ? [leftClip, rightClip] : [c]
          )
        );
        setSelectedEffectClipId(rightClip.id);
        return;
      }
    }

    if (cur > safeStart + 0.25 && cur < safeEnd - 0.25) {
      const mid = (safeStart + safeEnd) / 2;
      if (cur <= mid) {
        onChangeTrim(Number(cur.toFixed(2)), safeEnd);
      } else {
        onChangeTrim(safeStart, Number(cur.toFixed(2)));
      }
    }
  };

  const handleMusicTimelineChange = (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number
  ) => {
    if (!selectedMusic || !onChangeMusicMeta) return;
    onChangeMusicMeta({
      ...selectedMusic,
      timelineStart,
      timelineEnd,
      startTime: typeof songOffset === "number" ? songOffset : selectedMusic.startTime,
    });
  };

  const effectiveVolume = videoState.muted ? 0 : Math.round(videoState.volume * 100);
  const effectiveMusicVolume = Math.round(musicVolume * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-zinc-950/94 backdrop-blur-2xl border-t border-white/10 px-3.5 pt-2.5 pb-4 flex flex-col gap-2.5 pointer-events-auto select-none animate-in slide-in-from-bottom duration-200">
      {/* Dinamik Alt Şerit (Efektler / Ses / Hız / Filtreler) */}
      {activeStrip === "effects" && (
        <div className="flex flex-col gap-2 py-0.5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {REELS_EFFECT_PRESETS.map((eff) => {
              const active = selectedEffectClip
                ? selectedEffectClip.effect === eff.id
                : eff.id === "none"
                  ? effectClips.length === 0 && activeReelsEffect === "none"
                  : activeReelsEffect === eff.id;

              return (
                <button
                  key={eff.id}
                  type="button"
                  onClick={() => handleSelectEffectPreset(eff.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border transition-all active:scale-95 flex items-center gap-1.5 ${
                    active
                      ? "bg-pink-500 text-white border-pink-400 shadow-lg shadow-pink-500/25"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {eff.id !== "none" && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: eff.color }}
                    />
                  )}
                  <span>{eff.name}</span>
                </button>
              );
            })}

            {onChangeEffectClips && (
              <button
                type="button"
                onClick={() => addEffectClipAtPlayhead("zoom_pulse")}
                className="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border border-dashed border-pink-400/50 text-pink-300 bg-pink-500/10 hover:bg-pink-500/20 active:scale-95 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Yeni Klip</span>
              </button>
            )}
          </div>

          {/* Seçili Efekt Klibi Yoğunluk & Kapsam Kontrolleri */}
          {selectedEffectClip && onChangeEffectClips && (
            <div className="flex items-center gap-2.5 bg-white/5 rounded-xl px-2.5 py-1.5 border border-white/10">
              <span className="text-[10px] font-bold text-pink-300 shrink-0">
                Yoğunluk
              </span>
              <input
                type="range"
                min={15}
                max={100}
                value={selectedEffectClip.intensity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onChangeEffectClips(
                    effectClips.map((c) =>
                      c.id === selectedEffectClip.id ? { ...c, intensity: val } : c
                    )
                  );
                }}
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-pink-400"
              />
              <span className="text-[10px] font-bold text-white w-8 text-right tabular-nums">
                {selectedEffectClip.intensity}%
              </span>

              <button
                type="button"
                onClick={() =>
                  onChangeEffectClips(
                    effectClips.map((c) =>
                      c.id === selectedEffectClip.id
                        ? { ...c, startTime: safeStart, endTime: safeEnd }
                        : c
                    )
                  )
                }
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-bold text-zinc-200 flex items-center gap-1 shrink-0"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Tamamı</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onChangeEffectClips(
                    effectClips.filter((c) => c.id !== selectedEffectClip.id)
                  );
                  setSelectedEffectClipId(null);
                }}
                className="p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {activeStrip === "speed" && (
        <div className="grid grid-cols-6 gap-1.5 py-0.5">
          {SPEED_OPTIONS.map((rate) => {
            const active = Math.abs(videoState.playbackRate - rate) < 0.01;
            return (
              <button
                key={rate}
                type="button"
                onClick={() => onChangeSpeed(rate)}
                className={`py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
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
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
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
        <div className="flex flex-col gap-2 py-0.5">
          {!videoState.isMotionPhoto && (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  onChangeVolume(
                    videoState.muted && videoState.volume === 0 ? 1 : videoState.volume,
                    !videoState.muted
                  )
                }
                className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0"
              >
                {videoState.muted || effectiveVolume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </button>
              <span className="text-[11px] font-semibold text-zinc-300 w-14 shrink-0">
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

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenMusicPicker}
              className="px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-200 text-xs font-bold shrink-0 active:scale-95 transition-all"
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
                  className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-purple-400"
                />
                <span className="text-[11px] font-bold text-white w-9 text-right tabular-nums">
                  {effectiveMusicVolume}%
                </span>
                {onChangeMusicMeta && (
                  <button
                    type="button"
                    onClick={() => onChangeMusicMeta(null)}
                    className="p-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Şarkı Başlangıç Kesimi (Şarkının hangi saniyesinden başlayacağı) */}
          {selectedMusic && onChangeMusicMeta && (
            <div className="flex items-center gap-2.5 bg-white/5 rounded-xl px-2.5 py-1.5 border border-white/10">
              <span className="text-[10px] font-bold text-purple-300 shrink-0">
                Şarkı Kesimi
              </span>
              <input
                type="range"
                min={0}
                max={120}
                step={0.5}
                value={selectedMusic.startTime || 0}
                onChange={(e) => {
                  const nextOffset = Number(e.target.value);
                  onChangeMusicMeta({
                    ...selectedMusic,
                    startTime: nextOffset,
                  });
                }}
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-purple-400"
              />
              <span className="text-[10px] font-bold text-white w-10 text-right tabular-nums">
                {(selectedMusic.startTime || 0).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* 1. Çok Kanallı CapCut Timeline (Video + FX Klipleri + Şarkı Şeridi) */}
      <VideoTimeline
        duration={videoState.duration}
        trimStart={videoState.trimStart}
        trimEnd={videoState.trimEnd}
        currentTime={videoState.currentTime}
        isPlaying={videoState.isPlaying}
        thumbnails={thumbnails}
        getCurrentTime={getCurrentTime}
        playheadRef={playheadRef}
        trackRef={trackRef}
        timeLabelRef={timeLabelRef}
        effectClips={effectClips}
        selectedEffectClipId={selectedEffectClipId}
        onSelectEffectClip={(id) => {
          setSelectedEffectClipId(id);
          if (id) setActiveStrip("effects");
        }}
        onChangeEffectClips={onChangeEffectClips}
        musicClip={selectedMusic}
        onChangeMusicTimeline={handleMusicTimelineChange}
        onChangeTrim={onChangeTrim}
        onSeek={onSeek}
        onTogglePlay={onTogglePlay}
        onQuickAddEffectAtPlayhead={() => {
          setActiveStrip("effects");
          addEffectClipAtPlayhead("zoom_pulse");
        }}
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
              activeStrip === "effects" ||
              activeReelsEffect !== "none" ||
              effectClips.length > 0
                ? "bg-pink-500/20 border-pink-400/40 text-white"
                : "bg-white/5 border-transparent hover:bg-white/10 text-zinc-200"
            }`}
          >
            <Sparkles className="w-4 h-4 text-pink-400" />
            <span className="text-[10px] font-semibold">
              Efektler{effectClips.length > 0 ? ` (${effectClips.length})` : ""}
            </span>
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

