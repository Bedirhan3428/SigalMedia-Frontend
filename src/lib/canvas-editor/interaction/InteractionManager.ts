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
  private onBringToFront?: (layer: BaseLayer) => void;
  private onSnapGuide?: (snap: { x: boolean; y: boolean }) => void;
  private onDragMove?: (info: { layer: BaseLayer; clientX: number; clientY: number; isDragging: boolean }) => void;
  private onDragEnd?: (info: { layer: BaseLayer; clientX: number; clientY: number }) => void;

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

  // Yüksek Hassasiyetli ve Sıfır Gecikmeli Tap Koordinatörü
  private lastTapTime: number = 0;
  private lastTapLayer: BaseLayer | null = null;
  private prevFontBeforeTap: string | null = null;
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
    onBringToFront?: (layer: BaseLayer) => void;
    onSnapGuide?: (snap: { x: boolean; y: boolean }) => void;
    onDragMove?: (info: { layer: BaseLayer; clientX: number; clientY: number; isDragging: boolean }) => void;
    onDragEnd?: (info: { layer: BaseLayer; clientX: number; clientY: number }) => void;
  }) {
    this.canvas = options.canvas;
    this.getLayers = options.getLayers;
    this.getContext = options.getContext;
    this.onStateChange = options.onStateChange;
    this.onSelectLayer = options.onSelectLayer;
    this.onDoubleTapLayer = options.onDoubleTapLayer;
    this.onSingleTapLayer = options.onSingleTapLayer;
    this.onFilterSwipe = options.onFilterSwipe;
    this.onBringToFront = options.onBringToFront;
    this.onSnapGuide = options.onSnapGuide;
    this.onDragMove = options.onDragMove;
    this.onDragEnd = options.onDragEnd;

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

    // 1. Önce üst katmanlar (Metin, çıkartma, ikincil görsel, müzik rozeti)
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
      const wasSelected = Boolean(
        this.candidateLayer && this.selectedLayer === this.candidateLayer
      );
      this.prevFontBeforeTap = wasSelected ? 'already_selected' : null;

      // Tek elle etiket/resim taşıma (Single-finger drag):
      if (this.candidateLayer && this.candidateLayer.type !== 'media' && !this.candidateLayer.locked) {
        this.transformingLayer = this.candidateLayer;
        this.setSelectedLayer(this.candidateLayer);
        this.candidateLayer.isInteracting = true;
        // Otomatik Öne Getirme (Auto Z-Index)
        this.onBringToFront?.(this.candidateLayer);
        this.startLayerTransform = { ...this.candidateLayer.transform };
        this.startCenter = { x: pt.x, y: pt.y };
        this.onStateChange();
      }
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

      // Dokunulan nesneyi bul (öncelikle üst katmanlar, yoksa taban fotoğraf)
      const hit1 = this.findHitLayer(p1);
      const hit2 = this.findHitLayer(p2);
      const overlayHit = (hit1 && hit1.type !== 'media') ? hit1 : ((hit2 && hit2.type !== 'media') ? hit2 : null);
      const target = overlayHit || this.transformingLayer || hit1 || hit2 || this.selectedLayer || this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked) || null;

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

      // A. Taşıma (Pan) - Akıcı ve Hızlı Hareket (1.35x Pan Hızı)
      const currentCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      const PAN_SPEED = 1.35;
      const dx = ((currentCenter.x - this.startCenter.x) / this.canvas.width) * PAN_SPEED;
      const dy = ((currentCenter.y - this.startCenter.y) / this.canvas.height) * PAN_SPEED;
      let newX = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.x + dx));
      let newY = Math.max(-2.5, Math.min(3.5, this.startLayerTransform.y + dy));

      // MERKEZ MIKNATISI:
      // KURAL: Yazılar (TextLayer) merkez kılavuzundan/mıknatısından tamamen hariç tutulur.
      let snapX = false;
      let snapY = false;
      const isText = this.transformingLayer.type === 'text';

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

      this.transformingLayer.transform.x = newX;
      this.transformingLayer.transform.y = newY;

      // B. Ölçekleme (Pinch / Scale)
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (this.startDistance > 8) {
        const scaleFactor = currentDist / this.startDistance;
        const newScale = Math.max(0.15, Math.min(6.0, this.startLayerTransform.scale * scaleFactor));
        this.transformingLayer.transform.scale = Math.round(newScale * 100) / 100;
      }

      // C. Döndürme (Rotate) - Fotoğraflar için Kasıtlı Döndürme Eşiği (Deadzone)
      const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
      const isPhoto = this.transformingLayer.type === 'media' || this.transformingLayer.type === 'image_overlay';

      let rotationToApply = this.startLayerTransform.rotation;

      if (isPhoto) {
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

      this.transformingLayer.transform.rotation = rotationToApply;

      // Mıknatıslı Çöp Kutusu Takibi
      if (this.transformingLayer.type !== 'media') {
        const clientCenter = {
          x: (e.clientX + this.touchStartX) / 2,
          y: (e.clientY + this.touchStartY) / 2,
        };
        this.onDragMove?.({
          layer: this.transformingLayer,
          clientX: clientCenter.x,
          clientY: clientCenter.y,
          isDragging: true
        });
      }

      this.onStateChange();
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. TEK PARMAK MODU:
    // A) Üst nesne tutulduysa: Tek elle serbest taşıma + Merkez Mıknatısı + Çöp Takibi
    // B) Boş tuvalde sürükleniyorsa: Yatay Swipe (Filtre Değişimi)
    // ─────────────────────────────────────────────────────────────
    if (this.activePointers.size === 1) {
      const deltaX = e.clientX - this.touchStartX;
      const deltaY = e.clientY - this.touchStartY;
      const deltaDist = Math.hypot(deltaX, deltaY);

      // Taşıma/Sürükleme Eşiği (8px): 8px'den fazla hareket kesinlikle sürüklemedir, tıklama değildir
      const DRAG_THRESHOLD = 8;
      if (!this.isMoved) {
        if (deltaDist > DRAG_THRESHOLD) {
          this.isMoved = true;
          this.cancelTapTimer();
        } else {
          // 8px aşılmadığı sürece nesneyi kımıldatma, anlık tıklama hassasiyetini koru
          return;
        }
      }

      // A. Tek elle etiket / çıkartma / metin taşıma (Hızlı ve akıcı sürükleme)
      if (this.transformingLayer && this.transformingLayer.type !== 'media' && !this.transformingLayer.locked) {
        const DRAG_SPEED = 1.25;
        const dx = ((pt.x - this.startCenter.x) / this.canvas.width) * DRAG_SPEED;
        const dy = ((pt.y - this.startCenter.y) / this.canvas.height) * DRAG_SPEED;
        let newX = Math.max(-1.5, Math.min(2.5, this.startLayerTransform.x + dx));
        let newY = Math.max(-1.5, Math.min(2.5, this.startLayerTransform.y + dy));

        // Merkez Mıknatısı:
        // KURAL: Yazılar (TextLayer) merkez kılavuzundan/mıknatısından tamamen hariç tutulur.
        let snapX = false;
        let snapY = false;
        const isText = this.transformingLayer.type === 'text';

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

        this.transformingLayer.transform.x = newX;
        this.transformingLayer.transform.y = newY;

        // Mıknatıslı çöp kutusu konumu bildirimi
        this.onDragMove?.({
          layer: this.transformingLayer,
          clientX: e.clientX,
          clientY: e.clientY,
          isDragging: true
        });

        this.onStateChange();
        return;
      }

      // B. Boş Tuvalde Yatay Swipe Eşiği: 42px ve düşey hareketten belirgin biçimde fazla olmalı
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

    // Sürükleme bittiğinde çöp kutusu bırakma kontrolü
    if (this.transformingLayer && this.transformingLayer.type !== 'media') {
      this.onDragEnd?.({
        layer: this.transformingLayer,
        clientX: e.clientX,
        clientY: e.clientY
      });
    }

    // İki parmaktan tek parmağa düşüldüyse tek parmak taşımasını sürdür
    if (this.activePointers.size === 1 && this.transformingLayer && this.transformingLayer.type !== 'media') {
      const remainingPt = Array.from(this.activePointers.values())[0].pt;
      this.startCenter = { x: remainingPt.x, y: remainingPt.y };
      this.startLayerTransform = { ...this.transformingLayer.transform };
    }

    // Dokunuş tamamen bittiğinde etkileşimi kaldır ve kılavuz çizgisini kapat
    if (this.activePointers.size === 0) {
      this.onSnapGuide?.({ x: false, y: false });
    }
    if (this.activePointers.size === 0 && this.transformingLayer) {
      this.transformingLayer.isInteracting = false;
      this.transformingLayer = null;
      this.onStateChange();
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
    }
  };

  // Masaüstü fare tekerleği desteği (Ölçekleme ve serbest döndürme)
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    const hit = this.findHitLayer(pt);
    const target = (hit && hit.type !== 'media')
      ? hit
      : (this.selectedLayer || this.getLayers().find((l) => l.type === 'media' && l.visible && !l.locked));

    if (!target || target.locked) return;

    if (hit && hit.type !== 'media' && hit !== this.selectedLayer) {
      this.setSelectedLayer(hit);
    }

    if (e.ctrlKey) {
      // Ctrl + Wheel ➔ Zoom
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      target.transform.scale = Math.max(0.15, Math.min(6.0, target.transform.scale * factor));
    } else {
      // Normal Wheel ➔ Sağa veya sola serbest döndürme
      const step = e.shiftKey ? 1 : 4;
      const delta = e.deltaY > 0 ? step : -step;
      let newRot = (target.transform.rotation + delta) % 360;
      if (newRot < 0) newRot += 360;
      target.transform.rotation = Math.round(newRot);
    }

    this.onStateChange();
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

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 4;
      let newRot = (target.transform.rotation - step) % 360;
      if (newRot < 0) newRot += 360;
      target.transform.rotation = Math.round(newRot);
      this.onStateChange();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 4;
      let newRot = (target.transform.rotation + step) % 360;
      if (newRot < 0) newRot += 360;
      target.transform.rotation = Math.round(newRot);
      this.onStateChange();
    } else if (e.key === '0' || e.key === 'Escape') {
      if (target.transform.rotation !== 0) {
        target.transform.rotation = 0;
        this.onStateChange();
      }
    }
  };
}
