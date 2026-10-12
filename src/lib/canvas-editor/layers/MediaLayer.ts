import { BaseLayer } from './BaseLayer';
import {
  DEFAULT_FILTER_VALUES,
  EditorMedia,
  FilterPreset,
  FILTER_PRESETS,
  FilterValues,
  FitMode,
  MediaFilters,
  OverlayEffect,
  Rect
} from '../types';

export const DEFAULT_FILTERS: MediaFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  pixelate: 0,
  grain: 0,
  zoomBlur: 0,
  chromatic: 0
};

export class MediaLayer extends BaseLayer {
  public override type = 'media';
  public media: EditorMedia;
  public filters: MediaFilters;
  public fitMode: FitMode;

  // LERP ve Yumuşak Geçiş (No-Snap Interpolation) Değerleri
  public currentValues: FilterValues = { ...DEFAULT_FILTER_VALUES };
  public targetValues: FilterValues = { ...DEFAULT_FILTER_VALUES };
  public activeEffect: OverlayEffect = null;

  private animFrameId: number | null = null;
  private onRenderCallback: (() => void) | null = null;

  private static noiseCanvas: HTMLCanvasElement | null = null;
  private pixelCanvas: HTMLCanvasElement | null = null;

  private static getNoiseCanvas(): HTMLCanvasElement | null {
    if (MediaLayer.noiseCanvas) return MediaLayer.noiseCanvas;
    if (typeof document === 'undefined') return null;

    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 128;
    noiseCanvas.height = 128;
    const nCtx = noiseCanvas.getContext('2d');
    if (!nCtx) return null;

    const imgData = nCtx.createImageData(128, 128);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const val = (Math.random() * 255) | 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
    nCtx.putImageData(imgData, 0, 0);

    MediaLayer.noiseCanvas = noiseCanvas;
    return MediaLayer.noiseCanvas;
  }

  constructor(media: EditorMedia, options?: { fitMode?: FitMode; filters?: Partial<MediaFilters> }) {
    super();
    this.media = media;
    this.fitMode = options?.fitMode || 'contain';
    this.filters = { ...DEFAULT_FILTERS, ...(options?.filters || {}) };
    this.locked = false; // Görsel serbestçe sağa-sola hareket ettirilebilir, döndürülebilir ve ölçeklenebilir
  }

  /**
   * Hedef filtre presetine LERP ile pürüzsüz geçiş (Aktif = Aktif + (Hedef - Aktif) * 0.15)
   */
  public setPreset(preset: FilterPreset, onRender?: () => void) {
    this.targetValues = { ...preset.values };
    this.activeEffect = preset.overlayEffect || null;
    if (onRender) this.onRenderCallback = onRender;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    const animateLerp = () => {
      let isDone = true;
      const keys: (keyof FilterValues)[] = [
        'brightness',
        'contrast',
        'saturate',
        'sepia',
        'grayscale',
        'hueRotate',
        'blur'
      ];

      for (const k of keys) {
        const diff = this.targetValues[k] - this.currentValues[k];
        if (Math.abs(diff) > 0.003) {
          // LERP formülü: Aktif = Aktif + (Hedef - Aktif) * 0.15
          this.currentValues[k] += diff * 0.15;
          isDone = false;
        } else {
          this.currentValues[k] = this.targetValues[k];
        }
      }

      if (this.onRenderCallback) {
        this.onRenderCallback();
      }

      if (!isDone) {
        this.animFrameId = requestAnimationFrame(animateLerp);
      } else {
        this.animFrameId = null;
      }
    };

    this.animFrameId = requestAnimationFrame(animateLerp);
  }

  public setFilters(filters: Partial<MediaFilters>) {
    this.filters = { ...DEFAULT_FILTERS, ...filters };
  }

  public resetFilters() {
    this.filters = { ...DEFAULT_FILTERS };
    this.currentValues = { ...DEFAULT_FILTER_VALUES };
    this.targetValues = { ...DEFAULT_FILTER_VALUES };
    this.activeEffect = null;
  }

  public getFilterString(): string {
    const parts: string[] = [];
    if (Math.abs(this.currentValues.brightness - 1.0) > 0.005) {
      parts.push(`brightness(${Math.round(this.currentValues.brightness * 100)}%)`);
    }
    if (Math.abs(this.currentValues.contrast - 1.0) > 0.005) {
      parts.push(`contrast(${Math.round(this.currentValues.contrast * 100)}%)`);
    }
    if (Math.abs(this.currentValues.saturate - 1.0) > 0.005) {
      parts.push(`saturate(${Math.round(this.currentValues.saturate * 100)}%)`);
    }
    if (this.currentValues.sepia > 0.005) {
      parts.push(`sepia(${Math.round(this.currentValues.sepia * 100)}%)`);
    }
    if (this.currentValues.grayscale > 0.005) {
      parts.push(`grayscale(${Math.round(this.currentValues.grayscale * 100)}%)`);
    }
    if (Math.abs(this.currentValues.hueRotate) > 0.5) {
      parts.push(`hue-rotate(${Math.round(this.currentValues.hueRotate)}deg)`);
    }
    if (this.currentValues.blur > 0.05) {
      parts.push(`blur(${this.currentValues.blur.toFixed(1)}px)`);
    }

    return parts.length > 0 ? parts.join(' ') : 'none';
  }

