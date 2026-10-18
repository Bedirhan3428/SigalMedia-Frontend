// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  OverlayTrackItem,
  ReelsEffectClip,
  StoryAudioMeta,
  VideoTrackClip,
} from "@/lib/canvas-editor";
import TimelineRuler from "./TimelineRuler";
import TimelineTrackClips from "./TimelineTrackClips";
import TimelineOverlayTracks, { NLESelectedType } from "./TimelineOverlayTracks";

export interface VideoTimelineNLEProps {
  clips: VideoTrackClip[];
  overlayItems: OverlayTrackItem[];
  effectClips: ReelsEffectClip[];
  musicClip: StoryAudioMeta | null;
  totalDuration: number;
  maxSourceDuration: number;
  currentTime: number;
  isPlaying: boolean;
  thumbnails: string[];
  selectedItemId: string | null;
  selectedItemType: NLESelectedType;
  canUndo: boolean;
  canRedo: boolean;
  getCurrentTime?: () => number;
  onSelectItem: (id: string | null, type: NLESelectedType) => void;
  onTrimClip: (clipId: string, newSourceStart: number, newSourceEnd: number) => void;
  onReorderClips: (fromIndex: number, toIndex: number) => void;
  onAppendClipClick?: () => void;
  onChangeOverlayTiming: (layerId: string, start: number, end: number) => void;
  onReorderOverlayLayer?: (layerId: string, direction: "up" | "down") => void;
  onChangeEffectClips?: (clips: ReelsEffectClip[]) => void;
  onChangeMusicTimeline?: (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number
  ) => void;
  onSeek: (time: number) => void;
  onPauseVideo?: () => void;
  onTogglePlay: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenMusicPicker?: () => void;
  onOpenTextEditor?: () => void;
  onQuickAddEffect?: () => void;
  onCommitHistory?: () => void;
}

const LEFT_PAD_PX = 16;

