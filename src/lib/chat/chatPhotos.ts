// Hazır sohbet arka plan fotoğrafları (küçük SVG sahneleri; ağ isteği yok).
function scene(c1: string, c2: string, c3: string, kind: "sunset" | "mountain" | "city" | "abstract"): string {
  const g = (x2: number, y2: number) =>
    `<defs><linearGradient id="g" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>`;
  let s: string;
  if (kind === "sunset")
    s = g(0, 1) + `<circle cx="270" cy="170" r="46" fill="${c3}"/><path d="M0 220 Q100 190 200 225 T400 215 V300 H0z" fill="#1b1030"/>`;
  else if (kind === "mountain")
    s = g(0, 1) + `<path d="M0 240 L90 130 L150 190 L240 90 L330 200 L400 150 V300 H0z" fill="${c3}"/><path d="M0 270 L120 200 L220 260 L400 190 V300 H0z" fill="#0c1a22" opacity=".8"/>`;
  else if (kind === "city")
    s = g(0, 1) + `<g fill="${c3}"><rect x="20" y="140" width="50" height="160"/><rect x="80" y="90" width="44" height="210"/><rect x="134" y="160" width="60" height="140"/><rect x="204" y="70" width="40" height="230"/><rect x="254" y="130" width="56" height="170"/><rect x="320" y="110" width="60" height="190"/></g>`;
  else
    s = g(1, 1) + `<circle cx="90" cy="90" r="60" fill="${c3}" opacity=".5"/><circle cx="300" cy="200" r="90" fill="${c3}" opacity=".35"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">${s}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export const CHAT_PHOTOS: { id: string; name: string; css: string }[] = [
  { id: "p1", name: "Gün batımı", css: scene("#F59E0B", "#7C2D6B", "#FDE68A", "sunset") },
  { id: "p2", name: "Dağlar", css: scene("#38BDF8", "#1E3A5F", "#3F6E8C", "mountain") },
  { id: "p3", name: "Şehir", css: scene("#1E1B4B", "#6D28D9", "#0F172A", "city") },
  { id: "p4", name: "Bulutlar", css: scene("#34D399", "#0EA5E9", "#FFFFFF", "abstract") },
];
