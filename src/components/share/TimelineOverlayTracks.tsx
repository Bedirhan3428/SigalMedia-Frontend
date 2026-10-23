// [START] CREATED BY Bedirhan
"use client";

import React, { useRef, useState } from "react";
import {
  Music,
  Image as ImageIcon,
  Type,
} from "lucide-react";
import { BsStars } from "react-icons/bs";
import { PiStickerLight } from "react-icons/pi";
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
  onPanScroll?: (deltaPx: number) => void;
}

const DRAG_THRESHOLD_PX = 8;

type OverlayDragState = {
  targetKind: "overlay" | "effect" | "audio";
  mode: "left" | "right" | "move";
  id: string;
  itemType: NLESelectedType;
  startX: number;
  startY: number;
  initStart: number;
  initEnd: number;
  pointerId: number;
  dragStarted: boolean;
};

type ItemPressState = {
  targetKind: "overlay" | "effect" | "audio";
  id: string;
  itemType: NLESelectedType;
  startX: number;
  startY: number;
  lastX: number;
  initStart: number;
  initEnd: number;
  isSelected: boolean;
  hasMoved: boolean;
  pointerId: number;
  targetEl: HTMLElement;
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
  onPanScroll,
}: TimelineOverlayTracksProps) {
  const rootTrackContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<OverlayDragState | null>(null);
  const pressRef = useRef<ItemPressState | null>(null);
  const suppressClickRef = useRef<boolean>(false);
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

  const beginHandleDrag = (
    e: React.PointerEvent,
    state: {
      targetKind: "overlay" | "effect" | "audio";
      mode: "left" | "right";
      id: string;
      itemType: NLESelectedType;
      initStart: number;
      initEnd: number;
    }
  ) => {
    e.stopPropagation();
    clearLongPress();
    onPauseVideo?.();
    try {
      rootTrackContainerRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    onCommitHistory?.();
    dragRef.current = {
      ...state,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      dragStarted: false,
    };
  };

  const handleItemPointerDown = (
    e: React.PointerEvent,
    info: {
      targetKind: "overlay" | "effect" | "audio";
      id: string;
      itemType: NLESelectedType;
      initStart: number;
      initEnd: number;
      isSelected: boolean;
    }
  ) => {
    clearLongPress();
    pressRef.current = {
      ...info,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      pointerId: e.pointerId,
      targetEl: e.currentTarget as HTMLElement,
      hasMoved: false,
    };

    // Seçili öğe: mobilde parmak bar dışına çıksa da hareket kaybolmasın diye hemen yakala
    if (info.isSelected) {
      e.stopPropagation();
      try {
        rootTrackContainerRef.current?.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 1. Öğeye basıldığında kaydırma hareketi var mı kontrol et (Min 8px Eşik)
    const pr = pressRef.current;
    if (pr && !dragRef.current) {
      // Seçili öğe üzerindeki hareket timeline'ı kaydırmasın
      if (pr.isSelected) e.stopPropagation();
      const moveDist = Math.hypot(e.clientX - pr.startX, e.clientY - pr.startY);
      if (moveDist >= DRAG_THRESHOLD_PX) {
        pr.hasMoved = true;
        clearLongPress();

        // Seçili öğe doğrudan sürüklenerek taşınır (mobilde uzun basma gerekmez)
        if (pr.isSelected) {
          onPauseVideo?.();
          onCommitHistory?.();
          setElevatedItemId(pr.id);
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try {
              navigator.vibrate(20);
            } catch {}
          }
          dragRef.current = {
            targetKind: pr.targetKind,
            mode: "move",
            id: pr.id,
            itemType: pr.itemType,
            startX: pr.startX,
            startY: pr.startY,
            initStart: pr.initStart,
            initEnd: pr.initEnd,
            pointerId: pr.pointerId,
            dragStarted: true,
          };
        } else {
          // Öğe seçili değilken veya henüz havaya kaldırılmamışken:
          // Text bar / bileşen üzerinde yatay kaydırma -> Timeline Pan Scroll!
          const dx = e.clientX - pr.lastX;
          pr.lastX = e.clientX;
          if (onPanScroll) {
            onPanScroll(dx);
          }
        }
      }
    }

    // 2. Aktif sürükleme (tutamaçla uzatma/kısaltma veya seçili öğeyi taşıma)
    const st = dragRef.current;
    if (!st) return;

    const dxPx = e.clientX - st.startX;
    const dyPx = e.clientY - st.startY;

    // Tutamaçlarda da ilk dokunuşta sıçramayı önleyen min eşik kontrolü:
    if (!st.dragStarted) {
      if (Math.abs(dxPx) < DRAG_THRESHOLD_PX && Math.abs(dyPx) < DRAG_THRESHOLD_PX) {
        return; // Eşik aşılana kadar süre veya pozisyon kaymaz!
      }
      st.dragStarted = true;
    }

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

    // Eşik sonrası ani atlama (pop) olmaksızın 0'dan başlayan pürüzsüz delta:
    const effectiveDx =
      dxPx > 0 ? dxPx - DRAG_THRESHOLD_PX : dxPx + DRAG_THRESHOLD_PX;
    const dtSec = effectiveDx / Math.max(20, pps);
    const maxSec = Math.max(totalDuration + 15, 60);

    let nextStart = st.initStart;
    let nextEnd = st.initEnd;
    const span = Math.max(0.3, st.initEnd - st.initStart);

    let minBound = 0;
    let maxBound = maxSec;

    // Efekt kliplerinin birbirinin üzerine kaymasını ve çakışmasını kesin olarak engelle
    if (st.targetKind === "effect") {
      const otherEffects = effectClips.filter((c) => c.id !== st.id);
      for (let i = 0; i < otherEffects.length; i++) {
        const other = otherEffects[i];
        if (other.endTime <= st.initStart + 0.05 && other.endTime > minBound) {
          minBound = other.endTime;
        }
        if (other.startTime >= st.initEnd - 0.05 && other.startTime < maxBound) {
          maxBound = other.startTime;
        }
      }
    }

    if (st.mode === "left") {
      nextStart = Math.max(minBound, Math.min(st.initStart + dtSec, st.initEnd - 0.3));
    } else if (st.mode === "right") {
      nextEnd = Math.max(st.initStart + 0.3, Math.min(st.initEnd + dtSec, maxBound));
    } else if (st.mode === "move") {
      nextStart = Math.max(minBound, Math.min(st.initStart + dtSec, maxBound - span));
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

    const pr = pressRef.current;
    if (pr) {
      // Eğer parmak eşik kadar kaymadıysa: sabit, hafif bir dokunuş/tıklama ile öğeyi seç
      if (!pr.hasMoved) {
        e.stopPropagation();
        onPauseVideo?.();
        onSelectItem(pr.id, pr.itemType);
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 180);
      } else {
        // Parmak kaydıysa bu bir timeline scroll hareketidir; tıklamayı yut
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 180);
      }
      pressRef.current = null;
    }

    if (dragRef.current) {
      try {
        rootTrackContainerRef.current?.releasePointerCapture(dragRef.current.pointerId);
      } catch {}
      dragRef.current = null;
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
      ref={rootTrackContainerRef}
      className="flex flex-col gap-1.5 select-none"
      style={{ width: `${trackWidthPx}px`, WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
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
                    if (suppressClickRef.current) return;
                    onSelectItem(item.layerId, item.type);
                  }}
                  onPointerDown={(e) => {
                    handleItemPointerDown(e, {
                      targetKind: "overlay",
                      id: item.layerId,
                      itemType: item.type,
                      initStart: item.timelineStart,
                      initEnd: item.timelineEnd,
                      isSelected,
                    });
                  }}
                  className={`absolute top-0 bottom-0 rounded flex items-center px-2.5 gap-1.5 ${isSelected ? "touch-none" : "touch-pan-x"} select-none transition-transform duration-150 ${
                    isSelected
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-pointer"
                  } ${barBg} ${
                    isElevated
                      ? "scale-[1.03] ring-2 ring-inset ring-blue-400 shadow-[0_8px_24px_rgba(0,0,0,0.75)] z-30"
                      : isSelected
                        ? "ring-2 ring-inset ring-white shadow-lg z-20"
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
                    <PiStickerLight className="w-3.5 h-3.5 text-white shrink-0 pointer-events-none" />
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
                          beginHandleDrag(e, {
                            targetKind: "overlay",
                            mode: "left",
                            id: item.layerId,
                            itemType: item.type,
                            initStart: item.timelineStart,
                            initEnd: item.timelineEnd,
                          })
                        }
                        className="absolute -left-1.5 w-3.5 rounded-l bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none before:absolute before:content-[''] before:-inset-x-2.5 before:-inset-y-1.5"
                        style={{ top: 0, bottom: 0, height: "100%" }}
                      >
                        <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                      </div>
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          beginHandleDrag(e, {
                            targetKind: "overlay",
                            mode: "right",
                            id: item.layerId,
                            itemType: item.type,
                            initStart: item.timelineStart,
                            initEnd: item.timelineEnd,
                          })
                        }
                        className="absolute -right-1.5 w-3.5 rounded-r bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none before:absolute before:content-[''] before:-inset-x-2.5 before:-inset-y-1.5"
                        style={{ top: 0, bottom: 0, height: "100%" }}
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
            className="h-7 rounded bg-[#16171b] hover:bg-[#1e2026] border border-white/5 px-3 flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium transition-colors"
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
                className="h-7 rounded bg-[#16171b] hover:bg-[#1e2026] border border-white/5 px-3 flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium transition-colors"
              >
                <BsStars className="w-3.5 h-3.5 text-pink-400 shrink-0" />
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
                      onClick={(e) => {
                        e.stopPropagation();
                        if (suppressClickRef.current) return;
                        onSelectItem(fx.id, "effect");
                      }}
                      onPointerDown={(e) => {
                        handleItemPointerDown(e, {
                          targetKind: "effect",
                          id: fx.id,
                          itemType: "effect",
                          initStart: fx.startTime,
                          initEnd: fx.endTime,
                          isSelected,
                        });
                      }}
                      className={`absolute top-0 bottom-0 rounded flex items-center px-2.5 gap-1.5 ${isSelected ? "touch-none" : "touch-pan-x"} select-none transition-transform duration-150 ${
                        isSelected
                          ? "cursor-grab active:cursor-grabbing"
                          : "cursor-pointer"
                      } ${
                        isElevated
                          ? "scale-[1.03] ring-2 ring-inset ring-blue-400 shadow-2xl z-30"
                          : isSelected
                            ? "ring-2 ring-inset ring-white shadow-lg z-20"
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
                      <BsStars className="w-3 h-3 text-white shrink-0 pointer-events-none" />
                      <span className="text-[11px] font-bold text-white truncate pointer-events-none">
                        {preset?.name || fx.effect}
                      </span>

                      {isSelected && (
                        <>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) =>
                              beginHandleDrag(e, {
                                targetKind: "effect",
                                mode: "left",
                                id: fx.id,
                                itemType: "effect",
                                initStart: fx.startTime,
                                initEnd: fx.endTime,
                              })
                            }
                            className="absolute -left-1.5 w-4 rounded-l bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none before:absolute before:content-[''] before:-inset-x-2.5 before:-inset-y-1.5"
                            style={{ top: 0, bottom: 0, height: "100%" }}
                          >
                            <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                          </div>
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) =>
                              beginHandleDrag(e, {
                                targetKind: "effect",
                                mode: "right",
                                id: fx.id,
                                itemType: "effect",
                                initStart: fx.startTime,
                                initEnd: fx.endTime,
                              })
                            }
                            className="absolute -right-1.5 w-4 rounded-r bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none before:absolute before:content-[''] before:-inset-x-2.5 before:-inset-y-1.5"
                            style={{ top: 0, bottom: 0, height: "100%" }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  if (suppressClickRef.current) return;
                  onSelectItem(seg.id, "audio");
                }}
                onPointerDown={(e) => {
                  handleItemPointerDown(e, {
                    targetKind: "audio",
                    id: seg.id,
                    itemType: "audio",
                    initStart: seg.timelineStart,
                    initEnd: seg.timelineEnd,
                    isSelected,
                  });
                }}
                className={`absolute top-0 bottom-0 rounded bg-sky-600/80 flex items-center px-2.5 gap-2 ${isSelected ? "touch-none" : "touch-pan-x"} select-none overflow-visible transition-transform duration-150 ${
                  isSelected
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-pointer"
                } ${
                  isElevated
                    ? "scale-[1.03] ring-2 ring-inset ring-blue-400 shadow-2xl z-30"
                    : isSelected
                      ? "ring-2 ring-inset ring-white shadow-lg z-20"
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
                        beginHandleDrag(e, {
                          targetKind: "audio",
                          mode: "left",
                          id: seg.id,
                          itemType: "audio",
                          initStart: seg.timelineStart,
                          initEnd: seg.timelineEnd,
                        })
                      }
                      className="absolute -left-1.5 w-3.5 rounded-l bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none before:absolute before:content-[''] before:-inset-x-2.5 before:-inset-y-1.5"
                      style={{ top: 0, bottom: 0, height: "100%" }}
                    >
                      <div className="w-[1.5px] h-3.5 rounded-full bg-black" />
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) =>
                        beginHandleDrag(e, {
                          targetKind: "audio",
                          mode: "right",
                          id: seg.id,
                          itemType: "audio",
                          initStart: seg.timelineStart,
                          initEnd: seg.timelineEnd,
                        })
                      }
                      className="absolute -right-1.5 w-3.5 rounded-r bg-white flex items-center justify-center cursor-ew-resize z-30 shadow touch-none before:absolute before:content-[''] before:-inset-x-2.5 before:-inset-y-1.5"
                      style={{ top: 0, bottom: 0, height: "100%" }}
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
            className="h-7 rounded bg-[#16171b] hover:bg-[#1e2026] border border-white/5 px-3 flex items-center gap-1.5 text-zinc-400 text-[11px] font-medium transition-colors"
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
