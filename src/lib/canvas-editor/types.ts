export type MediaType = 'image' | 'video';

export interface EditorMedia {
  type: MediaType;
  element: HTMLImageElement | HTMLVideoElement;
  width: number;
  height: number;
  duration?: number;
}

export interface MediaFilters {
  brightness: number; // 100 = default (%)
  contrast: number;   // 100 = default (%)
  saturation: number; // 100 = default (%)
  blur: number;       // 0 = default (px)
  sepia: number;      // 0 = default (%)
  grayscale: number;  // 0 = default (%)
  hueRotate: number;  // 0 = default (deg)
  invert: number;     // 0 = default (%)
  pixelate?: number;  // 0 veya undefined = piksel efekti yok, >1 piksel boyutu (px)
  grain?: number;     // 0-100 analog film greni
  zoomBlur?: number;  // 0-10 radyal hareket bulanıklığı
  chromatic?: number; // 0-10 renk sapması / elde çekim optik ayrışması
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OverlayShapeMode = 'rounded' | 'circle' | 'polaroid' | 'heart' | 'star';
export type FontPreset = 'modern' | 'classic' | 'neon' | 'typewriter' | 'heavy';
export type TextBgPreset = 'none' | 'solid' | 'translucent' | 'neon';

export interface StoryAudioMeta {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number; // e.g. 15s
  startTime: number;
  coverUrl?: string;
}

export interface SnapGuideState {
  x: boolean;
  y: boolean;
  activeTime?: number;
}

export interface TextStyle {
  text: string;
  fontSize: number;          // Base font size in px relative to canvas
  fontFamily: string;
  color: string;
  fontWeight: 'normal' | 'bold' | '600' | '700' | '800' | '900';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  backgroundColor?: string;  // Instagram-style pill background
  backgroundPadding?: number;
  borderRadius?: number;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
}

export interface LayerTransform {
  x: number;       // Normalized [0..1], 0.5 = center
  y: number;       // Normalized [0..1], 0.5 = center
  scale: number;   // 1.0 = normal
  rotation: number;// in degrees (0 - 360)
  flipH?: boolean; // Horizontal flip (mirror)
  flipV?: boolean; // Vertical flip
}

export type TransformState = LayerTransform;

export type FitMode = 'contain' | 'cover' | 'fill';

export interface FilterValues {
  brightness: number; // default 1.0
  contrast: number;   // default 1.0
  saturate: number;   // default 1.0
  sepia: number;      // default 0.0
  grayscale: number;  // default 0.0
  hueRotate: number;  // in deg (default 0)
  blur: number;       // in px (default 0)
}

export type OverlayEffect = 'grain' | 'zoom_blur' | 'pixelate' | 'bloom' | 'shake' | null;

export interface FilterPreset {
  id: string;
  name: string;
  hasColor: boolean;
  backgroundGradient: string; // CSS radial gradient veya hex
  bgCenterColor?: string;     // Canvas 2D render için merkez rengi
  cssFilter: string;
  values: FilterValues;
  overlayEffect?: OverlayEffect;
}

export const DEFAULT_FILTER_VALUES: FilterValues = {
  brightness: 1.0,
  contrast: 1.0,
  saturate: 1.0,
  sepia: 0.0,
  grayscale: 0.0,
  hueRotate: 0.0,
  blur: 0.0
};

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'simple',
    name: 'Simple',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'contrast(1.02) saturate(1.02)',
    values: { brightness: 1.0, contrast: 1.02, saturate: 1.02, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'fade',
    name: 'Fade',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'contrast(0.85) brightness(1.1) saturate(0.9)',
    values: { brightness: 1.1, contrast: 0.85, saturate: 0.9, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'paris',
    name: 'Paris',
    hasColor: true,
    backgroundGradient: 'radial-gradient(circle at center, #241217 0%, #000000 75%)',
    bgCenterColor: '#241217',
    cssFilter: 'sepia(0.18) saturate(1.12) brightness(1.04) hue-rotate(-8deg)',
    values: { brightness: 1.04, contrast: 1.0, saturate: 1.12, sepia: 0.18, grayscale: 0, hueRotate: -8, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'los_angeles',
    name: 'Los Angeles',
    hasColor: true,
    backgroundGradient: 'radial-gradient(circle at center, #241708 0%, #000000 75%)',
    bgCenterColor: '#241708',
    cssFilter: 'sepia(0.22) saturate(1.35) contrast(1.08) hue-rotate(-14deg)',
    values: { brightness: 1.0, contrast: 1.08, saturate: 1.35, sepia: 0.22, grayscale: 0, hueRotate: -14, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    hasColor: true,
    backgroundGradient: 'radial-gradient(circle at center, #081226 0%, #000000 75%)',
    bgCenterColor: '#081226',
    cssFilter: 'contrast(1.22) saturate(1.15) hue-rotate(185deg) brightness(0.92)',
    values: { brightness: 0.92, contrast: 1.22, saturate: 1.15, sepia: 0, grayscale: 0, hueRotate: 185, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'jakarta',
    name: 'Jakarta',
    hasColor: true,
    backgroundGradient: 'radial-gradient(circle at center, #091a13 0%, #000000 75%)',
    bgCenterColor: '#091a13',
    cssFilter: 'saturate(1.25) contrast(1.1) hue-rotate(85deg) sepia(0.12)',
    values: { brightness: 1.0, contrast: 1.1, saturate: 1.25, sepia: 0.12, grayscale: 0, hueRotate: 85, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'rio',
    name: 'Rio de Janeiro',
    hasColor: true,
    backgroundGradient: 'radial-gradient(circle at center, #260d09 0%, #000000 75%)',
    bgCenterColor: '#260d09',
    cssFilter: 'saturate(1.45) contrast(1.18) brightness(1.02) hue-rotate(-22deg)',
    values: { brightness: 1.02, contrast: 1.18, saturate: 1.45, sepia: 0, grayscale: 0, hueRotate: -22, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'grainy',
    name: 'Grainy',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'contrast(1.08) brightness(0.98)',
    values: { brightness: 0.98, contrast: 1.08, saturate: 1.0, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0 },
    overlayEffect: 'grain',
  },
  {
    id: 'gritty',
    name: 'Gritty',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'contrast(1.35) saturate(0.7) brightness(0.95)',
    values: { brightness: 0.95, contrast: 1.35, saturate: 0.7, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'graphite',
    name: 'Graphite',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'grayscale(1) contrast(1.25) brightness(0.96)',
    values: { brightness: 0.96, contrast: 1.25, saturate: 1.0, sepia: 0, grayscale: 1.0, hueRotate: 0, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'hyper',
    name: 'Hyper',
    hasColor: true,
    backgroundGradient: 'radial-gradient(circle at center, #1a0826 0%, #000000 75%)',
    bgCenterColor: '#1a0826',
    cssFilter: 'saturate(1.7) contrast(1.28) hue-rotate(270deg)',
    values: { brightness: 1.0, contrast: 1.28, saturate: 1.7, sepia: 0, grayscale: 0, hueRotate: 270, blur: 0 },
    overlayEffect: null,
  },
  {
    id: 'zoom_blur',
    name: 'Zoom Blur',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'contrast(1.05)',
    values: { brightness: 1.0, contrast: 1.05, saturate: 1.0, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0 },
    overlayEffect: 'zoom_blur',
  },
  {
    id: 'soft_light',
    name: 'Soft Light',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'brightness(1.12) contrast(0.92) blur(0.4px)',
    values: { brightness: 1.12, contrast: 0.92, saturate: 1.0, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0.4 },
    overlayEffect: 'bloom',
  },
  {
    id: 'handheld',
    name: 'Handheld',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'contrast(1.05) saturate(1.05)',
    values: { brightness: 1.0, contrast: 1.05, saturate: 1.05, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0 },
    overlayEffect: 'shake',
  },
  {
    id: 'lores',
    name: 'Lo-Res',
    hasColor: false,
    backgroundGradient: '#000000',
    bgCenterColor: '#000000',
    cssFilter: 'contrast(1.15) saturate(1.1)',
    values: { brightness: 1.0, contrast: 1.15, saturate: 1.1, sepia: 0, grayscale: 0, hueRotate: 0, blur: 0 },
    overlayEffect: 'pixelate',
  },
];

export type StoryFilterPreset = FilterPreset;
export const STORY_FILTER_PRESETS = FILTER_PRESETS;

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  width?: number;          // Logical canvas width (default 1080)
  height?: number;         // Logical canvas height (default 1080)
  fitMode?: FitMode;       // How the media fits canvas
}