export function formatNLEClock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export default function VideoTimelineNLE({
  clips,
  overlayItems,
  effectClips,
  musicClip,
  totalDuration,
  maxSourceDuration,
  currentTime,
  isPlaying,
  thumbnails,
  selectedItemId,
  selectedItemType,
  canUndo,
  canRedo,
  getCurrentTime,
  onSelectItem,
  onTrimClip,
  onReorderClips,
  onAppendClipClick,
  onChangeOverlayTiming,
  onReorderOverlayLayer,
  onChangeEffectClips,
  onChangeMusicTimeline,
  onSeek,
  onPauseVideo,
  onTogglePlay,
  onUndo,
  onRedo,
  onOpenMusicPicker,
  onOpenTextEditor,
  onQuickAddEffect,
  onCommitHistory,
}: VideoTimelineNLEProps) {
  // Varsayılan sabit ölçek: 1 saniye = 60 piksel (40px - 100px arası zoom destekli)
  const [pps, setPps] = useState<number>(60);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const playheadDragRef = useRef<{
    startX: number;
    initTime: number;
  } | null>(null);

  const safeTotal = Math.max(0.5, totalDuration || 5);

  const syncPlayheadToTime = useCallback(
    (t: number, autoFollowViewport: boolean) => {
      const clamped = Math.max(0, Math.min(t, safeTotal + 10));
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatNLEClock(Math.min(clamped, safeTotal));
      }
      const xPx = LEFT_PAD_PX + clamped * pps;
      if (playheadRef.current) {
        playheadRef.current.style.left = `${xPx}px`;
      }
      if (autoFollowViewport && scrollContainerRef.current) {
        const el = scrollContainerRef.current;
        const viewWidth = el.clientWidth;
        if (viewWidth > 0) {
          if (xPx > el.scrollLeft + viewWidth - 44) {
            el.scrollLeft = xPx - viewWidth + 68;
          } else if (xPx < el.scrollLeft + 12) {
            el.scrollLeft = Math.max(0, xPx - 24);
          }
        }
      }
    },
    [pps, safeTotal]
  );

  // Oynatma esnasında 60 FPS akıcı Dinamik Playhead hareketi (soldan sağa kliplerin üzerinde gezer)
  useEffect(() => {
    const cur = getCurrentTime ? getCurrentTime() : currentTime;
    syncPlayheadToTime(cur, isPlaying);

    if (!isPlaying) return;
    let rafId: number | null = null;
    const tick = () => {
      const liveT = getCurrentTime ? getCurrentTime() : currentTime;
      syncPlayheadToTime(liveT, true);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [currentTime, getCurrentTime, isPlaying, syncPlayheadToTime]);

  // Kulakçık uzatma/kısaltma esnasında timeline'ı zıplatmadan sadece ibreyi ve video karesini günceller
  const handleSeekWithoutScroll = useCallback(
    (targetSec: number) => {
      if (isPlaying) {
        onPauseVideo?.();
      }
      const clamped = Math.max(0, targetSec);
      syncPlayheadToTime(clamped, false);
      onSeek(Math.min(safeTotal, clamped));
    },
    [isPlaying, onPauseVideo, onSeek, safeTotal, syncPlayheadToTime]
  );

  // Cetvele tıklandığında ibreyi o saniyeye taşır
  const handleRulerSeek = useCallback(
    (targetSec: number) => {
      if (isPlaying) {
        onPauseVideo?.();
      }
      const clamped = Math.max(0, Math.min(safeTotal, targetSec));
      syncPlayheadToTime(clamped, true);
      onSeek(clamped);
    },
    [isPlaying, onPauseVideo, onSeek, safeTotal, syncPlayheadToTime]
  );

  // Kulakçıklar ekran kenarına (sol/sağ 48px) ulaştığında timeline'ı akıcı kaydırır
  const handleEdgeScroll = useCallback((deltaPx: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, el.scrollLeft + deltaPx);
  }, []);

  // Dinamik Playhead'i doğrudan parmakla tutup sağa/sola gezdirme
  const handlePlayheadPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      onPauseVideo?.();
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    const cur = getCurrentTime ? getCurrentTime() : currentTime;
    playheadDragRef.current = {
      startX: e.clientX,
      initTime: Math.max(0, Math.min(safeTotal, cur)),
    };
  };

  const handlePlayheadPointerMove = (e: React.PointerEvent) => {
    const st = playheadDragRef.current;
    if (!st) return;
    e.stopPropagation();

    if (typeof window !== "undefined") {
      if (e.clientX > window.innerWidth - 44) {
        handleEdgeScroll(10);
        st.startX -= 10;
      } else if (e.clientX < 44) {
        handleEdgeScroll(-10);
        st.startX += 10;
      }
    }

    const dxPx = e.clientX - st.startX;
    const nextSec = Math.max(0, Math.min(safeTotal, st.initTime + dxPx / Math.max(20, pps)));
    syncPlayheadToTime(nextSec, false);
    onSeek(Number(nextSec.toFixed(3)));
  };

  const handlePlayheadPointerUp = (e: React.PointerEvent) => {
    if (!playheadDragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    playheadDragRef.current = null;
  };

  const initialPlayheadLeftPx =
    LEFT_PAD_PX + Math.max(0, Math.min(safeTotal, currentTime)) * pps;

  return (
    <div className="w-full flex flex-col gap-1.5 select-none pointer-events-auto">
      {/* 1. Üst Oynatma, Zaman Sayacı, Geri Al / İleri Al ve Ölçek (PPS Zoom) Satırı */}
      <div className="flex items-center justify-between px-4 pb-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            className="w-9 h-9 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] active:scale-90 transition-all flex items-center justify-center text-white shadow"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white ml-0.5" />
            )}
          </button>

          <div className="flex items-center gap-1 text-xs font-semibold tabular-nums">
            <span ref={timeLabelRef} className="text-white">
              {formatNLEClock(currentTime)}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{formatNLEClock(safeTotal)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* PPS Ölçek Azalt / Artır (40px - 100px/sn) */}
          <button
            type="button"
            onClick={() => setPps((p) => Math.max(40, p - 10))}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] active:scale-90 transition-all flex items-center justify-center text-zinc-300"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPps((p) => Math.min(100, p + 10))}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] active:scale-90 transition-all flex items-center justify-center text-zinc-300"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] disabled:opacity-35 active:scale-90 transition-all flex items-center justify-center text-zinc-200"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] disabled:opacity-35 active:scale-90 transition-all flex items-center justify-center text-zinc-200"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Dinamik Gezen Zaman İbreli (Dynamic Playhead) Çok Kanallı NLE Kayar Alanı */}
      <div className="relative w-full bg-[#0b0c0e] border-y border-white/10 py-2">
        <div
          ref={scrollContainerRef}
          className="w-full overflow-x-auto no-scrollbar"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="relative inline-flex items-stretch pl-4 pr-16">
            {/* DİNAMİK PLAYHEAD: Videonun o anki saniyesinde kliplerin üzerinde soldan sağa gezer ve tutulup sürüklenebilir */}
            <div
              ref={playheadRef}
              onPointerDown={handlePlayheadPointerDown}
              onPointerMove={handlePlayheadPointerMove}
              onPointerUp={handlePlayheadPointerUp}
              onPointerCancel={handlePlayheadPointerUp}
              style={{ left: `${initialPlayheadLeftPx}px` }}
              className="absolute top-0 bottom-0 -translate-x-1/2 w-7 z-40 flex flex-col items-center cursor-ew-resize touch-none"
            >
              <div className="w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] border border-black/40 shrink-0" />
              <div className="w-[2px] flex-1 bg-white shadow-[0_0_10px_rgba(255,255,255,0.95)] pointer-events-none" />
            </div>

            {/* Kanallar Yığını */}
            <div className="flex flex-col gap-2">
              {/* 1. Sabit PPS Zaman Cetveli (Ruler) */}
              <TimelineRuler
                totalDuration={safeTotal}
                pps={pps}
                onSeekToTime={handleRulerSeek}
              />

              {/* 2. Manyetik Ana Video Kanalı (Clips[] + Sondaki [+] Klip Ekle Butonu) */}
              <TimelineTrackClips
                clips={clips}
                maxSourceDuration={maxSourceDuration}
                pps={pps}
                thumbnails={thumbnails}
                selectedClipId={selectedItemType === "video" ? selectedItemId : null}
                onSelectClip={(clipId) => onSelectItem(clipId, "video")}
                onTrimClip={onTrimClip}
                onReorderClips={onReorderClips}
                onAppendClipClick={onAppendClipClick}
                onEdgeScroll={handleEdgeScroll}
                onPauseVideo={onPauseVideo}
                onSeek={handleSeekWithoutScroll}
                onCommitHistory={onCommitHistory}
              />

              {/* 3. Serbest Zamanlı Çok Katmanlı Overlay Kanalları (PIP, Metin, Sticker, FX, Ses) */}
              <TimelineOverlayTracks
                totalDuration={safeTotal}
                pps={pps}
                overlayItems={overlayItems}
                effectClips={effectClips}
                musicClip={musicClip}
                selectedItemId={selectedItemId}
                selectedItemType={selectedItemType}
                onSelectItem={onSelectItem}
                onChangeOverlayTiming={onChangeOverlayTiming}
                onReorderOverlayLayer={onReorderOverlayLayer}
                onChangeEffectClips={onChangeEffectClips}
                onChangeMusicTimeline={onChangeMusicTimeline}
                onPauseVideo={onPauseVideo}
                onSeek={handleSeekWithoutScroll}
                onEdgeScroll={handleEdgeScroll}
                onOpenMusicPicker={onOpenMusicPicker}
                onOpenTextEditor={onOpenTextEditor}
                onQuickAddEffect={onQuickAddEffect}
                onCommitHistory={onCommitHistory}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
