import { BaseLayer } from './BaseLayer';
import { LayerTransform, Rect, OverlayShapeMode } from '../types';

export class OverlayImageLayer extends BaseLayer {
  public override type = 'image_overlay';
  public image: HTMLImageElement;
  public naturalWidth: number;
  public naturalHeight: number;
  public shapeMode: OverlayShapeMode = 'original';

  constructor(options: {
    image: HTMLImageElement;
    id?: string;
    shapeMode?: OverlayShapeMode;
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
    if (options.shapeMode) {
      this.shapeMode = options.shapeMode;
    }
  }

  /**
   * Tek tıkla 6'lı Şekil Döngüsü:
   * Mod 1 (original) -> Mod 2 (rounded) -> Mod 3 (circle) -> Mod 4 (polaroid) -> Mod 5 (heart) -> Mod 6 (star)
   */
  public cycleShapeMode(): OverlayShapeMode {
    const sequence: OverlayShapeMode[] = ['original', 'rounded', 'circle', 'polaroid', 'heart', 'star'];
    const currentIndex = sequence.indexOf(this.shapeMode);
    const nextIndex = (currentIndex + 1) % sequence.length;
    this.shapeMode = sequence[nextIndex];
    return this.shapeMode;
  }

  /**
   * İkincil fotoğraf boyutları:
   * 'original' modunda görselin gerçek en-boy oranı korunarak açılır.
   */
  public getBaseDimensions(canvasWidth: number): { width: number; height: number } {
    const size = canvasWidth * 0.40;

    if (this.shapeMode === 'original') {
      const nw = this.naturalWidth || 300;
      const nh = this.naturalHeight || 300;
      const aspect = nw / nh;
      if (aspect >= 1) {
        const w = canvasWidth * 0.48;
        const h = w / aspect;
        return { width: w, height: h };
      } else {
        const h = canvasWidth * 0.54;
        const w = h * aspect;
        return { width: Math.max(canvasWidth * 0.28, w), height: h };
      }
    }

    if (this.shapeMode === 'polaroid') {
      return {
        width: size,
        height: size * 1.22
      };
    }
    return {
      width: size,
      height: size
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

  /**
   * Kalp Kesim Patikası (Heart Path)
   */
  private createHeartPath(ctx: CanvasRenderingContext2D, size: number) {
    const s = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.72);
    // Sol alt eğri -> sol kanat -> sol üst yuvarlak tepe -> tepe çukuru
    ctx.bezierCurveTo(-s * 0.45, s * 0.35, -s * 0.95, -s * 0.1, -s * 0.95, -s * 0.48);
    ctx.bezierCurveTo(-s * 0.95, -s * 0.88, -s * 0.45, -s * 0.96, 0, -s * 0.45);
    // Tepe çukuru -> sağ üst yuvarlak tepe -> sağ kanat -> alt sivri uç
    ctx.bezierCurveTo(s * 0.45, -s * 0.96, s * 0.95, -s * 0.88, s * 0.95, -s * 0.48);
    ctx.bezierCurveTo(s * 0.95, -s * 0.1, s * 0.45, s * 0.35, 0, s * 0.72);
    ctx.closePath();
  }

  /**
   * 5 Köşeli Yıldız Kesim Patikası (Star Path)
   */
  private createStarPath(ctx: CanvasRenderingContext2D, size: number) {
    const outerR = size * 0.50;
    const innerR = size * 0.22;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  public override render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.visible || !this.image) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const dims = this.getBaseDimensions(canvasWidth);
    const size = canvasWidth * 0.40;

    ctx.save();

    // 1. Filtrelerden Kesinlikle Etkilenmesin (Story filtreleri bu katmana sızamaz)
    ctx.filter = 'none';

    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);

    // Hafif ve zarif etkileşim yaylanması (%2 spring scale, çerçeve çizgisi yok)
    const interactionScale = this.isInteracting ? 1.02 : 1.0;
    const scaleX = this.transform.scale * (this.transform.flipH ? -1 : 1) * interactionScale;
    const scaleY = this.transform.scale * (this.transform.flipV ? -1 : 1) * interactionScale;
    ctx.scale(scaleX, scaleY);

    const cornerRadius = Math.round(20 * (canvasWidth / 414));

    // ─────────────────────────────────────────────────────────────
    // MOD 1: ORİJİNAL EN-BOY ORANI (ORİJİNAL BOYUT & ZARİF KÖŞELER)
    // ─────────────────────────────────────────────────────────────
    if (this.shapeMode === 'original') {
      const origW = dims.width;
      const origH = dims.height;
      const origRadius = Math.max(8, Math.round(14 * (canvasWidth / 414)));

      ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
      ctx.shadowBlur = this.isInteracting ? 26 : 16;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = this.isInteracting ? 8 : 4;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-origW / 2, -origH / 2, origW, origH, origRadius);
      } else {
        ctx.rect(-origW / 2, -origH / 2, origW, origH);
      }
      ctx.closePath();

