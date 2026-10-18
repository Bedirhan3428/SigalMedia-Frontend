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
  onSelectItem: (id: string | null, type: NLESelectedType) => void;
  onChangeOverlayTiming: (layerId: string, start: number, end: number) => void;
  onReorderOverlayLayer?: (layerId: string, direction: "up" | "down") => void;
  onChangeEffectClips?: (clips: ReelsEffectClip[]) => void;
  onChangeMusicTimeline?: (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number
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

  const beginDrag = (e: React.PointerEvent, state: OverlayDragState) => {
    e.stopPropagation();
    clearLongPress();
    onPauseVideo?.();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    onCommitHistory?.();
    onSelectItem(state.id, state.itemType);
    dragRef.current = state;

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

    const dxPx = e.clientX - st.startX;
    const dyPx = e.clientY - st.startY;
    const dtSec = dxPx / Math.max(20, pps);
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
      onChangeMusicTimeline(sRounded, eRounded);
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
    if (!dragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectItem(item.layerId, item.type);
                  }}
                  onPointerDown={(e) =>
                    beginDrag(e, {
                      targetKind: "overlay",
                      mode: "move",
                      id: item.layerId,
                      itemType: item.type,
                      startX: e.clientX,
                      startY: e.clientY,
                      initStart: item.timelineStart,
                      initEnd: item.timelineEnd,
                    })
                  }
                  className={`absolute top-0 bottom-0 rounded-lg flex items-center px-2.5 gap-1.5 cursor-grab active:cursor-grabbing touch-none transition-transform duration-150 ${barBg} ${
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

      {/* 2. Efekt (FX) Serbest Zamanlı Kanalı */}
      <div className="relative h-8 w-full">
        {effectClips.length > 0 ? (
          effectClips.map((fx) => {
            const preset = REELS_EFFECT_PRESETS.find((p) => p.id === fx.effect);
            const leftPx = Math.max(0, fx.startTime * pps);
            const widthPx = Math.max(28, (fx.endTime - fx.startTime) * pps);
            const isSelected =
              selectedItemId === fx.id && selectedItemType === "effect";
            const isElevated = elevatedItemId === fx.id;

            return (
              <div
                key={fx.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(fx.id, "effect");
                }}
                onPointerDown={(e) =>
                  beginDrag(e, {
                    targetKind: "effect",
                    mode: "move",
                    id: fx.id,
                    itemType: "effect",
                    startX: e.clientX,
                    startY: e.clientY,
                    initStart: fx.startTime,
                    initEnd: fx.endTime,
                  })
                }
                className={`absolute top-0 bottom-0 rounded-lg flex items-center px-2.5 gap-1.5 cursor-grab active:cursor-grabbing touch-none transition-transform duration-150 ${
                  isElevated
                    ? "scale-[1.03] ring-2 ring-blue-400 shadow-2xl z-30"
                    : isSelected
                      ? "ring-2 ring-white shadow-lg z-20"
                      : "border border-white/20 opacity-90 z-10"
                }`}
                style={{
                  left: `${leftPx}px`,
                  width: `${widthPx}px`,
                  backgroundColor: preset?.color ? `${preset.color}cc` : "#ec4899cc",
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
                      className="absolute -left-1.5 top-0 bottom-0 w-3.5 rounded-l-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow"
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
              onQuickAddEffect?.();
            }}
            style={{ width: `${Math.max(120, totalDuration * pps)}px` }}
            className="h-7 rounded-lg bg-[#16171b] hover:bg-[#1e2026] border border-white/5 px-3 flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0" />
            <span>+ Efekt ekle</span>
          </button>
        )}
      </div>

      {/* 3. Ses / Müzik (Waveform) Serbest Zamanlı Kanalı */}
      <div className="relative h-8 w-full">
        {musicClip ? (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelectItem(musicClip.id || "audio_main", "audio");
            }}
            onPointerDown={(e) =>
              beginDrag(e, {
                targetKind: "audio",
                mode: "move",
                id: musicClip.id || "audio_main",
                itemType: "audio",
                startX: e.clientX,
                startY: e.clientY,
                initStart: musicStart,
                initEnd: musicEnd,
              })
            }
            className={`absolute top-0 bottom-0 rounded-lg bg-sky-600/80 flex items-center px-2.5 gap-2 cursor-grab active:cursor-grabbing touch-none overflow-visible transition-transform duration-150 ${
              elevatedItemId === (musicClip.id || "audio_main")
                ? "scale-[1.03] ring-2 ring-blue-400 shadow-2xl z-30"
                : selectedItemType === "audio"
                  ? "ring-2 ring-white shadow-lg z-20"
                  : "border border-sky-300/30 z-10"
            }`}
            style={{
              left: `${musicStart * pps}px`,
              width: `${Math.max(32, (musicEnd - musicStart) * pps)}px`,
            }}
          >
            <Music className="w-3.5 h-3.5 text-white shrink-0 pointer-events-none" />
            <span className="text-[11px] font-bold text-white truncate pointer-events-none">
              {musicClip.title}
            </span>

            {/* Ses Dalgası (Waveform) Görselleştirmesi */}
            <div className="flex items-center gap-[2px] flex-1 h-4 overflow-hidden opacity-60 pointer-events-none">
              {Array.from({ length: 36 }).map((_, i) => {
                const h = 25 + ((i * 37) % 70);
                return (
                  <div
                    key={i}
                    className="w-[2px] bg-sky-100 rounded-full shrink-0"
                    style={{ height: `${h}%` }}
                  />
                );
              })}
            </div>

            {selectedItemType === "audio" && (
              <>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) =>
                    beginDrag(e, {
                      targetKind: "audio",
                      mode: "left",
                      id: musicClip.id || "audio_main",
                      itemType: "audio",
                      startX: e.clientX,
                      startY: e.clientY,
                      initStart: musicStart,
                      initEnd: musicEnd,
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
                      id: musicClip.id || "audio_main",
                      itemType: "audio",
                      startX: e.clientX,
                      startY: e.clientY,
                      initStart: musicStart,
                      initEnd: musicEnd,
                    })
                  }
                  className="absolute -right-1.5 top-0 bottom-0 w-3.5 rounded-r-lg bg-white flex items-center justify-center cursor-ew-resize z-30 shadow"
                >
                  <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                </div>
              </>
            )}
          </div>
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
