// [START] CREATED BY Bedirhan
"use client";

import React, { useRef, useState } from "react";
import {
  Music,
  Sparkles,
  Image as ImageIcon,
  Type,
  Sticker,
} from "lucide-react";
import {
  OverlayTrackItem,
  REELS_EFFECT_PRESETS,
  ReelsEffectClip,
  StoryAudioMeta,
} from "@/lib/canvas-editor";

export type NLESelectedType =
  | "video"
  | "text"
  | "sticker"
  | "photo"
  | "audio"
  | "effect"
  | null;

export interface TimelineOverlayTracksProps {
  totalDuration: number;
  pps: number;
  overlayItems: OverlayTrackItem[];
  effectClips: ReelsEffectClip[];
  musicClip: StoryAudioMeta | null;
  selectedItemId: string | null;
  selectedItemType: NLESelectedType;
  onSelectItem: (
    id: string | null,
    type: NLESelectedType,
    isSecondTap?: boolean
  ) => void;
  onChangeOverlayTiming: (layerId: string, start: number, end: number) => void;
  onReorderOverlayLayer?: (layerId: string, direction: "up" | "down") => void;
  onChangeEffectClips?: (clips: ReelsEffectClip[]) => void;
  onChangeMusicTimeline?: (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number,
    segmentId?: string
  ) => void;
  onPauseVideo?: () => void;
  onSeek?: (time: number) => void;
  onEdgeScroll?: (deltaPx: number) => void;
  onOpenMusicPicker?: () => void;
  onOpenTextEditor?: () => void;
  onQuickAddEffect?: () => void;
  onCommitHistory?: () => void;
}

type OverlayDragState = {
  targetKind: "overlay" | "effect" | "audio";
  mode: "left" | "right" | "move";
  id: string;
  itemType: NLESelectedType;
  startX: number;
  startY: number;
  initStart: number;
  initEnd: number;
  moved: boolean;
};

