// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import React, { useRef } from "react";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OnCanvasCropOverlayProps {
  cropRect: CropRect;
  onChangeCropRect: (next: CropRect) => void;
  onCommitHistory?: () => void;
}

type HandleMode =
  | "tl"
  | "tr"
  | "bl"
  | "br"
  | "t"
  | "b"
  | "l"
  | "r"
  | "move";

export default function OnCanvasCropOverlay({
  cropRect,
  onChangeCropRect,
  onCommitHistory,
}: OnCanvasCropOverlayProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: HandleMode;
    startX: number;
    startY: number;
    initRect: CropRect;
    stageWidth: number;
    stageHeight: number;
  } | null>(null);

  const safeX = Math.max(0, Math.min(0.88, cropRect?.x ?? 0));
  const safeY = Math.max(0, Math.min(0.88, cropRect?.y ?? 0));
  const safeRect: CropRect = {
    x: safeX,
    y: safeY,
    width: Math.max(0.12, Math.min(1 - safeX, cropRect?.width ?? 1)),
    height: Math.max(0.12, Math.min(1 - safeY, cropRect?.height ?? 1)),
  };

  const beginDrag = (e: React.PointerEvent, mode: HandleMode) => {
    e.stopPropagation();
    e.preventDefault();
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const bounds = stageEl.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    try {
      stageEl.setPointerCapture(e.pointerId);
    } catch {}

    onCommitHistory?.();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initRect: { ...safeRect },
      stageWidth: bounds.width,
      stageHeight: bounds.height,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st) return;
    e.stopPropagation();
    e.preventDefault();

    const dx = (e.clientX - st.startX) / st.stageWidth;
    const dy = (e.clientY - st.startY) / st.stageHeight;
    const minSize = 0.12;

    let { x, y, width: w, height: h } = st.initRect;
    const right = x + w;
    const bottom = y + h;

    if (st.mode === "move") {
      x = Math.max(0, Math.min(1 - w, x + dx));
      y = Math.max(0, Math.min(1 - h, y + dy));
    } else {
      if (st.mode === "tl" || st.mode === "bl" || st.mode === "l") {
        const nextX = Math.max(0, Math.min(right - minSize, x + dx));
        w = right - nextX;
        x = nextX;
      }
      if (st.mode === "tr" || st.mode === "br" || st.mode === "r") {
        const nextRight = Math.max(x + minSize, Math.min(1, right + dx));
        w = nextRight - x;
      }
      if (st.mode === "tl" || st.mode === "tr" || st.mode === "t") {
        const nextY = Math.max(0, Math.min(bottom - minSize, y + dy));
        h = bottom - nextY;
        y = nextY;
      }
      if (st.mode === "bl" || st.mode === "br" || st.mode === "b") {
        const nextBottom = Math.max(y + minSize, Math.min(1, bottom + dy));
        h = nextBottom - y;
      }
    }

    onChangeCropRect({
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
      width: Number(w.toFixed(4)),
      height: Number(h.toFixed(4)),
    });
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    try {
      stageRef.current?.releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
  };

  const leftPct = `${safeRect.x * 100}%`;
  const topPct = `${safeRect.y * 100}%`;
  const widthPct = `${safeRect.width * 100}%`;
  const heightPct = `${safeRect.height * 100}%`;
  const rightMaskLeftPct = `${(safeRect.x + safeRect.width) * 100}%`;
  const rightMaskWidthPct = `${Math.max(0, (1 - safeRect.x - safeRect.width) * 100)}%`;
  const bottomMaskTopPct = `${(safeRect.y + safeRect.height) * 100}%`;
  const bottomMaskHeightPct = `${Math.max(0, (1 - safeRect.y - safeRect.height) * 100)}%`;

  return (
    <div className="fixed inset-x-0 top-16 bottom-28 z-50 flex items-center justify-center px-4 py-2 pointer-events-none select-none">
      {/* 9:16 Tam Boyut Önizleme Çerçevesi (page.tsx tuvaliyle 1:1 milimetrik çakışır) */}
      <div
        ref={stageRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="relative h-full max-w-full aspect-[9/16] pointer-events-auto touch-none overflow-visible rounded-2xl"
      >
        {/* Kırpma Dışı Karartma Maskesi (4 Bölge: Üst, Alt, Sol, Sağ - %65 Karartma) */}
        <div
          className="absolute inset-x-0 top-0 bg-black/65 pointer-events-none rounded-t-2xl"
          style={{ height: topPct }}
        />
        <div
          className="absolute inset-x-0 bg-black/65 pointer-events-none rounded-b-2xl"
          style={{ top: bottomMaskTopPct, height: bottomMaskHeightPct }}
        />
        <div
          className="absolute left-0 bg-black/65 pointer-events-none"
          style={{ top: topPct, height: heightPct, width: leftPct }}
        />
        <div
          className="absolute bg-black/65 pointer-events-none"
          style={{
            top: topPct,
            height: heightPct,
            left: rightMaskLeftPct,
            width: rightMaskWidthPct,
          }}
        />

        {/* Aktif Kırpma Kutusu: 9 Eşit Parça (3x3 Rule of Thirds) + 8 Tutamaç */}
        <div
          onPointerDown={(e) => beginDrag(e, "move")}
          className="absolute border-[1.5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] cursor-move touch-none"
          style={{
            left: leftPct,
            top: topPct,
            width: widthPct,
            height: heightPct,
          }}
        >
          {/* 3x3 Rule of Thirds Izgarası (9 Eşit Parça) */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/3 inset-x-0 h-[1px] bg-white/55 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
            <div className="absolute top-2/3 inset-x-0 h-[1px] bg-white/55 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
            <div className="absolute left-1/3 inset-y-0 w-[1px] bg-white/55 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
            <div className="absolute left-2/3 inset-y-0 w-[1px] bg-white/55 shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
          </div>

          {/* 4 KÖŞE TUTAMACI (Kalın Beyaz L-Köşebentler + 44x44px Geniş Dokunma Alanı) */}
          {/* Sol-Üst (TL) */}
          <div
            onPointerDown={(e) => beginDrag(e, "tl")}
            className="absolute -top-4 -left-4 w-11 h-11 flex items-start justify-start p-3 cursor-nwse-resize z-30 touch-none"
          >
            <div className="w-5 h-5 border-t-[4px] border-l-[4px] border-white rounded-tl-sm shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>

          {/* Sağ-Üst (TR) */}
          <div
            onPointerDown={(e) => beginDrag(e, "tr")}
            className="absolute -top-4 -right-4 w-11 h-11 flex items-start justify-end p-3 cursor-nesw-resize z-30 touch-none"
          >
            <div className="w-5 h-5 border-t-[4px] border-r-[4px] border-white rounded-tr-sm shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>

          {/* Sol-Alt (BL) */}
          <div
            onPointerDown={(e) => beginDrag(e, "bl")}
            className="absolute -bottom-4 -left-4 w-11 h-11 flex items-end justify-start p-3 cursor-nesw-resize z-30 touch-none"
          >
            <div className="w-5 h-5 border-b-[4px] border-l-[4px] border-white rounded-bl-sm shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>

          {/* Sağ-Alt (BR) */}
          <div
            onPointerDown={(e) => beginDrag(e, "br")}
            className="absolute -bottom-4 -right-4 w-11 h-11 flex items-end justify-end p-3 cursor-nwse-resize z-30 touch-none"
          >
            <div className="w-5 h-5 border-b-[4px] border-r-[4px] border-white rounded-br-sm shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>

          {/* 4 KENAR ORTA TUTAMACI (Beyaz Hap Çubuklar + Geniş Dokunma Alanı) */}
          {/* Üst Kenar (T) */}
          <div
            onPointerDown={(e) => beginDrag(e, "t")}
            className="absolute -top-4 left-1/2 -translate-x-1/2 w-14 h-8 flex items-center justify-center cursor-ns-resize z-30 touch-none"
          >
            <div className="w-8 h-1.5 bg-white rounded-full shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>

          {/* Alt Kenar (B) */}
          <div
            onPointerDown={(e) => beginDrag(e, "b")}
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-14 h-8 flex items-center justify-center cursor-ns-resize z-30 touch-none"
          >
            <div className="w-8 h-1.5 bg-white rounded-full shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>

          {/* Sol Kenar (L) */}
          <div
            onPointerDown={(e) => beginDrag(e, "l")}
            className="absolute top-1/2 -translate-y-1/2 -left-4 w-8 h-14 flex items-center justify-center cursor-ew-resize z-30 touch-none"
          >
            <div className="w-1.5 h-8 bg-white rounded-full shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>

          {/* Sağ Kenar (R) */}
          <div
            onPointerDown={(e) => beginDrag(e, "r")}
            className="absolute top-1/2 -translate-y-1/2 -right-4 w-8 h-14 flex items-center justify-center cursor-ew-resize z-30 touch-none"
          >
            <div className="w-1.5 h-8 bg-white rounded-full shadow-[0_0_6px_rgba(0,0,0,0.65)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
