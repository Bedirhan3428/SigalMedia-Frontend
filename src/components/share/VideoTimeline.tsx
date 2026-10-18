// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Plus,
  Sparkles,
  Music,
  Volume2,
  VolumeX,
  Undo2,
  Scissors,
  Trash2,
} from "lucide-react";
import {
  REELS_EFFECT_PRESETS,
  ReelsEffectClip,
  StoryAudioMeta,
} from "@/lib/canvas-editor";

export interface VideoTimelineProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  isPlaying: boolean;
  thumbnails: string[];
  muted?: boolean;
  getCurrentTime?: () => number;
  playheadRef?: React.RefObject<HTMLDivElement | null>;
  trackRef?: React.RefObject<HTMLDivElement | null>;
  timeLabelRef?: React.RefObject<HTMLSpanElement | null>;
  effectClips?: ReelsEffectClip[];
  selectedEffectClipId?: string | null;
  onSelectEffectClip?: (id: string | null) => void;
  onChangeEffectClips?: (clips: ReelsEffectClip[]) => void;
  musicClip?: StoryAudioMeta | null;
  onChangeMusicTimeline?: (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number
  ) => void;
  onChangeTrim: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onToggleMute?: () => void;
  onOpenMusicPicker?: () => void;
  onQuickAddEffectAtPlayhead?: () => void;
}

