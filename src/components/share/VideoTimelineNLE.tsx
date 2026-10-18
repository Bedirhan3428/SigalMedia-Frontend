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
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const userScrollingRef = useRef<boolean>(false);
  const handleDraggingRef = useRef<boolean>(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticScrollRef = useRef<boolean>(false);

  const safeTotal = Math.max(0.5, totalDuration || 5);

  const syncScrollToTimeAnalog = useCallback(
    (t: number) => {
      const el = scrollContainerRef.current;
      const clamped = Math.max(0, Math.min(t, safeTotal));
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatNLEClock(clamped);
      }
      if (!el || userScrollingRef.current || handleDraggingRef.current) return;
      programmaticScrollRef.current = true;
      el.scrollLeft = clamped * pps;
    },
    [pps, safeTotal]
  );

  // Oynatma esnasında 60 FPS Pürüzsüz Analog Timeline Akışı (scrollLeft = liveTime * pps)
  useEffect(() => {
    const cur = getCurrentTime ? getCurrentTime() : currentTime;
    syncScrollToTimeAnalog(cur);

    if (!isPlaying) return;
    let rafId: number | null = null;
    const tick = () => {
      const liveT = getCurrentTime ? getCurrentTime() : currentTime;
      syncScrollToTimeAnalog(liveT);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [currentTime, getCurrentTime, isPlaying, syncScrollToTimeAnalog]);

  // Kullanıcı parmağıyla timeline'ı kaydırdığında anlıkSaniye = scrollLeft / PPS ve anında otomatik duraklatma
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      return;
    }
    if (handleDraggingRef.current) {
      return;
    }

    if (isPlaying) {
      onPauseVideo?.();
    }

    userScrollingRef.current = true;
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 140);

    const scrubbedSec = Math.max(0, Math.min(safeTotal, el.scrollLeft / pps));
    if (timeLabelRef.current) {
      timeLabelRef.current.textContent = formatNLEClock(scrubbedSec);
    }
    onSeek(Number(scrubbedSec.toFixed(3)));
  };

  // Cetvele tıklandığında ibreyi (merkezi) o saniyeye kaydırır
  const handleSeekAndScroll = useCallback(
    (targetSec: number) => {
      if (isPlaying) {
        onPauseVideo?.();
      }
      const clamped = Math.max(0, Math.min(safeTotal, targetSec));
      const el = scrollContainerRef.current;
      if (el) {
        programmaticScrollRef.current = true;
        el.scrollLeft = clamped * pps;
      }
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatNLEClock(clamped);
      }
      onSeek(clamped);
    },
    [isPlaying, onPauseVideo, onSeek, pps, safeTotal]
  );

  // Kulakçık uzatma/kısaltma esnasında timeline'ı zıplatmadan sadece video karesini ve sayacı günceller
  const handleSeekWithoutScroll = useCallback(
    (targetSec: number) => {
      if (isPlaying) {
        onPauseVideo?.();
      }
      handleDraggingRef.current = true;
      if (handleDragTimerRef.current) clearTimeout(handleDragTimerRef.current);
      handleDragTimerRef.current = setTimeout(() => {
        handleDraggingRef.current = false;
      }, 180);

      const clamped = Math.max(0, Math.min(safeTotal, targetSec));
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatNLEClock(clamped);
      }
      onSeek(clamped);
    },
    [isPlaying, onPauseVideo, onSeek, safeTotal]
  );

  // Kulakçıklar ekran kenarına (sol/sağ 48px) ulaştığında timeline'ı akıcı kaydırır
  const handleEdgeScroll = useCallback((deltaPx: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    handleDraggingRef.current = true;
    if (handleDragTimerRef.current) clearTimeout(handleDragTimerRef.current);
    handleDragTimerRef.current = setTimeout(() => {
      handleDraggingRef.current = false;
    }, 180);
    programmaticScrollRef.current = true;
    el.scrollLeft = Math.max(0, el.scrollLeft + deltaPx);
  }, []);

  return (
    <div
      className="w-full flex flex-col gap-1.5 select-none pointer-events-auto"
      onClick={() => onSelectItem(null, null)}
    >
      {/* 1. Üst Oynatma, Zaman Sayacı, Geri Al / İleri Al ve Ölçek (PPS Zoom) Satırı */}
      <div
        className="flex items-center justify-between px-4 pb-1"
        onClick={(e) => e.stopPropagation()}
      >
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
            onClick={() => {
              onPauseVideo?.();
              setPps((p) => Math.max(40, p - 10));
            }}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] active:scale-90 transition-all flex items-center justify-center text-zinc-300"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              onPauseVideo?.();
              setPps((p) => Math.min(100, p + 10));
            }}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] active:scale-90 transition-all flex items-center justify-center text-zinc-300"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={() => {
              onPauseVideo?.();
              onUndo();
            }}
            disabled={!canUndo}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] disabled:opacity-35 active:scale-90 transition-all flex items-center justify-center text-zinc-200"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              onPauseVideo?.();
              onRedo();
            }}
            disabled={!canRedo}
            className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-[#28282d] disabled:opacity-35 active:scale-90 transition-all flex items-center justify-center text-zinc-200"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Sabit Merkez İbreli (Fixed Center Playhead) ve 50vw Boşluklu 60 FPS Analog Kayar Konteyner */}
      <div className="relative w-full bg-[#0b0c0e] border-y border-white/10 py-2">
        {/* SABİT MERKEZ PLAYHEAD (left: 50%, üstte yuvarlak başlık + dikey beyaz ibre) */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)]" />
          <div className="w-[2px] flex-1 bg-white shadow-[0_0_10px_rgba(255,255,255,0.95)]" />
        </div>

        {/* Yatay Kaydırılabilir 50vw Sol / 50vw Sağ Boşluklu Çok Kanallı Alan */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onPointerDown={() => {
            if (isPlaying) onPauseVideo?.();
          }}
          onTouchStart={() => {
            if (isPlaying) onPauseVideo?.();
          }}
          className="w-full overflow-x-auto no-scrollbar"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="inline-flex items-stretch">
            {/* 50vw Sol Boşluk (Videonun 0.00s karesi tam merkez ibreye oturur) */}
            <div className="w-[50vw] shrink-0" />

            {/* Kanallar Yığını */}
            <div className="flex flex-col gap-2">
              {/* 1. Sabit PPS Zaman Cetveli (Ruler) */}
              <TimelineRuler
                totalDuration={safeTotal}
                pps={pps}
                onSeekToTime={handleSeekAndScroll}
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

            {/* 50vw Sağ Boşluk (Videonun son karesi tam merkez ibreye oturur) */}
            <div className="w-[50vw] shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
