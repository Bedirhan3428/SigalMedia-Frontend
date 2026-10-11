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
   * İkincil görselin varsayılan tuval taban boyutları:
   * Tuval genişliğinin %35'i kadar başlatılır ve en-boy oranı korunur.
   */
  public getBaseDimensions(canvasWidth: number): { width: number; height: number } {
    const targetW = canvasWidth * 0.35;
    const aspect = this.naturalHeight / (this.naturalWidth || 1);
    const targetH = targetW * aspect;

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

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);

    // Etkileşim yaylanması (İki parmakla dokunulduğunda hafif spring feedback)
    const interactionScale = this.isInteracting ? 1.04 : 1.0;
    const scaleX = this.transform.scale * (this.transform.flipH ? -1 : 1) * interactionScale;
    const scaleY = this.transform.scale * (this.transform.flipV ? -1 : 1) * interactionScale;
    ctx.scale(scaleX, scaleY);

    if (this.isInteracting) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
    }

    ctx.drawImage(
      this.image,
      -dims.width / 2,
      -dims.height / 2,
      dims.width,
      dims.height
    );

    ctx.restore();
  }
}
