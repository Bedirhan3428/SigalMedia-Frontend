import type { BaseLayer } from './layers/BaseLayer';

export type MediaType = 'image' | 'video';

export interface EditorMedia {
  type: MediaType;
  element: HTMLImageElement | HTMLVideoElement;
  width: number;
  height: number;
  duration?: number;
  // Ham kaynak (export sırasında demux için yeniden okunur)
  source?: string | Blob | File;
  objectUrl?: string;
  // Küçültme öncesi orijinal boyutlar (görsel küçültüldüyse)
  originalWidth?: number;
  originalHeight?: number;
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

export type OverlayShapeMode = 'original' | 'rounded' | 'circle' | 'polaroid' | 'heart' | 'star';
export type FontPreset = 'modern' | 'classic' | 'neon' | 'typewriter' | 'heavy';
export type TextBgPreset = 'none' | 'solid' | 'translucent' | 'neon';

export interface StoryAudioMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  streamUrl: string;
  startTime: number;
  duration: number;
  totalDuration: number;
  lyricsSnippet?: string;
  // Reels timeline yerleşimi (sn)
  timelineStart?: number;
  timelineEnd?: number;
  segments?: MusicSegment[];
  // Giriş / çıkış ses yumuşatma süresi (sn)
  fadeIn?: number;
  fadeOut?: number;
}

export interface MusicSegment {
  id: string;
  timelineStart: number;
  timelineEnd: number;
  // Şarkı içindeki mutlak başlangıç saniyesi (startTime dahil)
  songOffset: number;
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

// [START] CREATED BY Bedirhan
export type ShareMode = 'story' | 'reels' | 'post';

// ─────────────────────────────────────────────────────────────
// WP1: Sabit mantıksal çözünürlük, süre ve yükleme sınırları
// ─────────────────────────────────────────────────────────────

/** Reels / Hikaye video ve timeline üst sınırı (sn). Motor ve exporter yalnızca bunu kullanır. */
export const MAX_VIDEO_SEC = 60;

/** Story ve Reels mantıksal tuval boyutu (9:16). Viewport veya medyadan asla türetilmez. */
export const VERTICAL_LOGICAL_SIZE = { width: 1080, height: 1920 } as const;

export type PostAspect = '1:1' | '4:5' | '3:4' | '4:3';

export const DEFAULT_POST_ASPECT: PostAspect = '4:5';

/** Post mantıksal boyutları (uzun kenar <= 1440). */
export const POST_ASPECT_SIZES: Record<PostAspect, { width: number; height: number }> = {
  '1:1': { width: 1440, height: 1440 },
  '4:5': { width: 1152, height: 1440 },
  '3:4': { width: 1080, height: 1440 },
  '4:3': { width: 1440, height: 1080 },
};

/** Görseller yüklenirken bu uzun kenara (px) küçültülür (iOS tuval sınırı ~16.7M px). */
export const MAX_IMAGE_DECODE_PX = 4096;
export const MAX_IMAGE_DECODE_AREA = 16_000_000;

/** loadVideo / loadImage zaman aşımı (ms). */
export const MEDIA_LOAD_TIMEOUT_MS = 15_000;

export type MediaLoadErrorCode = 'timeout' | 'unsupported' | 'decode';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Başlangıç modu (varsayılan 'story'). Medya yüklendikten sonra değiştirilemez. */
  mode?: ShareMode;
  /** Post modu için başlangıç en-boy oranı (varsayılan '4:5'). */
  postAspect?: PostAspect;
  /** @deprecated Yok sayılır: mantıksal boyut moda göre sabittir. */
  width?: number;
  /** @deprecated Yok sayılır: mantıksal boyut moda göre sabittir. */
  height?: number;
  fitMode?: FitMode;       // How the media fits canvas
}

/** drag-move / drag-end olay yükü. clientX/Y sürüklenen katmanın MERKEZİDİR (client px). */
export interface DragInfo {
  layer: BaseLayer;
  /** Katman merkezi (client px). deletable=false iken NaN. */
  clientX: number;
  clientY: number;
  isDragging: boolean;
  /** Yalnızca tek parmakla gerçek sürüklemede true. false ise UI çöp kutusuyla silmemeli. */
  deletable: boolean;
}