export function formatTimelineTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, "0")}`;
}

type DragState =
  | { type: "scrub" }
  | { type: "video-start" }
  | { type: "video-end" }
  | {
      type: "fx-move" | "fx-start" | "fx-end";
      clipId: string;
      initialPointerTime: number;
      initialStart: number;
      initialEnd: number;
    }
  | {
      type: "audio-move" | "audio-start" | "audio-end";
      initialPointerTime: number;
      initialStart: number;
      initialEnd: number;
      initialSongOffset: number;
    }
  | null;

export default function VideoTimeline({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  isPlaying,
  thumbnails,
  muted = false,
  getCurrentTime,
  playheadRef: externalPlayheadRef,
  trackRef: externalTrackRef,
  timeLabelRef: externalTimeLabelRef,
  effectClips = [],
  selectedEffectClipId = null,
  onSelectEffectClip,
  onChangeEffectClips,
  musicClip = null,
  onChangeMusicTimeline,
  onChangeTrim,
  onSeek,
  onTogglePlay,
  onToggleMute,
  onOpenMusicPicker,
  onQuickAddEffectAtPlayhead,
}: VideoTimelineProps) {
  const internalTrackRef = useRef<HTMLDivElement | null>(null);
  const internalPlayheadRef = useRef<HTMLDivElement | null>(null);
  const internalTimeLabelRef = useRef<HTMLSpanElement | null>(null);

  const trackRef = externalTrackRef || internalTrackRef;
  const playheadRef = externalPlayheadRef || internalPlayheadRef;
  const timeLabelRef = externalTimeLabelRef || internalTimeLabelRef;

  const [dragState, setDragState] = useState<DragState>(null);
  const [selectedTrack, setSelectedTrack] = useState<"video" | "fx" | "audio">("video");
  const currentTimeRef = useRef<number>(currentTime);

  const safeDuration = Math.max(0.1, Math.min(duration || 0.1, 60));
  const safeStart = Math.max(0, Math.min(trimStart, safeDuration - 0.1));
  const safeEnd = Math.max(
    safeStart + 0.1,
    Math.min(trimEnd || safeDuration, safeDuration)
  );
  const trimmedDuration = Math.max(0.1, safeEnd - safeStart);

  const startPct = (safeStart / safeDuration) * 100;
  const endPct = (safeEnd / safeDuration) * 100;

  const musicStart =
    musicClip && typeof musicClip.timelineStart === "number"
      ? Math.max(0, Math.min(musicClip.timelineStart, safeDuration - 0.2))
      : safeStart;
  const musicEnd =
    musicClip &&
    typeof musicClip.timelineEnd === "number" &&
    musicClip.timelineEnd > musicStart + 0.1
      ? Math.min(safeDuration, musicClip.timelineEnd)
      : safeEnd;

  const musicStartPct = (musicStart / safeDuration) * 100;
  const musicEndPct = (musicEnd / safeDuration) * 100;

  // Playhead konumunu React state kullanmadan doğrudan DOM style.transform ile 60 FPS güncelle
  const syncPlayheadDom = useCallback(
    (rawTime: number) => {
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
    },
    [playheadRef, safeDuration, safeEnd, safeStart, timeLabelRef, trackRef]
  );

  useEffect(() => {
    const t = getCurrentTime ? getCurrentTime() : currentTime;
    syncPlayheadDom(t);
  }, [currentTime, getCurrentTime, syncPlayheadDom]);

  useEffect(() => {
    if (!isPlaying || !getCurrentTime) return;
    let rafId: number | null = null;

    const loop = () => {
      syncPlayheadDom(getCurrentTime());
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, getCurrentTime, syncPlayheadDom]);

  const clientXToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    return ratio * safeDuration;
  };

  const getActivePlayheadTime = (): number => {
    const raw = getCurrentTime ? getCurrentTime() : currentTimeRef.current;
    return Math.max(safeStart, Math.min(safeEnd, raw));
  };

  const handleSplitAction = () => {
    const cur = getActivePlayheadTime();
    if (selectedEffectClipId && onChangeEffectClips) {
      const target = effectClips.find((c) => c.id === selectedEffectClipId);
      if (target && cur > target.startTime + 0.2 && cur < target.endTime - 0.2) {
        const firstHalf: ReelsEffectClip = {
          ...target,
          endTime: Number(cur.toFixed(2)),
        };
        const secondHalf: ReelsEffectClip = {
          ...target,
          id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          startTime: Number((cur + 0.02).toFixed(2)),
        };
        onChangeEffectClips(
          effectClips.flatMap((c) =>
            c.id === target.id ? [firstHalf, secondHalf] : [c]
          )
        );
        onSelectEffectClip?.(secondHalf.id);
        return;
      }
    }

    if (selectedTrack === "audio" && musicClip && onChangeMusicTimeline) {
      if (cur > musicStart + 0.25 && cur < musicEnd - 0.25) {
        const mid = (musicStart + musicEnd) / 2;
        if (cur <= mid) {
          const delta = Math.max(0, cur - musicStart);
          onChangeMusicTimeline(
            Number(cur.toFixed(2)),
            Number(musicEnd.toFixed(2)),
            Number(((musicClip.startTime || 0) + delta).toFixed(2))
          );
        } else {
          onChangeMusicTimeline(
            Number(musicStart.toFixed(2)),
            Number(cur.toFixed(2)),
            musicClip.startTime || 0
          );
        }
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
      syncPlayheadDom(cur);
    }
  };

  const handleResetAllTrims = () => {
    onChangeTrim(0, safeDuration);
    if (musicClip && onChangeMusicTimeline) {
      onChangeMusicTimeline(0, safeDuration, musicClip.startTime || 0);
    }
    syncPlayheadDom(0);
    onSeek(0);
  };

  const handleDeleteSelectedFx = () => {
    if (!selectedEffectClipId || !onChangeEffectClips) return;
    onChangeEffectClips(effectClips.filter((c) => c.id !== selectedEffectClipId));
    onSelectEffectClip?.(null);
  };

  const beginDrag = (e: React.PointerEvent<HTMLElement>, state: DragState) => {
    e.stopPropagation();
    const container = trackRef.current;
    if (container) {
      try {
        container.setPointerCapture(e.pointerId);
      } catch {}
    }
    setDragState(state);

    if (state?.type === "scrub") {
      const t = Math.max(safeStart, Math.min(safeEnd, clientXToTime(e.clientX)));
      syncPlayheadDom(t);
      onSeek(t);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    e.stopPropagation();
    const t = clientXToTime(e.clientX);

    if (dragState.type === "video-start") {
      const nextStart = Math.max(0, Math.min(t, safeEnd - 0.25));
      onChangeTrim(Number(nextStart.toFixed(2)), safeEnd);
      syncPlayheadDom(nextStart);
      onSeek(nextStart);
    } else if (dragState.type === "video-end") {
      const nextEnd = Math.max(safeStart + 0.25, Math.min(t, safeDuration));
      onChangeTrim(safeStart, Number(nextEnd.toFixed(2)));
      syncPlayheadDom(nextEnd);
      onSeek(nextEnd);
    } else if (dragState.type === "scrub") {
      const nextTime = Math.max(safeStart, Math.min(safeEnd, t));
      syncPlayheadDom(nextTime);
      onSeek(nextTime);
    } else if (
      (dragState.type === "fx-move" ||
        dragState.type === "fx-start" ||
        dragState.type === "fx-end") &&
      onChangeEffectClips
    ) {
      const delta = t - dragState.initialPointerTime;
      const clipLen = Math.max(0.2, dragState.initialEnd - dragState.initialStart);

      onChangeEffectClips(
        effectClips.map((c) => {
          if (c.id !== dragState.clipId) return c;
          if (dragState.type === "fx-move") {
            const nextStart = Math.max(
              0,
              Math.min(safeDuration - clipLen, dragState.initialStart + delta)
            );
            return {
              ...c,
              startTime: Number(nextStart.toFixed(2)),
              endTime: Number((nextStart + clipLen).toFixed(2)),
            };
          }
          if (dragState.type === "fx-start") {
            const nextStart = Math.max(
              0,
              Math.min(dragState.initialEnd - 0.2, dragState.initialStart + delta)
            );
            return { ...c, startTime: Number(nextStart.toFixed(2)) };
          }
          const nextEnd = Math.max(
            dragState.initialStart + 0.2,
            Math.min(safeDuration, dragState.initialEnd + delta)
          );
          return { ...c, endTime: Number(nextEnd.toFixed(2)) };
        })
      );
    } else if (
      (dragState.type === "audio-move" ||
        dragState.type === "audio-start" ||
        dragState.type === "audio-end") &&
      onChangeMusicTimeline
    ) {
      const delta = t - dragState.initialPointerTime;
      const clipLen = Math.max(0.3, dragState.initialEnd - dragState.initialStart);

      if (dragState.type === "audio-move") {
        const nextStart = Math.max(
          0,
          Math.min(safeDuration - clipLen, dragState.initialStart + delta)
        );
        onChangeMusicTimeline(
          Number(nextStart.toFixed(2)),
          Number((nextStart + clipLen).toFixed(2)),
          dragState.initialSongOffset
        );
      } else if (dragState.type === "audio-start") {
        const nextStart = Math.max(
          0,
          Math.min(dragState.initialEnd - 0.3, dragState.initialStart + delta)
        );
        const startShift = nextStart - dragState.initialStart;
        onChangeMusicTimeline(
          Number(nextStart.toFixed(2)),
          Number(dragState.initialEnd.toFixed(2)),
          Number(Math.max(0, dragState.initialSongOffset + startShift).toFixed(2))
        );
      } else {
        const nextEnd = Math.max(
          dragState.initialStart + 0.3,
          Math.min(safeDuration, dragState.initialEnd + delta)
        );
        onChangeMusicTimeline(
          Number(dragState.initialStart.toFixed(2)),
          Number(nextEnd.toFixed(2)),
          dragState.initialSongOffset
        );
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setDragState(null);
  };

  // Zaman cetveli etiketleri (1sn • 3sn • 5sn)
  const tickMarks = [
    Math.round(safeDuration * 0.2),
    Math.round(safeDuration * 0.5),
    Math.round(safeDuration * 0.8),
  ];

  return (
    <div className="w-full flex flex-col gap-3 select-none touch-none">
      {/* 1. Ferah Oynatma & Zaman Kontrol Satırı */}
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          onClick={onTogglePlay}
          className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all flex items-center justify-center text-white"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-white" />
          ) : (
            <Play className="w-4 h-4 fill-white ml-0.5" />
          )}
        </button>

        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 tabular-nums">
          <span ref={timeLabelRef} className="text-zinc-200">
            {formatTimelineTime(Math.max(0, currentTime - safeStart))}
          </span>
          <span>/</span>
          <span>{formatTimelineTime(trimmedDuration)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetAllTrims}
            title="Sıfırla"
            className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all flex items-center justify-center text-zinc-300"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {selectedEffectClipId ? (
            <button
              type="button"
              onClick={handleDeleteSelectedFx}
              title="Efekti Sil"
              className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/30 active:scale-90 transition-all flex items-center justify-center text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSplitAction}
              title="Böl / Kırp"
              className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all flex items-center justify-center text-zinc-300"
            >
              <Scissors className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Ferah Çok Kanallı Timeline Alanı */}
      <div className="w-full border-t border-white/10 pt-2">
        <div className="flex items-stretch w-full">
          {/* Sol Kanal İkon Sütunu (Ses Kapat/Aç) */}
          <div className="w-12 shrink-0 flex flex-col gap-1.5 pt-6 pr-1.5">
            <div className="h-14 rounded-r-md bg-[#16171b] flex items-center justify-center">
              {onToggleMute ? (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-zinc-300" />
                  )}
                </button>
              ) : (
                <Volume2 className="w-4 h-4 text-zinc-400" />
              )}
            </div>
            <div className="h-9 rounded-r-md bg-[#16171b]" />
            <div className="h-9 rounded-r-md bg-[#16171b]" />
          </div>

          {/* Sağ Interaktif Zaman Çizelgesi Gövdesi */}
          <div
            ref={trackRef}
            onPointerDown={(e) => {
              setSelectedTrack("video");
              onSelectEffectClip?.(null);
              beginDrag(e, { type: "scrub" });
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative flex-1 flex flex-col gap-1.5 cursor-pointer touch-none pr-3"
          >
            {/* Üst Saniye Cetveli (1sn • 3sn) */}
            <div className="h-5 flex items-center justify-evenly text-[11px] font-medium text-zinc-400 pointer-events-none select-none">
              <span>{tickMarks[0] || 1}sn</span>
              <span className="text-zinc-600">•</span>
              <span>{tickMarks[1] || 3}sn</span>
              <span className="text-zinc-600">•</span>
              <span>{tickMarks[2] || 5}sn</span>
            </div>

            {/* 1. KANAL: VİDEO FİLM ŞERİDİ */}
            <div
              onClick={() => setSelectedTrack("video")}
              className="relative h-14 w-full rounded-md overflow-visible bg-[#16171b]"
            >
              <div className="absolute inset-0 rounded-md overflow-hidden flex w-full h-full pointer-events-none">
                {thumbnails.length > 0 ? (
                  thumbnails.map((src, idx) => (
                    <img
                      key={idx}
                      src={src}
                      alt=""
                      draggable={false}
                      className="h-full flex-1 object-cover select-none"
                    />
                  ))
                ) : (
                  <div className="w-full h-full bg-zinc-800/70" />
                )}

                {/* Kırpma Dışı Karartmalar */}
                <div
                  className="absolute inset-y-0 left-0 bg-black/75"
                  style={{ width: `${startPct}%` }}
                />
                <div
                  className="absolute inset-y-0 right-0 bg-black/75"
                  style={{ width: `${Math.max(0, 100 - endPct)}%` }}
                />
              </div>

              {/* Sol Beyaz Hap Tutamaç (Görseldeki Gibi) */}
              <div
                onPointerDown={(e) => {
                  setSelectedTrack("video");
                  beginDrag(e, { type: "video-start" });
                }}
                style={{ left: `calc(${startPct}% - 10px)` }}
                className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
              >
                <div className="w-4 h-7 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                </div>
              </div>

              {/* Sağ Beyaz Hap Tutamaç */}
              <div
                onPointerDown={(e) => {
                  setSelectedTrack("video");
                  beginDrag(e, { type: "video-end" });
                }}
                style={{ left: `calc(${endPct}% - 10px)` }}
                className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
              >
                <div className="w-4 h-7 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                </div>
              </div>
            </div>

            {/* 2. KANAL: SES / MÜZİK ŞERİDİ ("+ Ses ekle" veya Sürüklenebilir Şarkı) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTrack("audio");
                onSelectEffectClip?.(null);
              }}
              className="relative h-9 w-full rounded-md bg-[#16171b] overflow-hidden flex items-center"
            >
              {!musicClip ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMusicPicker?.();
                  }}
                  className="w-full h-full px-3 flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4 text-zinc-400" />
                  <span>Ses ekle</span>
                </button>
              ) : (
                <div
                  onPointerDown={(e) => {
                    setSelectedTrack("audio");
                    onSelectEffectClip?.(null);
                    beginDrag(e, {
                      type: "audio-move",
                      initialPointerTime: clientXToTime(e.clientX),
                      initialStart: musicStart,
                      initialEnd: musicEnd,
                      initialSongOffset: musicClip.startTime || 0,
                    });
                  }}
                  style={{
                    left: `${musicStartPct}%`,
                    width: `${Math.max(5, musicEndPct - musicStartPct)}%`,
                  }}
                  className={`absolute inset-y-0.5 rounded-md bg-purple-600/35 border flex items-center justify-between px-3 cursor-grab active:cursor-grabbing z-10 ${
                    selectedTrack === "audio"
                      ? "border-purple-300 ring-1 ring-purple-300/50"
                      : "border-purple-400/50"
                  }`}
                >
                  <div
                    onPointerDown={(e) => {
                      setSelectedTrack("audio");
                      beginDrag(e, {
                        type: "audio-start",
                        initialPointerTime: clientXToTime(e.clientX),
                        initialStart: musicStart,
                        initialEnd: musicEnd,
                        initialSongOffset: musicClip.startTime || 0,
                      });
                    }}
                    className="absolute inset-y-0 left-0 w-3 bg-white/40 hover:bg-white rounded-l cursor-ew-resize z-20"
                  />

                  <div className="flex items-center gap-1.5 overflow-hidden pointer-events-none w-full justify-between px-1">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <Music className="w-3 h-3 text-purple-200 shrink-0" />
                      <span className="text-xs font-semibold text-purple-100 truncate">
                        {musicClip.title}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-purple-200/80 tabular-nums shrink-0">
                      +{Math.round(musicClip.startTime || 0)}s
                    </span>
                  </div>

                  <div
                    onPointerDown={(e) => {
                      setSelectedTrack("audio");
                      beginDrag(e, {
                        type: "audio-end",
                        initialPointerTime: clientXToTime(e.clientX),
                        initialStart: musicStart,
                        initialEnd: musicEnd,
                        initialSongOffset: musicClip.startTime || 0,
                      });
                    }}
                    className="absolute inset-y-0 right-0 w-3 bg-white/40 hover:bg-white rounded-r cursor-ew-resize z-20"
                  />
                </div>
              )}
            </div>

            {/* 3. KANAL: EFEKT ŞERİDİ ("+ Efekt ekle" veya Sürüklenebilir FX Klipleri) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTrack("fx");
              }}
              className="relative h-9 w-full rounded-md bg-[#16171b] overflow-hidden flex items-center"
            >
              {effectClips.length === 0 ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTrack("fx");
                    onQuickAddEffectAtPlayhead?.();
                  }}
                  className="w-full h-full px-3 flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4 text-zinc-400" />
                  <span>Efekt ekle</span>
                </button>
              ) : (
                effectClips.map((clip) => {
                  const preset = REELS_EFFECT_PRESETS.find((p) => p.id === clip.effect);
                  const cStartPct = (Math.max(0, clip.startTime) / safeDuration) * 100;
                  const cEndPct =
                    (Math.min(
                      safeDuration,
                      Math.max(clip.startTime + 0.15, clip.endTime)
                    ) /
                      safeDuration) *
                    100;
                  const isSelected = selectedEffectClipId === clip.id;
                  const color = preset?.color || "#ec4899";

                  return (
                    <div
                      key={clip.id}
                      onPointerDown={(e) => {
                        setSelectedTrack("fx");
                        onSelectEffectClip?.(clip.id);
                        beginDrag(e, {
                          type: "fx-move",
                          clipId: clip.id,
                          initialPointerTime: clientXToTime(e.clientX),
                          initialStart: clip.startTime,
                          initialEnd: clip.endTime,
                        });
                      }}
                      style={{
                        left: `${cStartPct}%`,
                        width: `${Math.max(5, cEndPct - cStartPct)}%`,
                        backgroundColor: `${color}38`,
                        borderColor: isSelected ? "#ffffff" : color,
                      }}
                      className={`absolute inset-y-0.5 rounded-md border flex items-center justify-between px-2.5 cursor-grab active:cursor-grabbing z-10 select-none ${
                        isSelected ? "ring-1 ring-white shadow-md" : ""
                      }`}
                    >
                      <div
                        onPointerDown={(e) => {
                          setSelectedTrack("fx");
                          onSelectEffectClip?.(clip.id);
                          beginDrag(e, {
                            type: "fx-start",
                            clipId: clip.id,
                            initialPointerTime: clientXToTime(e.clientX),
                            initialStart: clip.startTime,
                            initialEnd: clip.endTime,
                          });
                        }}
                        className="absolute inset-y-0 left-0 w-3 bg-white/40 hover:bg-white rounded-l cursor-ew-resize z-20"
                      />

                      <div className="flex items-center gap-1.5 overflow-hidden pointer-events-none mx-auto">
                        <Sparkles className="w-3 h-3 text-white shrink-0" />
                        <span className="text-xs font-semibold text-white truncate">
                          {preset?.name || clip.effect}
                        </span>
                      </div>

                      <div
                        onPointerDown={(e) => {
                          setSelectedTrack("fx");
                          onSelectEffectClip?.(clip.id);
                          beginDrag(e, {
                            type: "fx-end",
                            clipId: clip.id,
                            initialPointerTime: clientXToTime(e.clientX),
                            initialStart: clip.startTime,
                            initialEnd: clip.endTime,
                          });
                        }}
                        className="absolute inset-y-0 right-0 w-3 bg-white/40 hover:bg-white rounded-r cursor-ew-resize z-20"
                      />
                    </div>
                  );
                })
              )}
            </div>

            {/* Oynatma Çubuğu (Playhead) - Cetvelden en alt kanala kadar uzanan ince beyaz çizgi */}
            <div
              ref={playheadRef}
              style={{
                left: 0,
                transform: "translate3d(0px, 0, 0)",
                willChange: "transform",
              }}
              className="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] z-30 pointer-events-none"
            >
              <div className="w-2 h-2 rounded-full bg-white -ml-[3px] mt-1.5 shadow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan


