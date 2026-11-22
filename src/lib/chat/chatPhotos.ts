// Hazır sohbet arka plan fotoğrafları (küçük SVG sahneleri; ağ isteği yok).
// Düzen: gökyüzü CSS gradyanıdır (her boyutu doldurur); SVG katmanı yalnızca sahne öğelerini çizer ve
// "xMidYMax meet" ile alta yaslanır (yakınlaştırma yok, kırpma yok). Yer/bina şekilleri yanlara taşar,
// böylece geniş ekranda sahne ortada doğal boyutta kalır, kenarlar zemini sürdürür.
const X0 = -3000;
const X1 = 3400;

function scene(c1: string, c2: string, c3: string, kind: "sunset" | "mountain" | "city" | "abstract"): string {
  let s: string;
  if (kind === "sunset")
    s = `<circle cx="270" cy="170" r="46" fill="${c3}"/><path d="M${X0} 215 H0 Q100 190 200 225 T400 215 H${X1} V300 H${X0}z" fill="#1b1030"/>`;
  else if (kind === "mountain")
    s = `<path d="M${X0} 240 H0 L90 130 L150 190 L240 90 L330 200 L400 190 H${X1} V300 H${X0}z" fill="${c3}"/><path d="M${X0} 270 H0 L120 200 L220 260 L400 210 H${X1} V300 H${X0}z" fill="#0c1a22" opacity=".8"/>`;
  else if (kind === "city")
    s = `<g fill="${c3}"><rect x="${X0}" y="250" width="${X1 - X0}" height="50"/><rect x="20" y="140" width="50" height="160"/><rect x="80" y="90" width="44" height="210"/><rect x="134" y="160" width="60" height="140"/><rect x="204" y="70" width="40" height="230"/><rect x="254" y="130" width="56" height="170"/><rect x="320" y="110" width="60" height="190"/></g>`;
  else
    s = `<circle cx="90" cy="150" r="60" fill="${c3}" opacity=".5"/><circle cx="300" cy="200" r="90" fill="${c3}" opacity=".35"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax meet">${s}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}"), linear-gradient(180deg,${c1},${c2})`;
}

export const CHAT_PHOTOS: { id: string; name: string; css: string }[] = [
  { id: "p1", name: "Gün batımı", css: scene("#F59E0B", "#7C2D6B", "#FDE68A", "sunset") },
  { id: "p2", name: "Dağlar", css: scene("#38BDF8", "#1E3A5F", "#3F6E8C", "mountain") },
  { id: "p3", name: "Şehir", css: scene("#1E1B4B", "#6D28D9", "#0F172A", "city") },
  { id: "p4", name: "Bulutlar", css: scene("#34D399", "#0EA5E9", "#FFFFFF", "abstract") },
];