export interface VideoState {
  isVideo: boolean;
  isMotionPhoto?: boolean;
  duration: number;
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  currentTime: number;
  isPlaying: boolean;
}

export interface VideoTrackClip {
  id: string;
  sourceMediaId: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  playbackRate: number;
  volume: number;
  muted: boolean;
  isMotionPhoto?: boolean;
  transform?: LayerTransform;
  fitMode?: FitMode;
  cropRect?: Rect;
  media?: EditorMedia;
  thumbnailUrl?: string;
  thumbnails?: string[];
}

export type OverlayTrackType = 'text' | 'sticker' | 'photo';

export interface OverlayTrackItem {
  id: string;
  layerId: string;
  type: OverlayTrackType;
  timelineStart: number;
  timelineEnd: number;
  label: string;
  color: string;
  previewUrl?: string;
}

export type PostStudioFilterId =
  | 'none'
  | 'cinematic'
  | 'vintage_90s'
  | 'cold_nordic'
  | 'warm_portrait'
  | 'mono_contrast'
  | 'fade_film';

export interface PostAdjustmentState {
  brightness: number; // -100..100
  contrast: number;   // -100..100
  saturation: number; // -100..100
  warmth: number;     // -100..100
  vignette: number;   // 0..100
  sharpness: number;  // 0..100
  grain: number;      // 0..100
  lightLeak: number;  // 0..100
  bokehGlow: number;  // 0..100
  filterPreset: PostStudioFilterId;
}

export const DEFAULT_POST_ADJUSTMENTS: PostAdjustmentState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  vignette: 0,
  sharpness: 0,
  grain: 0,
  lightLeak: 0,
  bokehGlow: 0,
  filterPreset: 'none',
};

export type ReelsEffectId =
  | 'none'
  | 'glitch'
  | 'zoom_pulse'
  | 'flash'
  | 'shake'
  | 'rgb_shift'
  | 'cyber_neon'
  | 'cinema_warm'
  | 'vhs_grain';

export interface ReelsEffectClip {
  id: string;
  effect: ReelsEffectId;
  startTime: number;
  endTime: number;
  intensity?: number; // 0..100
}
// [END] CREATED BY Bedirhan

// [START] WP1: Undo / redo anlık görüntüsü
/** Tek bir katmanın değiştirilebilir durumu (katman nesnesine referansla birlikte saklanır). */
export interface LayerStateSnapshot {
  transform: LayerTransform;
  visible: boolean;
  locked: boolean;
  timelineStart: number;
  timelineEnd: number;
  // TextLayer
  style?: TextStyle;
  fontPreset?: FontPreset;
  bgPreset?: TextBgPreset;
  // OverlayImageLayer
  shapeMode?: OverlayShapeMode;
  // MusicStickerLayer
  audioMeta?: StoryAudioMeta;
}

/**
 * engine.snapshot() çıktısı. Bellek içi ve opaktır: JSON'a çevirmeyin, alanlarına güvenmeyin.
 * Silinmiş katmanlar dahil tüm katman nesnelerine referans tutar; restore() bunları geri koyar.
 * loadMedia() ile taban medya değişirse eski anlık görüntüler geçersiz olur (restore false döner).
 */
export interface EngineSnapshot {
  readonly version: 1;
  readonly mode: ShareMode;
  readonly postAspect: PostAspect;
  readonly baseMediaKey: string | null;
  readonly layers: ReadonlyArray<{ layer: BaseLayer; state: LayerStateSnapshot }>;
  readonly media: {
    transform: LayerTransform;
    fitMode: FitMode;
    filters: MediaFilters;
    postAdjustments: PostAdjustmentState;
    reelsEffect: ReelsEffectId;
    effectClips: ReelsEffectClip[];
    trimStart: number;
    trimEnd: number;
    playbackRate: number;
    volume: number;
    muted: boolean;
    cropRect?: Rect;
  } | null;
  readonly clips: VideoTrackClip[];
  readonly filterIndex: number;
  readonly music: StoryAudioMeta | null;
  readonly selectedLayerId: string | null;
  readonly timelineTime: number;
}
// [END] WP1