      ctx.fillStyle = '#000000';
      ctx.fill();

      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-origW / 2, -origH / 2, origW, origH, origRadius);
      } else {
        ctx.rect(-origW / 2, -origH / 2, origW, origH);
      }
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        this.image,
        -origW / 2,
        -origH / 2,
        origW,
        origH
      );
      ctx.restore();

      ctx.restore();
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // MOD 4: BEYAZ ÇERÇEVELİ POLAROID
    // ─────────────────────────────────────────────────────────────
    if (this.shapeMode === 'polaroid') {
      const cardW = dims.width;
      const cardH = dims.height;
      const cardRadius = Math.max(8, Math.round(12 * (canvasWidth / 414)));
      const photoMargin = Math.round(14 * (canvasWidth / 414));
      const photoW = cardW - photoMargin * 2;
      const photoH = photoW;
      const photoTop = -cardH / 2 + photoMargin;

      // Polaroid Kart Gölgesi
      ctx.shadowColor = 'rgba(0, 0, 0, 0.40)';
      ctx.shadowBlur = this.isInteracting ? 30 : 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = this.isInteracting ? 10 : 5;

      // Polaroid Beyaz Gövdesi
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, cardRadius);
      } else {
        ctx.rect(-cardW / 2, -cardH / 2, cardW, cardH);
      }
      ctx.fill();

      // Gölgeyi sıfırla ve fotoğraf alanına kırp
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.rect(-cardW / 2 + photoMargin, photoTop, photoW, photoH);
      ctx.clip();

      // Görseli kare fotoğraf alanına cover ölçekle
      const scale = Math.max(photoW / (this.naturalWidth || 1), photoH / (this.naturalHeight || 1));
      const drawW = (this.naturalWidth || 1) * scale;
      const drawH = (this.naturalHeight || 1) * scale;
      const imgCenterX = 0;
      const imgCenterY = photoTop + photoH / 2;

      ctx.drawImage(
        this.image,
        imgCenterX - drawW / 2,
        imgCenterY - drawH / 2,
        drawW,
        drawH
      );
      ctx.restore();

      ctx.restore();
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // DİĞER 4 MOD: YUMUŞAK KÖŞELİ KARE, DAİRE, KALP, YILDIZ
    // ─────────────────────────────────────────────────────────────
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = this.isInteracting ? 26 : 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = this.isInteracting ? 8 : 4;

    const defineShapePath = () => {
      if (this.shapeMode === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.closePath();
      } else if (this.shapeMode === 'heart') {
        this.createHeartPath(ctx, size);
      } else if (this.shapeMode === 'star') {
        this.createStarPath(ctx, size);
      } else {
        // 'rounded' - Yumuşak Köşeli Kare (20px radius)
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-size / 2, -size / 2, size, size, cornerRadius);
        } else {
          ctx.rect(-size / 2, -size / 2, size, size);
        }
        ctx.closePath();
      }
    };

    // Taban silüet dolgusu (siyah)
    defineShapePath();
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Şekil maskesine kırp (Clip)
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    defineShapePath();
    ctx.clip();

    // Görseli şeklin içine object-fit: cover olarak merkezle
    const coverScale = Math.max(size / (this.naturalWidth || 1), size / (this.naturalHeight || 1));
    const drawW = (this.naturalWidth || 1) * coverScale;
    const drawH = (this.naturalHeight || 1) * coverScale;

    ctx.drawImage(
      this.image,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH
    );
    ctx.restore();

    ctx.restore();
  }
}