  public getBaseDimensions(canvasWidth: number, canvasHeight: number): { width: number; height: number } {
    const mediaW = this.media.width;
    const mediaH = this.media.height;

    if (this.fitMode === 'fill') {
      return { width: canvasWidth, height: canvasHeight };
    }

    const scale = this.fitMode === 'cover'
      ? Math.max(canvasWidth / mediaW, canvasHeight / mediaH)
      : Math.min(canvasWidth / mediaW, canvasHeight / mediaH);

    return {
      width: mediaW * scale,
      height: mediaH * scale
    };
  }

  public override getBoundingBox(_ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): Rect {
    const dims = this.getBaseDimensions(canvasWidth, canvasHeight);
    return {
      x: -dims.width / 2,
      y: -dims.height / 2,
      width: dims.width,
      height: dims.height
    };
  }

  public override render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.visible || !this.media.element) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const dims = this.getBaseDimensions(canvasWidth, canvasHeight);

    ctx.save();
    // 1. Serbest pozisyon (sağa / sola / yukarı / aşağı taşıma)
    ctx.translate(center.x, center.y);
    // 2. Serbest açı (döndürme)
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    // 3. Serbest ölçekleme (büyütme / küçültme), ayna (flip) ve etkileşim yaylanması
    const interactionScale = this.isInteracting ? 1.03 : 1.0;
    const scaleX = this.transform.scale * (this.transform.flipH ? -1 : 1) * interactionScale;
    const scaleY = this.transform.scale * (this.transform.flipV ? -1 : 1) * interactionScale;
    ctx.scale(scaleX, scaleY);

    const filterStr = this.getFilterString();
    ctx.filter = filterStr;

    // A. Taban Çizim Kaynağı (Lo-Res / Pikselleştirme: 120 x H boyuta küçültülüp yumuşatma kapalı basılır)
    let drawSource: CanvasImageSource = this.media.element;
    let usePixelated = false;

    if (this.activeEffect === 'pixelate') {
      const offW = 120;
      const offH = Math.max(12, Math.round(120 * (dims.height / dims.width)));

      if (!this.pixelCanvas) {
        this.pixelCanvas = document.createElement('canvas');
      }
      this.pixelCanvas.width = offW;
      this.pixelCanvas.height = offH;

      const offCtx = this.pixelCanvas.getContext('2d');
      if (offCtx) {
        offCtx.imageSmoothingEnabled = false;
        offCtx.drawImage(this.media.element, 0, 0, offW, offH);
        drawSource = this.pixelCanvas;
        usePixelated = true;
      }
    }

    const prevSmooth = ctx.imageSmoothingEnabled;
    if (usePixelated) {
      ctx.imageSmoothingEnabled = false;
    }

    // Ana çizim
    ctx.drawImage(
      drawSource,
      -dims.width / 2,
      -dims.height / 2,
      dims.width,
      dims.height
    );

    if (usePixelated) {
      ctx.imageSmoothingEnabled = prevSmooth;
    }

    // B. Zoom Blur (%102 ve %104 oranında iki kez hafif opaklıkla alpha 0.25 üst üste bindirilir)
    if (this.activeEffect === 'zoom_blur') {
      ctx.save();
      ctx.globalAlpha = 0.25;
      for (const scaleFactor of [1.02, 1.04]) {
        ctx.save();
        ctx.scale(scaleFactor, scaleFactor);
        ctx.drawImage(
          drawSource,
          -dims.width / 2,
          -dims.height / 2,
          dims.width,
          dims.height
        );
        ctx.restore();
      }
      ctx.restore();
    }

    // C. Soft Light / Bloom (Rüya gibi ışık dağılması / dreamy bloom)
    if (this.activeEffect === 'bloom') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22;
      ctx.drawImage(
        drawSource,
        -dims.width / 2,
        -dims.height / 2,
        dims.width,
        dims.height
      );
      ctx.restore();
    }

    // D. Handheld / Shake (Organik kamera sarsıntısı / hafif optik ayrışma)
    if (this.activeEffect === 'shake') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(
        drawSource,
        -dims.width / 2 - 3,
        -dims.height / 2,
        dims.width,
        dims.height
      );
      ctx.drawImage(
        drawSource,
        -dims.width / 2 + 3,
        -dims.height / 2,
        dims.width,
        dims.height
      );
      ctx.restore();
    }

    // Filtre stringini sıfırla (gren dokusu filtrelenmesin)
    ctx.filter = 'none';

    // E. Grainy (128x128 piksellik yarı saydam gürültü deseni ctx.globalCompositeOperation = 'overlay' basılır)
    if (this.activeEffect === 'grain') {
      const nCanvas = MediaLayer.getNoiseCanvas();
      if (nCanvas) {
        const pattern = ctx.createPattern(nCanvas, 'repeat');
        if (pattern) {
          ctx.save();
          ctx.globalCompositeOperation = 'overlay';
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = pattern;
          ctx.fillRect(-dims.width / 2, -dims.height / 2, dims.width, dims.height);
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  public flipHorizontal(): void {
    this.transform.flipH = !this.transform.flipH;
  }

  public flipVertical(): void {
    this.transform.flipV = !this.transform.flipV;
  }
}
