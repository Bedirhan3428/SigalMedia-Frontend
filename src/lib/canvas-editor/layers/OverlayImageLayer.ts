import { BaseLayer } from './BaseLayer';
import { LayerTransform, Rect } from '../types';

export class OverlayImageLayer extends BaseLayer {
  public override type = 'image_overlay';
  public image: HTMLImageElement;
  public naturalWidth: number;
  public naturalHeight: number;

  constructor(options: {
    image: HTMLImageElement;
    id?: string;
    transform?: Partial<LayerTransform>;
  }) {
    super({
      id: options.id,
      transform: {
        x: 0.5,
        y: 0.5,
        scale: 1.0,
        rotation: 0,
        ...(options.transform || {})
      }
    });

    this.image = options.image;
    this.naturalWidth = options.image.naturalWidth || options.image.width || 300;
    this.naturalHeight = options.image.naturalHeight || options.image.height || 300;
  }

  /**
   * İkincil görselin 16:9 çerçeve taban boyutları:
   * Tuval genişliğinin %46'sı kadar genişlik ve tam 16:9 en-boy oranı.
   */
  public getBaseDimensions(canvasWidth: number): { width: number; height: number } {
    const targetW = canvasWidth * 0.46;
    const targetH = targetW * (9 / 16); // 16:9 En-Boy Oranı

    return {
      width: targetW,
      height: targetH
    };
  }

  public override getBoundingBox(_ctx: CanvasRenderingContext2D, canvasWidth: number): Rect {
    const dims = this.getBaseDimensions(canvasWidth);
    return {
      x: -dims.width / 2,
      y: -dims.height / 2,
      width: dims.width,
      height: dims.height
    };
  }

  public override render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.visible || !this.image) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const dims = this.getBaseDimensions(canvasWidth);
    const frameW = dims.width;
    const frameH = dims.height;
    // Çerçevenin yuvarlak köşesi
    const cornerRadius = Math.max(12, Math.round(frameH * 0.12));

    ctx.save();

    // 1. Filtrelerden Kesinlikle Etkilenmesin (Story efektleri bu katmana sızamaz)
    ctx.filter = 'none';

    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);

    // Etkileşim yaylanması (Tek veya iki parmakla dokunulduğunda hafif spring feedback)
    const interactionScale = this.isInteracting ? 1.04 : 1.0;
    const scaleX = this.transform.scale * (this.transform.flipH ? -1 : 1) * interactionScale;
    const scaleY = this.transform.scale * (this.transform.flipV ? -1 : 1) * interactionScale;
    ctx.scale(scaleX, scaleY);

    // 2. 16:9 Çerçevenin Yuvarlatılmış Patikası (Rounded Rect Path)
    const createFramePath = () => {
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-frameW / 2, -frameH / 2, frameW, frameH, cornerRadius);
      } else {
        const x = -frameW / 2, y = -frameH / 2, w = frameW, h = frameH, r = cornerRadius;
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
    };

    // 3. Çerçeve Dış Gölgesi (Hafif sinematik yükselti)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = this.isInteracting ? 22 : 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = this.isInteracting ? 8 : 4;

    // 4. Çerçeve Tabanı: Tam Siyah (#000000 - Sığmayan kısımlar siyah kalır)
    createFramePath();
    ctx.fillStyle = '#000000';
    ctx.fill();

    // 5. Çerçevenin İçine Kırp (Clip to rounded frame - Köşeler çerçevenin köşeleridir)
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    createFramePath();
    ctx.clip();

    // 6. Görseli 16:9 Çerçeve İçine Orantılı Sığdır (object-fit: contain)
    const imgScale = Math.min(frameW / (this.naturalWidth || 1), frameH / (this.naturalHeight || 1));
    const drawW = (this.naturalWidth || 1) * imgScale;
    const drawH = (this.naturalHeight || 1) * imgScale;

    ctx.drawImage(
      this.image,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH
    );
    ctx.restore(); // Kırpmayı sıfırla

    // 7. Çerçevenin Zarif İnce Kenarlık Çizgisi
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    createFramePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}
