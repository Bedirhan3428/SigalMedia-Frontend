import { LayerTransform, Point, Rect } from '../types';

export abstract class BaseLayer {
  public id: string;
  public abstract type: string;
  public transform: LayerTransform;
  public visible: boolean = true;
  public temporalVisible: boolean = true;
  public timelineStart: number = 0;
  public timelineEnd: number = 60;
  public locked: boolean = false;
  public selected: boolean = false;
  public isInteracting: boolean = false; // İki parmakla dokunulduğunda aktifleşen yaylanma durumu

  constructor(options?: {
    id?: string;
    transform?: Partial<LayerTransform>;
    timelineStart?: number;
    timelineEnd?: number;
  }) {
    this.id = options?.id || Math.random().toString(36).substring(2, 9);
    this.transform = {
      x: 0.5,
      y: 0.5,
      scale: 1.0,
      rotation: 0,
      ...(options?.transform || {})
    };
    if (typeof options?.timelineStart === 'number') {
      this.timelineStart = options.timelineStart;
    }
    if (typeof options?.timelineEnd === 'number') {
      this.timelineEnd = options.timelineEnd;
    }
  }

  public isVisibleAtTime(t: number): boolean {
    return this.visible && t >= this.timelineStart - 0.03 && t <= this.timelineEnd + 0.03;
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
    if (!this.visible || !this.temporalVisible) return false;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);

    const rad = (-this.transform.rotation * Math.PI) / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;

    const unrotatedX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const unrotatedY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const touchSlop = this.type === 'media' ? 0 : 68;
    const halfW = (bounds.width * this.transform.scale) / 2 + touchSlop;
    const halfH = (bounds.height * this.transform.scale) / 2 + touchSlop;

    return (
      unrotatedX >= -halfW &&
      unrotatedX <= halfW &&
      unrotatedY >= -halfH &&
      unrotatedY <= halfH
    );
  }

  public isCornerHandleHit(point: Point, ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): boolean {
    if (this.type === 'media' || !this.selected || !this.visible || !this.temporalVisible) return false;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);
    const pad = 14;
    const halfW = ((bounds.width + pad * 2) * this.transform.scale) / 2;
    const halfH = ((bounds.height + pad * 2) * this.transform.scale) / 2;

    const rad = (-this.transform.rotation * Math.PI) / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const unrotatedX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const unrotatedY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const hitRadius = 56;
    const corners = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH],
    ];
    for (const [cx, cy] of corners) {
      if (Math.hypot(unrotatedX - cx, unrotatedY - cy) <= hitRadius) {
        return true;
      }
    }
    return false;
  }

  public renderSelectionHighlight(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (this.type === 'media' || !this.selected) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);
    const pad = 14;
    const w = bounds.width + pad * 2;
    const h = bounds.height + pad * 2;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    ctx.scale(this.transform.scale, this.transform.scale);

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
    ctx.lineWidth = Math.max(2.5, 3.5 / Math.max(0.4, this.transform.scale));
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 14);
    ctx.stroke();

    // Köşe tutamaç noktaları
    const r = Math.max(6, 9 / Math.max(0.4, this.transform.scale));
    ctx.fillStyle = '#ffffff';
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }
}
