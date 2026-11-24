import { memo, useId } from "react";
import type { ArtKey } from "@/lib/feed/types";

/** Üretilmiş SVG sanatı (harici görsel yok). Her örnek kendi gradyan kimliğini kullanır. */
export const Art = memo(function Art({ k }: { k: ArtKey }) {
  const gid = `a${useId().replace(/:/g, "")}`;
  const g = (stops: [string, string][], x2 = 0, y2 = 1) => (
    <linearGradient id={gid} x1="0" y1="0" x2={x2} y2={y2}>
      {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
    </linearGradient>
  );
  let body: React.ReactNode;
  switch (k) {
    case "sunset":
      body = (<><defs>{g([["0", "#3b2a7a"], [".55", "#ff6b81"], ["1", "#ffd24a"]])}</defs><rect width="400" height="300" fill={`url(#${gid})`} /><circle cx="270" cy="190" r="46" fill="#fff3c4" opacity=".95" /><path d="M0 230q60-30 120-10t130-6 150 12v74H0z" fill="#1a1238" /><path d="M0 262q80-24 170-6t230-8v52H0z" fill="#0d0a22" /></>);
      break;
    case "wave":
      body = (<><defs>{g([["0", "#0b3b6e"], ["1", "#22d3ee"]], 1, 1)}</defs><rect width="400" height="300" fill={`url(#${gid})`} /><path d="M0 170q50-50 100-10t100-6 100 20 100-14v140H0z" fill="#0ea5c8" opacity=".7" /><path d="M0 210q60-40 110-6t110-4 180 8v92H0z" fill="#06283f" /><circle cx="90" cy="70" r="26" fill="#e0f7ff" opacity=".8" /></>);
      break;
    case "hills":
      body = (<><defs>{g([["0", "#a8e6cf"], ["1", "#2d6a4f"]])}</defs><rect width="400" height="300" fill={`url(#${gid})`} /><circle cx="110" cy="80" r="34" fill="#fff8d6" /><path d="M0 200q90-90 190-20t210-40v160H0z" fill="#40916c" /><path d="M0 250q120-60 220-10t180-20v80H0z" fill="#1b4332" /></>);
      break;
    case "city":
      body = (<><defs>{g([["0", "#1e1b4b"], ["1", "#c026d3"]])}</defs><rect width="400" height="300" fill={`url(#${gid})`} /><g fill="#0c0a1f"><rect x="20" y="150" width="50" height="150" /><rect x="80" y="110" width="44" height="190" /><rect x="134" y="170" width="60" height="130" /><rect x="204" y="90" width="48" height="210" /><rect x="262" y="140" width="56" height="160" /><rect x="328" y="120" width="60" height="180" /></g><g fill="#ffd24a" opacity=".8"><rect x="92" y="130" width="6" height="8" /><rect x="108" y="160" width="6" height="8" /><rect x="216" y="110" width="6" height="8" /><rect x="230" y="150" width="6" height="8" /><rect x="340" y="150" width="6" height="8" /></g></>);
      break;
    default:
      body = (<><rect width="400" height="300" fill="#ff4d8d" /><circle cx="120" cy="120" r="90" fill="#ffd24a" opacity=".9" /><circle cx="280" cy="190" r="100" fill="#6f5cff" opacity=".85" /><circle cx="200" cy="150" r="40" fill="#fff" opacity=".6" /></>);
  }
  return (
    <svg className="fd-art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
      {body}
    </svg>
  );
});
