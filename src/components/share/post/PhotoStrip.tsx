"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

// WP-35: şerit küçük resimleri 80px'lik küçük kopyalardır. Eskiden her render'da 7 tam çözünürlüklü fotoğrafın
// yeni blob URL'si üretilip yeniden çözülüyordu (her sayfa render'ında + her fotoğraf geçişinde ana iş parçacığı
// kilitleniyordu). Küçük kopya dosya başına bir kez üretilir, WeakMap'te tutulur.
const THUMB_PX = 80;
const resolved = new WeakMap<File, string | null>();
const thumbCache = new WeakMap<File, Promise<string | null>>();
function makeThumb(file: File): Promise<string | null> {
  let p = thumbCache.get(file);
  if (!p) {
    p = (async () => {
      try {
        const bmp = await createImageBitmap(file, { resizeWidth: THUMB_PX * 2, resizeQuality: "medium" });
        const c = document.createElement("canvas");
        c.width = THUMB_PX;
        c.height = THUMB_PX;
        const ctx = c.getContext("2d");
        if (!ctx) {
          bmp.close();
          return null;
        }
        const k = Math.max(THUMB_PX / bmp.width, THUMB_PX / bmp.height);
        const w = bmp.width * k;
        const h = bmp.height * k;
        ctx.drawImage(bmp, (THUMB_PX - w) / 2, (THUMB_PX - h) / 2, w, h);
        bmp.close();
        return c.toDataURL("image/jpeg", 0.75);
      } catch {
        return null;
      }
    })();
    thumbCache.set(file, p);
  }
  return p;
}

function useThumbs(files: File[]): (string | null)[] {
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    const todo = files.filter((f) => !resolved.has(f));
    for (const f of todo) {
      void makeThumb(f).then((u) => {
        resolved.set(f, u);
        if (alive) bump((n) => n + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, [files]);
  return files.map((f) => resolved.get(f) ?? null);
}

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
  const urls = useThumbs(files);
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
        {files.map((_, i) => (
          <button
            key={`${i}`}
            type="button"
            disabled={busy}
            onClick={() => onSelect(i)}
            aria-label={`Fotoğraf ${i + 1}${i === active ? " (seçili)" : ""}`}
            aria-pressed={i === active}
            data-testid="photo-thumb"
            className={`relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 ${i === active ? "border-white" : "border-transparent opacity-70"}`}
          >
            {urls[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[i] as string} alt="" className="w-full h-full object-cover" draggable={false} />
            ) : (
              <span className="block w-full h-full bg-white/10" />
            )}
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
