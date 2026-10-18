// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Scissors,
  Sparkles,
  Music,
  ArrowLeftToLine,
  ArrowRightToLine,
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
  onQuickAddEffectAtPlayhead?: () => void;
}

export function formatTimelineTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  const tenths = Math.floor((Math.max(0, sec) % 1) * 10);
  return `${mins}:${rem.toString().padStart(2, "0")}.${tenths}`;
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

  // CapCut Tarzı Hassas Başını Kes / Böl / Sonunu Kes İşlemleri (Aktif kanala göre)
  const handleTrimLeftToPlayhead = () => {
    const cur = getActivePlayheadTime();
    if (selectedTrack === "fx" && selectedEffectClipId && onChangeEffectClips) {
      onChangeEffectClips(
        effectClips.map((c) =>
          c.id === selectedEffectClipId && cur < c.endTime - 0.15
            ? { ...c, startTime: Number(cur.toFixed(2)) }
            : c
        )
      );
      return;
    }
    if (selectedTrack === "audio" && musicClip && onChangeMusicTimeline) {
      if (cur < musicEnd - 0.2) {
        const delta = Math.max(0, cur - musicStart);
        onChangeMusicTimeline(
          Number(cur.toFixed(2)),
          Number(musicEnd.toFixed(2)),
          Number(((musicClip.startTime || 0) + delta).toFixed(2))
        );
      }
      return;
    }
    if (cur > safeStart + 0.15 && cur < safeEnd - 0.2) {
      onChangeTrim(Number(cur.toFixed(2)), safeEnd);
      syncPlayheadDom(cur);
      onSeek(cur);
    }
  };

  const handleTrimRightToPlayhead = () => {
    const cur = getActivePlayheadTime();
    if (selectedTrack === "fx" && selectedEffectClipId && onChangeEffectClips) {
      onChangeEffectClips(
        effectClips.map((c) =>
          c.id === selectedEffectClipId && cur > c.startTime + 0.15
            ? { ...c, endTime: Number(cur.toFixed(2)) }
            : c
        )
      );
      return;
    }
    if (selectedTrack === "audio" && musicClip && onChangeMusicTimeline) {
      if (cur > musicStart + 0.2) {
        onChangeMusicTimeline(
          Number(musicStart.toFixed(2)),
          Number(cur.toFixed(2)),
          musicClip.startTime || 0
        );
      }
      return;
    }
    if (cur > safeStart + 0.2 && cur < safeEnd - 0.15) {
      onChangeTrim(safeStart, Number(cur.toFixed(2)));
      syncPlayheadDom(cur);
      onSeek(cur);
    }
  };

  const handleSplitAction = () => {
    const cur = getActivePlayheadTime();
    // Seçili efekt klibi varsa playhead noktasından iki ayrı efekt klibine böl
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

    // Seçili ses kanalıysa playhead'e göre yakın tarafı kes
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

    // Video kırpma: playhead'in yakın olduğu ucu kırp
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

  return (
    <div className="w-full flex flex-col gap-2 select-none touch-none">
      {/* Üst Kontrol ve CapCut Hassas Kesim Çubuğu */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all flex items-center justify-center text-white"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 tabular-nums">
            <span ref={timeLabelRef} className="text-white">
              {formatTimelineTime(Math.max(0, currentTime - safeStart))}
            </span>
            <span className="text-zinc-500">/</span>
            <span>{formatTimelineTime(trimmedDuration)}</span>
          </div>

          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-[9px] font-extrabold text-emerald-300 tracking-wider">
            60 FPS
          </span>
        </div>

        {/* CapCut Hassas Kırpma & Bölme Araçları */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleTrimLeftToPlayhead}
            title="Başını Kes"
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-200 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all"
          >
            <ArrowLeftToLine className="w-3.5 h-3.5 text-emerald-400" />
            <span>Baş</span>
          </button>

          <button
            type="button"
            onClick={handleSplitAction}
            title="Playhead Noktasından Böl"
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-200 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>Böl</span>
          </button>

          <button
            type="button"
            onClick={handleTrimRightToPlayhead}
            title="Sonunu Kes"
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-200 text-[10px] font-bold flex items-center gap-1 active:scale-95 transition-all"
          >
            <ArrowRightToLine className="w-3.5 h-3.5 text-emerald-400" />
            <span>Son</span>
          </button>

          {selectedEffectClipId && (
            <button
              type="button"
              onClick={handleDeleteSelectedFx}
              title="Efekt Klibini Sil"
              className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 active:scale-95 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Çok Kanallı CapCut Timeline Gövdesi */}
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
        className="relative w-full rounded-xl overflow-hidden bg-zinc-900/95 border border-white/10 flex flex-col gap-1 p-1 cursor-pointer touch-none"
      >
        {/* 1. KANAL: ANA VİDEO ŞERİDİ */}
        <div
          onClick={() => setSelectedTrack("video")}
          className="relative h-12 w-full rounded-lg overflow-hidden bg-zinc-950"
        >
          <div className="absolute inset-0 flex w-full h-full pointer-events-none">
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
          </div>

          {/* Kırpma Dışı Karartmalar */}
          <div
            className="absolute inset-y-0 left-0 bg-black/75 pointer-events-none"
            style={{ width: `${startPct}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-black/75 pointer-events-none"
            style={{ width: `${Math.max(0, 100 - endPct)}%` }}
          />

          {/* Aktif Video Kırpma Çerçevesi */}
          <div
            className={`absolute inset-y-0 border-y-2 pointer-events-none transition-colors ${
              selectedTrack === "video" ? "border-emerald-400" : "border-emerald-500/60"
            }`}
            style={{
              left: `${startPct}%`,
              width: `${Math.max(0, endPct - startPct)}%`,
            }}
          />

          {/* Sol Video Kırpma Tutamacı */}
          <div
            onPointerDown={(e) => {
              setSelectedTrack("video");
              beginDrag(e, { type: "video-start" });
            }}
            style={{ left: `calc(${startPct}% - 10px)` }}
            className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
          >
            <div className="w-3.5 h-full rounded-l-md bg-emerald-400 flex items-center justify-center shadow-lg">
              <div className="w-0.5 h-5 rounded-full bg-black/80" />
            </div>
          </div>

          {/* Sağ Video Kırpma Tutamacı */}
          <div
            onPointerDown={(e) => {
              setSelectedTrack("video");
              beginDrag(e, { type: "video-end" });
            }}
            style={{ left: `calc(${endPct}% - 10px)` }}
            className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
          >
            <div className="w-3.5 h-full rounded-r-md bg-emerald-400 flex items-center justify-center shadow-lg">
              <div className="w-0.5 h-5 rounded-full bg-black/80" />
            </div>
          </div>
        </div>

        {/* 2. KANAL: SÜRÜKLENEBİLİR & BOYUTLANDIRILABİLİR EFEKT KLİPLERİ (FX TRACK) */}
        {onChangeEffectClips && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTrack("fx");
            }}
            className="relative h-7 w-full rounded-md bg-zinc-950/90 border border-white/5 overflow-hidden flex items-center"
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
                className="w-full h-full flex items-center justify-center gap-1.5 text-[10px] font-semibold text-pink-300/75 hover:text-pink-200 hover:bg-pink-500/10 transition-colors"
              >
                <Sparkles className="w-3 h-3 text-pink-400" />
                <span>+ Efekt Klibi Ekle (Sürüklenebilir)</span>
              </button>
            ) : (
              effectClips.map((clip) => {
                const preset = REELS_EFFECT_PRESETS.find((p) => p.id === clip.effect);
                const cStartPct = (Math.max(0, clip.startTime) / safeDuration) * 100;
                const cEndPct =
                  (Math.min(safeDuration, Math.max(clip.startTime + 0.15, clip.endTime)) /
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
                      width: `${Math.max(3, cEndPct - cStartPct)}%`,
                      backgroundColor: `${color}38`,
                      borderColor: isSelected ? "#ffffff" : color,
                    }}
                    className={`absolute inset-y-0.5 rounded-md border flex items-center justify-between px-2 cursor-grab active:cursor-grabbing z-10 select-none ${
                      isSelected ? "ring-1 ring-white shadow-md" : ""
                    }`}
                  >
                    {/* Sol FX Resize Tutamacı */}
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
                      className="absolute inset-y-0 left-0 w-2.5 bg-white/30 hover:bg-white/60 rounded-l cursor-ew-resize z-20"
                    />

                    <div className="flex items-center gap-1 overflow-hidden pointer-events-none mx-auto">
                      <Sparkles className="w-2.5 h-2.5 text-white shrink-0" />
                      <span className="text-[10px] font-bold text-white truncate">
                        {preset?.name || clip.effect}
                      </span>
                    </div>

                    {/* Sağ FX Resize Tutamacı */}
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
                      className="absolute inset-y-0 right-0 w-2.5 bg-white/30 hover:bg-white/60 rounded-r cursor-ew-resize z-20"
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 3. KANAL: SÜRÜKLENEBİLİR & KESİLEBİLİR ŞARKI / SES ŞERİDİ (AUDIO TRACK) */}
        {musicClip && onChangeMusicTimeline && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTrack("audio");
              onSelectEffectClip?.(null);
            }}
            className="relative h-7 w-full rounded-md bg-zinc-950/90 border border-white/5 overflow-hidden flex items-center"
          >
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
                width: `${Math.max(4, musicEndPct - musicStartPct)}%`,
              }}
              className={`absolute inset-y-0.5 rounded-md bg-purple-600/35 border flex items-center justify-between px-2.5 cursor-grab active:cursor-grabbing z-10 ${
                selectedTrack === "audio"
                  ? "border-purple-300 ring-1 ring-purple-300/60"
                  : "border-purple-400/60"
              }`}
            >
              {/* Sol Ses Kesme Tutamacı */}
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
                className="absolute inset-y-0 left-0 w-2.5 bg-purple-300/60 hover:bg-purple-200 rounded-l cursor-ew-resize z-20"
              />

              <div className="flex items-center gap-1.5 overflow-hidden pointer-events-none w-full justify-between px-1">
                <div className="flex items-center gap-1 overflow-hidden">
                  <Music className="w-2.5 h-2.5 text-purple-200 shrink-0" />
                  <span className="text-[10px] font-bold text-purple-100 truncate">
                    {musicClip.title}
                  </span>
                </div>
                <span className="text-[9px] font-semibold text-purple-200/80 tabular-nums shrink-0">
                  +{Math.round(musicClip.startTime || 0)}s
                </span>
              </div>

              {/* Sağ Ses Kesme Tutamacı */}
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
                className="absolute inset-y-0 right-0 w-2.5 bg-purple-300/60 hover:bg-purple-200 rounded-r cursor-ew-resize z-20"
              />
            </div>
          </div>
        )}

        {/* Oynatma Çubuğu (Playhead) - Tüm Kanalları Keser, useRef + style.transform ile 60 FPS */}
        <div
          ref={playheadRef}
          style={{
            left: 0,
            transform: "translate3d(0px, 0, 0)",
            willChange: "transform",
          }}
          className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.95)] z-30 pointer-events-none"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-white -ml-[4px] -mt-0.5 shadow" />
        </div>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan

