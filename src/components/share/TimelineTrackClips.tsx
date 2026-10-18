// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import React, { useEffect, useRef, useState } from "react";
import { VolumeX, ArrowLeftRight, Plus, Check } from "lucide-react";
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
  onReorderModeChange?: (isReordering: boolean) => void;
  onAppendClipClick?: () => void;
  onEdgeScroll?: (deltaPx: number) => void;
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

const TILE_SLOT_PX = 74; // 64px (w-16) + 10px (gap-2.5)

export default function TimelineTrackClips({
  clips,
  maxSourceDuration,
  pps,
  thumbnails,
  selectedClipId,
  onSelectClip,
  onTrimClip,
  onReorderClips,
  onReorderModeChange,
  onAppendClipClick,
  onEdgeScroll,
  onPauseVideo,
  onSeek,
  onCommitHistory,
}: TimelineTrackClipsProps) {
  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<ClipDragState | null>(null);
  const trimPreviewRef = useRef<TrimPreviewState | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);

  const [trimPreview, setTrimPreview] = useState<TrimPreviewState | null>(null);
  const [isReorderMode, setIsReorderMode] = useState<boolean>(false);
  const [reorderingClipId, setReorderingClipId] = useState<string | null>(null);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [reorderOffsetPx, setReorderOffsetPx] = useState<number>(0);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const enterReorderMode = () => {
    setIsReorderMode(true);
    onReorderModeChange?.(true);
  };

  const exitReorderMode = () => {
    clearLongPressTimer();
    dragRef.current = null;
    setIsReorderMode(false);
    setReorderingClipId(null);
    setInsertionIndex(null);
    setReorderOffsetPx(0);
    onReorderModeChange?.(false);
  };

  const getClipTimelineStart = (index: number): number => {
    let acc = 0;
    for (let i = 0; i < index && i < clips.length; i++) {
      acc += Math.max(0.2, clips[i].duration);
    }
    return acc;
  };

  const captureOnRoot = (pointerId: number) => {
    try {
      rootContainerRef.current?.setPointerCapture(pointerId);
    } catch {}
  };

  const releaseOnRoot = (pointerId: number) => {
    try {
      rootContainerRef.current?.releasePointerCapture(pointerId);
    } catch {}
  };

  const beginClipDrag = (e: React.PointerEvent, state: ClipDragState) => {
    e.stopPropagation();
    e.preventDefault();
    clearLongPressTimer();
    onPauseVideo?.();
    captureOnRoot(e.pointerId);
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
      enterReorderMode();
      setReorderingClipId(state.clipId);
      setInsertionIndex(state.clipIndex);
      setReorderOffsetPx(0);
    }
  };

  // Sıralama modundayken herhangi bir 1:1 karoya dokunulduğunda 0ms gecikmeyle anında sürükleme başlatır
  const handleTilePointerDown = (
    e: React.PointerEvent,
    clip: VideoTrackClip,
    idx: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onPauseVideo?.();
    onCommitHistory?.();
    onSelectClip(clip.id);
    captureOnRoot(e.pointerId);

    const state: ClipDragState = {
      mode: "reorder",
      clipId: clip.id,
      clipIndex: idx,
      startX: e.clientX,
      initSourceStart: clip.sourceStart,
      initSourceEnd: clip.sourceEnd,
      clipTimelineStart: getClipTimelineStart(idx),
      playbackRate: clip.playbackRate || 1,
      isMotionPhoto: clip.isMotionPhoto,
    };
    dragRef.current = state;
    setReorderingClipId(clip.id);
    setInsertionIndex(idx);
    setReorderOffsetPx(0);
  };

  const handleClipBodyPointerDown = (
    e: React.PointerEvent,
    clip: VideoTrackClip,
    idx: number
  ) => {
    e.stopPropagation();
    onPauseVideo?.();
    onSelectClip(clip.id);

    clearLongPressTimer();
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    pressOriginRef.current = { x: startX, y: startY, pointerId };

    // 300ms Basılı Tutma -> Kalıcı 1:1 Küçük Kareler Sıralama Modu (Dedicated Reorder Mode)
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      onPauseVideo?.();
      onCommitHistory?.();
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      captureOnRoot(pointerId);
      enterReorderMode();
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
      setReorderOffsetPx(0);
    }, 300);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pressOriginRef.current && !dragRef.current) {
      const moveDist = Math.hypot(
        e.clientX - pressOriginRef.current.x,
        e.clientY - pressOriginRef.current.y
      );
      if (moveDist > 10) {
        clearLongPressTimer();
      }
    }

    const st = dragRef.current;
    if (!st) return;
    e.stopPropagation();
    e.preventDefault();

    // Ekran kenarlarına yaklaşıldığında otomatik yatay kaydırma (Edge Auto-Scroll)
    if (
      st.mode !== "reorder" &&
      typeof window !== "undefined" &&
      onEdgeScroll
    ) {
      const edgeZone = 48;
      if (e.clientX > window.innerWidth - edgeZone) {
        onEdgeScroll(10);
        st.startX -= 10;
      } else if (e.clientX < edgeZone) {
        onEdgeScroll(-10);
        st.startX += 10;
      }
    }

    const dxPx = e.clientX - st.startX;
    const rate = Math.max(0.25, st.playbackRate || 1.0);
    const dtTimelineSec = dxPx / Math.max(20, pps);
    const dtSourceSec = dtTimelineSec * rate;
    const clipObj = clips.find((c) => c.id === st.clipId);
    const clipMediaDur = clipObj?.media?.duration || maxSourceDuration || 60;
    const maxAllowedSource = st.isMotionPhoto
      ? 60
      : Math.max(0.5, clipMediaDur, st.initSourceEnd + 30);
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
      // 1:1 Küçük Kareler Modunda canlı slot değişimi
      const slotSteps = Math.trunc(dxPx / TILE_SLOT_PX);
      if (slotSteps !== 0) {
        const targetIdx = Math.max(
          0,
          Math.min(clips.length - 1, st.clipIndex + slotSteps)
        );
        if (targetIdx !== st.clipIndex) {
          const movedSlots = targetIdx - st.clipIndex;
          onReorderClips(st.clipIndex, targetIdx);
          setInsertionIndex(targetIdx);
          const nextStartX = st.startX + movedSlots * TILE_SLOT_PX;
          dragRef.current = {
            ...st,
            clipIndex: targetIdx,
            startX: nextStartX,
          };
          setReorderOffsetPx(e.clientX - nextStartX);
          return;
        }
      }
      setReorderOffsetPx(dxPx);
    }
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    clearLongPressTimer();
    const st = dragRef.current;
    if (!st) return;
    e.stopPropagation();
    releaseOnRoot(e.pointerId);

    const activePreview = trimPreviewRef.current;
    dragRef.current = null;
    trimPreviewRef.current = null;
    setTrimPreview(null);
    // ÖNEMLİ: Parmak bırakıldığında aktif tutulan karo yerleşir ancak isReorderMode KAPANMAZ!
    setReorderingClipId(null);
    setInsertionIndex(null);
    setReorderOffsetPx(0);

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
      ref={rootContainerRef}
      className={`relative flex items-center select-none ${
        isReorderMode ? "w-full touch-none py-1" : "h-16"
      }`}
      onClick={(e) => e.stopPropagation()}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* KALICI 1:1 KÜÇÜK KARELER SIRALAMA MODU (Kullanıcı [✓ Bitti] diyene kadar açık kalır) */}
      {isReorderMode ? (
        <div className="flex flex-col gap-2 w-full bg-zinc-900/95 border border-white/20 rounded-2xl p-2.5 shadow-2xl touch-none">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Sıralama</span>
            </div>

            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                exitReorderMode();
              }}
              className="h-8 px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 shrink-0 active:scale-95 transition-all shadow-md"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Bitti</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1 px-0.5 touch-none">
            {clips.map((clip, idx) => {
              const isHeld = reorderingClipId === clip.id;
              const thumbSrc =
                clip.thumbnailUrl ||
                (thumbnails.length > 0
                  ? thumbnails[Math.min(thumbnails.length - 1, idx * 2)]
                  : null);

              return (
                <div
                  key={clip.id}
                  onPointerDown={(e) => handleTilePointerDown(e, clip, idx)}
                  style={{
                    transform: isHeld
                      ? `translate3d(${reorderOffsetPx}px, -4px, 0) scale(1.1)`
                      : "translate3d(0, 0, 0) scale(1)",
                  }}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-transform duration-75 cursor-grab active:cursor-grabbing touch-none select-none ${
                    isHeld
                      ? "border-emerald-400 ring-2 ring-emerald-400/60 shadow-[0_12px_28px_rgba(0,0,0,0.85)] z-40"
                      : insertionIndex === idx
                        ? "border-amber-400 opacity-95 z-20"
                        : "border-white/25 opacity-90 hover:border-white/50 z-10"
                  }`}
                >
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt=""
                      draggable={false}
                      className="w-full h-full object-cover pointer-events-none select-none"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-800" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
                  <span className="absolute top-1 left-1.5 px-1 py-0.2 rounded bg-black/75 text-[10px] font-extrabold text-amber-300 tabular-nums pointer-events-none">
                    #{idx + 1}
                  </span>
                  <span className="absolute bottom-1 right-1.5 text-[10px] font-bold text-white tabular-nums pointer-events-none">
                    {clip.duration.toFixed(1)}s
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* NORMAL MANYETİK ANA VİDEO KANALI + SONDAKİ [+] KLİP EKLEME BUTONU */
        <div className="flex items-center h-14">
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
              const thumbCount = Math.max(
                1,
                Math.min(
                  clip.thumbnailUrl ? 12 : thumbnails.length || 1,
                  Math.ceil(widthPx / 42)
                )
              );

              return (
                <div
                  key={clip.id}
                  className="flex items-center shrink-0 transition-[margin] duration-150"
                  style={{
                    marginLeft: leftGapPx > 0 ? `${leftGapPx}px` : "0px",
                    marginRight: rightGapPx > 0 ? `${rightGapPx}px` : "0px",
                  }}
                >
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectClip(clip.id);
                    }}
                    onPointerDown={(e) => handleClipBodyPointerDown(e, clip, idx)}
                    className="relative h-14 rounded-xl overflow-visible cursor-pointer shrink-0 z-10"
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
                      {clip.thumbnailUrl ? (
                        Array.from({ length: thumbCount }).map((_, tIdx) => (
                          <img
                            key={tIdx}
                            src={clip.thumbnailUrl}
                            alt=""
                            draggable={false}
                            className="h-full flex-1 object-cover pointer-events-none select-none opacity-90"
                          />
                        ))
                      ) : thumbnails.length > 0 ? (
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
                          onClick={(e) => e.stopPropagation()}
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
                          className="absolute top-1 right-2.5 px-1.5 py-0.5 rounded bg-black/75 border border-white/20 text-[9px] font-semibold text-zinc-200 flex items-center gap-1 cursor-grab active:cursor-grabbing z-20 touch-none"
                        >
                          <ArrowLeftRight className="w-2.5 h-2.5 text-amber-400" />
                          <span>Sırala</span>
                        </div>
                      )}
                    </div>

                    {/* Seçili Klip Sol ve Sağ Kırpma Kulakçıkları (Trim Handles) */}
                    {isSelected && (
                      <>
                        <div
                          onClick={(e) => e.stopPropagation()}
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
                          className="absolute -left-2 top-0 bottom-0 w-5 rounded-l-xl bg-amber-400 flex items-center justify-center cursor-ew-resize z-30 shadow-lg touch-none"
                        >
                          <div className="w-[2px] h-5 rounded-full bg-black/80" />
                        </div>

                        <div
                          onClick={(e) => e.stopPropagation()}
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
                          className="absolute -right-2 top-0 bottom-0 w-5 rounded-r-xl bg-amber-400 flex items-center justify-center cursor-ew-resize z-30 shadow-lg touch-none"
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

          {/* ANA BARIN SONUNA YENİ KLİP / GÖRSEL EKLEME [+] BUTONU */}
          {onAppendClipClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPauseVideo?.();
                onAppendClipClick();
              }}
              className="ml-2.5 w-11 h-11 rounded-xl bg-[#1c1c1e] hover:bg-[#28282d] border border-white/15 active:scale-95 transition-all flex items-center justify-center text-white shadow-md shrink-0"
            >
              <Plus className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
// [END] CREATED BY Bedirhan
