// Sohbet temaları ve CSS değişkeni üretimi (yalnızca frontend). Tasarım: qa/design/chat/chat-mockup.html
import type { CSSProperties } from "react";

export type ChatThemeId =
  | "turkuaz"
  | "okyanus"
  | "gunbatimi"
  | "neon"
  | "orman"
  | "lavanta"
  | "minimal"
  | "gece"
  | "seker"
  | "kiraz";

export type BgType = "solid" | "gradient" | "pattern" | "photo";
export type BgPattern = "dots" | "lines" | "grid";
export type BubbleShape = "round" | "soft" | "sharp";
export type TextSize = "S" | "M" | "L";

export type ChatSettings = {
  v: 1;
  theme: ChatThemeId;
  bg: {
    type: BgType;
    pattern: BgPattern;
    /** Hazır fotoğraf kimliği (p1..p4) ya da 'custom' (galeriden seçilen, ayrı anahtarda saklanır). */
    photo: string;
    blur: number; // 0-20 px
    dim: number; // 0-80 %
    /** Galeri fotoğrafı seçildiği an (ms). Daha yeni bir ortak arka plan değişikliği gelirse özel fotoğraf bırakılır. */
    customAt?: number;
  };
  bubble: BubbleShape;
  textSize: TextSize;
  compact: boolean;
  nickname: string; // en çok 24 karakter
};

export type ChatTheme = {
  id: ChatThemeId;
  name: string;
  a: string; // gönderilen balon gradyanı başlangıç
  b: string; // bitiş
  t: string; // gönderilen balon metni
  recvBg: string;
  recvT: string;
  acc: string;
  bg1: string;
  bg2: string;
  dark: boolean;
};

export const CHAT_THEMES: ChatTheme[] = [
  { id: "turkuaz", name: "Turkuaz", a: "#0F766E", b: "#0E7490", t: "#FFFFFF", recvBg: "#1A1E25", recvT: "#E8ECF1", acc: "#38D5C8", bg1: "#0B0D10", bg2: "#12151A", dark: true },
  { id: "okyanus", name: "Okyanus", a: "#0B6E99", b: "#1D4ED8", t: "#FFFFFF", recvBg: "#12303F", recvT: "#E6F4FA", acc: "#38C6F4", bg1: "#07161F", bg2: "#0B2A3D", dark: true },
  { id: "gunbatimi", name: "Gün batımı", a: "#C2410C", b: "#BE185D", t: "#FFFFFF", recvBg: "#3A1C26", recvT: "#FFE9DE", acc: "#FF8A4C", bg1: "#1F0F14", bg2: "#34172A", dark: true },
  { id: "neon", name: "Neon", a: "#39FF9C", b: "#00E5FF", t: "#04120C", recvBg: "#151A22", recvT: "#E8FFF4", acc: "#39FF9C", bg1: "#07090D", bg2: "#0D1117", dark: true },
  { id: "orman", name: "Orman", a: "#166534", b: "#0F766E", t: "#FFFFFF", recvBg: "#17302A", recvT: "#E4F5EA", acc: "#4ADE80", bg1: "#0A1510", bg2: "#102A1E", dark: true },
  { id: "lavanta", name: "Lavanta", a: "#6D28D9", b: "#A21CAF", t: "#FFFFFF", recvBg: "#2C2145", recvT: "#F0E9FF", acc: "#B794F6", bg1: "#130E22", bg2: "#221538", dark: true },
  { id: "minimal", name: "Minimal", a: "#2A2F38", b: "#3A4150", t: "#FFFFFF", recvBg: "#FFFFFF", recvT: "#14171C", acc: "#2A2F38", bg1: "#F2F3F5", bg2: "#E3E6EA", dark: false },
  { id: "gece", name: "Gece", a: "#1E2A5A", b: "#312E81", t: "#E8ECFF", recvBg: "#1A2147", recvT: "#E8ECFF", acc: "#7C8CFF", bg1: "#070A1A", bg2: "#0F1438", dark: true },
  // Vurgu #FF5CA8 -> #D6287F -> #B8175F: açık zeminde (bg1 ve bg2) 4,5:1 altına düşmesin.
  { id: "seker", name: "Şeker", a: "#FF8FC7", b: "#FFB86B", t: "#3B0A24", recvBg: "#FFFFFF", recvT: "#3B0A24", acc: "#B8175F", bg1: "#FFF0F7", bg2: "#FFE0EE", dark: false },
  { id: "kiraz", name: "Kiraz", a: "#B91C1C", b: "#9F1239", t: "#FFFFFF", recvBg: "#3A1A20", recvT: "#FFE8EA", acc: "#FF5C6C", bg1: "#1A0A0C", bg2: "#2B1015", dark: true },
];

export const THEME_IDS = CHAT_THEMES.map((t) => t.id);

export function getTheme(id: string): ChatTheme {
  return CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES[0];
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const c = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG kontrast oranı. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Gönderilen balon metninin gradyanın en zayıf ucundaki kontrastı. */
export function sentMinRatio(t: ChatTheme): number {
  return Math.min(contrastRatio(t.a, t.t), contrastRatio(t.b, t.t));
}

export const TEXT_SIZES: Record<TextSize, string> = { S: "14px", M: "15.5px", L: "17.5px" };
export const BUBBLE_SHAPES: Record<BubbleShape, { r: string; rt: string }> = {
  round: { r: "20px", rt: "20px" },
  soft: { r: "22px", rt: "6px" },
  sharp: { r: "6px", rt: "2px" },
};

/** Mesaj tepkileri (yaygın desteklenen emojiler). */
export const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🔥"] as const;

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  v: 1,
  theme: "turkuaz",
  bg: { type: "gradient", pattern: "dots", photo: "p1", blur: 0, dim: 0 },
  bubble: "soft",
  textSize: "M",
  compact: false,
  nickname: "",
};

/** Sohbet köküne uygulanacak CSS değişkenleri (balonlar yalnızca bunları okur). */
export function settingsToVars(s: ChatSettings): CSSProperties {
  const t = getTheme(s.theme);
  const shape = BUBBLE_SHAPES[s.bubble] ?? BUBBLE_SHAPES.soft;
  const vars: Record<string, string> = {
    "--sent-a": t.a,
    "--sent-b": t.b,
    "--sent-t": t.t,
    "--recv-bg": t.recvBg,
    "--recv-t": t.recvT,
    "--acc": t.acc,
    "--bg1": t.bg1,
    "--bg2": t.bg2,
    "--panel": t.dark ? "#0E1115" : "#FFFFFF",
    "--panel-t": t.dark ? "#E8ECF1" : "#14171C",
    "--panel-line": t.dark ? "rgba(255,255,255,.09)" : "rgba(0,0,0,.1)",
    "--sub": t.dark ? "#A9B4C2" : "#4A5565",
    "--chip": t.dark ? "rgba(0,0,0,.4)" : "rgba(255,255,255,.75)",
    "--chip-t": t.dark ? "#E8ECF1" : "#14171C",
    "--fs": TEXT_SIZES[s.textSize] ?? TEXT_SIZES.M,
    "--r": shape.r,
    "--rt": shape.rt,
    "--pad": s.compact ? "6px 10px" : "10px 13px",
    "--gap": s.compact ? "3px" : "7px",
    "--gapc": s.compact ? "1px" : "2px",
    "--blur": `${s.bg.blur}px`,
    "--dim": String(s.bg.dim / 100),
  };
  return vars as CSSProperties;
}
