// Reels çıkartma seti: satır içi SVG'ler (100x100 görünüm kutusu). Tuvale PNG blob olarak eklenir.

export interface ReelsSticker {
  id: string;
  label: string;
  /** Tam <svg> işaretlemesi (xmlns dahil). */
  svg: string;
}

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${inner}</svg>`;

/** Kalın yazı çıkartmaları için ortak metin stili. */
const textBadge = (text: string, fill: string, textFill: string, size: number) =>
  wrap(
    `<rect x="6" y="22" width="88" height="56" rx="16" fill="${fill}" stroke="#fff" stroke-width="4"/>` +
      `<text x="50" y="58" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="${size}" text-anchor="middle" fill="${textFill}">${text}</text>`
  );

export const REELS_STICKERS: readonly ReelsSticker[] = [
  {
    id: "heart",
    label: "Kalp",
    svg: wrap(
      `<path d="M50 88 C20 66 8 48 8 32 C8 18 19 9 31 9 C40 9 47 14 50 21 C53 14 60 9 69 9 C81 9 92 18 92 32 C92 48 80 66 50 88Z" fill="#ef4444" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="M24 28 C24 22 29 19 34 20" stroke="#fecaca" stroke-width="5" fill="none" stroke-linecap="round"/>`
    ),
  },
  {
    id: "star",
    label: "Yıldız",
    svg: wrap(
      `<path d="M50 8 L62 36 L92 38 L69 58 L77 88 L50 72 L23 88 L31 58 L8 38 L38 36Z" fill="#facc15" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`
    ),
  },
  {
    id: "fire",
    label: "Ateş",
    svg: wrap(
      `<path d="M50 6 C54 24 74 32 74 58 C74 76 63 90 50 90 C37 90 26 76 26 58 C26 46 32 40 38 34 C38 44 42 48 46 48 C42 32 44 18 50 6Z" fill="#f97316" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="M50 52 C58 62 62 68 62 74 C62 82 56 86 50 86 C44 86 38 82 38 74 C38 66 44 62 50 52Z" fill="#fde047"/>`
    ),
  },
  { id: "wow", label: "WOW", svg: textBadge("WOW", "#a855f7", "#ffffff", 30) },
  { id: "lol", label: "LOL", svg: textBadge("LOL", "#06b6d4", "#ffffff", 32) },
  {
    id: "bubble",
    label: "Balon",
    svg: wrap(
      `<path d="M16 16 H84 Q92 16 92 24 V62 Q92 70 84 70 H48 L28 90 V70 H16 Q8 70 8 62 V24 Q8 16 16 16Z" fill="#ffffff" stroke="#111827" stroke-width="4" stroke-linejoin="round"/>` +
        `<circle cx="34" cy="43" r="5" fill="#111827"/><circle cx="50" cy="43" r="5" fill="#111827"/><circle cx="66" cy="43" r="5" fill="#111827"/>`
    ),
  },
  {
    id: "arrow",
    label: "Ok",
    svg: wrap(
      `<path d="M10 40 H56 V20 L92 50 L56 80 V60 H10Z" fill="#22c55e" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`
    ),
  },
  {
    id: "sparkles",
    label: "Parıltı",
    svg: wrap(
      `<path d="M42 10 L50 38 L78 46 L50 54 L42 82 L34 54 L6 46 L34 38Z" fill="#fde047" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="M78 8 L82 22 L96 26 L82 30 L78 44 L74 30 L60 26 L74 22Z" fill="#f9a8d4" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="M76 62 L79 72 L89 75 L79 78 L76 88 L73 78 L63 75 L73 72Z" fill="#93c5fd" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`
    ),
  },
  {
    id: "crown",
    label: "Taç",
    svg: wrap(
      `<path d="M10 78 L6 30 L30 50 L50 18 L70 50 L94 30 L90 78Z" fill="#facc15" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>` +
        `<rect x="10" y="78" width="80" height="10" rx="3" fill="#eab308" stroke="#fff" stroke-width="3"/>` +
        `<circle cx="50" cy="18" r="5" fill="#ef4444"/><circle cx="6" cy="30" r="4" fill="#ef4444"/><circle cx="94" cy="30" r="4" fill="#ef4444"/>`
    ),
  },
  {
    id: "sunglasses",
    label: "Gözlük",
    svg: wrap(
      `<path d="M6 36 H94 L88 42 Q86 70 66 70 Q50 70 46 52 H54 Q50 70 34 70 Q14 70 12 42Z" fill="#111827" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="M18 44 L30 44 L22 56Z M58 44 L70 44 L62 56Z" fill="#6b7280" opacity=".7"/>`
    ),
  },
  { id: "hundred", label: "100", svg: textBadge("100", "#ef4444", "#ffffff", 38) },
  { id: "ok", label: "OK", svg: textBadge("OK", "#22c55e", "#ffffff", 38) },
  {
    id: "music",
    label: "Nota",
    svg: wrap(
      `<path d="M38 20 L84 10 V64" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M38 20 V72" stroke="#fff" stroke-width="12" stroke-linecap="round"/>` +
        `<path d="M38 20 L84 10 V64 M38 20 V72" fill="none" stroke="#ec4899" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<ellipse cx="28" cy="74" rx="16" ry="12" fill="#ec4899" stroke="#fff" stroke-width="4"/>` +
        `<ellipse cx="74" cy="66" rx="16" ry="12" fill="#ec4899" stroke="#fff" stroke-width="4"/>`
    ),
  },
  {
    id: "sun",
    label: "Güneş",
    svg: wrap(
      `<g stroke="#fbbf24" stroke-width="7" stroke-linecap="round">` +
        `<path d="M50 6 V18 M50 82 V94 M6 50 H18 M82 50 H94 M19 19 L27 27 M73 73 L81 81 M81 19 L73 27 M27 73 L19 81"/></g>` +
        `<circle cx="50" cy="50" r="22" fill="#fde047" stroke="#fff" stroke-width="4"/>`
    ),
  },
  {
    id: "lightning",
    label: "Şimşek",
    svg: wrap(
      `<path d="M58 4 L22 54 H46 L38 96 L80 40 H55Z" fill="#facc15" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`
    ),
  },
  { id: "new", label: "NEW", svg: textBadge("NEW", "#f43f5e", "#ffffff", 30) },
];

/** Önizleme için SVG'yi data URL'e çevirir. */
export function stickerPreviewUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** SVG çıkartmayı şeffaf PNG blob'a çizer (varsayılan 512 px kare). */
export function stickerToPngBlob(svg: string, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob"));
        }, "image/png");
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("svg"));
    img.src = stickerPreviewUrl(svg);
  });
}
