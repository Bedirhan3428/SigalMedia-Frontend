import { BaseLayer } from '../layers/BaseLayer';
import { DragInfo, Point } from '../types';

/** Taban medya üzerindeki jest kuralları (motor moda göre belirler). */
export interface MediaGesturePolicy {
  /** Üst katmana dokunulmadıysa tek parmakla taban medyayı kaydır (Post, Reels). */
  oneFingerPan: boolean;
  /** İki parmakla taban medyayı döndürmeye izin ver (Hikaye, Reels video). */
  allowRotate: boolean;
  /** Boş alanda yatay kaydırma ile filtre değiştir (yalnızca Hikaye). */
  filterSwipe: boolean;
}

const DEFAULT_MEDIA_POLICY: MediaGesturePolicy = {
  oneFingerPan: false,
  allowRotate: true,
  filterSwipe: true,
};

interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InteractionManagerOptions {
  canvas: HTMLCanvasElement;
  getLayers: () => BaseLayer[];
  getContext: () => CanvasRenderingContext2D;
  /** @deprecated onTransform / onGestureEnd / onRenderRequest kullanın. Verilirse hepsinde çağrılır. */
  onStateChange?: () => void;
  /** Jest sırasında her pointermove'da (senkron) çağrılır; motor rAF ile kısar. */
  onTransform?: (layer: BaseLayer) => void;
  /** Jest bittiğinde (son parmak kalktığında) çağrılır. changed=false ise hiçbir dönüşüm uygulanmadı. */
  onGestureEnd?: (layer: BaseLayer | null, changed: boolean) => void;
  /** Yalnızca yeniden çizim gerektiğinde (seçim değişimi vb.). */
  onRenderRequest?: () => void;
  onSelectLayer: (layer: BaseLayer | null) => void;
  onDoubleTapLayer?: (layer: BaseLayer) => void;
  onSingleTapLayer?: (layer: BaseLayer) => void;
  onFilterSwipe?: (direction: 'prev' | 'next') => void;
  onBringToFront?: (layer: BaseLayer) => void;
  onSnapGuide?: (snap: { x: boolean; y: boolean }) => void;
  onDragMove?: (info: DragInfo) => void;
  onDragEnd?: (info: DragInfo) => void;
  onPointerDownCapture?: () => void;
  getMediaGesturePolicy?: () => MediaGesturePolicy;
}

