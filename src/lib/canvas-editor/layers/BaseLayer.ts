import { LayerStateSnapshot, LayerTransform, MAX_VIDEO_SEC, Point, Rect } from '../types';

export type HandleId = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'b' | 'l' | 'r';

export abstract class BaseLayer {
  public id: string;
  public abstract type: string;
  public transform: LayerTransform;
  public visible: boolean = true;
  public temporalVisible: boolean = true;
  public timelineStart: number = 0;
  public timelineEnd: number = MAX_VIDEO_SEC;
  public locked: boolean = false;
  /** 0..1: katman çizilirken (önizleme ve export) globalAlpha ile uygulanır. */
  public opacity: number = 1;
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

  /** Undo için değiştirilebilir durumun kopyası (alt sınıflar genişletir). */
  public getState(): LayerStateSnapshot {
    return {
      transform: { ...this.transform },
      visible: this.visible,
      locked: this.locked,
      opacity: this.opacity,
      timelineStart: this.timelineStart,
      timelineEnd: this.timelineEnd,
    };
  }

  /** getState() çıktısını geri uygular. */
  public applyState(state: LayerStateSnapshot): void {
    this.transform = { ...state.transform };
    this.visible = state.visible;
    this.locked = state.locked;
    this.opacity = typeof state.opacity === "number" ? state.opacity : 1;
    this.timelineStart = state.timelineStart;
    this.timelineEnd = state.timelineEnd;
    this.isInteracting = false;
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

  /** Kenar tutamaçlarını (sol/sağ/üst/alt) destekleyen katmanlar true döner (şimdilik yalnız metin). */
  public supportsEdgeHandles(): boolean {
    return false;
  }

  /**
   * Seçim çerçevesi tutamacı isabet testi. En yakın tutamaç kazanır; kenar tutamaçları yalnız
   * supportsEdgeHandles() ise. hitHalf: tutamaç etrafındaki kare dokunma alanının yarı boyu (tuval px;
   * çağıran >= 22 CSS px karşılığını verir).
   */
  public hitTestHandle(
    point: Point,
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    hitHalf: number = 56
  ): HandleId | null {
    if (this.type === 'media' || !this.selected || !this.visible || !this.temporalVisible) return null;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);
    const pad = 14;
    const halfW = ((bounds.width + pad * 2) * this.transform.scale) / 2;
    const halfH = ((bounds.height + pad * 2) * this.transform.scale) / 2;

    const rad = (-this.transform.rotation * Math.PI) / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const ux = dx * Math.cos(rad) - dy * Math.sin(rad);
    const uy = dx * Math.sin(rad) + dy * Math.cos(rad);

    const handles: Array<[HandleId, number, number]> = [
      ['tl', -halfW, -halfH],
      ['tr', halfW, -halfH],
      ['br', halfW, halfH],
      ['bl', -halfW, halfH],
    ];
    if (this.supportsEdgeHandles()) {
      handles.push(['t', 0, -halfH], ['b', 0, halfH], ['l', -halfW, 0], ['r', halfW, 0]);
    }
    let best: HandleId | null = null;
    let bestD = Infinity;
    for (const [id, hx, hy] of handles) {
      const ax = Math.abs(ux - hx);
      const ay = Math.abs(uy - hy);
      if (ax <= hitHalf && ay <= hitHalf) {
        const d = Math.hypot(ax, ay);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    }
    return best;
  }

  public isCornerHandleHit(point: Point, ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): boolean {
    const h = this.hitTestHandle(point, ctx, canvasWidth, canvasHeight);
    return h === 'tl' || h === 'tr' || h === 'br' || h === 'bl';
  }

  public renderSelectionHighlight(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (this.type === 'media' || !this.selected) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);
    const pad = 14;
    const w = bounds.width + pad * 2;
    const h = bounds.height + pad * 2;
    const sc = Math.max(0.2, this.transform.scale);

    // 1 CSS px kaç tuval pikseli (görsel boyutlar CSS px cinsinden tasarlanır)
    let k = 1;
    try {
      const el = ctx.canvas as HTMLCanvasElement | undefined;
      const cw = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().width : 0;
      if (cw > 0 && canvasWidth > 0) k = canvasWidth / cw;
    } catch {
      k = 1;
    }
    k = Math.max(1, Math.min(4, k));

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    ctx.scale(this.transform.scale, this.transform.scale);

    // Tamamen beyaz çerçeve; beyaz zeminde görünmesi için koyu gölge (gölge piksel uzayında, ölçekten bağımsız)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 4 * k;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1 * k;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = (2 * k) / sc;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 14);
    ctx.stroke();

    // Köşe tutamaçları: dolu beyaz daireler
    const r = (7 * k) / sc;
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
    }

    // Kenar tutamaçları: dolu beyaz hap (pill)
    if (this.supportsEdgeHandles()) {
      const len = (24 * k) / sc;
      const thick = (7 * k) / sc;
      const pills: Array<[number, number, number, number]> = [
        [0, -h / 2, len, thick],
        [0, h / 2, len, thick],
        [-w / 2, 0, thick, len],
        [w / 2, 0, thick, len],
      ];
      for (const [px, py, pw, ph] of pills) {
        ctx.beginPath();
        ctx.roundRect(px - pw / 2, py - ph / 2, pw, ph, Math.min(pw, ph) / 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
