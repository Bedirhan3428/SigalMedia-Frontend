import { BaseLayer } from '../layers/BaseLayer';
import { Point } from '../types';

export type InteractionMode = 'none' | 'drag' | 'rotate' | 'scale' | 'pinch';

export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private getLayers: () => BaseLayer[];
  private getContext: () => CanvasRenderingContext2D;
  private onStateChange: () => void;
  private onSelectLayer: (layer: BaseLayer | null) => void;
  private onDoubleTapLayer?: (layer: BaseLayer) => void;
  private onSingleTapLayer?: (layer: BaseLayer) => void;

  private selectedLayer: BaseLayer | null = null;
  private mode: InteractionMode = 'none';
  private startPointerPos: Point = { x: 0, y: 0 };
  private startLayerTransform = { x: 0.5, y: 0.5, scale: 1.0, rotation: 0 };
  private startDistance: number = 0;
  private startAngle: number = 0;
  private activePointers = new Map<number, Point>();

  // Dokunma ve Çift Dokunma (Tap & Double Tap) Takibi
  private pointerDownTime: number = 0;
  private pointerDownPos: Point = { x: 0, y: 0 };
  private isMoved: boolean = false;
  private lastTapTime: number = 0;
  private lastTapLayerId: string | null = null;
  private currentHitLayer: BaseLayer | null = null;

  constructor(options: {
    canvas: HTMLCanvasElement;
    getLayers: () => BaseLayer[];
    getContext: () => CanvasRenderingContext2D;
    onStateChange: () => void;
    onSelectLayer: (layer: BaseLayer | null) => void;
    onDoubleTapLayer?: (layer: BaseLayer) => void;
    onSingleTapLayer?: (layer: BaseLayer) => void;
  }) {
    this.canvas = options.canvas;
    this.getLayers = options.getLayers;
    this.getContext = options.getContext;
    this.onStateChange = options.onStateChange;
    this.onSelectLayer = options.onSelectLayer;
    this.onDoubleTapLayer = options.onDoubleTapLayer;
    this.onSingleTapLayer = options.onSingleTapLayer;

    // Dokunmatik kaydırmayı engelle (Mobile first)
    this.canvas.style.touchAction = 'none';

    this.bindEvents();
  }

  public setSelectedLayer(layer: BaseLayer | null) {
    if (this.selectedLayer) {
      this.selectedLayer.selected = false;
    }
    this.selectedLayer = layer;
    if (this.selectedLayer) {
      this.selectedLayer.selected = true;
    }
    this.onSelectLayer(this.selectedLayer);
    this.onStateChange();
  }

  public getSelectedLayer(): BaseLayer | null {
    return this.selectedLayer;
  }

  private getCanvasPoint(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  private isOverRotateHandle(point: Point, layer: BaseLayer): boolean {
    const center = layer.getPixelPosition(this.canvas.width, this.canvas.height);
    const handleY = layer.getRotateHandleY(this.getContext(), this.canvas.width, this.canvas.height);

    const rad = (-layer.transform.rotation * Math.PI) / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const dist = Math.hypot(localX, localY - handleY);
    return dist <= 38;
  }

  private isOverScaleHandle(point: Point, layer: BaseLayer): boolean {
    const center = layer.getPixelPosition(this.canvas.width, this.canvas.height);
    const bounds = layer.getBoundingBox(this.getContext(), this.canvas.width, this.canvas.height);
    const w = bounds.width * layer.transform.scale;
    const h = bounds.height * layer.transform.scale;

    const rad = (-layer.transform.rotation * Math.PI) / 180;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const corners = [
      [-w / 2 - 12, -h / 2 - 12],
      [w / 2 + 12, -h / 2 - 12],
      [-w / 2 - 12, h / 2 + 12],
      [w / 2 + 12, h / 2 + 12]
    ];

    return corners.some(([cx, cy]) => Math.hypot(localX - cx, localY - cy) <= 26);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const target = this.selectedLayer || this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked);
    if (!target || target.locked) return;

    // Shift basılıyken 1 derecelik adımlarla, normalde 3 derecelik adımlarla hassas döndür
    const step = e.shiftKey ? 1 : 4;
    const delta = e.deltaY > 0 ? step : -step;
    let newRot = (target.transform.rotation + delta) % 360;
    if (newRot < 0) newRot += 360;
    target.transform.rotation = Math.round(newRot);
    this.onStateChange();
  };

  private bindEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public destroy() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private onPointerDown = (e: PointerEvent) => {
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture yoksa sessiz geç
    }

    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    this.activePointers.set(e.pointerId, pt);

    this.pointerDownTime = Date.now();
    this.pointerDownPos = pt;
    this.isMoved = false;

    // İki parmakla çift dokunuş (Direct Pinch Zoom & Rotate)
    if (this.activePointers.size === 2) {
      if (!this.selectedLayer) {
        const media = this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked);
        if (media) this.setSelectedLayer(media);
      }
      if (this.selectedLayer && !this.selectedLayer.locked) {
        this.mode = 'pinch';
        const pts = Array.from(this.activePointers.values());
        this.startDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.startAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI) - this.selectedLayer.transform.rotation;
        this.startLayerTransform = { ...this.selectedLayer.transform };
        return;
      }
    }

    this.startPointerPos = pt;

    // 1. Döndürme kolu kontrolü
    if (this.selectedLayer && !this.selectedLayer.locked && this.isOverRotateHandle(pt, this.selectedLayer)) {
      this.mode = 'rotate';
      const center = this.selectedLayer.getPixelPosition(this.canvas.width, this.canvas.height);
      this.startAngle = Math.atan2(pt.y - center.y, pt.x - center.x) * (180 / Math.PI) - this.selectedLayer.transform.rotation;
      return;
    }

    // 2. Ölçekleme kolu kontrolü
    if (this.selectedLayer && !this.selectedLayer.locked && this.isOverScaleHandle(pt, this.selectedLayer)) {
      this.mode = 'scale';
      const center = this.selectedLayer.getPixelPosition(this.canvas.width, this.canvas.height);
      this.startDistance = Math.hypot(pt.x - center.x, pt.y - center.y);
      this.startLayerTransform = { ...this.selectedLayer.transform };
      return;
    }

    // 3. Katman vuruş testi (Önce üst katmanlar, sonra medya katmanı)
    const layers = [...this.getLayers()].reverse();
    let hitLayer: BaseLayer | null = null;
    const ctx = this.getContext();

    for (const layer of layers) {
      if (layer.type !== 'media' && layer.visible && !layer.locked && layer.containsPoint(pt, ctx, this.canvas.width, this.canvas.height)) {
        hitLayer = layer;
        break;
      }
    }

    // Üst katman isabet etmediyse görseli serbestçe taşımak üzere doğrudan medya katmanını hedef al
    if (!hitLayer) {
      const mediaLayer = this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked);
      if (mediaLayer) {
        hitLayer = mediaLayer;
      }
    }

    this.currentHitLayer = hitLayer;

    if (hitLayer) {
      this.setSelectedLayer(hitLayer);
      this.mode = 'drag';
      this.startLayerTransform = { ...hitLayer.transform };
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.setSelectedLayer(null);
      this.mode = 'none';
      this.canvas.style.cursor = 'default';
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.activePointers.has(e.pointerId)) return;
    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    this.activePointers.set(e.pointerId, pt);

    if (Math.hypot(pt.x - this.pointerDownPos.x, pt.y - this.pointerDownPos.y) > 8) {
      this.isMoved = true;
    }

    if (this.mode === 'none' || !this.selectedLayer) {
      if (this.selectedLayer && this.isOverRotateHandle(pt, this.selectedLayer)) {
        this.canvas.style.cursor = 'grab';
        return;
      }
      if (this.selectedLayer && this.isOverScaleHandle(pt, this.selectedLayer)) {
        this.canvas.style.cursor = 'nwse-resize';
        return;
      }
      const ctx = this.getContext();
      const isOverLayer = this.getLayers().some(
        (l) => l.visible && !l.locked && l.containsPoint(pt, ctx, this.canvas.width, this.canvas.height)
      );
      this.canvas.style.cursor = isOverLayer ? 'move' : 'default';
      return;
    }

    // Pinch Zoom / Rotate
    if (this.mode === 'pinch' && this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.startDistance > 0) {
        const scaleFactor = currentDist / this.startDistance;
        const newScale = Math.max(0.2, Math.min(5.0, this.startLayerTransform.scale * scaleFactor));
        this.selectedLayer.transform.scale = Math.round(newScale * 100) / 100;
      }

      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI);
      let newRot = (angle - this.startAngle) % 360;
      if (newRot < 0) newRot += 360;
      this.selectedLayer.transform.rotation = Math.round(newRot);

      this.onStateChange();
      return;
    }

    // Direct Drag (Sağa - Sola ve Her Yöne Kesintisiz Serbest Taşıma)
    if (this.mode === 'drag') {
      const dx = (pt.x - this.startPointerPos.x) / this.canvas.width;
      const dy = (pt.y - this.startPointerPos.y) / this.canvas.height;

      this.selectedLayer.transform.x = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.x + dx));
      this.selectedLayer.transform.y = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.y + dy));
      this.onStateChange();
    } else if (this.mode === 'rotate') {
      const center = this.selectedLayer.getPixelPosition(this.canvas.width, this.canvas.height);
      const angle = Math.atan2(pt.y - center.y, pt.x - center.x) * (180 / Math.PI);
      let newRot = (angle - this.startAngle) % 360;
      if (newRot < 0) newRot += 360;

      // 0, 90, 180, 270 dereceye hafif mıknatıslanma (snap)
      if (Math.abs(newRot - 0) < 3 || Math.abs(newRot - 360) < 3) newRot = 0;
      else if (Math.abs(newRot - 90) < 3) newRot = 90;
      else if (Math.abs(newRot - 180) < 3) newRot = 180;
      else if (Math.abs(newRot - 270) < 3) newRot = 270;

      this.selectedLayer.transform.rotation = Math.round(newRot);
      this.onStateChange();
    } else if (this.mode === 'scale') {
      const center = this.selectedLayer.getPixelPosition(this.canvas.width, this.canvas.height);
      const currentDist = Math.hypot(pt.x - center.x, pt.y - center.y);
      if (this.startDistance > 0) {
        const scaleFactor = currentDist / this.startDistance;
        const newScale = Math.max(0.2, Math.min(5.0, this.startLayerTransform.scale * scaleFactor));
        this.selectedLayer.transform.scale = Math.round(newScale * 100) / 100;
        this.onStateChange();
      }
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // sessiz geç
    }

    const tapDuration = Date.now() - this.pointerDownTime;
    const targetLayer = this.currentHitLayer;

    // Dokunma Tespiti (Taşıma yapılmadıysa)
    if (!this.isMoved && tapDuration < 320 && targetLayer && !targetLayer.locked) {
      const now = Date.now();
      if (this.lastTapLayerId === targetLayer.id && (now - this.lastTapTime) < 340) {
        // ÇİFT DOKUNMA (Double Tap ➔ Metin Düzenleme Odak Modu)
        this.onDoubleTapLayer?.(targetLayer);
        this.lastTapTime = 0;
        this.lastTapLayerId = null;
      } else {
        // TEK DOKUNMA (Single Tap ➔ Stil Değiştirme)
        this.lastTapTime = now;
        this.lastTapLayerId = targetLayer.id;
        this.onSingleTapLayer?.(targetLayer);
      }
    }

    if (this.activePointers.size === 0) {
      this.mode = 'none';
      this.currentHitLayer = null;
      this.canvas.style.cursor = 'default';
      this.onStateChange();
    }
  };
}
