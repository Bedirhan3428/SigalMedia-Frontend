import { BaseLayer } from './BaseLayer';
import { Rect, StoryAudioMeta } from '../types';

export class MusicStickerLayer extends BaseLayer {
  public override type = 'music_sticker';
  public audioMeta: StoryAudioMeta;

  constructor(options: {
    audioMeta: StoryAudioMeta;
    id?: string;
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
  }) {
    super({
      id: options.id,
      transform: {
        x: options.x ?? 0.5,
        y: options.y ?? 0.65,
        scale: options.scale ?? 1.0,
        rotation: options.rotation ?? 0,
      }
    });
    this.audioMeta = options.audioMeta;
  }

  public override getBoundingBox(ctx: CanvasRenderingContext2D, canvasWidth: number): Rect {
    const width = Math.round(canvasWidth * 0.44);
    const height = Math.round(width * 0.28);
    return {
      x: -width / 2,
      y: -height / 2,
      width,
      height
    };
  }

  public override render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.visible) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth);
    const w = bounds.width;
    const h = bounds.height;
    const radius = h / 2; // Tam yuvarlatılmış hap (pill)

    ctx.save();
    ctx.filter = 'none';

    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    const interactionScale = this.isInteracting ? 1.02 : 1.0;
    ctx.scale(this.transform.scale * interactionScale, this.transform.scale * interactionScale);

    // 1. Dış Gölge
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = this.isInteracting ? 24 : 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = this.isInteracting ? 8 : 4;

    // 2. Yarı Saydam Buzlu Beyaz Hap Zemin (Frosted Pill)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
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

    // 3. Sol İkon Dairesi (Müzik İkonu / Dalga Rozeti)
    const iconR = h * 0.36;
    const iconCenterX = -w / 2 + h * 0.5;
    const iconCenterY = 0;

    ctx.fillStyle = '#EC4899'; // Pembe müzik rengi
    ctx.beginPath();
    ctx.arc(iconCenterX, iconCenterY, iconR, 0, Math.PI * 2);
    ctx.fill();

    // Müzik İkonu Çizimi (Nota sembolü)
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    const noteX = iconCenterX - 4;
    const noteY = iconCenterY - 6;
    ctx.arc(noteX, noteY + 10, 4, 0, Math.PI * 2);
    ctx.arc(noteX + 9, noteY + 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(noteX + 2, noteY, 2.5, 10);
    ctx.fillRect(noteX + 11, noteY - 2, 2.5, 10);
    ctx.fillRect(noteX + 2, noteY - 2, 11, 3);

    // 4. Şarkı Başlığı ve Sanatçı Metni
    const textStartX = iconCenterX + iconR + 12;
    const maxTextW = w - (textStartX - (-w / 2)) - 16;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Başlık
    ctx.fillStyle = '#111827';
    ctx.font = `800 ${Math.round(h * 0.28)}px 'Plus Jakarta Sans', -apple-system, sans-serif`;
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
    ctx.font = `600 ${Math.round(h * 0.22)}px 'Plus Jakarta Sans', -apple-system, sans-serif`;
    let artist = this.audioMeta.artist || 'Sanatçı';
    if (ctx.measureText(artist).width > maxTextW) {
      while (artist.length > 3 && ctx.measureText(artist + '...').width > maxTextW) {
        artist = artist.slice(0, -1);
      }
      artist += '...';
    }
    ctx.fillText(artist, textStartX, h * 0.18);

    ctx.restore();
  }
}
