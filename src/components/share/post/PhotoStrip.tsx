"use client";

import { useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

export interface PhotoStripProps {
  files: File[];
  active: number;
  max: number;
  busy: boolean;
  /** Yanıt modunda üst sınır 3 (ipucu metni için). */
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  /** Alt panelin üstünde konumlanır (px). */
  bottom: number;
}

/** WP-27: Gönderi modunda çoklu fotoğraf şeridi: seç, ekle, sırala (oklar), sil. Sayaç "2/7". */
export default function PhotoStrip({ files, active, max, busy, onSelect, onAdd, onRemove, onMove, bottom }: PhotoStripProps) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const many = files.length > 1;
  const btn = "w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-90 disabled:opacity-30 shrink-0";
  return (
    <div
      data-testid="photo-strip"
      className="fixed inset-x-0 z-30 px-3 pointer-events-none"
      style={{ bottom: bottom + 6 }}
    >
      <div className="mx-auto max-w-md h-[52px] rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 pointer-events-auto flex items-center gap-2 px-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] font-bold text-white/80 shrink-0 tabular-nums" data-testid="photo-count">
          {active + 1}/{files.length}
        </span>
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            disabled={busy}
            onClick={() => onSelect(i)}
            aria-label={`Fotoğraf ${i + 1}${i === active ? " (seçili)" : ""}`}
            aria-pressed={i === active}
            data-testid="photo-thumb"
            className={`relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 ${i === active ? "border-white" : "border-transparent opacity-70"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="w-full h-full object-cover" draggable={false} />
          </button>
        ))}
        {files.length < max ? (
          <button type="button" disabled={busy} onClick={onAdd} aria-label="Fotoğraf ekle" data-testid="photo-add" className={btn}>
            <Plus className="w-4 h-4" />
          </button>
        ) : (
          <span className="text-[10px] text-white/60 shrink-0 px-1" data-testid="photo-max">En fazla {max}</span>
        )}
        {many ? (
          <>
            <button type="button" disabled={busy || active === 0} onClick={() => onMove(active, -1)} aria-label="Fotoğrafı sola taşı" className={btn}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" disabled={busy || active === files.length - 1} onClick={() => onMove(active, 1)} aria-label="Fotoğrafı sağa taşı" className={btn}>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button type="button" disabled={busy} onClick={() => onRemove(active)} aria-label="Fotoğrafı kaldır" data-testid="photo-remove" className={btn}>
              <X className="w-4 h-4" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
