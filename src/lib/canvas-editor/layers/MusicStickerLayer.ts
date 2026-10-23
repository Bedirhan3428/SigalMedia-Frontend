import { BaseLayer } from './BaseLayer';
import { Rect, StoryAudioMeta } from '../types';
import { LayerBitmapCache } from '../utils/layerBitmapCache';

export class MusicStickerLayer extends BaseLayer {
  public override type = 'music_sticker';
  public audioMeta: StoryAudioMeta;
  private thumbnailImage: HTMLImageElement | null = null;
  private isImageLoaded = false;

  constructor(options: {
    audioMeta: StoryAudioMeta;
    id?: string;
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    onUpdate?: () => void;
  }) {
    super({
      id: options.id,
      transform: {
        x: options.x ?? 0.5,
        y: options.y ?? 0.65,
        scale: options.scale ?? 1.0,
        rotation: options.rotation ?? 0,
      },
    });
    this.audioMeta = options.audioMeta;

    if (this.audioMeta.thumbnail) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.thumbnailImage = img;
        this.isImageLoaded = true;
        if (options.onUpdate) options.onUpdate();
      };
      img.src = this.audioMeta.thumbnail;
    }
  }

  public override getBoundingBox(ctx: CanvasRenderingContext2D, canvasWidth: number): Rect {
    const width = Math.round(canvasWidth * 0.48);
    const height = Math.round(width * 0.28);
    return {
      x: -width / 2,
      y: -height / 2,
      width,
      height,
    };
  }

  private bitmapCache = new LayerBitmapCache();

  public override render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.visible) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth);
    const w = bounds.width;
    const h = bounds.height;
    const interactionScale = this.isInteracting ? 1.03 : 1.0;
    const scale = this.transform.scale * interactionScale;

    // Dokunma sırasında gölge ve ölçek değişir; yalnızca durağan halde önbellekten bas
    const margin = 40;
    const bmpW = w * scale + margin * 2;
    const bmpH = h * scale + margin * 2;
    const key = [
      this.audioMeta.title,
      this.audioMeta.artist,
      this.isImageLoaded ? 'img' : 'noimg',
      w,
      scale.toFixed(3),
    ].join('|');
    const bitmap = this.isInteracting
      ? null
      : this.bitmapCache.get(key, bmpW, bmpH, (bctx) => {
          bctx.translate(bmpW / 2, bmpH / 2);
          bctx.scale(scale, scale);
          this.drawContent(bctx, w, h);
        });

    ctx.save();
    ctx.filter = 'none';

    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    if (bitmap) {
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    } else {
      ctx.scale(scale, scale);
      this.drawContent(ctx, w, h);
    }
    ctx.restore();
  }

  // Yerel koordinatlarda (merkez 0,0) hap zemin + kapak + başlık/sanatçı çizimi
  private drawContent(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const radius = h / 2; // Tam yuvarlatılmış hap (pill)

    // 1. Yumuşak Dış Gölge
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = this.isInteracting ? 26 : 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = this.isInteracting ? 8 : 4;

    // 2. Yarı Saydam Buzlu Zemin (Frosted Pill)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    } else {
      ctx.rect(-w / 2, -h / 2, w, h);
    }
    ctx.fill();

    // Gölgeyi sıfırla
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // 3. Sol İkon / Kapak Görseli Bölümü
    const iconR = h * 0.36;
    const iconCenterX = -w / 2 + h * 0.5;
    const iconCenterY = 0;

    if (this.isImageLoaded && this.thumbnailImage) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconCenterX, iconCenterY, iconR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        this.thumbnailImage,
        iconCenterX - iconR,
        iconCenterY - iconR,
        iconR * 2,
        iconR * 2
      );
      ctx.restore();
    } else {
      // Müzik İkonu Rozeti (Gül/Pembe degradeli)
      ctx.fillStyle = '#EC4899';
      ctx.beginPath();
      ctx.arc(iconCenterX, iconCenterY, iconR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      const noteX = iconCenterX - 4;
      const noteY = iconCenterY - 6;
      ctx.arc(noteX, noteY + 10, 3.5, 0, Math.PI * 2);
      ctx.arc(noteX + 8, noteY + 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(noteX + 2, noteY, 2, 10);
      ctx.fillRect(noteX + 10, noteY - 2, 2, 10);
      ctx.fillRect(noteX + 2, noteY - 2, 10, 2.5);
    }

    // 4. Şarkı Başlığı ve Sanatçı Metni
    const textStartX = iconCenterX + iconR + 12;
    const maxTextW = w - (textStartX - (-w / 2)) - 16;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Başlık
    ctx.fillStyle = '#111827';
    ctx.font = `800 ${Math.round(h * 0.26)}px 'Plus Jakarta Sans', -apple-system, sans-serif`;
    let title = this.audioMeta.title || 'Müzik';
    if (ctx.measureText(title).width > maxTextW) {
      while (title.length > 3 && ctx.measureText(title + '...').width > maxTextW) {
        title = title.slice(0, -1);
      }
      title += '...';
    }
    ctx.fillText(title, textStartX, -h * 0.14);

    // Sanatçı
    ctx.fillStyle = '#6B7280';
    ctx.font = `600 ${Math.round(h * 0.20)}px 'Plus Jakarta Sans', -apple-system, sans-serif`;
    let artist = this.audioMeta.artist || 'Sanatçı';
    if (ctx.measureText(artist).width > maxTextW) {
      while (artist.length > 3 && ctx.measureText(artist + '...').width > maxTextW) {
        artist = artist.slice(0, -1);
      }
      artist += '...';
    }
    ctx.fillText(artist, textStartX, h * 0.18);
  }
}
