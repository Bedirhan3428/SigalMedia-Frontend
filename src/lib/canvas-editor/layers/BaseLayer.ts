import { LayerTransform, Point, Rect } from '../types';

export abstract class BaseLayer {
  public id: string;
  public abstract type: string;
  public transform: LayerTransform;
  public visible: boolean = true;
  public locked: boolean = false;
  public selected: boolean = false;

  constructor(options?: {
    id?: string;
    transform?: Partial<LayerTransform>;
  }) {
    this.id = options?.id || Math.random().toString(36).substring(2, 9);
    this.transform = {
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      ...(options?.transform || {})
    };
  }

  public getPixelPosition(canvasWidth: number, canvasHeight: number): Point {
    return {
      x: this.transform.x * canvasWidth,
      y: this.transform.y * canvasHeight
    };
  }

  public abstract render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void;

  public abstract getBoundingBox(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): Rect;

  public containsPoint(point: Point, ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): boolean {
    if (!this.visible) return false;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);

    const rad = (-this.transform.rotation * Math.PI) / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;

    const unrotatedX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const unrotatedY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const halfW = (bounds.width * this.transform.scale) / 2;
    const halfH = (bounds.height * this.transform.scale) / 2;

    return (
      unrotatedX >= -halfW &&
      unrotatedX <= halfW &&
      unrotatedY >= -halfH &&
      unrotatedY <= halfH
    );
  }

  public getRotateHandleY(ctx: CanvasRenderingContext2D, _canvasWidth: number, canvasHeight: number): number {
    const bounds = this.getBoundingBox(ctx, _canvasWidth, canvasHeight);
    const h = bounds.height * this.transform.scale;
    if (this.type === 'media') {
      // Görsel ekranı kaplasa dahi döndürme pini tuval içinde rahatça görünebilir ve tıklanabilir kalsın
      return -Math.min(h / 2 + 46, canvasHeight * 0.40);
    }
    return -h / 2 - 38;
  }

  public renderSelectionHighlight(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.selected) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);
    const w = bounds.width * this.transform.scale;
    const h = bounds.height * this.transform.scale;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);

    // SigalMedia yeşil çerçevesi
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#10b981';
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(-w / 2 - 12, -h / 2 - 12, w + 24, h + 24);
    ctx.setLineDash([]);

    // Köşe tutamaçları (Dokunmatik için rahat boyut)
    const handleRadius = 10;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;

    const corners = [
      [-w / 2 - 12, -h / 2 - 12],
      [w / 2 + 12, -h / 2 - 12],
      [-w / 2 - 12, h / 2 + 12],
      [w / 2 + 12, h / 2 + 12]
    ];

    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Üst döndürme pini (Her zaman tuvalin içinde ve görünür)
    const rotateHandleY = this.getRotateHandleY(ctx, canvasWidth, canvasHeight);
    ctx.beginPath();
    ctx.moveTo(0, this.type === 'media' ? rotateHandleY + 24 : -h / 2 - 12);
    ctx.lineTo(0, rotateHandleY);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, rotateHandleY, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }
}
