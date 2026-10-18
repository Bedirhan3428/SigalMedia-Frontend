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
  onCommitHistory?: () => void;
}

type ClipDragState = {
  mode: "trim-left" | "trim-right" | "reorder";
  clipId: string;
  clipIndex: number;
  startX: number;
  initSourceStart: number;
  initSourceEnd: number;
  playbackRate: number;
  isMotionPhoto?: boolean;
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
  onCommitHistory,
}: TimelineTrackClipsProps) {
  const dragRef = useRef<ClipDragState | null>(null);
  const [reorderingClipId, setReorderingClipId] = useState<string | null>(null);

  const beginClipDrag = (
    e: React.PointerEvent,
    state: ClipDragState
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onCommitHistory?.();
    onSelectClip(state.clipId);
    dragRef.current = state;
    if (state.mode === "reorder") {
      setReorderingClipId(state.clipId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st) return;
    e.stopPropagation();

    const dxPx = e.clientX - st.startX;
    const dtTimelineSec = dxPx / Math.max(20, pps);
    const dtSourceSec = dtTimelineSec * (st.playbackRate || 1.0);
    const maxAllowedSource = st.isMotionPhoto
      ? 60
      : Math.max(0.5, maxSourceDuration || 60);

    if (st.mode === "trim-left") {
      const nextStart = Math.max(
        0,
        Math.min(st.initSourceStart + dtSourceSec, st.initSourceEnd - 0.3)
      );
      onTrimClip(st.clipId, Number(nextStart.toFixed(2)), st.initSourceEnd);
      return;
    }

    if (st.mode === "trim-right") {
      const nextEnd = Math.max(
        st.initSourceStart + 0.3,
        Math.min(st.initSourceEnd + dtSourceSec, maxAllowedSource)
      );
      onTrimClip(st.clipId, st.initSourceStart, Number(nextEnd.toFixed(2)));
      return;
    }

    if (st.mode === "reorder") {
      const thresholdPx = Math.max(40, (st.initSourceEnd - st.initSourceStart) * pps * 0.55);
      if (dxPx > thresholdPx && st.clipIndex < clips.length - 1) {
        onReorderClips(st.clipIndex, st.clipIndex + 1);
        dragRef.current = {
          ...st,
          clipIndex: st.clipIndex + 1,
          startX: e.clientX,
        };
      } else if (dxPx < -thresholdPx && st.clipIndex > 0) {
        onReorderClips(st.clipIndex, st.clipIndex - 1);
        dragRef.current = {
          ...st,
          clipIndex: st.clipIndex - 1,
          startX: e.clientX,
        };
      }
    }
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
    setReorderingClipId(null);
  };

  return (
    <div
      className="relative h-14 flex items-center select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* Manyetik Ana Video Kanalı: Parçalar boşluksuz (2px ayrım çizgisiyle) yan yana dizilir */}
      <div className="flex items-center h-14 gap-[2px] bg-black/80 rounded-xl">
        {clips.map((clip, idx) => {
          const widthPx = Math.max(28, Math.round(clip.duration * pps));
          const isSelected = selectedClipId === clip.id;
          const isReordering = reorderingClipId === clip.id;
          const thumbCount = Math.max(1, Math.min(thumbnails.length || 1, Math.ceil(widthPx / 42)));

          return (
            <div
              key={clip.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectClip(clip.id);
              }}
              className={`relative h-14 rounded-xl overflow-visible transition-transform duration-150 cursor-pointer shrink-0 ${
                isReordering ? "scale-[1.04] z-30 opacity-90 shadow-2xl" : "z-10"
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
                          Math.floor((tIdx / Math.max(1, thumbCount)) * thumbnails.length)
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
                    {clip.duration.toFixed(1)}s
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
          );
        })}
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
