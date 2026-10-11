import { LayerTransform, Point, Rect } from '../types';

export abstract class BaseLayer {
  public id: string;
  public abstract type: string;
  public transform: LayerTransform;
  public visible: boolean = true;
  public locked: boolean = false;
  public selected: boolean = false;
  public isInteracting: boolean = false; // İki parmakla dokunulduğunda aktifleşen yaylanma durumu

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

  /**
   * Borderless Canvas: Nesneler etrafında çirkin dikdörtgen çizgiler veya tutamaçlar çizilmez.
   * Geri bildirim doğrudan katmanın kendi render döngüsündeki yaylanma ve hafif parlama ile verilir.
   */
  public renderSelectionHighlight(_ctx: CanvasRenderingContext2D, _canvasWidth: number, _canvasHeight: number): void {
    // Sıfır çizgi ilkesi gereği tutamaç veya çizgi çizilmez
  }
}
