// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Scissors,
  Sparkles,
  Music,
  Gauge,
  Palette,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Maximize2,
  Sticker,
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
  onOpenStickerSheet?: () => void;
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
  onOpenStickerSheet,
  onSelectFilterIndex,
  onSelectReelsEffect,
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
    <div className="fixed inset-x-0 bottom-0 z-40 bg-black pt-2 pb-6 flex flex-col gap-3.5 pointer-events-auto select-none">
      {/* 1. Ferah Çok Kanallı Zaman Çizelgesi */}
      <VideoTimeline
        duration={videoState.duration}
        trimStart={videoState.trimStart}
        trimEnd={videoState.trimEnd}
        currentTime={videoState.currentTime}
        isPlaying={videoState.isPlaying}
        thumbnails={thumbnails}
        muted={videoState.muted || effectiveVolume === 0}
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
        onToggleMute={() =>
          onChangeVolume(
            videoState.muted && videoState.volume === 0 ? 1 : videoState.volume,
            !videoState.muted
          )
        }
        onOpenMusicPicker={onOpenMusicPicker}
        onQuickAddEffectAtPlayhead={() => {
          setActiveStrip("effects");
          addEffectClipAtPlayhead("zoom_pulse");
        }}
      />

      {/* 2. Açılır Alt Araç Şeridi (Yalnızca ilgili araca dokunulduğunda açılır) */}
      {activeStrip === "effects" && (
        <div className="flex flex-col gap-2 px-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
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
                  className={`px-3.5 py-2 rounded-2xl text-xs font-semibold shrink-0 border transition-all active:scale-95 flex items-center gap-1.5 ${
                    active
                      ? "bg-white text-black border-white"
                      : "bg-[#1c1c1e] text-zinc-300 border-white/5 hover:bg-[#26262a]"
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
                className="px-3.5 py-2 rounded-2xl text-xs font-semibold shrink-0 border border-white/15 text-white bg-[#1c1c1e] hover:bg-[#26262a] active:scale-95 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Yeni Klip</span>
              </button>
            )}
          </div>

          {selectedEffectClip && onChangeEffectClips && (
            <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2 border border-white/5">
              <span className="text-xs font-medium text-zinc-400 shrink-0">
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
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
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
                className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-zinc-200 flex items-center gap-1 shrink-0"
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
                className="p-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {activeStrip === "speed" && (
        <div className="grid grid-cols-6 gap-2 px-4">
          {SPEED_OPTIONS.map((rate) => {
            const active = Math.abs(videoState.playbackRate - rate) < 0.01;
            return (
              <button
                key={rate}
                type="button"
                onClick={() => onChangeSpeed(rate)}
                className={`py-2 rounded-2xl text-xs font-semibold border transition-all active:scale-95 ${
                  active
                    ? "bg-white text-black border-white"
                    : "bg-[#1c1c1e] text-white border-white/5 hover:bg-[#26262a]"
                }`}
              >
                {rate}x
              </button>
            );
          })}
        </div>
      )}

      {activeStrip === "filters" && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4">
          {FILTER_PRESETS.map((preset, idx) => {
            const active = activeFilterIndex === idx;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectFilterIndex(idx)}
                className={`px-4 py-2 rounded-2xl text-xs font-semibold shrink-0 border transition-all active:scale-95 ${
                  active
                    ? "bg-white text-black border-white"
                    : "bg-[#1c1c1e] text-zinc-300 border-white/5 hover:bg-[#26262a]"
                }`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
      )}

      {activeStrip === "audio" && (
        <div className="flex flex-col gap-2 px-4">
          {!videoState.isMotionPhoto && (
            <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2">
              <button
                type="button"
                onClick={() =>
                  onChangeVolume(
                    videoState.muted && videoState.volume === 0 ? 1 : videoState.volume,
                    !videoState.muted
                  )
                }
                className="text-white shrink-0"
              >
                {videoState.muted || effectiveVolume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-zinc-300" />
                )}
              </button>
              <span className="text-xs font-medium text-zinc-400 w-14 shrink-0">
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
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
                {effectiveVolume}%
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2">
            <button
              type="button"
              onClick={onOpenMusicPicker}
              className="px-3 py-1 rounded-xl bg-white/10 text-white text-xs font-semibold shrink-0 active:scale-95 transition-all"
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
                  className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
                />
                <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
                  {effectiveMusicVolume}%
                </span>
                {onChangeMusicMeta && (
                  <button
                    type="button"
                    onClick={() => onChangeMusicMeta(null)}
                    className="p-1.5 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {selectedMusic && onChangeMusicMeta && (
            <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2">
              <span className="text-xs font-medium text-zinc-400 shrink-0">
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
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <span className="text-xs font-semibold text-white w-10 text-right tabular-nums">
                {(selectedMusic.startTime || 0).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. Görseldeki Gibi Ferah Yuvarlatılmış Kutu İkonlu Alt Araç Barı */}
      <div className="flex items-start justify-between gap-2.5 overflow-x-auto no-scrollbar px-4 pt-1">
        <button
          type="button"
          onClick={() => {
            if (!selectedMusic) {
              onOpenMusicPicker();
            } else {
              toggleStrip("audio");
            }
          }}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div
            className={`w-16 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
              activeStrip === "audio" || selectedMusic
                ? "bg-white text-black"
                : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
            }`}
          >
            <Music className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200">Ses</span>
        </button>

        <button
          type="button"
          onClick={onOpenTextEditor}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div className="w-16 h-12 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white text-base font-bold transition-all active:scale-95">
            Aa
          </div>
          <span className="text-[11px] font-medium text-zinc-200">Metin</span>
        </button>

        <button
          type="button"
          onClick={() => toggleStrip("effects")}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div
            className={`w-16 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
              activeStrip === "effects" ||
              activeReelsEffect !== "none" ||
              effectClips.length > 0
                ? "bg-white text-black"
                : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
            }`}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200">Efektler</span>
        </button>

        <button
          type="button"
          onClick={handleSplitAtPlayhead}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div className="w-16 h-12 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
            <Scissors className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200">Kes</span>
        </button>

        {onOpenStickerSheet && (
          <button
            type="button"
            onClick={onOpenStickerSheet}
            className="flex flex-col items-center gap-1.5 shrink-0 group"
          >
            <div className="w-16 h-12 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
              <Sticker className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-medium text-zinc-200">Çıkartmalar</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => toggleStrip("filters")}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div
            className={`w-16 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
              activeStrip === "filters" || activeFilterIndex > 0
                ? "bg-white text-black"
                : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
            }`}
          >
            <Palette className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200">Filtreler</span>
        </button>

        <button
          type="button"
          onClick={() => toggleStrip("speed")}
          className="flex flex-col items-center gap-1.5 shrink-0 group"
        >
          <div
            className={`w-16 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
              activeStrip === "speed" || Math.abs(videoState.playbackRate - 1) > 0.01
                ? "bg-white text-black"
                : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
            }`}
          >
            <Gauge className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-200">Hız</span>
        </button>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan


