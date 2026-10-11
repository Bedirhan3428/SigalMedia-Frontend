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

export type FitMode = 'contain' | 'cover' | 'fill';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  width?: number;          // Logical canvas width (default 1080)
  height?: number;         // Logical canvas height (default 1080)
  fitMode?: FitMode;       // How the media fits canvas
}
