import { BaseLayer } from './BaseLayer';
import { EditorMedia, FitMode, MediaFilters, Rect } from '../types';

export const DEFAULT_FILTERS: MediaFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  hueRotate: 0,
  invert: 0
};

export class MediaLayer extends BaseLayer {
  public override type = 'media';
  public media: EditorMedia;
  public filters: MediaFilters;
  public fitMode: FitMode;

  constructor(media: EditorMedia, options?: { fitMode?: FitMode; filters?: Partial<MediaFilters> }) {
    super();
    this.media = media;
    this.fitMode = options?.fitMode || 'contain';
    this.filters = { ...DEFAULT_FILTERS, ...(options?.filters || {}) };
    this.locked = false; // Görsel serbestçe sağa-sola hareket ettirilebilir, döndürülebilir ve ölçeklenebilir
  }

  public setFilters(filters: Partial<MediaFilters>) {
    this.filters = { ...this.filters, ...filters };
  }

  public resetFilters() {
    this.filters = { ...DEFAULT_FILTERS };
  }

  public getFilterString(): string {
    const parts: string[] = [];
    if (this.filters.brightness !== 100) parts.push(`brightness(${this.filters.brightness}%)`);
    if (this.filters.contrast !== 100) parts.push(`contrast(${this.filters.contrast}%)`);
    if (this.filters.saturation !== 100) parts.push(`saturate(${this.filters.saturation}%)`);
    if (this.filters.blur > 0) parts.push(`blur(${this.filters.blur}px)`);
    if (this.filters.sepia > 0) parts.push(`sepia(${this.filters.sepia}%)`);
    if (this.filters.grayscale > 0) parts.push(`grayscale(${this.filters.grayscale}%)`);
    if (this.filters.hueRotate !== 0) parts.push(`hue-rotate(${this.filters.hueRotate}deg)`);
    if (this.filters.invert > 0) parts.push(`invert(${this.filters.invert}%)`);

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
    // 3. Serbest ölçekleme (büyütme / küçültme) ve ayna (flip)
    const scaleX = this.transform.scale * (this.transform.flipH ? -1 : 1);
    const scaleY = this.transform.scale * (this.transform.flipV ? -1 : 1);
    ctx.scale(scaleX, scaleY);

    const filterStr = this.getFilterString();
    ctx.filter = filterStr;

    ctx.drawImage(
      this.media.element,
      -dims.width / 2,
      -dims.height / 2,
      dims.width,
      dims.height
    );

    ctx.filter = 'none';
    ctx.restore();
  }

  public flipHorizontal(): void {
    this.transform.flipH = !this.transform.flipH;
  }

  public flipVertical(): void {
    this.transform.flipV = !this.transform.flipV;
  }
}