export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private getLayers: () => BaseLayer[];
  private getContext: () => CanvasRenderingContext2D;
  private onStateChangeLegacy?: () => void;
  private onTransformCb?: (layer: BaseLayer) => void;
  private onGestureEndCb?: (layer: BaseLayer | null, changed: boolean) => void;
  private onRenderRequestCb?: () => void;
  private onSelectLayer: (layer: BaseLayer | null) => void;
  private onDoubleTapLayer?: (layer: BaseLayer) => void;
  private onSingleTapLayer?: (layer: BaseLayer) => void;
  private onFilterSwipe?: (direction: 'prev' | 'next') => void;
  private onBringToFront?: (layer: BaseLayer) => void;
  private onSnapGuide?: (snap: { x: boolean; y: boolean }) => void;
  private onDragMove?: (info: DragInfo) => void;
  private onDragEnd?: (info: DragInfo) => void;
  private onPointerDownCapture?: () => void;
  private getMediaGesturePolicy: () => MediaGesturePolicy;

  private selectedLayer: BaseLayer | null = null;
  private transformingLayer: BaseLayer | null = null;

  // Aktif dokunuşlar (Pointer ID -> client & canvas coordinates)
  private activePointers = new Map<number, { clientX: number; clientY: number; pt: Point }>();

  // Tek Parmak & Swipe (Filtre) Takibi
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private isMoved: boolean = false;
  private isSwipeTriggered: boolean = false;
  private isCornerResizeMode: boolean = false;
  private candidateLayer: BaseLayer | null = null;

  // WP1: jest durumu
  private isMediaPan = false;
  private gestureHadMultiTouch = false;
  private gestureChanged = false;
  private contentRect: ContentRect | null = null;
  private wheelCommitTimer: ReturnType<typeof setTimeout> | null = null;
  private wheelLayer: BaseLayer | null = null;

  // İki Parmak (Pan + Pinch + Rotate) Takibi
  private startCenter: Point = { x: 0, y: 0 };
  private startDistance: number = 0;
  private startAngle: number = 0;
  private startLayerTransform = { x: 0.5, y: 0.5, scale: 1.0, rotation: 0 };

  // Yüksek Hassasiyetli ve Sıfır Gecikmeli Tap Koordinatörü
  private lastTapTime: number = 0;
  private lastTapLayer: BaseLayer | null = null;
  private prevFontBeforeTap: string | null = null;
  private pendingTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTapLayer: BaseLayer | null = null;

  constructor(options: InteractionManagerOptions) {
    this.canvas = options.canvas;
    this.getLayers = options.getLayers;
    this.getContext = options.getContext;
    this.onStateChangeLegacy = options.onStateChange;
    this.onTransformCb = options.onTransform;
    this.onGestureEndCb = options.onGestureEnd;
    this.onRenderRequestCb = options.onRenderRequest;
    this.onSelectLayer = options.onSelectLayer;
    this.onDoubleTapLayer = options.onDoubleTapLayer;
    this.onSingleTapLayer = options.onSingleTapLayer;
    this.onFilterSwipe = options.onFilterSwipe;
    this.onBringToFront = options.onBringToFront;
    this.onSnapGuide = options.onSnapGuide;
    this.onDragMove = options.onDragMove;
    this.onDragEnd = options.onDragEnd;
    this.onPointerDownCapture = options.onPointerDownCapture;
    this.getMediaGesturePolicy = options.getMediaGesturePolicy || (() => DEFAULT_MEDIA_POLICY);

    // Dokunmatik varsayılan kaydırmaları engelle
    this.canvas.style.touchAction = 'none';

    this.bindEvents();
  }

  // ─────────────────────────────────────────────────────────────
  // Geri çağrı yardımcıları
  // ─────────────────────────────────────────────────────────────
  private notifyTransform(layer: BaseLayer) {
    this.gestureChanged = true;
    if (this.onTransformCb) this.onTransformCb(layer);
    else this.onStateChangeLegacy?.();
  }

  private notifyRender() {
    if (this.onRenderRequestCb) this.onRenderRequestCb();
    else this.onStateChangeLegacy?.();
  }

  private notifyGestureEnd(layer: BaseLayer | null, changed: boolean) {
    if (this.onGestureEndCb) this.onGestureEndCb(layer, changed);
    else this.onStateChangeLegacy?.();
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
    this.notifyRender();
  }

  public getSelectedLayer(): BaseLayer | null {
    return this.selectedLayer;
  }

  /** Bir jest sürerken true (UI/motor oynatma senkronunu buna göre erteleyebilir). */
  public isGestureActive(): boolean {
    return this.activePointers.size > 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Koordinat dönüşümü: CSS object-fit (contain/cover) letterbox'ını hesaba katar
  // ─────────────────────────────────────────────────────────────
  private computeContentRect(): ContentRect {
    const rect = this.canvas.getBoundingClientRect();
    const cw = this.canvas.width || 1;
    const ch = this.canvas.height || 1;
    let fit = '';
    try {
      fit = typeof getComputedStyle === 'function' ? getComputedStyle(this.canvas).objectFit : '';
    } catch {
      fit = '';
    }
    if ((fit === 'contain' || fit === 'scale-down' || fit === 'cover') && rect.width > 0 && rect.height > 0) {
      const scale =
        fit === 'cover'
          ? Math.max(rect.width / cw, rect.height / ch)
          : Math.min(rect.width / cw, rect.height / ch, fit === 'scale-down' ? 1 : Infinity);
      const w = cw * scale;
      const h = ch * scale;
      return {
        left: rect.left + (rect.width - w) / 2,
        top: rect.top + (rect.height - h) / 2,
        width: w,
        height: h,
      };
    }
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  private getRect(): ContentRect {
    if (!this.contentRect || this.activePointers.size === 0) {
      this.contentRect = this.computeContentRect();
    }
    return this.contentRect;
  }

  private getCanvasPoint(clientX: number, clientY: number): Point {
    const rect = this.getRect();
    const scaleX = this.canvas.width / (rect.width || 1);
    const scaleY = this.canvas.height / (rect.height || 1);

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  /** Tuval pikselini client koordinatına çevirir. */
  public canvasToClient(pt: Point): Point {
    const rect = this.contentRect || this.computeContentRect();
    return {
      x: rect.left + (pt.x * rect.width) / (this.canvas.width || 1),
      y: rect.top + (pt.y * rect.height) / (this.canvas.height || 1),
    };
  }

  private buildDragInfo(layer: BaseLayer, deletable: boolean): DragInfo {
    if (!deletable) {
      return { layer, clientX: Number.NaN, clientY: Number.NaN, isDragging: true, deletable: false };
    }
    const centerPx = layer.getPixelPosition(this.canvas.width, this.canvas.height);
    const c = this.canvasToClient(centerPx);
    return { layer, clientX: c.x, clientY: c.y, isDragging: true, deletable: true };
  }

  private findHitLayer(pt: Point): BaseLayer | null {
    const layers = [...this.getLayers()].reverse();
    const ctx = this.getContext();

    // 1. Önce üst katmanlar (Metin, çıkartma, ikincil görsel, müzik rozeti)
    for (const layer of layers) {
      if (layer.type !== 'media' && layer.visible && !layer.locked && layer.containsPoint(pt, ctx, this.canvas.width, this.canvas.height)) {
        return layer;
      }
    }

    // 2. Taban medya katmanı
    const mediaLayer = this.getMediaLayer();
    if (mediaLayer && mediaLayer.containsPoint(pt, ctx, this.canvas.width, this.canvas.height)) {
      return mediaLayer;
    }

    return null;
  }

  private getMediaLayer(): BaseLayer | null {
    return this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked) || null;
  }

  private cancelTapTimer() {
    this.lastTapTime = 0;
    this.lastTapLayer = null;
    this.prevFontBeforeTap = null;
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
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
    }
  }

  public destroy() {
    this.cancelTapTimer();
    if (this.wheelCommitTimer) {
      clearTimeout(this.wheelCommitTimer);
      this.wheelCommitTimer = null;
    }
    this.activePointers.clear();
    this.transformingLayer = null;
    this.selectedLayer = null;
    this.candidateLayer = null;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.onPointerDownCapture?.();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture yoksa devam et
    }

    if (this.activePointers.size === 0) {
      // Yeni jest: letterbox dikdörtgenini bir kez hesapla
      this.contentRect = this.computeContentRect();
      this.gestureHadMultiTouch = false;
      this.gestureChanged = false;
      this.isMediaPan = false;
    }

    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    this.activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY, pt });

    // Tek Parmak Başlangıcı
    if (this.activePointers.size === 1) {
      this.touchStartX = e.clientX;
      this.touchStartY = e.clientY;
      this.isMoved = false;
      this.isSwipeTriggered = false;
      this.isCornerResizeMode = false;

      const ctx = this.getContext();
      if (
        this.selectedLayer &&
        this.selectedLayer.type !== 'media' &&
        !this.selectedLayer.locked &&
        this.selectedLayer.isCornerHandleHit(pt, ctx, this.canvas.width, this.canvas.height)
      ) {
        this.candidateLayer = this.selectedLayer;
        this.transformingLayer = this.selectedLayer;
        this.isCornerResizeMode = true;
        this.selectedLayer.isInteracting = true;
        const centerPx = this.selectedLayer.getPixelPosition(this.canvas.width, this.canvas.height);
        this.startCenter = centerPx;
        this.startDistance = Math.max(12, Math.hypot(pt.x - centerPx.x, pt.y - centerPx.y));
        this.startAngle = Math.atan2(pt.y - centerPx.y, pt.x - centerPx.x) * (180 / Math.PI);
        this.startLayerTransform = { ...this.selectedLayer.transform };
        this.notifyRender();
        return;
      }

      this.candidateLayer = this.findHitLayer(pt);
      const wasSelected = Boolean(
        this.candidateLayer && this.selectedLayer === this.candidateLayer
      );
      this.prevFontBeforeTap = wasSelected ? 'already_selected' : null;

      // Tek elle etiket/resim/metin taşıma (Single-finger drag):
      if (this.candidateLayer && this.candidateLayer.type !== 'media' && !this.candidateLayer.locked) {
        this.transformingLayer = this.candidateLayer;
        this.setSelectedLayer(this.candidateLayer);
        this.candidateLayer.isInteracting = true;
        // Otomatik Öne Getirme (Auto Z-Index)
        this.onBringToFront?.(this.candidateLayer);
        this.startLayerTransform = { ...this.candidateLayer.transform };
        this.startCenter = { x: pt.x, y: pt.y };
        this.notifyRender();
        return;
      }

      // WP1 (C1): tek parmakla taban medya kaydırma (Post / Reels)
      if (
        this.candidateLayer &&
        this.candidateLayer.type === 'media' &&
        this.getMediaGesturePolicy().oneFingerPan
      ) {
        this.transformingLayer = this.candidateLayer;
        this.isMediaPan = true;
        this.startLayerTransform = { ...this.candidateLayer.transform };
        this.startCenter = { x: pt.x, y: pt.y };
      }
      return;
    }

    // İki Parmak Başlangıcı (Transform Modu)
    if (this.activePointers.size === 2) {
      // 1. Bekleyen tap zamanlayıcısını iptal et
      this.cancelTapTimer();
      this.isSwipeTriggered = true; // Filtre kaydırmayı kilitle
      this.isCornerResizeMode = false;
      this.gestureHadMultiTouch = true;
      this.isMediaPan = false;

      const pts = Array.from(this.activePointers.values()).map((p) => p.pt);
      const p1 = pts[0];
      const p2 = pts[1];

      // Dokunulan nesneyi bul (öncelikle üst katmanlar, yoksa taban fotoğraf)
      const hit1 = this.findHitLayer(p1);
      const hit2 = this.findHitLayer(p2);
      const overlayHit = (hit1 && hit1.type !== 'media') ? hit1 : ((hit2 && hit2.type !== 'media') ? hit2 : null);
      const target = overlayHit || this.transformingLayer || hit1 || hit2 || this.selectedLayer || this.getMediaLayer();

      if (target && !target.locked) {
        this.transformingLayer = target;
        this.setSelectedLayer(target);
        target.isInteracting = true;

        if (target.type !== 'media') {
          // Otomatik Öne Getirme (Auto Z-Index)
          this.onBringToFront?.(target);
        }

        this.startCenter = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2
        };
        this.startDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        this.startAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
        this.startLayerTransform = { ...target.transform };

        this.notifyRender();
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
      const layer = this.transformingLayer;
      const isMedia = layer.type === 'media';
      const policy = this.getMediaGesturePolicy();

      // A. Taşıma (Pan) - Akıcı ve Hızlı Hareket (1.35x Pan Hızı; medya kaydırmada 1:1)
      const currentCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      const PAN_SPEED = isMedia && policy.oneFingerPan ? 1.0 : 1.35;
      const dx = ((currentCenter.x - this.startCenter.x) / this.canvas.width) * PAN_SPEED;
      const dy = ((currentCenter.y - this.startCenter.y) / this.canvas.height) * PAN_SPEED;
      let newX = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.x + dx));
      let newY = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.y + dy));

      // MERKEZ MIKNATISI:
      // KURAL: Yazılar (TextLayer) merkez kılavuzundan/mıknatısından tamamen hariç tutulur.
      let snapX = false;
      let snapY = false;
      const isText = layer.type === 'text';

      if (!isText) {
        // Yumuşak ve esnek mıknatıs eşiği (0.0065 = ~7px)
        const SNAP_THRESHOLD = 0.0065;
        if (Math.abs(newX - 0.5) < SNAP_THRESHOLD) {
          newX = 0.5;
          snapX = true;
        }
        if (Math.abs(newY - 0.5) < SNAP_THRESHOLD) {
          newY = 0.5;
          snapY = true;
        }
      }
      this.onSnapGuide?.({ x: snapX, y: snapY });

      layer.transform.x = newX;
      layer.transform.y = newY;

      // B. Ölçekleme (Pinch / Scale)
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (this.startDistance > 8) {
        const scaleFactor = currentDist / this.startDistance;
        const newScale = Math.max(0.15, Math.min(6.0, this.startLayerTransform.scale * scaleFactor));
        layer.transform.scale = Math.round(newScale * 100) / 100;
      }

      // C. Döndürme (Rotate) - Fotoğraflar için Kasıtlı Döndürme Eşiği (Deadzone)
      const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
      const isPhoto = isMedia || layer.type === 'image_overlay';

      let rotationToApply = this.startLayerTransform.rotation;

      if (isMedia && !policy.allowRotate) {
        // Post / Reels fotoğraf: döndürme yalnızca 90° butonuyla
        rotationToApply = this.startLayerTransform.rotation;
      } else if (isPhoto) {
        // Fotoğraflar için Dönme Eşiği: 8.5 Derece
        // Parmaklar kasıtlı olarak döndürülmediği sürece fotoğraf sağa-sola yalpalamaz
        let diff = (currentAngle - this.startAngle) % 360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        const PHOTO_DEADZONE = 8.5;
        if (Math.abs(diff) > PHOTO_DEADZONE) {
          const activeDelta = (diff > 0 ? diff - PHOTO_DEADZONE : diff + PHOTO_DEADZONE) * 0.85;
          let newRot = (this.startLayerTransform.rotation + activeDelta) % 360;
          if (newRot < 0) newRot += 360;

          // Dik açılara (0°, 90°, 180°, 270°) temiz mıknatıslanma
          if (Math.abs(newRot - 0) <= 3.5 || Math.abs(newRot - 360) <= 3.5) newRot = 0;
          else if (Math.abs(newRot - 90) <= 3.5) newRot = 90;
          else if (Math.abs(newRot - 180) <= 3.5) newRot = 180;
          else if (Math.abs(newRot - 270) <= 3.5) newRot = 270;

          rotationToApply = Math.round(newRot);
        }
      } else if (isText) {
        // Yazılar serbestçe dönebilmeli, sadece 0/360 dereceye 2 derece kala nazikçe düzlenir
        const angleDelta = currentAngle - this.startAngle;
        let newRot = (this.startLayerTransform.rotation + angleDelta) % 360;
        if (newRot < 0) newRot += 360;
        if (Math.abs(newRot - 0) <= 2.0 || Math.abs(newRot - 360) <= 2.0) newRot = 0;
        rotationToApply = Math.round(newRot);
      } else {
        const angleDelta = currentAngle - this.startAngle;
        let newRot = (this.startLayerTransform.rotation + angleDelta) % 360;
        if (newRot < 0) newRot += 360;
        if (Math.abs(newRot - 0) <= 3.0 || Math.abs(newRot - 360) <= 3.0) newRot = 0;
        else if (Math.abs(newRot - 90) <= 3.0) newRot = 90;
        else if (Math.abs(newRot - 180) <= 3.0) newRot = 180;
        else if (Math.abs(newRot - 270) <= 3.0) newRot = 270;
        rotationToApply = Math.round(newRot);
      }

      layer.transform.rotation = rotationToApply;

      // Çöp kutusu: iki parmak jestinde ASLA silinmez (C2). Kutu görünür ama sıcak olmaz.
      if (!isMedia) {
        this.onDragMove?.(this.buildDragInfo(layer, false));
      }

      this.notifyTransform(layer);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. TEK PARMAK MODU:
    // A) Köşe tutamacı tutulduysa: Tek parmakla ölçekleme + döndürme
    // B) Üst nesne tutulduysa: Tek elle 1:1 serbest taşıma
    // C) Taban medya (Post/Reels): tek parmakla kaydırma
    // D) Boş tuvalde sürükleniyorsa (Hikaye): Yatay Swipe (Filtre Değişimi)
    // ─────────────────────────────────────────────────────────────
    if (this.activePointers.size === 1) {
      const deltaX = e.clientX - this.touchStartX;
      const deltaY = e.clientY - this.touchStartY;
      const deltaDist = Math.hypot(deltaX, deltaY);

      const DRAG_THRESHOLD = 3;
      if (!this.isMoved) {
        if (deltaDist > DRAG_THRESHOLD) {
          this.isMoved = true;
          this.cancelTapTimer();
        } else {
          return;
        }
      }

      if (this.isCornerResizeMode && this.transformingLayer && this.transformingLayer.type !== 'media' && !this.transformingLayer.locked) {
        const curDist = Math.max(8, Math.hypot(pt.x - this.startCenter.x, pt.y - this.startCenter.y));
        const scaleFactor = curDist / this.startDistance;
        const newScale = Math.max(0.2, Math.min(5.0, this.startLayerTransform.scale * scaleFactor));
        this.transformingLayer.transform.scale = Math.round(newScale * 100) / 100;

        const curAngle = Math.atan2(pt.y - this.startCenter.y, pt.x - this.startCenter.x) * (180 / Math.PI);
        const angleDelta = curAngle - this.startAngle;
        let newRot = (this.startLayerTransform.rotation + angleDelta) % 360;
        if (newRot < 0) newRot += 360;
        if (Math.abs(newRot - 0) <= 3.0 || Math.abs(newRot - 360) <= 3.0) newRot = 0;
        this.transformingLayer.transform.rotation = Math.round(newRot);

        this.notifyTransform(this.transformingLayer);
        return;
      }

      // A. Tek elle etiket / çıkartma / metin taşıma (1:1 anlık sürükleme)
      if (this.transformingLayer && this.transformingLayer.type !== 'media' && !this.transformingLayer.locked) {
        const layer = this.transformingLayer;
        const dx = (pt.x - this.startCenter.x) / this.canvas.width;
        const dy = (pt.y - this.startCenter.y) / this.canvas.height;
        let newX = Math.max(-1.5, Math.min(2.5, this.startLayerTransform.x + dx));
        let newY = Math.max(-1.5, Math.min(2.5, this.startLayerTransform.y + dy));

        let snapX = false;
        let snapY = false;
        const isText = layer.type === 'text';

        if (!isText) {
          const SNAP_THRESHOLD = 0.0065;
          if (Math.abs(newX - 0.5) < SNAP_THRESHOLD) {
            newX = 0.5;
            snapX = true;
          }
          if (Math.abs(newY - 0.5) < SNAP_THRESHOLD) {
            newY = 0.5;
            snapY = true;
          }
        }
        this.onSnapGuide?.({ x: snapX, y: snapY });

        layer.transform.x = newX;
        layer.transform.y = newY;

        // C2: çöp kutusu yalnızca tek parmak sürüklemede ve katman merkezine göre
        this.onDragMove?.(this.buildDragInfo(layer, !this.gestureHadMultiTouch));

        this.notifyTransform(layer);
        return;
      }

      // C. Taban medya tek parmak kaydırma (Post / Reels)
      if (
        this.isMediaPan &&
        this.transformingLayer &&
        this.transformingLayer.type === 'media' &&
        !this.transformingLayer.locked
      ) {
        const layer = this.transformingLayer;
        layer.isInteracting = true;
        const dx = (pt.x - this.startCenter.x) / this.canvas.width;
        const dy = (pt.y - this.startCenter.y) / this.canvas.height;
        let newX = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.x + dx));
        let newY = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.y + dy));
        const SNAP_THRESHOLD = 0.0065;
        let snapX = false;
        let snapY = false;
        if (Math.abs(newX - 0.5) < SNAP_THRESHOLD) {
          newX = 0.5;
          snapX = true;
        }
        if (Math.abs(newY - 0.5) < SNAP_THRESHOLD) {
          newY = 0.5;
          snapY = true;
        }
        this.onSnapGuide?.({ x: snapX, y: snapY });
        layer.transform.x = newX;
        layer.transform.y = newY;
        this.notifyTransform(layer);
        return;
      }

      // D. Boş Tuvalde Yatay Swipe Eşiği (yalnızca Hikaye, B13)
      if (!this.getMediaGesturePolicy().filterSwipe) return;
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
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // sessiz geç
    }

    // İki parmaktan tek parmağa düşüldüyse tek parmak taşımasını sürdür (silme kapalı kalır)
    if (this.activePointers.size === 1 && this.transformingLayer) {
      const remainingPt = Array.from(this.activePointers.values())[0].pt;
      if (this.transformingLayer.type !== 'media') {
        this.startCenter = { x: remainingPt.x, y: remainingPt.y };
        this.startLayerTransform = { ...this.transformingLayer.transform };
      } else if (this.getMediaGesturePolicy().oneFingerPan) {
        this.isMediaPan = true;
        this.isMoved = true;
        this.startCenter = { x: remainingPt.x, y: remainingPt.y };
        this.startLayerTransform = { ...this.transformingLayer.transform };
      }
    }

    // Dokunuş tamamen bittiğinde etkileşimi kaldır ve kılavuz çizgisini kapat
    if (this.activePointers.size === 0) {
      const layer = this.transformingLayer;
      // Çöp kutusu bırakma kontrolü: yalnızca jest boyunca tek parmakla gerçekten sürüklendiyse
      if (layer && layer.type !== 'media') {
        const deletable =
          this.isMoved && !this.gestureHadMultiTouch && !this.isCornerResizeMode;
        const info = this.buildDragInfo(layer, deletable);
        info.isDragging = false;
        this.onDragEnd?.(info);
      }

      this.isCornerResizeMode = false;
      this.isMediaPan = false;
      this.onSnapGuide?.({ x: false, y: false });
      if (layer) {
        layer.isInteracting = false;
        this.transformingLayer = null;
      }
      this.notifyGestureEnd(layer, this.gestureChanged);
      this.gestureChanged = false;
    }

    // ─────────────────────────────────────────────────────────────
    // GÜVENLİ VE HASSAS ÇİFT TIKLAMA / TEK TIKLAMA YÖNETİMİ
    // Çift tık yapıldığında yazı tipi ASLA DEĞİŞMEZ!
    // ─────────────────────────────────────────────────────────────
    if (this.activePointers.size === 0 && !this.isMoved && !this.isSwipeTriggered) {
      const target = this.candidateLayer;
      const now = performance.now();
      const DOUBLE_TAP_WINDOW = 320; // 320ms çift tıklama algılama penceresi
      const isDoubleTap = (now - this.lastTapTime < DOUBLE_TAP_WINDOW) && (this.lastTapLayer === target);

      if (isDoubleTap) {
        // ÇİFT DOKUNMA GERÇEKLEŞTİ:
        // Bekleyen tek tık zamanlayıcısını anında iptal et (böylece font asla değişmez!)
        if (this.pendingTapTimer) {
          clearTimeout(this.pendingTapTimer);
          this.pendingTapTimer = null;
          this.pendingTapLayer = null;
        }
        this.lastTapTime = 0;
        this.lastTapLayer = null;

        if (target) {
          this.setSelectedLayer(target);
          this.onDoubleTapLayer?.(target);
        } else {
          // Tuvalde boş alana çift dokunulursa yeni metin ekleme açılır
          this.onDoubleTapLayer?.(undefined as unknown as BaseLayer);
        }
      } else {
        // İLK DOKUNMA:
        this.lastTapTime = now;
        this.lastTapLayer = target;
        const wasAlreadySelected = this.prevFontBeforeTap === 'already_selected';

        // Katmanı anında seçili yap (kalıcı / sticky seçim)
        if (target && target.type !== 'media') {
          this.setSelectedLayer(target);
        } else {
          // Yalnızca tuvalde boş alana (media arka planına) dokunulduğunda üst katman seçimi kalkar
          this.setSelectedLayer(null);
        }

        // Önceki bekleyen zamanlayıcı varsa temizle
        if (this.pendingTapTimer) {
          clearTimeout(this.pendingTapTimer);
          this.pendingTapTimer = null;
        }

        // Tek tık eylemini (font/şekil döngüsü) yalnızca katman ZATEN seçiliyse çalıştır
        if (target && target.type !== 'media' && wasAlreadySelected) {
          this.pendingTapLayer = target;
          this.pendingTapTimer = setTimeout(() => {
            const l = this.pendingTapLayer;
            this.pendingTapTimer = null;
            this.pendingTapLayer = null;
            if (l && this.selectedLayer === l) {
              this.onSingleTapLayer?.(l);
            }
          }, 240);
        }
      }
    }

    if (this.activePointers.size === 0) {
      this.isMoved = false;
      this.isSwipeTriggered = false;
      this.candidateLayer = null;
      this.gestureHadMultiTouch = false;
    }
  };

  // Masaüstü fare tekerleği desteği (Ölçekleme ve serbest döndürme)
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.onPointerDownCapture?.();
    if (this.activePointers.size === 0) this.contentRect = this.computeContentRect();
    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    const hit = this.findHitLayer(pt);
    const target = (hit && hit.type !== 'media')
      ? hit
      : (this.selectedLayer || this.getMediaLayer());

    if (!target || target.locked) return;

    if (hit && hit.type !== 'media' && hit !== this.selectedLayer) {
      this.setSelectedLayer(hit);
    }

    const isMedia = target.type === 'media';
    if (e.ctrlKey) {
      // Ctrl + Wheel ➔ Zoom
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      target.transform.scale = Math.max(0.15, Math.min(6.0, target.transform.scale * factor));
    } else {
      if (isMedia && !this.getMediaGesturePolicy().allowRotate) return;
      // Normal Wheel ➔ Sağa veya sola serbest döndürme
      const step = e.shiftKey ? 1 : 4;
      const delta = e.deltaY > 0 ? step : -step;
      let newRot = (target.transform.rotation + delta) % 360;
      if (newRot < 0) newRot += 360;
      target.transform.rotation = Math.round(newRot);
    }

    this.notifyTransform(target);
    // Tekerlek jesti için 'bitti' sinyali: 300 ms sessizlikten sonra
    this.wheelLayer = target;
    if (this.wheelCommitTimer) clearTimeout(this.wheelCommitTimer);
    this.wheelCommitTimer = setTimeout(() => {
      this.wheelCommitTimer = null;
      const l = this.wheelLayer;
      this.wheelLayer = null;
      this.gestureChanged = false;
      this.notifyGestureEnd(l, true);
    }, 300);
  };

  // Klavye ok tuşlarıyla serbest ve hassas döndürme (Left / Right Arrow)
  private onKeyDown = (e: KeyboardEvent) => {
    const activeEl = document.activeElement as HTMLElement | null;
    const tag = activeEl?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable) {
      return;
    }

    const target = this.selectedLayer;
    if (!target || target.locked) return;
    if (target.type === 'media' && !this.getMediaGesturePolicy().allowRotate) return;

    let changed = false;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 4;
      let newRot = (target.transform.rotation - step) % 360;
      if (newRot < 0) newRot += 360;
      target.transform.rotation = Math.round(newRot);
      changed = true;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 4;
      let newRot = (target.transform.rotation + step) % 360;
      if (newRot < 0) newRot += 360;
      target.transform.rotation = Math.round(newRot);
      changed = true;
    } else if (e.key === '0' || e.key === 'Escape') {
      if (target.transform.rotation !== 0) {
        target.transform.rotation = 0;
        changed = true;
      }
    }
    if (changed) {
      this.notifyTransform(target);
      this.gestureChanged = false;
      this.notifyGestureEnd(target, true);
    }
  };
}
