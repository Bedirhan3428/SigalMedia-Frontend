import { BaseLayer } from './BaseLayer';
// [MODIFIED BY Bedirhan]
import {
  DEFAULT_FILTER_VALUES,
  DEFAULT_POST_ADJUSTMENTS,
  EditorMedia,
  FilterPreset,
  FilterValues,
  FitMode,
  MediaFilters,
  OverlayEffect,
  PostAdjustmentState,
  Rect,
  ReelsEffectClip,
  ReelsEffectId,
} from '../types';
import { ImageAdjustmentsEngine } from '../image-adjustments';

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

  // [START] CREATED BY Bedirhan
  public trimStart: number = 0;
  public trimEnd: number = 0;
  public playbackRate: number = 1.0;
  public volume: number = 1.0;
  public muted: boolean = false;
  public isMotionPhoto: boolean = false;
  public virtualTime: number = 0;
  public virtualPlaying: boolean = false;
  public postAdjustments: PostAdjustmentState = { ...DEFAULT_POST_ADJUSTMENTS };
  public reelsEffect: ReelsEffectId = 'none';
  public effectClips: ReelsEffectClip[] = [];
  public timelineTime: number = 0;
  public cropRect?: { x: number; y: number; width: number; height: number };
  public isCropOverlayOpen: boolean = false;
  // [END] CREATED BY Bedirhan

  private animFrameId: number | null = null;
  private onRenderCallback: (() => void) | null = null;
  private pixelCanvas: HTMLCanvasElement | null = null;

  // [START] CREATED BY Bedirhan
  public isTimeDependentEffect(): boolean {
    return (
      this.effectClips.length > 0 ||
      this.reelsEffect === 'zoom_pulse' ||
      this.reelsEffect === 'glitch' ||
      this.reelsEffect === 'flash' ||
      this.reelsEffect === 'shake'
    );
  }

  public isActiveEffectTimeDependentAt(timeSec: number): boolean {
    const active = ImageAdjustmentsEngine.resolveActiveEffects(
      this.reelsEffect,
      this.effectClips,
      timeSec
    );
    for (let i = 0; i < active.length; i++) {
      const e = active[i].effect;
      if (e === 'zoom_pulse' || e === 'glitch' || e === 'flash' || e === 'shake') {
        return true;
      }
    }
    return false;
  }
  // [END] CREATED BY Bedirhan

  // [MODIFIED BY Bedirhan]
  constructor(media: EditorMedia, options?: { fitMode?: FitMode; filters?: Partial<MediaFilters> }) {
    super();
    this.media = media;
    this.fitMode = options?.fitMode || 'contain';
    this.filters = { ...DEFAULT_FILTERS, ...(options?.filters || {}) };
    this.locked = false; // Görsel serbestçe sağa-sola hareket ettirilebilir, döndürülebilir ve ölçeklenebilir

    if (media.type === 'video' && media.element instanceof HTMLVideoElement) {
      const dur = Number.isFinite(media.duration) && (media.duration || 0) > 0
        ? (media.duration as number)
        : (Number.isFinite(media.element.duration) ? media.element.duration : 0);
      this.trimStart = 0;
      this.trimEnd = dur > 0 ? Math.min(dur, 60) : 0;
      this.playbackRate = 1.0;
      this.volume = 1.0;
      this.muted = false;
      media.element.playbackRate = 1.0;
      media.element.volume = 1.0;
      media.element.muted = false;
    }
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

    // ─────────────────────────────────────────────────────────────
    // AKILLI SIĞDIRMA VE OTOMATİK KÖŞE YUVARLAMA (24px KÖŞE DETAYI)
    // 9:16 ve tam ekran temasındayken radius: 0px.
    // Küçültüldüğü veya kenarlardan ayrıldığı anda otomatik 24px yuvarlama!
    // ─────────────────────────────────────────────────────────────
    const mediaAspect = (this.media.width || 1) / (this.media.height || 1);
    const canvasAspect = canvasWidth / canvasHeight;
    const is916 = Math.abs(mediaAspect - canvasAspect) < 0.025;

    const isFullScreenTouching =
      is916 &&
      this.transform.scale >= 0.995 &&
      Math.abs(this.transform.rotation % 360) < 0.5 &&
      Math.abs(this.transform.x - 0.5) < 0.005 &&
      Math.abs(this.transform.y - 0.5) < 0.005;

    const cornerRadius = isFullScreenTouching ? 0 : Math.round(24 * (canvasWidth / 414));

    ctx.save();
    if (
      !this.isCropOverlayOpen &&
      this.cropRect &&
      (this.cropRect.x > 0.002 ||
        this.cropRect.y > 0.002 ||
        this.cropRect.width < 0.998 ||
        this.cropRect.height < 0.998)
    ) {
      ctx.beginPath();
      ctx.rect(
        this.cropRect.x * canvasWidth,
        this.cropRect.y * canvasHeight,
        this.cropRect.width * canvasWidth,
        this.cropRect.height * canvasHeight
      );
      ctx.clip();
    }
    // 1. Serbest pozisyon (sağa / sola / yukarı / aşağı taşıma)
    ctx.translate(center.x, center.y);
    // 2. Serbest açı (döndürme)
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    // 3. Serbest ölçekleme (büyütme / küçültme), ayna (flip) ve etkileşim yaylanması
    const interactionScale = this.isInteracting ? 1.03 : 1.0;
    const scaleX = this.transform.scale * (this.transform.flipH ? -1 : 1) * interactionScale;
    const scaleY = this.transform.scale * (this.transform.flipV ? -1 : 1) * interactionScale;
    ctx.scale(scaleX, scaleY);

    // Otomatik Köşe Yuvarlama Kırpması (Eğer ekran sınırından ayrıldıysa)
    if (cornerRadius > 0) {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-dims.width / 2, -dims.height / 2, dims.width, dims.height, cornerRadius);
      } else {
        const x = -dims.width / 2, y = -dims.height / 2, w = dims.width, h = dims.height, r = cornerRadius;
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
      ctx.clip();
    }

    const filterStr = this.getFilterString();

    // A. Taban Çizim Kaynağı (Lo-Res: 1/6 oranında küçültülüp yumuşatma kapalı tekrar büyütülür)
    let drawSource: CanvasImageSource = this.media.element;
    let usePixelated = false;

    if (this.activeEffect === 'pixelate') {
      const offW = Math.max(16, Math.round(dims.width / 6));
      const offH = Math.max(16, Math.round(dims.height / 6));

      if (!this.pixelCanvas) {
        this.pixelCanvas = document.createElement('canvas');
      }
      if (this.pixelCanvas.width !== offW || this.pixelCanvas.height !== offH) {
        this.pixelCanvas.width = offW;
        this.pixelCanvas.height = offH;
      }

      const offCtx = this.pixelCanvas.getContext('2d');
      if (offCtx) {
        offCtx.imageSmoothingEnabled = false;
        offCtx.clearRect(0, 0, offW, offH);
        offCtx.drawImage(this.media.element, 0, 0, offW, offH);
        drawSource = this.pixelCanvas;
        usePixelated = true;
      }
    }

    const prevSmooth = ctx.imageSmoothingEnabled;
    if (usePixelated) {
      ctx.imageSmoothingEnabled = false;
    }

    // [MODIFIED BY Bedirhan]
    const hasCustomAdjustments =
      !ImageAdjustmentsEngine.isDefaultAdjustments(this.postAdjustments) ||
      this.reelsEffect !== 'none' ||
      this.effectClips.length > 0;

    if (hasCustomAdjustments) {
      ImageAdjustmentsEngine.renderAdjustedMedia(
        ctx,
        drawSource,
        {
          x: -dims.width / 2,
          y: -dims.height / 2,
          width: dims.width,
          height: dims.height,
        },
        this.postAdjustments,
        this.reelsEffect,
        this.timelineTime,
        filterStr,
        this.effectClips
      );
    } else {
      // Ana çizim
      ctx.filter = filterStr;
      ctx.drawImage(
        drawSource,
        -dims.width / 2,
        -dims.height / 2,
        dims.width,
        dims.height
      );
      ctx.filter = 'none';
    }

    if (usePixelated) {
      ctx.imageSmoothingEnabled = prevSmooth;
    }

    // B. Zoom Blur (%102 ve %104 oranında merkez sabit kalarak hafif opaklıkla üst üste bindirilir)
    if (this.activeEffect === 'zoom_blur') {
      ctx.save();
      ctx.globalAlpha = 0.22;
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

    // C. Soft Light (Parlak bölgeler screen harmanlama moduyla üst üste basılır)
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

    // D. Handheld / Shake (Organik kamera sarsıntısı)
    if (this.activeEffect === 'shake') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25;
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

    // E. Grainy (Önceden üretilmiş tek offscreen noise canvas overlay olarak basılır)
    if (this.activeEffect === 'grain') {
      const nCanvas = ImageAdjustmentsEngine.getGrainCanvas();
      if (nCanvas) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.22;
        ctx.drawImage(nCanvas, -dims.width / 2, -dims.height / 2, dims.width, dims.height);
        ctx.restore();
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

  // [START] CREATED BY Bedirhan
  public enableMotionPhoto(duration = 5): void {
    this.isMotionPhoto = true;
    this.media.duration = duration;
    this.trimStart = 0;
    this.trimEnd = duration;
    this.playbackRate = 1.0;
    this.volume = 0;
    this.muted = true;
    this.virtualTime = 0;
    this.virtualPlaying = true;
  }

  public setPostAdjustments(adj: Partial<PostAdjustmentState>): void {
    this.postAdjustments = { ...this.postAdjustments, ...adj };
  }

  public resetPostAdjustments(): void {
    this.postAdjustments = { ...DEFAULT_POST_ADJUSTMENTS };
  }

  public setReelsEffect(effect: ReelsEffectId): void {
    this.reelsEffect = effect;
  }

  public setEffectClips(clips: ReelsEffectClip[]): void {
    this.effectClips = clips.map((c) => ({ ...c }));
  }

  public getEffectClips(): ReelsEffectClip[] {
    return this.effectClips.map((c) => ({ ...c }));
  }

  public getVideoElement(): HTMLVideoElement | null {
    if (this.media.type === 'video' && this.media.element instanceof HTMLVideoElement) {
      return this.media.element;
    }
    return null;
  }

  public getDuration(): number {
    if (this.isMotionPhoto) {
      return this.media.duration || 5;
    }
    const video = this.getVideoElement();
    if (!video) return 0;
    const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : (this.media.duration || 0);
    return Number.isFinite(d) ? d : 0;
  }

  public getCurrentTime(): number {
    if (this.isMotionPhoto) {
      return this.virtualTime;
    }
    const video = this.getVideoElement();
    return video ? video.currentTime || 0 : 0;
  }

  public setTrim(start: number, end: number): void {
    if (this.isMotionPhoto) {
      const clampedStart = Math.max(0, Math.min(start, 59.5));
      const clampedEnd = Math.max(clampedStart + 0.5, Math.min(end, 60));
      this.trimStart = clampedStart;
      this.trimEnd = clampedEnd;
      this.media.duration = Math.max(5, clampedEnd);
      if (this.virtualTime < this.trimStart || this.virtualTime > this.trimEnd) {
        this.virtualTime = this.trimStart;
      }
      return;
    }

    const dur = this.getDuration();
    const maxEnd = dur > 0 ? dur : Math.max(end, start + 0.1);
    const clampedStart = Math.max(0, Math.min(start, maxEnd - 0.1));
    const clampedEnd = Math.max(clampedStart + 0.1, Math.min(end, maxEnd, clampedStart + 60));
    this.trimStart = clampedStart;
    this.trimEnd = clampedEnd;

    const video = this.getVideoElement();
    if (video) {
      if (video.currentTime < this.trimStart || video.currentTime > this.trimEnd) {
        video.currentTime = this.trimStart;
      }
    }
  }

  public setPlaybackRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(4.0, rate));
    this.playbackRate = clamped;
    const video = this.getVideoElement();
    if (video) {
      video.playbackRate = clamped;
    }
  }

  public setVolume(volume: number, muted?: boolean): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.volume = clamped;
    if (typeof muted === 'boolean') {
      this.muted = muted;
    } else if (clamped === 0) {
      this.muted = true;
    } else if (this.muted && clamped > 0 && muted === undefined) {
      this.muted = false;
    }

    const video = this.getVideoElement();
    if (video) {
      video.volume = clamped;
      video.muted = this.muted;
    }
  }

  public async seek(t: number): Promise<void> {
    const dur = this.getDuration();
    const clamped = Math.max(0, Math.min(t, dur > 0 ? Math.max(0, dur - 0.001) : t));

    if (this.isMotionPhoto) {
      this.virtualTime = clamped;
      return;
    }

    const video = this.getVideoElement();
    if (!video) return;

    // 60 FPS export sırasında aynı kaynak kare içindeysek (15ms tolerans) gereksiz GOP seek yapma
    if (Math.abs(video.currentTime - clamped) < 0.015 && video.readyState >= 2 && !video.seeking) {
      return;
    }

    return new Promise<void>((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };

      const onSeeked = () => {
        finish();
      };

      const timer = setTimeout(finish, 42);
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = clamped;
    });
  }

  public async renderAt(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    t: number
  ): Promise<void> {
    this.currentValues = { ...this.targetValues };
    await this.seek(t);
    this.render(ctx, canvasWidth, canvasHeight);
  }

  public destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.virtualPlaying = false;
    const video = this.getVideoElement();
    if (video) {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
    }
    if (this.media.objectUrl) {
      try {
        URL.revokeObjectURL(this.media.objectUrl);
      } catch {}
    }
  }
  // [END] CREATED BY Bedirhan
}
