import { BaseLayer } from '../layers/BaseLayer';
import { Point } from '../types';

export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private getLayers: () => BaseLayer[];
  private getContext: () => CanvasRenderingContext2D;
  private onStateChange: () => void;
  private onSelectLayer: (layer: BaseLayer | null) => void;
  private onDoubleTapLayer?: (layer: BaseLayer) => void;
  private onSingleTapLayer?: (layer: BaseLayer) => void;
  private onFilterSwipe?: (direction: 'prev' | 'next') => void;

  private selectedLayer: BaseLayer | null = null;
  private transformingLayer: BaseLayer | null = null;

  // Aktif dokunuşlar (Pointer ID -> client & canvas coordinates)
  private activePointers = new Map<number, { clientX: number; clientY: number; pt: Point }>();

  // Tek Parmak & Swipe (Filtre) Takibi
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private isMoved: boolean = false;
  private isSwipeTriggered: boolean = false;
  private candidateLayer: BaseLayer | null = null;

  // İki Parmak (Pan + Pinch + Rotate) Takibi
  private startCenter: Point = { x: 0, y: 0 };
  private startDistance: number = 0;
  private startAngle: number = 0;
  private startLayerTransform = { x: 0.5, y: 0.5, scale: 1.0, rotation: 0 };

  // TapCoordinator (250ms Diferansiyeli)
  private pendingTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTapLayer: BaseLayer | null = null;

  constructor(options: {
    canvas: HTMLCanvasElement;
    getLayers: () => BaseLayer[];
    getContext: () => CanvasRenderingContext2D;
    onStateChange: () => void;
    onSelectLayer: (layer: BaseLayer | null) => void;
    onDoubleTapLayer?: (layer: BaseLayer) => void;
    onSingleTapLayer?: (layer: BaseLayer) => void;
    onFilterSwipe?: (direction: 'prev' | 'next') => void;
  }) {
    this.canvas = options.canvas;
    this.getLayers = options.getLayers;
    this.getContext = options.getContext;
    this.onStateChange = options.onStateChange;
    this.onSelectLayer = options.onSelectLayer;
    this.onDoubleTapLayer = options.onDoubleTapLayer;
    this.onSingleTapLayer = options.onSingleTapLayer;
    this.onFilterSwipe = options.onFilterSwipe;

    // Dokunmatik varsayılan kaydırmaları engelle
    this.canvas.style.touchAction = 'none';

    this.bindEvents();
  }

  public setSelectedLayer(layer: BaseLayer | null) {
    if (this.selectedLayer && this.selectedLayer !== layer) {
      this.selectedLayer.selected = false;
      this.selectedLayer.isInteracting = false;
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
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  private findHitLayer(pt: Point): BaseLayer | null {
    const layers = [...this.getLayers()].reverse();
    const ctx = this.getContext();

    // 1. Önce üst katmanlar (Metin, çıkartma, görsel üzeri görsel)
    for (const layer of layers) {
      if (layer.type !== 'media' && layer.visible && !layer.locked && layer.containsPoint(pt, ctx, this.canvas.width, this.canvas.height)) {
        return layer;
      }
    }

    // 2. Taban medya katmanı
    const mediaLayer = this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked);
    if (mediaLayer && mediaLayer.containsPoint(pt, ctx, this.canvas.width, this.canvas.height)) {
      return mediaLayer;
    }

    return null;
  }

  private cancelTapTimer() {
    if (this.pendingTapTimer) {
      clearTimeout(this.pendingTapTimer);
      this.pendingTapTimer = null;
      this.pendingTapLayer = null;
    }
  }

  private bindEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public destroy() {
    this.cancelTapTimer();
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
      // pointer capture yoksa devam et
    }

    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY, pt });

    // Tek Parmak Başlangıcı
    if (this.activePointers.size === 1) {
      this.touchStartX = e.clientX;
      this.touchStartY = e.clientY;
      this.isMoved = false;
      this.isSwipeTriggered = false;
      this.candidateLayer = this.findHitLayer(pt);
      return;
    }

    // İki Parmak Başlangıcı (Transform Modu)
    if (this.activePointers.size === 2) {
      // 1. Bekleyen tap zamanlayıcısını iptal et
      this.cancelTapTimer();
      this.isSwipeTriggered = true; // Filtre kaydırmayı kilitle

      const pts = Array.from(this.activePointers.values()).map((p) => p.pt);
      const p1 = pts[0];
      const p2 = pts[1];

      // Dokunulan nesneyi bul (p1 veya p2 altında olan)
      const hit1 = this.findHitLayer(p1);
      const hit2 = this.findHitLayer(p2);
      const target = hit1 || hit2 || this.selectedLayer || this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked) || null;

      if (target && !target.locked) {
        this.transformingLayer = target;
        this.setSelectedLayer(target);
        target.isInteracting = true; // Hafif yaylanma ve gölge geri bildirimi

        this.startCenter = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2
        };
        this.startDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        this.startAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
        this.startLayerTransform = { ...target.transform };

        this.onStateChange();
      }
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.activePointers.has(e.pointerId)) return;

    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY, pt });

    // ─────────────────────────────────────────────────────────────
    // 1. İKİ PARMAK MODU: EŞZAMANLI PAN + PINCH + ROTATE
    // ─────────────────────────────────────────────────────────────
    if (this.activePointers.size >= 2 && this.transformingLayer && !this.transformingLayer.locked) {
      const pts = Array.from(this.activePointers.values()).map((p) => p.pt);
      const p1 = pts[0];
      const p2 = pts[1];

      // A. Taşıma (Pan)
      const currentCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      const dx = (currentCenter.x - this.startCenter.x) / this.canvas.width;
      const dy = (currentCenter.y - this.startCenter.y) / this.canvas.height;
      this.transformingLayer.transform.x = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.x + dx));
      this.transformingLayer.transform.y = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.y + dy));

      // B. Ölçekleme (Pinch / Scale)
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (this.startDistance > 8) {
        const scaleFactor = currentDist / this.startDistance;
        const newScale = Math.max(0.15, Math.min(6.0, this.startLayerTransform.scale * scaleFactor));
        this.transformingLayer.transform.scale = Math.round(newScale * 100) / 100;
      }

      // C. Döndürme (Rotate)
      const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
      const angleDelta = currentAngle - this.startAngle;
      let newRot = (this.startLayerTransform.rotation + angleDelta) % 360;
      if (newRot < 0) newRot += 360;

      // 0, 90, 180, 270 dereceye hafif mıknatıslanma (snap)
      if (Math.abs(newRot - 0) < 3 || Math.abs(newRot - 360) < 3) newRot = 0;
      else if (Math.abs(newRot - 90) < 3) newRot = 90;
      else if (Math.abs(newRot - 180) < 3) newRot = 180;
      else if (Math.abs(newRot - 270) < 3) newRot = 270;

      this.transformingLayer.transform.rotation = Math.round(newRot);

      this.onStateChange();
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. TEK PARMAK MODU: HİÇBİR NESNEYİ HAREKET ETTİRMEZ!
    //    SADECE YATAY SWIPE (FİLTRE DEĞİŞİMİ) DİNLER
    // ─────────────────────────────────────────────────────────────
    if (this.activePointers.size === 1) {
      const deltaX = e.clientX - this.touchStartX;
      const deltaY = e.clientY - this.touchStartY;

      if (Math.hypot(deltaX, deltaY) > 10) {
        this.isMoved = true;
        this.cancelTapTimer();
      }

      // Yatay Swipe Eşiği: 42px ve düşey hareketten belirgin biçimde fazla olmalı
      const SWIPE_THRESHOLD = 42;
      if (!this.isSwipeTriggered && Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
        this.isSwipeTriggered = true;
        this.touchStartX = e.clientX; // Eşiği sıfırla
        const direction = deltaX > 0 ? 'prev' : 'next';
        this.onFilterSwipe?.(direction);
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

    // İki parmak bittiğinde yaylanma efektini kaldır
    if (this.activePointers.size < 2 && this.transformingLayer) {
      this.transformingLayer.isInteracting = false;
      this.transformingLayer = null;
      this.onStateChange();
    }

    // ─────────────────────────────────────────────────────────────
    // TAP COORDINATOR (250ms Diferansiyeli)
    // ─────────────────────────────────────────────────────────────
    if (this.activePointers.size === 0 && !this.isMoved && !this.isSwipeTriggered) {
      const target = this.candidateLayer;

      if (this.pendingTapTimer) {
        // İKİNCİ DOKUNUŞ 250ms İÇİNDE GELDİ ➔ ÇİFT TIK EYLEMİ
        this.cancelTapTimer();

        if (target) {
          this.setSelectedLayer(target);
          this.onDoubleTapLayer?.(target);
        }
      } else {
        // İLK DOKUNUŞ ➔ 250ms ZAMANLAYICIYI BAŞLAT
        this.pendingTapLayer = target;
        this.pendingTapTimer = setTimeout(() => {
          const finalTarget = this.pendingTapLayer;
          this.pendingTapTimer = null;
          this.pendingTapLayer = null;

          // 250ms DOLDU VE 2. TIK GELMEDİ ➔ TEK TIK EYLEMİ
          if (finalTarget) {
            this.setSelectedLayer(finalTarget);
            this.onSingleTapLayer?.(finalTarget);
          } else {
            this.setSelectedLayer(null);
          }
        }, 250);
      }
    }

    if (this.activePointers.size === 0) {
      this.isMoved = false;
      this.isSwipeTriggered = false;
      this.candidateLayer = null;
    }
  };

  // Masaüstü fare tekerleği desteği (Ölçekleme ve serbest döndürme)
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const target = this.selectedLayer || this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked);
    if (!target || target.locked) return;

    if (e.ctrlKey) {
      // Ctrl + Wheel ➔ Zoom
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      target.transform.scale = Math.max(0.2, Math.min(5.0, target.transform.scale * factor));
    } else {
      // Normal Wheel ➔ Rotate
      const step = e.shiftKey ? 1 : 5;
      const delta = e.deltaY > 0 ? step : -step;
      let newRot = (target.transform.rotation + delta) % 360;
      if (newRot < 0) newRot += 360;
      target.transform.rotation = Math.round(newRot);
    }

    this.onStateChange();
  };
}
