// [START] CREATED BY Bedirhan
"use client";

import React, { useRef, useState } from "react";
import { VolumeX, ArrowLeftRight } from "lucide-react";
import { VideoTrackClip } from "@/lib/canvas-editor";

export interface TimelineTrackClipsProps {
  clips: VideoTrackClip[];
  maxSourceDuration: number;
  pps: number;
  thumbnails: string[];
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onTrimClip: (clipId: string, newSourceStart: number, newSourceEnd: number) => void;
  onReorderClips: (fromIndex: number, toIndex: number) => void;
  onPauseVideo?: () => void;
  onSeek?: (time: number) => void;
  onCommitHistory?: () => void;
}

type ClipDragState = {
  mode: "trim-left" | "trim-right" | "reorder";
  clipId: string;
  clipIndex: number;
  startX: number;
  initSourceStart: number;
  initSourceEnd: number;
  clipTimelineStart: number;
  playbackRate: number;
  isMotionPhoto?: boolean;
};

type TrimPreviewState = {
  clipId: string;
  mode: "trim-left" | "trim-right";
  previewSourceStart: number;
  previewSourceEnd: number;
  leftGapPx: number;
  rightGapPx: number;
};

export default function TimelineTrackClips({
  clips,
  maxSourceDuration,
  pps,
  thumbnails,
  selectedClipId,
  onSelectClip,
  onTrimClip,
  onReorderClips,
  onPauseVideo,
  onSeek,
  onCommitHistory,
}: TimelineTrackClipsProps) {
  const dragRef = useRef<ClipDragState | null>(null);
  const trimPreviewRef = useRef<TrimPreviewState | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
    target: HTMLElement;
  } | null>(null);

  const [trimPreview, setTrimPreview] = useState<TrimPreviewState | null>(null);
  const [reorderingClipId, setReorderingClipId] = useState<string | null>(null);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  const getClipTimelineStart = (index: number): number => {
    let acc = 0;
    for (let i = 0; i < index && i < clips.length; i++) {
      acc += Math.max(0.2, clips[i].duration);
    }
    return acc;
  };

  const beginClipDrag = (e: React.PointerEvent, state: ClipDragState) => {
    e.stopPropagation();
    clearLongPressTimer();
    onPauseVideo?.();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    onCommitHistory?.();
    onSelectClip(state.clipId);
    dragRef.current = state;

    if (state.mode === "trim-left" || state.mode === "trim-right") {
      const initialPreview: TrimPreviewState = {
        clipId: state.clipId,
        mode: state.mode,
        previewSourceStart: state.initSourceStart,
        previewSourceEnd: state.initSourceEnd,
        leftGapPx: 0,
        rightGapPx: 0,
      };
      trimPreviewRef.current = initialPreview;
      setTrimPreview(initialPreview);
    } else if (state.mode === "reorder") {
      setReorderingClipId(state.clipId);
      setInsertionIndex(state.clipIndex);
    }
  };

  const handleClipBodyPointerDown = (
    e: React.PointerEvent,
    clip: VideoTrackClip,
    idx: number
  ) => {
    onSelectClip(clip.id);
    if (clips.length <= 1) return;

    clearLongPressTimer();
    const targetEl = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    pressOriginRef.current = { x: startX, y: startY, pointerId, target: targetEl };

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      onPauseVideo?.();
      onCommitHistory?.();
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      try {
        targetEl.setPointerCapture(pointerId);
      } catch {}
      const state: ClipDragState = {
        mode: "reorder",
        clipId: clip.id,
        clipIndex: idx,
        startX,
        initSourceStart: clip.sourceStart,
        initSourceEnd: clip.sourceEnd,
        clipTimelineStart: getClipTimelineStart(idx),
        playbackRate: clip.playbackRate || 1,
        isMotionPhoto: clip.isMotionPhoto,
      };
      dragRef.current = state;
      setReorderingClipId(clip.id);
      setInsertionIndex(idx);
    }, 300);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pressOriginRef.current && !dragRef.current) {
      const moveDist = Math.hypot(
        e.clientX - pressOriginRef.current.x,
        e.clientY - pressOriginRef.current.y
      );
      if (moveDist > 8) {
        clearLongPressTimer();
      }
    }

    const st = dragRef.current;
    if (!st) return;
    e.stopPropagation();

    const dxPx = e.clientX - st.startX;
    const rate = Math.max(0.25, st.playbackRate || 1.0);
    const dtTimelineSec = dxPx / Math.max(20, pps);
    const dtSourceSec = dtTimelineSec * rate;
    const maxAllowedSource = st.isMotionPhoto
      ? 60
      : Math.max(0.5, maxSourceDuration || 60);
    const initDurSec = (st.initSourceEnd - st.initSourceStart) / rate;

    if (st.mode === "trim-left") {
      const nextStart = Number(
        Math.max(0, Math.min(st.initSourceStart + dtSourceSec, st.initSourceEnd - 0.3)).toFixed(2)
      );
      const nextDurSec = Math.max(0.2, (st.initSourceEnd - nextStart) / rate);
      const shrunkSec = Math.max(0, initDurSec - nextDurSec);
      const leftGapPx = Math.round(shrunkSec * pps);

      const nextPreview: TrimPreviewState = {
        clipId: st.clipId,
        mode: "trim-left",
        previewSourceStart: nextStart,
        previewSourceEnd: st.initSourceEnd,
        leftGapPx,
        rightGapPx: 0,
      };
      trimPreviewRef.current = nextPreview;
      setTrimPreview(nextPreview);

      const previewTimelineSec = Math.max(0, st.clipTimelineStart + shrunkSec);
      onSeek?.(Number(previewTimelineSec.toFixed(2)));
      return;
    }

    if (st.mode === "trim-right") {
      const nextEnd = Number(
        Math.max(
          st.initSourceStart + 0.3,
          Math.min(st.initSourceEnd + dtSourceSec, maxAllowedSource)
        ).toFixed(2)
      );
      const nextDurSec = Math.max(0.2, (nextEnd - st.initSourceStart) / rate);
      const shrunkSec = Math.max(0, initDurSec - nextDurSec);
      const rightGapPx = Math.round(shrunkSec * pps);

      const nextPreview: TrimPreviewState = {
        clipId: st.clipId,
        mode: "trim-right",
        previewSourceStart: st.initSourceStart,
        previewSourceEnd: nextEnd,
        leftGapPx: 0,
        rightGapPx,
      };
      trimPreviewRef.current = nextPreview;
      setTrimPreview(nextPreview);

      const previewTimelineSec = Math.max(0, st.clipTimelineStart + nextDurSec);
      onSeek?.(Number(previewTimelineSec.toFixed(2)));
      return;
    }

    if (st.mode === "reorder") {
      const thresholdPx = Math.max(36, ((st.initSourceEnd - st.initSourceStart) / rate) * pps * 0.48);
      if (dxPx > thresholdPx && st.clipIndex < clips.length - 1) {
        const nextIdx = st.clipIndex + 1;
        onReorderClips(st.clipIndex, nextIdx);
        setInsertionIndex(nextIdx);
        dragRef.current = {
          ...st,
          clipIndex: nextIdx,
          startX: e.clientX,
        };
      } else if (dxPx < -thresholdPx && st.clipIndex > 0) {
        const prevIdx = st.clipIndex - 1;
        onReorderClips(st.clipIndex, prevIdx);
        setInsertionIndex(prevIdx);
        dragRef.current = {
          ...st,
          clipIndex: prevIdx,
          startX: e.clientX,
        };
      }
    }
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    clearLongPressTimer();
    const st = dragRef.current;
    if (!st) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const activePreview = trimPreviewRef.current;
    dragRef.current = null;
    trimPreviewRef.current = null;
    setTrimPreview(null);
    setReorderingClipId(null);
    setInsertionIndex(null);

    // Aşama 2: Parmağı bıraktığında geçici boşluğu kapat ve manyetik birleşmeyi (Ripple) uygula
    if (
      activePreview &&
      (st.mode === "trim-left" || st.mode === "trim-right")
    ) {
      onTrimClip(
        activePreview.clipId,
        activePreview.previewSourceStart,
        activePreview.previewSourceEnd
      );
    }
  };

  return (
    <div
      className="relative h-14 flex items-center select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* Manyetik Ana Video Kanalı: Parçalar boşluksuz (2px ayrım çizgisiyle) yan yana dizilir */}
      <div className="flex items-center h-14 gap-[2px] bg-black/80 rounded-xl transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {clips.map((clip, idx) => {
          const isTrimmingThis = trimPreview?.clipId === clip.id;
          const rate = Math.max(0.25, clip.playbackRate || 1);
          const effectiveDuration = isTrimmingThis
            ? Math.max(
                0.2,
                (trimPreview.previewSourceEnd - trimPreview.previewSourceStart) / rate
              )
            : clip.duration;
          const widthPx = Math.max(28, Math.round(effectiveDuration * pps));
          const leftGapPx = isTrimmingThis ? trimPreview.leftGapPx : 0;
          const rightGapPx = isTrimmingThis ? trimPreview.rightGapPx : 0;

          const isSelected = selectedClipId === clip.id;
          const isReordering = reorderingClipId === clip.id;
          const showInsertGuide =
            reorderingClipId !== null &&
            insertionIndex === idx &&
            reorderingClipId === clip.id;
          const thumbCount = Math.max(
            1,
            Math.min(thumbnails.length || 1, Math.ceil(widthPx / 42))
          );

          return (
            <div
              key={clip.id}
              className="flex items-center shrink-0 transition-[margin,width] duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                marginLeft: leftGapPx > 0 ? `${leftGapPx}px` : "0px",
                marginRight: rightGapPx > 0 ? `${rightGapPx}px` : "0px",
              }}
            >
              {/* Long-Press Reorder Mavi Ekleme Kılavuz Çizgisi */}
              {showInsertGuide && (
                <div className="w-1 h-16 bg-blue-500 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.95)] mr-1 pointer-events-none z-40" />
              )}

              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip(clip.id);
                }}
                onPointerDown={(e) => handleClipBodyPointerDown(e, clip, idx)}
                className={`relative h-14 rounded-xl overflow-visible transition-transform duration-150 cursor-pointer shrink-0 ${
                  isReordering
                    ? "scale-105 z-30 opacity-95 shadow-[0_10px_28px_rgba(0,0,0,0.75)] ring-2 ring-blue-400"
                    : "z-10"
                }`}
                style={{ width: `${widthPx}px` }}
              >
                {/* İç Film Şeridi Konteyneri */}
                <div
                  className={`w-full h-full rounded-xl overflow-hidden relative flex bg-zinc-900 border-2 transition-colors ${
                    isSelected
                      ? "border-amber-400 shadow-[0_0_0_1px_rgba(251,191,36,0.45)]"
                      : "border-white/15 hover:border-white/30"
                  }`}
                >
                  {thumbnails.length > 0 ? (
                    Array.from({ length: thumbCount }).map((_, tIdx) => {
                      const src =
                        thumbnails[
                          Math.min(
                            thumbnails.length - 1,
                            Math.floor(
                              (tIdx / Math.max(1, thumbCount)) * thumbnails.length
                            )
                          )
                        ];
                      return (
                        <img
                          key={tIdx}
                          src={src}
                          alt=""
                          draggable={false}
                          className="h-full flex-1 object-cover pointer-events-none select-none opacity-90"
                        />
                      );
                    })
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800" />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25 pointer-events-none" />

                  {/* Klip Etiket ve Bilgi Rozetleri */}
                  <div className="absolute left-2.5 bottom-1.5 flex items-center gap-1.5 pointer-events-none">
                    <span className="px-1.5 py-0.5 rounded bg-black/65 text-[10px] font-bold text-white tabular-nums">
                      {effectiveDuration.toFixed(1)}s
                    </span>
                    {Math.abs((clip.playbackRate || 1) - 1) > 0.01 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[9px] font-extrabold tabular-nums">
                        {clip.playbackRate}x
                      </span>
                    )}
                    {clip.muted && !clip.isMotionPhoto && (
                      <span className="p-0.5 rounded bg-black/65 text-red-400">
                        <VolumeX className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>

                  {/* Çoklu klip varsa sıra değiştirme tutamacı */}
                  {isSelected && clips.length > 1 && (
                    <div
                      onPointerDown={(e) =>
                        beginClipDrag(e, {
                          mode: "reorder",
                          clipId: clip.id,
                          clipIndex: idx,
                          startX: e.clientX,
                          initSourceStart: clip.sourceStart,
                          initSourceEnd: clip.sourceEnd,
                          clipTimelineStart: getClipTimelineStart(idx),
                          playbackRate: clip.playbackRate || 1,
                          isMotionPhoto: clip.isMotionPhoto,
                        })
                      }
                      className="absolute top-1 right-2.5 px-1.5 py-0.5 rounded bg-black/75 border border-white/20 text-[9px] font-semibold text-zinc-200 flex items-center gap-1 cursor-grab active:cursor-grabbing z-20"
                    >
                      <ArrowLeftRight className="w-2.5 h-2.5 text-amber-400" />
                      <span>Taşı</span>
                    </div>
                  )}
                </div>

                {/* Seçili Klip Sol ve Sağ Kırpma Kulakçıkları (Trim Handles) */}
                {isSelected && (
                  <>
                    <div
                      onPointerDown={(e) =>
                        beginClipDrag(e, {
                          mode: "trim-left",
                          clipId: clip.id,
                          clipIndex: idx,
                          startX: e.clientX,
                          initSourceStart: clip.sourceStart,
                          initSourceEnd: clip.sourceEnd,
                          clipTimelineStart: getClipTimelineStart(idx),
                          playbackRate: clip.playbackRate || 1,
                          isMotionPhoto: clip.isMotionPhoto,
                        })
                      }
                      className="absolute -left-1.5 top-0 bottom-0 w-4 rounded-l-xl bg-amber-400 flex items-center justify-center cursor-ew-resize z-30 shadow-lg touch-none"
                    >
                      <div className="w-[2px] h-5 rounded-full bg-black/80" />
                    </div>

                    <div
                      onPointerDown={(e) =>
                        beginClipDrag(e, {
                          mode: "trim-right",
                          clipId: clip.id,
                          clipIndex: idx,
                          startX: e.clientX,
                          initSourceStart: clip.sourceStart,
                          initSourceEnd: clip.sourceEnd,
                          clipTimelineStart: getClipTimelineStart(idx),
                          playbackRate: clip.playbackRate || 1,
                          isMotionPhoto: clip.isMotionPhoto,
                        })
                      }
                      className="absolute -right-1.5 top-0 bottom-0 w-4 rounded-r-xl bg-amber-400 flex items-center justify-center cursor-ew-resize z-30 shadow-lg touch-none"
                    >
                      <div className="w-[2px] h-5 rounded-full bg-black/80" />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
