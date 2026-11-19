import type { FontPreset, TextBgPreset } from "@/lib/canvas-editor/types";

/** Font archetype of a text layer. Same union as the engine's `FontPreset` (`TextLayer.fontPreset`). */
export type TextFontPreset = FontPreset;

/**
 * Background style of a text layer. Same union as the engine's `TextBgPreset`
 * (`TextLayer.bgPreset`): none = plain text with a soft shadow, solid = black box,
 * translucent = semi-transparent box, neon = coloured glow.
 */
export type TextBackgroundPreset = TextBgPreset;

/** Horizontal alignment (`TextLayer.style.textAlign`). */
export type TextAlign = "left" | "center" | "right";

/** Display data for one font archetype. */
export interface TextFontOption {
  /** Preset id. */
  id: TextFontPreset;
  /** Turkish label shown on the chip. */
  label: string;
  /** CSS font-family (identical to the engine's `FONT_PRESET_CONFIGS`). */
  fontFamily: string;
  /** CSS font-weight. */
  fontWeight: "normal" | "bold" | "600" | "700" | "800";
  /** CSS font-style. */
  fontStyle: "normal" | "italic";
}

/**
 * Font archetypes in the engine's cycle order (Modern → Klasik → Neon → Daktilo → Güçlü).
 * Mirrors `FONT_PRESET_CONFIGS` in `lib/canvas-editor/layers/TextLayer.ts` so the editor
 * preview matches the canvas; keep the two in sync.
 */
export const TEXT_FONT_OPTIONS: readonly TextFontOption[] = [
  {
    id: "modern",
    label: "Modern",
    fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: "800",
    fontStyle: "normal",
  },
  {
    id: "classic",
    label: "Klasik",
    fontFamily: "'Playfair Display', Didot, 'Cinzel', Georgia, serif",
    fontWeight: "700",
    fontStyle: "italic",
  },
  {
    id: "neon",
    label: "Neon",
    fontFamily: "'Caveat', 'Outfit', cursive, sans-serif",
    fontWeight: "700",
    fontStyle: "normal",
  },
  {
    id: "typewriter",
    label: "Daktilo",
    fontFamily: "'Space Mono', 'SF Mono', 'Courier New', monospace",
    fontWeight: "700",
    fontStyle: "normal",
  },
  {
    id: "heavy",
    label: "Güçlü",
    fontFamily: "'Bebas Neue', 'Impact', sans-serif",
    fontWeight: "700",
    fontStyle: "normal",
  },
];

/** Lookup of {@link TEXT_FONT_OPTIONS} by id (exhaustive over the engine's presets). */
export const TEXT_FONT_BY_ID: Record<TextFontPreset, TextFontOption> = {
  modern: TEXT_FONT_OPTIONS[0],
  classic: TEXT_FONT_OPTIONS[1],
  neon: TEXT_FONT_OPTIONS[2],
  typewriter: TEXT_FONT_OPTIONS[3],
  heavy: TEXT_FONT_OPTIONS[4],
};

/** Background styles in the engine's cycle order, with Turkish labels. */
export const TEXT_BG_PRESETS: readonly { id: TextBackgroundPreset; label: string }[] = [
  { id: "none", label: "Arka plan yok" },
  { id: "solid", label: "Dolu arka plan" },
  { id: "translucent", label: "Yarı saydam arka plan" },
  { id: "neon", label: "Neon parlama" },
];

/** The 18-colour Instagram-style story palette (same as the previous editor). */
export const TEXT_COLORS: readonly string[] = [
  "#FFFFFF", // Beyaz
  "#000000", // Siyah
  "#737373", // Nötr Gri
  "#EF4444", // Kırmızı
  "#F97316", // Turuncu
  "#F59E0B", // Kehribar
  "#EAB308", // Sarı
  "#84CC16", // Fıstık Yeşili
  "#10B981", // Zümrüt Yeşili
  "#06B6D4", // Camgöbeği
  "#0EA5E9", // Gökyüzü Mavisi
  "#3B82F6", // Mavi
  "#6366F1", // İndigo
  "#8B5CF6", // Menekşe
  "#A855F7", // Mor
  "#D946EF", // Fuşya
  "#EC4899", // Pembe
  "#F43F5E", // Gül
];

/** Font size range of the size slider, in canvas px at 1080 px width (`TextStyle.fontSize`). */
export const TEXT_SIZE_MIN = 40;
/** See {@link TEXT_SIZE_MIN}. */
export const TEXT_SIZE_MAX = 200;

/**
 * Editable state of a text layer. Maps 1:1 onto the engine's `TextLayer`:
 *
 * | field        | TextLayer                                   |
 * |--------------|---------------------------------------------|
 * | `text`       | `style.text` / `setText()`                  |
 * | `fontPreset` | `fontPreset` / `setFontPreset()`            |
 * | `bgPreset`   | `bgPreset` / `setBgPreset()`                |
 * | `color`      | `style.color` (+ `shadowColor` when neon)   |
 * | `align`      | `style.textAlign`                           |
 * | `fontSize`   | `style.fontSize` (canvas px at 1080 width)  |
 *
 * Apply order on the layer: `setFontPreset`, `setBgPreset`, then `setStyle({ color, textAlign,
 * fontSize })`, then `setText` (neon glow takes its colour from `style.color`).
 */
export interface TextEditorValue {
  /** Raw text, may contain `\n`. */
  text: string;
  /** Font archetype. */
  fontPreset: TextFontPreset;
  /** Background style. */
  bgPreset: TextBackgroundPreset;
  /** Text colour, `#RRGGBB`. */
  color: string;
  /** Horizontal alignment. */
  align: TextAlign;
  /** Font size in canvas px (engine default 90). */
  fontSize: number;
}

/** Defaults for a new text layer (matches the engine's defaults and the previous editor). */
export const DEFAULT_TEXT_EDITOR_VALUE: TextEditorValue = {
  text: "",
  fontPreset: "modern",
  bgPreset: "solid",
  color: "#FFFFFF",
  align: "center",
  fontSize: 90,
};
