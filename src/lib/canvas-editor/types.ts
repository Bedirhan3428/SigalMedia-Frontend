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

export interface TextStyle {
  text: string;
  fontSize: number;          // Base font size in px relative to canvas
  fontFamily: string;
  color: string;
  fontWeight: 'normal' | 'bold' | '600' | '800';
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

export interface StoryFilterPreset {
  id: string;
  name: string;
  filters: Partial<MediaFilters>;
}

export const STORY_FILTER_PRESETS: StoryFilterPreset[] = [
  {
    id: 'normal',
    name: 'Normal',
    filters: {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      blur: 0,
      sepia: 0,
      grayscale: 0,
      hueRotate: 0,
      invert: 0
    }
  },
  {
    id: 'oslo',
    name: 'Oslo',
    filters: {
      brightness: 106,
      contrast: 112,
      saturation: 90,
      hueRotate: 15,
      sepia: 5
    }
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    filters: {
      brightness: 105,
      contrast: 118,
      saturation: 135,
      sepia: 12
    }
  },
  {
    id: 'vintage',
    name: 'Vintage',
    filters: {
      brightness: 102,
      contrast: 95,
      saturation: 85,
      sepia: 45
    }
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    filters: {
      brightness: 100,
      contrast: 130,
      saturation: 150,
      hueRotate: -25
    }
  },
  {
    id: 'bw',
    name: 'B&W',
    filters: {
      grayscale: 100,
      contrast: 135,
      brightness: 105
    }
  }
];

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  width?: number;          // Logical canvas width (default 1080)
  height?: number;         // Logical canvas height (default 1080)
  fitMode?: FitMode;       // How the media fits canvas
}