export default function TimelineOverlayTracks({
  totalDuration,
  pps,
  overlayItems,
  effectClips,
  musicClip,
  selectedItemId,
  selectedItemType,
  onSelectItem,
  onChangeOverlayTiming,
  onReorderOverlayLayer,
  onChangeEffectClips,
  onChangeMusicTimeline,
  onPauseVideo,
  onSeek,
  onEdgeScroll,
  onOpenMusicPicker,
  onOpenTextEditor,
  onQuickAddEffect,
  onCommitHistory,
}: TimelineOverlayTracksProps) {
  const dragRef = useRef<OverlayDragState | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elevatedItemId, setElevatedItemId] = useState<string | null>(null);

  const trackMaxSec = Math.max(10, Math.ceil(totalDuration + 10));
  const trackWidthPx = trackMaxSec * pps;

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const beginDrag = (
    e: React.PointerEvent,
    state: Omit<OverlayDragState, "moved">
  ) => {
    e.stopPropagation();
    clearLongPress();
    onPauseVideo?.();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    if (state.mode !== "move") {
      onCommitHistory?.();
    }
    dragRef.current = { ...state, moved: false };

    if (state.mode === "move") {
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(35);
          } catch {}
        }
        setElevatedItemId(state.id);
      }, 300);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st) return;
    e.stopPropagation();

    const dxPx = e.clientX - st.startX;
    const dyPx = e.clientY - st.startY;
    if (!st.moved) {
      if (Math.hypot(dxPx, dyPx) < 4) return;
      st.moved = true;
      if (st.mode === "move") {
        onCommitHistory?.();
      }
    }

    // Ekran kenarlarında otomatik yatay kaydırma (Edge Auto-Scroll)
    if (typeof window !== "undefined" && onEdgeScroll) {
      const edgeZone = 48;
      if (e.clientX > window.innerWidth - edgeZone) {
        onEdgeScroll(10);
        st.startX -= 10;
      } else if (e.clientX < edgeZone) {
        onEdgeScroll(-10);
        st.startX += 10;
      }
    }

    const dtSec = (e.clientX - st.startX) / Math.max(20, pps);
    const maxSec = Math.max(totalDuration + 15, 60);

    // Dikey sürükleme ile katman sırası (Z-Index / satır sırası) değiştirme
    if (
      st.targetKind === "overlay" &&
      st.mode === "move" &&
      onReorderOverlayLayer &&
      overlayItems.length > 1
    ) {
      if (dyPx < -32) {
        onReorderOverlayLayer(st.id, "down");
        dragRef.current = { ...st, startY: e.clientY };
      } else if (dyPx > 32) {
        onReorderOverlayLayer(st.id, "up");
        dragRef.current = { ...st, startY: e.clientY };
      }
    }

    let nextStart = st.initStart;
    let nextEnd = st.initEnd;
    const span = Math.max(0.3, st.initEnd - st.initStart);

    if (st.mode === "left") {
      nextStart = Math.max(0, Math.min(st.initStart + dtSec, st.initEnd - 0.3));
    } else if (st.mode === "right") {
      nextEnd = Math.max(st.initStart + 0.3, Math.min(st.initEnd + dtSec, maxSec));
    } else if (st.mode === "move") {
      nextStart = Math.max(0, Math.min(st.initStart + dtSec, maxSec - span));
      nextEnd = nextStart + span;
    }

    const sRounded = Number(nextStart.toFixed(2));
    const eRounded = Number(nextEnd.toFixed(2));

    if (st.targetKind === "overlay") {
      onChangeOverlayTiming(st.id, sRounded, eRounded);
    } else if (st.targetKind === "effect" && onChangeEffectClips) {
      onChangeEffectClips(
        effectClips.map((c) =>
          c.id === st.id ? { ...c, startTime: sRounded, endTime: eRounded } : c
        )
      );
    } else if (st.targetKind === "audio" && onChangeMusicTimeline) {
      onChangeMusicTimeline(sRounded, eRounded, undefined, st.id);
    }

    if (st.mode === "left") {
      onSeek?.(sRounded);
    } else if (st.mode === "right") {
      onSeek?.(eRounded);
    }
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    clearLongPress();
    setElevatedItemId(null);
    const st = dragRef.current;
    if (!st) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;

    // Seçili bir öğeye sürüklemeden 2. kez tıklandığında ilgili düzenleme menüsünü aç
    if (!st.moved && st.mode === "move") {
      onSelectItem(st.id, st.itemType, true);
    }
  };

  const musicStart =
    musicClip && typeof musicClip.timelineStart === "number"
      ? Math.max(0, musicClip.timelineStart)
      : 0;
  const musicEnd =
    musicClip &&
    typeof musicClip.timelineEnd === "number" &&
    musicClip.timelineEnd > musicStart
      ? musicClip.timelineEnd
      : Math.max(musicStart + 1, totalDuration);

  const audioSegments =
    musicClip?.segments && musicClip.segments.length > 0
      ? musicClip.segments
      : musicClip
        ? [
            {
              id: musicClip.id || "audio_main",
              timelineStart: musicStart,
              timelineEnd: musicEnd,
              songOffset: musicClip.startTime || 0,
            },
          ]
        : [];

  return (
    <div
      className="flex flex-col gap-1.5 select-none"
      style={{ width: `${trackWidthPx}px` }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* 1. Fotoğraf (PIP), Metin ve Sticker Serbest Zamanlı Katman Satırları */}
      {overlayItems.length > 0 ? (
        <div className="flex flex-col gap-1">
          {overlayItems.map((item) => {
            const leftPx = Math.max(0, item.timelineStart * pps);
            const widthPx = Math.max(
              28,
              (item.timelineEnd - item.timelineStart) * pps
            );
            const isSelected =
              selectedItemId === item.layerId && selectedItemType === item.type;
            const isElevated = elevatedItemId === item.layerId;

            const barBg =
              item.type === "photo"
                ? "bg-purple-600/85"
                : item.type === "sticker"
                  ? "bg-emerald-600/85"
                  : "bg-amber-500/90";

            return (
              <div key={item.id} className="relative h-8 w-full">
                <div
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    // 1. Tıklama: Yalnızca seçer (menü açılmaz, bar kaymaz)
                    if (!isSelected) {
                      e.stopPropagation();
                      onPauseVideo?.();
                      onSelectItem(item.layerId, item.type, false);
                      return;
                    }
                    // Seçiliyken: Sürüklenirse taşır, sürüklenmeden bırakılırsa 2. tıklama menüsünü açar
                    beginDrag(e, {
                      targetKind: "overlay",
                      mode: "move",
                      id: item.layerId,
                      itemType: item.type,
                      startX: e.clientX,
                      startY: e.clientY,
                      initStart: item.timelineStart,
                      initEnd: item.timelineEnd,
                    });
                  }}
                  className={`absolute top-0 bottom-0 rounded-lg flex items-center px-2.5 gap-1.5 touch-none transition-transform duration-150 ${
                    isSelected
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-pointer"
                  } ${barBg} ${
                    isElevated
                      ? "scale-[1.03] ring-2 ring-blue-400 shadow-[0_8px_24px_rgba(0,0,0,0.75)] z-30"
                      : isSelected
                        ? "ring-2 ring-white shadow-lg z-20"
                        : "border border-white/20 opacity-95 hover:opacity-100 z-10"
                  }`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${widthPx}px`,
                  }}
                >
                  {item.type === "photo" && item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="w-4 h-4 rounded object-cover shrink-0 pointer-events-none"
                    />
                  ) : item.type === "photo" ? (
                    <ImageIcon className="w-3.5 h-3.5 text-white shrink-0 pointer-events-none" />
                  ) : item.type === "sticker" ? (
                    <Sticker className="w-3.5 h-3.5 text-white shrink-0 pointer-events-none" />
                  ) : (
                    <Type className="w-3.5 h-3.5 text-black shrink-0 pointer-events-none" />
                  )}

                  <span
                    className={`text-[11px] font-bold truncate pointer-events-none ${
                      item.type === "text" ? "text-black" : "text-white"
                    }`}
                  >
                    {item.label}
                  </span>

                  {/* Sol ve Sağ Uzatma/Kısaltma Kulakçıkları */}
                  {isSelected && (
                    <>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          beginDrag(e, {
                            targetKind: "overlay",
                            mode: "left",
                            id: item.layerId,
                            itemType: item.type,
                            startX: e.clientX,
                            startY: e.clientY,
                            initStart: item.timelineStart,
                            initEnd: item.timelineEnd,
                          })
                        }
                        className="absolute -left-1.5 top-0 bottom-0 w-3.5 rounded-l-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow"
                      >
                        <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                      </div>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          beginDrag(e, {
                            targetKind: "overlay",
                            mode: "right",
                            id: item.layerId,
                            itemType: item.type,
                            startX: e.clientX,
                            startY: e.clientY,
                            initStart: item.timelineStart,
                            initEnd: item.timelineEnd,
                          })
                        }
                        className="absolute -right-1.5 top-0 bottom-0 w-3.5 rounded-r-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow"
                      >
                        <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative h-7 w-full">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenTextEditor?.();
            }}
            style={{ width: `${Math.max(120, totalDuration * pps)}px` }}
            className="h-7 rounded-lg bg-[#16171b] hover:bg-[#1e2026] border border-white/5 px-3 flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium transition-colors"
          >
            <Type className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>+ Metin veya Çıkartma ekle</span>
          </button>
        </div>
      )}

      {/* 2. Efekt (FX) Çok Şeritli (Multi-Lane) Serbest Zamanlı Kanalı */}
      {(() => {
        if (effectClips.length === 0) {
          return (
            <div className="relative h-7 w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPauseVideo?.();
                  onQuickAddEffect?.();
                }}
                style={{ width: `${Math.max(120, totalDuration * pps)}px` }}
                className="h-7 rounded-lg bg-[#16171b] hover:bg-[#1e2026] border border-white/5 px-3 flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <span>+ Efekt ekle</span>
              </button>
            </div>
          );
        }

        // Çakışan efektleri otomatik alt şeritlere (Multi-Lane) ayır
        const lanes: ReelsEffectClip[][] = [];
        for (const fx of effectClips) {
          let placed = false;
          for (const lane of lanes) {
            const hasOverlap = lane.some(
              (existing) =>
                !(
                  fx.endTime <= existing.startTime + 0.02 ||
                  fx.startTime >= existing.endTime - 0.02
                )
            );
            if (!hasOverlap) {
              lane.push(fx);
              placed = true;
              break;
            }
          }
          if (!placed) {
            lanes.push([fx]);
          }
        }

        return (
          <div className="flex flex-col gap-1">
            {lanes.map((laneClips, laneIdx) => (
              <div key={`fx_lane_${laneIdx}`} className="relative h-8 w-full">
                {laneClips.map((fx) => {
                  const preset = REELS_EFFECT_PRESETS.find(
                    (p) => p.id === fx.effect
                  );
                  const leftPx = Math.max(0, fx.startTime * pps);
                  const widthPx = Math.max(28, (fx.endTime - fx.startTime) * pps);
                  const isSelected =
                    selectedItemId === fx.id && selectedItemType === "effect";
                  const isElevated = elevatedItemId === fx.id;

                  return (
                    <div
                      key={fx.id}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        // 1. Tıklama: Yalnızca seçer (menü açılmaz, bar kaymaz)
                        if (!isSelected) {
                          e.stopPropagation();
                          onPauseVideo?.();
                          onSelectItem(fx.id, "effect", false);
                          return;
                        }
                        // Seçiliyken: Sürüklenirse taşır, sürüklenmeden bırakılırsa 2. tıklama menüsünü açar
                        beginDrag(e, {
                          targetKind: "effect",
                          mode: "move",
                          id: fx.id,
                          itemType: "effect",
                          startX: e.clientX,
                          startY: e.clientY,
                          initStart: fx.startTime,
                          initEnd: fx.endTime,
                        });
                      }}
                      className={`absolute top-0 bottom-0 rounded-lg flex items-center px-2.5 gap-1.5 touch-none transition-transform duration-150 ${
                        isSelected
                          ? "cursor-grab active:cursor-grabbing"
                          : "cursor-pointer"
                      } ${
                        isElevated
                          ? "scale-[1.03] ring-2 ring-blue-400 shadow-2xl z-30"
                          : isSelected
                            ? "ring-2 ring-white shadow-lg z-20"
                            : "border border-white/20 opacity-90 z-10"
                      }`}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                        backgroundColor: preset?.color
                          ? `${preset.color}cc`
                          : "#ec4899cc",
                      }}
                    >
                      <Sparkles className="w-3 h-3 text-white shrink-0 pointer-events-none" />
                      <span className="text-[11px] font-bold text-white truncate pointer-events-none">
                        {preset?.name || fx.effect}
                      </span>

                      {isSelected && (
                        <>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) =>
                              beginDrag(e, {
                                targetKind: "effect",
                                mode: "left",
                                id: fx.id,
                                itemType: "effect",
                                startX: e.clientX,
                                startY: e.clientY,
                                initStart: fx.startTime,
                                initEnd: fx.endTime,
                              })
                            }
                            className="absolute -left-1.5 top-0 bottom-0 w-4 rounded-l-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none"
                          >
                            <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                          </div>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) =>
                              beginDrag(e, {
                                targetKind: "effect",
                                mode: "right",
                                id: fx.id,
                                itemType: "effect",
                                startX: e.clientX,
                                startY: e.clientY,
                                initStart: fx.startTime,
                                initEnd: fx.endTime,
                              })
                            }
                            className="absolute -right-1.5 top-0 bottom-0 w-4 rounded-r-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none"
                          >
                            <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {/* 3. Ses / Müzik (Waveform) Serbest Zamanlı Kanalı (Çoklu / Bölünmüş Parça Desteği) */}
      <div className="relative h-8 w-full">
        {musicClip && audioSegments.length > 0 ? (
          audioSegments.map((seg, segIdx) => {
            const isSelected =
              selectedItemType === "audio" &&
              (selectedItemId === seg.id ||
                (audioSegments.length === 1 && !selectedItemId));
            const isElevated = elevatedItemId === seg.id;
            const segLeftPx = Math.max(0, seg.timelineStart * pps);
            const segWidthPx = Math.max(
              32,
              (seg.timelineEnd - seg.timelineStart) * pps
            );

            return (
              <div
                key={seg.id}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  // 1. Tıklama: Yalnızca seçer (menü açılmaz, bar kaymaz)
                  if (!isSelected) {
                    e.stopPropagation();
                    onPauseVideo?.();
                    onSelectItem(seg.id, "audio", false);
                    return;
                  }
                  // Seçiliyken: Sürüklenirse taşır, sürüklenmeden bırakılırsa 2. tıklama menüsünü açar
                  beginDrag(e, {
                    targetKind: "audio",
                    mode: "move",
                    id: seg.id,
                    itemType: "audio",
                    startX: e.clientX,
                    startY: e.clientY,
                    initStart: seg.timelineStart,
                    initEnd: seg.timelineEnd,
                  });
                }}
                className={`absolute top-0 bottom-0 rounded-lg bg-sky-600/80 flex items-center px-2.5 gap-2 touch-none overflow-visible transition-transform duration-150 ${
                  isSelected
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-pointer"
                } ${
                  isElevated
                    ? "scale-[1.03] ring-2 ring-blue-400 shadow-2xl z-30"
                    : isSelected
                      ? "ring-2 ring-white shadow-lg z-20"
                      : "border border-sky-300/30 z-10"
                }`}
                style={{
                  left: `${segLeftPx}px`,
                  width: `${segWidthPx}px`,
                }}
              >
                <Music className="w-3.5 h-3.5 text-white shrink-0 pointer-events-none" />
                <span className="text-[11px] font-bold text-white truncate pointer-events-none">
                  {audioSegments.length > 1
                    ? `${musicClip.title} #${segIdx + 1}`
                    : musicClip.title}
                </span>

                {/* Ses Dalgası (Waveform) Görselleştirmesi */}
                <div className="flex items-center gap-[2px] flex-1 h-4 overflow-hidden opacity-60 pointer-events-none">
                  {Array.from({ length: 36 }).map((_, i) => {
                    const h = 25 + (((i + segIdx * 7) * 37) % 70);
                    return (
                      <div
                        key={i}
                        className="w-[2px] bg-sky-100 rounded-full shrink-0"
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}
                </div>

                {isSelected && (
                  <>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) =>
                        beginDrag(e, {
                          targetKind: "audio",
                          mode: "left",
                          id: seg.id,
                          itemType: "audio",
                          startX: e.clientX,
                          startY: e.clientY,
                          initStart: seg.timelineStart,
                          initEnd: seg.timelineEnd,
                        })
                      }
                      className="absolute -left-1.5 top-0 bottom-0 w-3.5 rounded-l-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow"
                    >
                      <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) =>
                        beginDrag(e, {
                          targetKind: "audio",
                          mode: "right",
                          id: seg.id,
                          itemType: "audio",
                          startX: e.clientX,
                          startY: e.clientY,
                          initStart: seg.timelineStart,
                          initEnd: seg.timelineEnd,
                        })
                      }
                      className="absolute -right-1.5 top-0 bottom-0 w-3.5 rounded-r-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow"
                    >
                      <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                    </div>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenMusicPicker?.();
            }}
            style={{ width: `${Math.max(120, totalDuration * pps)}px` }}
            className="h-7 rounded-lg bg-[#16171b] hover:bg-[#1e2026] border border-white/5 px-3 flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium transition-colors"
          >
            <Music className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>+ Ses / Müzik ekle</span>
          </button>
        )}
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
