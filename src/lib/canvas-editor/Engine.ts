import { BaseLayer } from './layers/BaseLayer';
import { MediaLayer } from './layers/MediaLayer';
import { TextLayer } from './layers/TextLayer';
import { OverlayImageLayer } from './layers/OverlayImageLayer';
import { MusicStickerLayer } from './layers/MusicStickerLayer';
import { MediaSourceManager, MediaLoadError } from './MediaSource';
import { InteractionManager, MediaGesturePolicy } from './interaction/InteractionManager';
import { ImageExporter, ExportImageOptions } from './exporter/ImageExporter';
import { generateVideoThumbnails } from './utils/videoThumbs';
import { reverseVideoRange, ReverseClipError } from './exporter/ClipReverser';
import {
  EngineOptions,
  EditorMedia,
  MediaFilters,
  MediaType,
  TextStyle,
  FitMode,
  FILTER_PRESETS,
  FilterPreset,
  StoryAudioMeta,
  SnapGuideState,
  VideoState,
  ShareMode,
  PostAdjustmentState,
  DEFAULT_POST_ADJUSTMENTS,
  ReelsEffectClip,
  ReelsEffectId,
  VideoTrackClip,
  ClipAnimation,
  ClipAnimationKind,
  OverlayTrackItem,
  LayerTransform,
  DragInfo,
  EngineSnapshot,
  PostAspect,
  POST_ASPECT_SIZES,
  DEFAULT_POST_ASPECT,
  VERTICAL_LOGICAL_SIZE,
  MAX_VIDEO_SEC,
  FontPreset,
  TextBgPreset,
} from './types';

// [MODIFIED BY Bedirhan]
export type EngineEventMap = {
  /** Her çizimden sonra (rAF). */
  'render': [];
  'select': [layer: BaseLayer | null];
  /**
   * Yapısal / kalıcı değişiklik: katman eklendi/silindi/sırası değişti, klip listesi veya klip verisi
   * değişti, bir ayar (filtre, efekt, düzeltme, döndürme...) uygulandı ya da bir jest TAMAMLANDI.
   * Jest sırasında (pointermove) ASLA tetiklenmez; onun yerine 'transform' kullanın.
   */
  'change': [];
  /** Jest sırasında dönüşüm değişti (rAF ile kısılmış, karede en çok 1 kez). */
  'transform': [layer: BaseLayer | null];
  'double-tap': [layer?: BaseLayer];
  'single-tap': [layer: BaseLayer];
  'filter-swipe': [direction: string, filterName: string];
  /** rAF ile kısılmış. clientX/Y = katman merkezi; deletable=false ise NaN. */
  'drag-move': [info: DragInfo];
  /** Jest sonunda bir kez. UI yalnızca info.deletable && çöp kutusu üzerinde ise silmeli. */
  'drag-end': [info: DragInfo];
  'snap-guide': [snap: SnapGuideState];
  'video-time': [state: VideoState];
  'video-progress': [currentTime: number];
  /** Otomatik oynatma sesli reddedildi: video sessiz oynuyor, ses için kullanıcı dokunuşu gerek. */
  'sound-blocked': [blocked: boolean];
  /** Mantıksal tuval boyutu değişti (yalnızca Post en-boy değişiminde). */
  'resize': [size: { width: number; height: number }];
  /** Motor müzik meta verisi değişti (sticker silinince null). */
  'music-change': [music: StoryAudioMeta | null];
};

export type EngineEvent = keyof EngineEventMap;
export type EventListener<K extends EngineEvent = EngineEvent> = (...args: EngineEventMap[K]) => void;

let mediaKeyCounter = 0;

/** Yerel ses dosyası yüklenemedi: 'unsupported' (ses değil / codec) | 'decode' (zaman aşımı). */
export class AudioLoadError extends Error {
  public readonly code: 'unsupported' | 'decode';
  constructor(code: 'unsupported' | 'decode') {
    super(`audio-load:${code}`);
    this.name = 'AudioLoadError';
    this.code = code;
  }
}

export type ClipAdjustmentKey = 'brightness' | 'contrast' | 'saturation' | 'warmth' | 'vignette' | 'sharpness';

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private fitMode: FitMode;

  private mediaLayer: MediaLayer | null = null;
  private overlayLayers: BaseLayer[] = [];
  private cachedAllLayers: BaseLayer[] = [];
  private interactionManager: InteractionManager;

  private isDirty = false;
  private activeFilterIndex: number = 0;
  private filterIntensity = 1;
  private listeners: Map<EngineEvent, Set<(args: unknown) => void>> = new Map();

  // Merkez Mıknatısı Hizalama Çizgisi Durumu
  private snapGuide: SnapGuideState = { x: false, y: false };
  private snapGuideTimer: ReturnType<typeof setTimeout> | null = null;

  // [START] CREATED BY Bedirhan
  private videoLoopId: number | null = null;
  private isExportingVideo = false;
  private shareMode: ShareMode = 'story';
  private lastVirtualTickTime: number = 0;
  private videoClips: VideoTrackClip[] = [];
  private nleTimelineTime: number = 0;
  private isNlePlaying: boolean = false;
  private activePlayingClipId: string | null = null;

  // 5sn Fotoğraf->Video Statik Katman Offscreen Önbelleği (Tek Seferlik Tahsis)
  private staticSceneCacheCanvas: HTMLCanvasElement | null = null;
  private staticSceneCacheCtx: CanvasRenderingContext2D | null = null;
  private staticSceneCacheDirty = true;

  private overlayCacheCanvas: HTMLCanvasElement | null = null;
  private overlayCacheCtx: CanvasRenderingContext2D | null = null;
  private overlayCacheDirty = true;
  private overlayCacheVersion = 0;

  private ambientBgCacheCanvas: HTMLCanvasElement | null = null;
  private ambientBgCacheCtx: CanvasRenderingContext2D | null = null;
  private ambientBgCacheKey = '';

  private lastActiveEffectsKey = '';
  private lastExportSourceTime = -1;
  private lastExportClipId = '';
  private seekInFlight = false;
  private pendingSeekTime: number | null = null;
  // [END] CREATED BY Bedirhan

  // [START] WP1
  private postAspect: PostAspect = DEFAULT_POST_ASPECT;
  /** loadMedia sonrası true: mod artık değiştirilemez (B7). */
  private modeLocked = false;
  private destroyed = false;
  private renderRafId: number | null = null;
  private pendingTransformLayer: BaseLayer | null = null;
  private hasPendingTransform = false;
  private pendingDragMove: DragInfo | null = null;
  /** Önizleme backing store / mantıksal boyut oranı (<=1). Çizim ctx.setTransform ile mantıksal uzayda kalır. */
  private previewScaleX = 1;
  private previewScaleY = 1;
  private previewResizeObserver: ResizeObserver | null = null;
  private previewDprMql: MediaQueryList | null = null;
  private static readonly MAX_PREVIEW_DPR = 2;
  private loadToken = 0;
  private baseMediaKey: string | null = null;
  /** Otomatik oynatma sesli reddedildi (B5). Kullanıcı tercihi (muted) DEĞİŞMEZ. */
  private soundBlocked = false;
  /** Kullanıcı/uygulama oynatma istiyor (pauseVideo ile false). */
  private playIntent = false;
  /** Sayfa gizlenirken oynuyordu ve kimse açıkça durdurmadı: görünür olunca devam et. */
  private resumeOnVisible = false;
  private musicMeta: StoryAudioMeta | null = null;
  /** Motorun sahip olduğu yerel müzik blob URL'leri (en yeni sonda). Undo için son 3'ü tutulur. */
  private ownedMusicUrls: string[] = [];
  private appliedClipFilter = false;
  private lastClipFilterIdx = -1;
  /** Motorun yüklediği tüm medya (taban, klip, overlay). destroy/loadMedia'da serbest bırakılır. */
  private mediaRegistry = new Set<EditorMedia>();
  private overlayMedia = new Map<BaseLayer, EditorMedia>();
  /** Artık hiçbir klibin kullanmadığı medya: undo için kısa süre tutulur (en çok 3). */
  private orphanMedia: EditorMedia[] = [];
  private releasedMedia = new WeakSet<EditorMedia>();
  private revivingMedia = new Map<EditorMedia, Promise<EditorMedia | null>>();
  private static readonly MAX_ORPHAN_MEDIA = 3;
  // [END] WP1

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    const ctx =
      this.canvas.getContext('2d', { desynchronized: true }) ||
      this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context from canvas');
    this.ctx = ctx;

    // WP1 (B1/B2): mantıksal boyut yalnızca moda (ve Post en-boy oranına) bağlıdır.
    // options.width/height kasıtlı olarak yok sayılır.
    this.shareMode = options.mode || 'story';
    if (options.postAspect && POST_ASPECT_SIZES[options.postAspect]) {
      this.postAspect = options.postAspect;
    }
    const initial = this.getLogicalSizeFor(this.shareMode, this.postAspect);
    this.width = initial.width;
    this.height = initial.height;
    this.fitMode = options.fitMode || 'contain';

    // Görüntü boyutu yalnızca CSS'tir: en-boy oranı farklı bir kutuda letterbox ile gösterilir.
    try {
      if (!this.canvas.style.objectFit) this.canvas.style.objectFit = 'contain';
    } catch {}

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.interactionManager = new InteractionManager({
      canvas: this.canvas,
      getLogicalSize: () => ({ width: this.width, height: this.height }),
      getLayers: () => this.getAllLayers(),
      getContext: () => this.ctx,
      getMediaGesturePolicy: () => this.getMediaGesturePolicy(),
      onPointerDownCapture: () => {
        if (this.shareMode === 'reels' && (this.isNlePlaying || this.videoLoopId !== null)) {
          this.pauseVideo();
        }
      },
      onTransform: (layer) => this.handleInteractionTransform(layer),
      onGestureEnd: (layer, changed) => this.handleGestureEnd(layer, changed),
      onRenderRequest: () => this.requestRender(),
      onSelectLayer: (layer) => {
        this.emit('select', layer);
      },
      onDoubleTapLayer: (layer) => {
        this.emit('double-tap', layer);
      },
      onSingleTapLayer: (layer) => {
        this.invalidateStaticCache();
        this.emit('single-tap', layer);
      },
      onFilterSwipe: (direction) => {
        const filterName = this.cycleFilter(direction);
        this.emit('filter-swipe', direction, filterName);
      },
      onBringToFront: (layer) => {
        this.bringToFront(layer);
      },
      onSnapGuide: (snap) => {
        this.setSnapGuide(snap);
      },
      onDragMove: (info) => {
        this.invalidateStaticCache();
        // rAF ile kısılır (render ile aynı karede yayınlanır)
        this.pendingDragMove = info;
        this.requestRender();
      },
      onDragEnd: (info) => {
        this.invalidateStaticCache();
        // Bekleyen drag-move, drag-end'den SONRA yayınlanmamalı
        this.pendingDragMove = null;
        this.emit('drag-end', info);
      }
    });

    this.setupPreviewSizing();
    // QA kancası: yalnızca test betiği window.__QA_ENGINE_HOOK ayarlarsa motoru dışarı verir
    if (typeof window !== "undefined" && (window as unknown as { __QA_ENGINE_HOOK?: boolean }).__QA_ENGINE_HOOK) {
      const w = window as unknown as { __qaEngines?: WeakRef<CanvasEngine>[] };
      (w.__qaEngines ||= []).push(new WeakRef(this));
    }
    this.requestRender();

    this.canvas.addEventListener('pointerup', this.onCanvasPointerUp);
    if (typeof document !== 'undefined') {
      // capture: hedef (document) aşamasında diğer işleyicilerden ÖNCE çalışır
      document.addEventListener('visibilitychange', this.onVisibilityChange, true);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // WP1: Görünürlük, jest ve ses yönetimi
  // ─────────────────────────────────────────────────────────────
  /**
   * C-04: Önizleme tuvalinin backing store'u gösterim boyutu x min(DPR, 2) olur (mantıksal 1080-uzayından
   * büyük olamaz). Katmanlar, hit-test ve export mantıksal koordinatlarla çalışır; render() ctx'e
   * ölçek dönüşümü uygular. Export kendi tuvalinde tam çözünürlükte çizer.
   */
  private computePreviewBackingSize(): { w: number; h: number } {
    const lw = this.width;
    const lh = this.height;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return { w: this.canvas.width || lw, h: this.canvas.height || lh };
    const dpr = Math.min(
      CanvasEngine.MAX_PREVIEW_DPR,
      (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    );
    const fit = Math.min(cw / lw, ch / lh);
    const scale = Math.min(1, Math.max(0.1, fit * dpr));
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    return { w: Math.min(lw, even(lw * scale)), h: Math.min(lh, even(lh * scale)) };
  }

  /** Backing store'u hesaplanan boyuta getirir (sessiz). Boyut değiştiyse true (tuval silinmiş olur). */
  private applyPreviewBackingSize(): boolean {
    const { w, h } = this.computePreviewBackingSize();
    const cur = this.canvas;
    const same = cur.width === w && cur.height === h;
    this.previewScaleX = w / this.width;
    this.previewScaleY = h / this.height;
    if (same) return false;
    // Küçük titreşimlerde (<4px) yeniden boyutlandırma yapma; ama mantıksal boyut değiştiyse zorunlu
    if (Math.abs(cur.width - w) < 4 && Math.abs(cur.height - h) < 4 && cur.width * this.height === cur.height * this.width) {
      this.previewScaleX = cur.width / this.width;
      this.previewScaleY = cur.height / this.height;
      return false;
    }
    cur.width = w;
    cur.height = h;
    return true;
  }

  private setupPreviewSizing() {
    if (typeof window === 'undefined') return;
    const resync = () => {
      if (this.destroyed) return;
      if (this.applyPreviewBackingSize()) {
        this.invalidateStaticCache();
        this.requestRender();
      }
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.previewResizeObserver = new ResizeObserver(resync);
      this.previewResizeObserver.observe(this.canvas);
    }
    try {
      // DPR değişimi (zoom / ekran değiştirme)
      this.previewDprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      this.previewDprMql.addEventListener('change', resync);
      this.onPreviewDprChange = resync;
    } catch {
      this.previewDprMql = null;
    }
    resync();
  }
  private onPreviewDprChange: (() => void) | null = null;

  private onVisibilityChange = () => {
    if (this.destroyed || typeof document === 'undefined') return;
    if (document.hidden) {
      if (this.isPlaying() && !this.isExportingVideo) {
        this.resumeOnVisible = true;
        this.pauseInternal();
      }
      this.clearMediaSession();
    } else if (this.resumeOnVisible) {
      this.resumeOnVisible = false;
      if (!this.isExportingVideo && this.mediaLayer) {
        this.playVideo().catch(() => {});
      }
    }
  };

  private clearMediaSession() {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      } catch {}
    }
  }

  /**
   * Tuvalde parmak kalkınca (pointerup = tarayıcıların kullanıcı etkinleştirme olayı; dokunmatikte
   * pointerdown değildir) ses engelini kaldırmayı dener.
   */
  private onCanvasPointerUp = () => {
    if (this.soundBlocked && !this.destroyed) {
      this.unlockSound().catch(() => {});
    }
  };

  private setSoundBlocked(blocked: boolean) {
    if (this.soundBlocked === blocked) return;
    this.soundBlocked = blocked;
    this.emit('sound-blocked', blocked);
  }

  /** Kullanıcının istediği sessiz durumu (otomatik oynatma engelinden bağımsız). */
  private getIntendedMuted(): boolean {
    const ml = this.mediaLayer;
    if (!ml) return false;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const active = this.getActiveClipAtTime(this.nleTimelineTime);
      return active ? Boolean(active.clip.muted) : ml.muted;
    }
    return ml.muted;
  }

  /**
   * video.play() çağırır; tarayıcı sesli oynatmayı reddederse (NotAllowedError) elementi
   * yalnızca o an sessize alıp tekrar dener ve 'sound-blocked' yayınlar. Tercih (muted) kalıcı değişmez.
   */
  private async playElementWithFallback(video: HTMLVideoElement, wantMuted: boolean): Promise<boolean> {
    const effectiveMuted = wantMuted || this.soundBlocked;
    if (video.muted !== effectiveMuted) video.muted = effectiveMuted;
    try {
      await video.play();
      return true;
    } catch (err) {
      if (this.destroyed) return false;
      const name = (err as { name?: string } | null)?.name;
      if (name !== 'NotAllowedError') return false;
      if (!effectiveMuted) {
        video.muted = true;
        this.setSoundBlocked(true);
        try {
          await video.play();
          return true;
        } catch {
          return false;
        }
      }
      // Sessiz oynatma bile reddedildi (ör. iOS Düşük Güç Modu): dokunuş gerekir
      this.setSoundBlocked(true);
      return false;
    }
  }

  /**
   * Ses engelini kaldırır. Bir kullanıcı jesti (tıklama/dokunma) içinde SENKRON çağrılmalıdır (iOS).
   * true: ses açık (veya kullanıcı zaten sessiz istiyor).
   */
  public unlockSound(): Promise<boolean> {
    if (!this.soundBlocked) return Promise.resolve(true);
    const video = this.mediaLayer?.getVideoElement() || null;
    const wantMuted = this.getIntendedMuted();
    if (!video || this.mediaLayer?.isMotionPhoto) {
      this.setSoundBlocked(false);
      return Promise.resolve(true);
    }
    video.muted = wantMuted;
    if (video.paused && !this.playIntent) {
      // Oynatılmıyor: bir sonraki playVideo sesli dener
      this.setSoundBlocked(false);
      return Promise.resolve(true);
    }
    let p: Promise<void>;
    try {
      p = video.play();
    } catch {
      return Promise.resolve(false);
    }
    return p.then(
      () => {
        if (this.destroyed) return false;
        this.setSoundBlocked(false);
        if (!this.playIntent && !video.paused) {
          // Bu arada pauseVideo çağrıldı
          try { video.pause(); } catch {}
        } else if (this.videoLoopId === null && this.playIntent) {
          this.startVideoLoop();
        }
        this.emit('video-time', this.getVideoState());
        return true;
      },
      (err: unknown) => {
        if (this.destroyed) return false;
        const name = (err as { name?: string } | null)?.name;
        if (name === 'NotAllowedError') {
          video.muted = true;
          if (this.playIntent) video.play().catch(() => {});
          return false;
        }
        // AbortError vb. (arada pause geldi): jest içindeydik, engel kalktı say
        this.setSoundBlocked(false);
        return true;
      }
    );
  }

  /**
   * MediaLayer.setVolume elementi doğrudan sesli yapar; ses engelliyken bu, jest içindeyse kilidi açma
   * denemesine, değilse yeniden sessize almaya dönüşür.
   */
  private reconcileSoundBlockAfterVolumeChange() {
    if (!this.soundBlocked) return;
    if (this.getIntendedMuted()) {
      const v = this.mediaLayer?.getVideoElement();
      if (v) v.muted = true;
      return;
    }
    this.unlockSound().catch(() => {});
  }

  /** Otomatik oynatma sesli reddedildiyse true: UI küçük bir "sesi aç" düğmesi göstermeli. */
  public needsUserGestureForSound(): boolean {
    return this.soundBlocked;
  }

  /** Algılanan sessiz durum (tercih veya otomatik oynatma engeli). */
  public isMuted(): boolean {
    return this.getIntendedMuted() || this.soundBlocked;
  }

  /**
   * Sessiz tercihini ayarlar (Hikaye/Post: taban video; Reels: aktif klip).
   * muted=false bir kullanıcı jesti içinde çağrılırsa ses engelini de kaldırır.
   */
  public setMuted(muted: boolean): void {
    const ml = this.mediaLayer;
    if (!ml) return;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const active = this.getActiveClipAtTime(this.nleTimelineTime);
      const clip = active ? active.clip : this.videoClips[0];
      this.updateClipVolume(clip.id, muted ? clip.volume : clip.volume > 0 ? clip.volume : 1, muted);
    } else {
      ml.muted = muted;
      if (!muted && ml.volume <= 0) ml.volume = 1;
      const v = ml.getVideoElement();
      if (v) {
        v.volume = ml.volume;
        if (muted || !this.soundBlocked) v.muted = muted;
      }
      this.emit('video-time', this.getVideoState());
      this.emit('change');
    }
    if (!muted && this.soundBlocked) {
      this.unlockSound().catch(() => {});
    }
  }

  /** Sesi aç/kapat. Ses engelliyse önce engeli kaldırır (sesi açar). Yeni sessiz durumu döner. */
  public toggleMute(): boolean {
    if (this.soundBlocked) {
      this.setMuted(false);
      return false;
    }
    const next = !this.getIntendedMuted();
    this.setMuted(next);
    return next;
  }

  // ─────────────────────────────────────────────────────────────
  // WP1: Jest akışı (D1: pointermove -> 'transform', jest sonu -> 'change')
  // ─────────────────────────────────────────────────────────────
  private handleInteractionTransform(layer: BaseLayer) {
    if (this.mediaLayer && layer === this.mediaLayer) {
      this.applyMediaConstraints();
      this.syncActiveClipTransformFromMediaLayer();
    }
    this.pendingTransformLayer = layer;
    this.hasPendingTransform = true;
    this.requestRender();
  }

  private handleGestureEnd(layer: BaseLayer | null, changed: boolean) {
    if (changed && this.mediaLayer && layer === this.mediaLayer) {
      this.applyMediaConstraints();
      this.syncActiveClipTransformFromMediaLayer();
    }
    this.requestRender();
    if (changed) this.emit('change');
  }

  private syncActiveClipTransformFromMediaLayer() {
    if (this.shareMode !== 'reels' || !this.mediaLayer || this.videoClips.length === 0) return;
    const active = this.getActiveClipAtTime(this.nleTimelineTime);
    if (active) {
      this.videoClips[active.index] = {
        ...this.videoClips[active.index],
        transform: { ...this.mediaLayer.transform },
        fitMode: this.mediaLayer.fitMode,
      };
    }
  }

  private getMediaGesturePolicy(): MediaGesturePolicy {
    if (this.shareMode === 'post') {
      return { oneFingerPan: true, allowRotate: false, filterSwipe: false };
    }
    if (this.shareMode === 'reels') {
      return {
        oneFingerPan: true,
        allowRotate: !(this.mediaLayer && this.mediaLayer.isMotionPhoto),
        filterSwipe: false,
      };
    }
    // Hikaye: serbest yerleşim (iki parmak), tek parmak yatay kaydırma = filtre
    return { oneFingerPan: false, allowRotate: true, filterSwipe: true };
  }

  /** Post ve Reels fotoğraf: taban medya her zaman kareyi kaplar (siyah boşluk yok). */
  private isCoverClampActive(): boolean {
    const ml = this.mediaLayer;
    if (!ml) return false;
    if (this.shareMode === 'post') return true;
    return this.shareMode === 'reels' && ml.isMotionPhoto;
  }

  /**
   * Kaplama (cover) sınırlaması: ölçek >= kaplama ölçeği, ofsetler kenar boşluk bırakmayacak şekilde.
   * Döndürme 90°'nin katına yuvarlanır. Saf fonksiyon: dönüşümün sınırlanmış kopyasını döner.
   */
  public static clampTransformToCover(
    transform: LayerTransform,
    media: { width: number; height: number },
    fitMode: FitMode,
    canvasWidth: number,
    canvasHeight: number
  ): LayerTransform {
    const mw = Math.max(1, media.width || 1);
    const mh = Math.max(1, media.height || 1);
    let baseW: number;
    let baseH: number;
    if (fitMode === 'fill') {
      baseW = canvasWidth;
      baseH = canvasHeight;
    } else {
      const s = fitMode === 'cover'
        ? Math.max(canvasWidth / mw, canvasHeight / mh)
        : Math.min(canvasWidth / mw, canvasHeight / mh);
      baseW = mw * s;
      baseH = mh * s;
    }
    const rotation = (((Math.round((transform.rotation || 0) / 90) * 90) % 360) + 360) % 360;
    const swapped = rotation % 180 !== 0;
    const bw = swapped ? baseH : baseW;
    const bh = swapped ? baseW : baseH;
    const minScale = Math.max(canvasWidth / bw, canvasHeight / bh);
    const scale = Math.max(minScale, Math.min(Math.max(6, minScale), transform.scale || 1));
    const ew = bw * scale;
    const eh = bh * scale;
    const minX = 1 - ew / (2 * canvasWidth);
    const maxX = ew / (2 * canvasWidth);
    const minY = 1 - eh / (2 * canvasHeight);
    const maxY = eh / (2 * canvasHeight);
    return {
      ...transform,
      rotation,
      scale: Number(scale.toFixed(4)),
      x: Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), transform.x)),
      y: Math.max(Math.min(minY, maxY), Math.min(Math.max(minY, maxY), transform.y)),
    };
  }

  /** Aktif moda göre taban medya kısıtlarını uygular. Değiştiyse true. */
  private applyMediaConstraints(): boolean {
    const ml = this.mediaLayer;
    if (!ml || !this.isCoverClampActive()) return false;
    const next = CanvasEngine.clampTransformToCover(ml.transform, ml.media, ml.fitMode, this.width, this.height);
    const t = ml.transform;
    if (
      Math.abs(next.x - t.x) < 1e-6 &&
      Math.abs(next.y - t.y) < 1e-6 &&
      Math.abs(next.scale - t.scale) < 1e-6 &&
      next.rotation === t.rotation
    ) {
      return false;
    }
    ml.transform = next;
    return true;
  }

  /** Mod değişince taban medya görsel davranışlarını ayarla. */
  private applyModeToMediaLayer() {
    const ml = this.mediaLayer;
    if (!ml) return;
    ml.springOnInteract = this.shareMode === 'story';
    ml.roundCornersWhenDetached = this.shareMode !== 'post';
  }

  // ─────────────────────────────────────────────────────────────
  // WP1: Mantıksal çözünürlük (B1/B2)
  // ─────────────────────────────────────────────────────────────
  private getLogicalSizeFor(mode: ShareMode, aspect: PostAspect): { width: number; height: number } {
    if (mode === 'post') {
      const s = POST_ASPECT_SIZES[aspect] || POST_ASPECT_SIZES[DEFAULT_POST_ASPECT];
      return { width: s.width, height: s.height };
    }
    return { width: VERTICAL_LOGICAL_SIZE.width, height: VERTICAL_LOGICAL_SIZE.height };
  }

  /** Mantıksal boyutu moda göre uygular. Değiştiyse true. */
  private applyLogicalSize(): boolean {
    const size = this.getLogicalSizeFor(this.shareMode, this.postAspect);
    const changed =
      size.width !== this.width ||
      size.height !== this.height;
    if (!changed) return false;
    this.width = size.width;
    this.height = size.height;
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.applyPreviewBackingSize();
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('resize', { width: this.width, height: this.height });
    return true;
  }

  /** Post en-boy oranı (1:1, 4:5, 3:4, 4:3). Post dışında saklanır ve Post'a geçince uygulanır. */
  public setPostAspect(aspect: PostAspect): void {
    if (!POST_ASPECT_SIZES[aspect]) return;
    const prev = this.postAspect;
    this.postAspect = aspect;
    if (this.shareMode !== 'post') return;
    const resized = this.applyLogicalSize();
    const clamped = this.applyMediaConstraints();
    if (resized || clamped || prev !== aspect) {
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  public getPostAspect(): PostAspect {
    return this.postAspect;
  }

  public getLogicalSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  // [START] CREATED BY Bedirhan
  public invalidateStaticCache(): void {
    this.staticSceneCacheDirty = true;
    this.overlayCacheDirty = true;
  }
  // [END] CREATED BY Bedirhan

  /**
   * @deprecated Mantıksal boyut artık moda göre sabittir (Story/Reels 1080×1920, Post en-boy oranına göre).
   * Hikaye/Reels'te argümanlar yok sayılır. Post'ta verilen boyut desteklenen bir en-boy oranına
   * (±0.02) karşılık geliyorsa setPostAspect() olarak yorumlanır (eski UI 1440×1080 = 4:3 geçer).
   */
  public updateCanvasResolution(width?: number, height?: number) {
    if (this.shareMode === 'post' && width && height) {
      const ratio = width / height;
      const match = (Object.keys(POST_ASPECT_SIZES) as PostAspect[]).find((a) => {
        const s = POST_ASPECT_SIZES[a];
        return Math.abs(s.width / s.height - ratio) < 0.02;
      });
      if (match && match !== this.postAspect) {
        this.setPostAspect(match);
        return;
      }
    }
    this.applyLogicalSize();
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }

  // [MODIFIED BY Bedirhan]
  public getAllLayers(): BaseLayer[] {
    this.cachedAllLayers.length = 0;
    if (this.mediaLayer) this.cachedAllLayers.push(this.mediaLayer);
    for (let i = 0; i < this.overlayLayers.length; i++) {
      this.cachedAllLayers.push(this.overlayLayers[i]);
    }
    return this.cachedAllLayers;
  }

  // [START] CREATED BY Bedirhan
  /**
   * Modu ayarlar. Medya yüklendikten sonra mod DEĞİŞTİRİLEMEZ (B7): farklı mod için UI yeni bir
   * oturum (yeni motor) başlatmalıdır. Kabul edildiyse true, reddedildiyse false döner.
   */
  public setShareMode(mode: ShareMode): boolean {
    if (mode === this.shareMode) return true;
    if (this.modeLocked) {
      if (typeof console !== 'undefined') {
        console.warn(`[CanvasEngine] Mod medya yüklendikten sonra değiştirilemez (${this.shareMode} -> ${mode}). Yeni oturum başlatın.`);
      }
      return false;
    }
    this.shareMode = mode;
    this.applyLogicalSize();
    this.applyModeToMediaLayer();
    this.invalidateStaticCache();
    this.requestRender();
    return true;
  }

  /** setShareMode ile aynı. */
  public setMode(mode: ShareMode): boolean {
    return this.setShareMode(mode);
  }

  public getShareMode(): ShareMode {
    return this.shareMode;
  }

  public getMode(): ShareMode {
    return this.shareMode;
  }

  /** Medya yüklendiyse true (mod kilitli). */
  public isModeLocked(): boolean {
    return this.modeLocked;
  }
  // [END] CREATED BY Bedirhan

  // ─────────────────────────────────────────────────────────────
  // WP1: Medya kaydı (D3)
  // ─────────────────────────────────────────────────────────────
  private registerMedia(media: EditorMedia) {
    this.mediaRegistry.add(media);
  }

  private releaseMediaNow(media: EditorMedia) {
    if (this.releasedMedia.has(media)) return;
    MediaSourceManager.release(media);
    this.mediaRegistry.delete(media);
    this.releasedMedia.add(media);
    const oi = this.orphanMedia.indexOf(media);
    if (oi !== -1) this.orphanMedia.splice(oi, 1);
  }

  private isOverlayMedia(media: EditorMedia): boolean {
    for (const m of this.overlayMedia.values()) {
      if (m === media) return true;
    }
    return false;
  }

  private isMediaInUse(media: EditorMedia): boolean {
    if (this.mediaLayer && this.mediaLayer.media === media) return true;
    for (let i = 0; i < this.videoClips.length; i++) {
      if (this.videoClips[i].media === media) return true;
    }
    return false;
  }

  /**
   * Hiçbir klibin kullanmadığı klip medyalarını "yetim" havuzuna alır (undo için duraklatılmış tutulur).
   * Havuz 3'ü aşarsa en eskisi serbest bırakılır.
   */
  private collectUnusedClipMedia() {
    for (const media of Array.from(this.mediaRegistry)) {
      if (this.isOverlayMedia(media) || this.isMediaInUse(media)) {
        const oi = this.orphanMedia.indexOf(media);
        if (oi !== -1) this.orphanMedia.splice(oi, 1);
        continue;
      }
      if (!this.orphanMedia.includes(media)) {
        if (media.element instanceof HTMLVideoElement) {
          try { media.element.pause(); } catch {}
        }
        this.orphanMedia.push(media);
      }
    }
    while (this.orphanMedia.length > CanvasEngine.MAX_ORPHAN_MEDIA) {
      const oldest = this.orphanMedia[0];
      this.releaseMediaNow(oldest);
    }
  }

  /** Kullanılmayan (yetim) klip medyalarını hemen serbest bırakır. Undo geçmişi temizlenince çağrılabilir. */
  public purgeUnusedMedia(): void {
    this.collectUnusedClipMedia();
    for (const m of [...this.orphanMedia]) this.releaseMediaNow(m);
  }

  /** Overlay dışındaki tüm medyayı serbest bırakır (loadMedia değişimi). */
  private releaseAllClipMedia() {
    for (const media of Array.from(this.mediaRegistry)) {
      if (this.isOverlayMedia(media)) continue;
      this.releaseMediaNow(media);
    }
    this.orphanMedia = [];
  }

  /** restore(): serbest bırakılmış bir klip medyasını kaynağından yeniden yükler. */
  private reviveMedia(old: EditorMedia): void {
    if (this.revivingMedia.has(old) || !old.source) return;
    const token = this.loadToken;
    const p = MediaSourceManager.load(old.source, old.type)
      .then((fresh) => {
        if (this.destroyed || token !== this.loadToken) {
          MediaSourceManager.release(fresh);
          return null;
        }
        this.registerMedia(fresh);
        let used = false;
        this.videoClips = this.videoClips.map((c) => {
          if (c.media !== old) return c;
          used = true;
          return { ...c, media: fresh, sourceMediaId: fresh.objectUrl || c.sourceMediaId };
        });
        if (this.mediaLayer && this.mediaLayer.media === old) {
          this.mediaLayer.media = fresh;
          used = true;
        }
        if (!used) {
          this.collectUnusedClipMedia();
        } else {
          this.activePlayingClipId = null;
          this.invalidateStaticCache();
          this.requestRender();
          this.emit('change');
        }
        return fresh;
      })
      .catch(() => null)
      .finally(() => {
        this.revivingMedia.delete(old);
      });
    this.revivingMedia.set(old, p);
  }

  // [MODIFIED BY Bedirhan]
  /**
   * Taban medyayı yükler (veya değiştirir). Görseller ~4096 px'e küçültülür.
   * Hata: MediaLoadError ('timeout' | 'unsupported' | 'decode'); mevcut medya korunur.
   * Motor yok edildiyse veya araya yeni bir loadMedia girdiyse AbortError fırlatır.
   * Post modunda video MediaLoadError('unsupported') ile reddedilir.
   * İlk başarılı yüklemeden sonra mod kilitlenir.
   * @param _autoResizeCanvas @deprecated Yok sayılır: tuval boyutu medyadan türetilmez (B2).
   */
  public async loadMedia(source: string | Blob | File, forcedType?: MediaType, _autoResizeCanvas = false): Promise<EditorMedia> {
    void _autoResizeCanvas;
    if (this.destroyed) throw new DOMException('Engine destroyed', 'AbortError');
    const token = ++this.loadToken;

    const media = await MediaSourceManager.load(source, forcedType);

    if (this.destroyed || token !== this.loadToken) {
      MediaSourceManager.release(media);
      throw new DOMException('Media load superseded', 'AbortError');
    }
    if (this.shareMode === 'post' && media.type === 'video') {
      MediaSourceManager.release(media);
      throw new MediaLoadError('unsupported', 'video', 'Post mode accepts images only');
    }

    // Eski medyayı yalnızca yeni medya hazır olduktan sonra bırak (hata durumunda editör açık kalır)
    this.pauseInternal();
    this.stopVideoLoop();
    if (this.mediaLayer) {
      this.mediaLayer.destroy();
      this.mediaLayer = null;
    }
    this.releaseAllClipMedia();
    this.registerMedia(media);
    this.baseMediaKey = `media_${++mediaKeyCounter}`;
    this.modeLocked = true;
    this.playIntent = false;
    this.resumeOnVisible = false;
    this.setSoundBlocked(false);

    this.mediaLayer = new MediaLayer(media, { fitMode: this.fitMode });
    this.mediaLayer.filterIntensity = this.filterIntensity;
    this.applyModeToMediaLayer();
    const currentPreset = FILTER_PRESETS[this.activeFilterIndex];
    if (currentPreset) {
      this.mediaLayer.setPreset(currentPreset, () => this.requestRender());
    }

    if (this.shareMode === 'reels' && media.type === 'image') {
      this.mediaLayer.enableMotionPhoto(5);
    }
    this.applyMediaConstraints();

    // B8: tek klip de MAX_VIDEO_SEC ile sınırlı (fazlası sessizce kaybolmaz, baştan kırpılır)
    const initDur = Math.min(MAX_VIDEO_SEC, Math.max(0.5, this.mediaLayer.getDuration() || 5));
    this.videoClips = [
      {
        id: `clip_${Date.now().toString(36)}_0`,
        sourceMediaId: media.objectUrl || 'main_media',
        sourceStart: 0,
        sourceEnd: Number(initDur.toFixed(2)),
        duration: Number(initDur.toFixed(2)),
        playbackRate: 1.0,
        volume: 1.0,
        muted: media.type === 'image',
        isMotionPhoto: this.shareMode === 'reels' && media.type === 'image',
        transform: { ...this.mediaLayer.transform },
        fitMode: this.fitMode,
        cropRect: { x: 0, y: 0, width: 1, height: 1 },
        media,
      },
    ];
    this.nleTimelineTime = 0;
    this.activePlayingClipId = null;

    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');

    if (media.type === 'video' || (this.shareMode === 'reels' && media.type === 'image')) {
      await this.playVideo();
      this.emit('video-time', this.getVideoState());
    }

    return media;
  }

  public getMedia(): EditorMedia | null {
    return this.mediaLayer ? this.mediaLayer.media : null;
  }

  public setFitMode(fitMode: FitMode) {
    if (this.fitMode === fitMode && (!this.mediaLayer || this.mediaLayer.fitMode === fitMode)) return;
    this.fitMode = fitMode;
    if (this.mediaLayer) {
      this.mediaLayer.fitMode = fitMode;
      this.applyMediaConstraints();
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  public rotateMediaOrSelected(degrees = 90) {
    const sel = this.interactionManager.getSelectedLayer();
    const target = sel || this.mediaLayer;
    if (target) {
      let next = (target.transform.rotation + degrees) % 360;
      if (next < 0) next += 360;
      target.transform.rotation = Math.round(next);
      if (target === this.mediaLayer) {
        this.applyMediaConstraints();
        this.syncActiveClipTransformFromMediaLayer();
      }
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  public setMediaRotation(degrees: number) {
    const sel = this.interactionManager.getSelectedLayer();
    const target = sel || this.mediaLayer;
    if (target) {
      const norm = (degrees % 360 + 360) % 360;
      target.transform.rotation = Math.round(norm);
      if (target === this.mediaLayer) {
        this.applyMediaConstraints();
        this.syncActiveClipTransformFromMediaLayer();
      }
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  /** Taban medyayı tam olarak bu dönüşüme ayarlar (Post kırpma ekranı; cover kısıtı uygulanır). */
  public setMediaTransform(partial: Partial<LayerTransform>): void {
    const ml = this.mediaLayer;
    if (!ml) return;
    ml.transform = { ...ml.transform, ...partial };
    this.applyMediaConstraints();
    this.syncActiveClipTransformFromMediaLayer();
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public getMediaTransform(): LayerTransform | null {
    return this.mediaLayer ? { ...this.mediaLayer.transform } : null;
  }

  public getMediaRotation(): number {
    const sel = this.interactionManager.getSelectedLayer();
    const target = sel || this.mediaLayer;
    return target ? target.transform.rotation : 0;
  }

  public flipMediaHorizontal() {
    if (this.mediaLayer) {
      this.mediaLayer.flipHorizontal();
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  // [START] CREATED BY Bedirhan
  public flipMediaVertical() {
    if (this.mediaLayer) {
      this.mediaLayer.flipVertical();
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  public setPostAdjustments(adj: Partial<PostAdjustmentState>) {
    if (!this.mediaLayer) return;
    this.mediaLayer.setPostAdjustments(adj);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public resetPostAdjustments() {
    if (!this.mediaLayer) return;
    this.mediaLayer.resetPostAdjustments();
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public getPostAdjustments(): PostAdjustmentState {
    return this.mediaLayer ? { ...this.mediaLayer.postAdjustments } : { ...DEFAULT_POST_ADJUSTMENTS };
  }

  public setReelsEffect(effect: ReelsEffectId) {
    if (!this.mediaLayer) return;
    this.mediaLayer.setReelsEffect(effect);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public getReelsEffect(): ReelsEffectId {
    return this.mediaLayer ? this.mediaLayer.reelsEffect : 'none';
  }

  public setEffectClips(clips: ReelsEffectClip[]) {
    if (!this.mediaLayer) return;
    this.mediaLayer.setEffectClips(clips);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public getEffectClips(): ReelsEffectClip[] {
    return this.mediaLayer ? this.mediaLayer.getEffectClips() : [];
  }
  // [END] CREATED BY Bedirhan

  public resetMediaTransform() {
    if (this.mediaLayer) {
      this.mediaLayer.transform.x = 0.5;
      this.mediaLayer.transform.y = 0.5;
      this.mediaLayer.transform.rotation = 0;
      this.mediaLayer.transform.scale = 1.0;
      this.mediaLayer.transform.flipH = false;
      this.mediaLayer.transform.flipV = false;
      this.applyMediaConstraints();
      this.syncActiveClipTransformFromMediaLayer();
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  public getMediaLayer(): MediaLayer | null {
    return this.mediaLayer;
  }

  public setFilters(filters: Partial<MediaFilters>) {
    if (!this.mediaLayer) return;
    this.mediaLayer.setFilters(filters);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public resetFilters() {
    if (!this.mediaLayer) return;
    this.mediaLayer.resetFilters();
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public cycleFilter(direction: 'prev' | 'next'): string {
    const total = FILTER_PRESETS.length;
    if (direction === 'next') {
      this.activeFilterIndex = (this.activeFilterIndex + 1) % total;
    } else {
      this.activeFilterIndex = (this.activeFilterIndex - 1 + total) % total;
    }

    const preset = FILTER_PRESETS[this.activeFilterIndex];
    if (this.mediaLayer) {
      this.mediaLayer.setPreset(preset, () => this.requestRender());
    }
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    return preset.name;
  }

  /** WP-14: filtre yoğunluğu 0..1 (varsayılan 1). Önizleme + export + snapshot. */
  public setFilterIntensity(intensity: number): void {
    const v = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 1;
    this.filterIntensity = v;
    if (this.mediaLayer) this.mediaLayer.setFilterIntensity(v, () => this.requestRender());
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public getFilterIntensity(): number {
    return this.filterIntensity;
  }

  public getCurrentFilterName(): string {
    return FILTER_PRESETS[this.activeFilterIndex]?.name || 'Simple';
  }

  public getCurrentFilterPreset(): FilterPreset {
    return FILTER_PRESETS[this.activeFilterIndex] || FILTER_PRESETS[0];
  }

  public getCurrentFilterIndex(): number {
    return this.activeFilterIndex;
  }

  public getFilterIndex(): number {
    return this.activeFilterIndex;
  }

  public rotateMedia90(degrees = 90) {
    this.rotateMediaOrSelected(degrees);
  }

  public resetMediaGeometry() {
    this.resetMediaTransform();
  }

  public setFilterByIndex(index: number): string {
    const total = FILTER_PRESETS.length;
    this.activeFilterIndex = ((index % total) + total) % total;
    const preset = FILTER_PRESETS[this.activeFilterIndex];
    if (this.mediaLayer) {
      this.mediaLayer.setPreset(preset, () => this.requestRender());
    }
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    return preset.name;
  }

  /** WP-09: taslak kaydı için bir çıkartma/fotoğraf katmanının kaynak medyası. */
  public getOverlayLayerMedia(layer: BaseLayer): EditorMedia | null {
    return this.overlayMedia.get(layer) ?? null;
  }

  public async addOverlayImage(
    source: string | Blob | File | HTMLImageElement,
    x = 0.5,
    y = 0.5
  ): Promise<OverlayImageLayer> {
    let imgElement: HTMLImageElement;

    let media: EditorMedia | null = null;

    if (source instanceof HTMLImageElement) {
      imgElement = source;
    } else {
      if (this.destroyed) throw new DOMException('Engine destroyed', 'AbortError');
      media = await MediaSourceManager.load(source, 'image');
      if (this.destroyed) {
        MediaSourceManager.release(media);
        throw new DOMException('Engine destroyed', 'AbortError');
      }
      imgElement = media.element as HTMLImageElement;
    }

    const layer = new OverlayImageLayer({
      image: imgElement,
      transform: { x, y, scale: 1.0, rotation: 0 }
    });
    if (media) {
      // Overlay görseli silinse bile snapshot ile geri gelebilir: destroy/yeni oturumda serbest bırakılır
      this.registerMedia(media);
      this.overlayMedia.set(layer, media);
    }

    this.assignDefaultOverlayTiming(layer);

    this.overlayLayers.push(layer);
    this.interactionManager.setSelectedLayer(layer);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    return layer;
  }

  public addText(text = 'Yazı Ekleyin', style?: Partial<TextStyle>, x = 0.5, y = 0.5): TextLayer {
    const layer = new TextLayer({
      style: { text, ...style },
      x,
      y
    });

    this.assignDefaultOverlayTiming(layer);

    this.overlayLayers.push(layer);
    this.interactionManager.setSelectedLayer(layer);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    return layer;
  }

  /**
   * Müziği ayarlar ve (Hikaye/Post'ta) YENİ bir sticker ekler; öncekini değiştirir.
   * Reels'te sticker eklenmez ve null döner (B6). Tercihen setMusic() kullanın.
   */
  public addMusicSticker(audioMeta: StoryAudioMeta, x = 0.5, y = 0.65): MusicStickerLayer | null {
    this.musicMeta = { ...audioMeta };
    if (this.shareMode === 'reels') {
      if (this.overlayLayers.some((l) => l instanceof MusicStickerLayer)) {
        this.overlayLayers = this.overlayLayers.filter((l) => !(l instanceof MusicStickerLayer));
        this.invalidateStaticCache();
        this.requestRender();
        this.emit('change');
      }
      this.emit('music-change', { ...audioMeta });
      return null;
    }
    const layer = this.createMusicStickerLayer(audioMeta, x, y);
    this.emit('music-change', { ...audioMeta });
    return layer;
  }

  private assignDefaultOverlayTiming(layer: BaseLayer) {
    if (this.shareMode === 'reels') {
      const totalDur = Math.max(5, this.getTotalTimelineDuration() || 5);
      if (layer instanceof TextLayer) {
        // Metinler ibre konumundan itibaren 3 sn olarak eklenir
        const TEXT_SPAN_SEC = 3;
        const span = Math.min(TEXT_SPAN_SEC, totalDur);
        const cur = Math.max(0, Math.min(this.getCurrentTime() || 0, totalDur));
        const start = Math.max(0, Math.min(cur, totalDur - span));
        layer.timelineStart = Number(start.toFixed(2));
        layer.timelineEnd = Number((start + span).toFixed(2));
        layer.temporalVisible = true;
        return;
      }
      layer.timelineStart = 0;
      layer.timelineEnd = Number(totalDur.toFixed(2));
      layer.temporalVisible = true;
    } else {
      layer.timelineStart = 0;
      layer.timelineEnd = MAX_VIDEO_SEC;
      layer.temporalVisible = true;
    }
  }

  public getMusicSticker(): MusicStickerLayer | null {
    const found = this.overlayLayers.find((l) => l instanceof MusicStickerLayer);
    return (found as MusicStickerLayer) || null;
  }

  /**
   * Müzik sticker'ını (ve ona bağlı müziği) kaldırır (B6). Sticker yoksa da müzik temizlenir.
   * Kaldırılan bir şey olduysa true.
   */
  public removeMusicSticker(): boolean {
    const hadSticker = this.overlayLayers.some((l) => l instanceof MusicStickerLayer);
    const hadMusic = this.musicMeta !== null;
    if (hadSticker) {
      const sel = this.interactionManager.getSelectedLayer();
      if (sel instanceof MusicStickerLayer) this.interactionManager.setSelectedLayer(null);
      this.overlayLayers = this.overlayLayers.filter((l) => !(l instanceof MusicStickerLayer));
    }
    this.musicMeta = null;
    this.gcDeviceMusicUrls();
    if (hadMusic) this.emit('music-change', null);
    if (hadSticker) {
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
    return hadSticker || hadMusic;
  }

  /**
   * Müziği ayarlar ve sticker yaşam döngüsünü yönetir (B6):
   * - null: müzik ve sticker kaldırılır.
   * - Hikaye/Post: sticker yoksa eklenir, varsa konumu korunarak güncellenir.
   * - Reels: sticker ASLA tuvale eklenmez (yalnızca meta tutulur).
   * Not: Müzik sesini çalmak/dışa aktarmak UI + exporter'ın işidir (music seçeneği).
   */
  public setMusic(meta: StoryAudioMeta | null): void {
    if (!meta) {
      this.removeMusicSticker();
      return;
    }
    if (meta.source === 'device' && meta.streamUrl.startsWith('blob:') && !this.ownedMusicUrls.includes(meta.streamUrl)) {
      this.ownedMusicUrls.push(meta.streamUrl);
    }
    this.musicMeta = { ...meta };
    this.gcDeviceMusicUrls();
    if (this.shareMode === 'reels') {
      if (this.overlayLayers.some((l) => l instanceof MusicStickerLayer)) {
        this.overlayLayers = this.overlayLayers.filter((l) => !(l instanceof MusicStickerLayer));
        this.invalidateStaticCache();
        this.requestRender();
        this.emit('change');
      }
    } else {
      const existing = this.getMusicSticker();
      if (existing) {
        existing.setAudioMeta(meta);
        this.invalidateStaticCache();
        this.requestRender();
        this.emit('change');
      } else {
        this.createMusicStickerLayer(meta, 0.5, 0.65);
      }
    }
    this.emit('music-change', { ...meta });
  }

  /** Yerel müzik blob URL'lerini serbest bırakır: aktif olan ve undo için son 3'ü korunur (force: hepsi). */
  private gcDeviceMusicUrls(force = false): void {
    const cur = this.musicMeta?.streamUrl;
    while (this.ownedMusicUrls.length > (force ? 0 : 3)) {
      const i = this.ownedMusicUrls.findIndex((u) => force || u !== cur);
      if (i === -1) break;
      const [url] = this.ownedMusicUrls.splice(i, 1);
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  }

  private probeAudioDuration(url: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const a = new Audio();
      a.preload = 'metadata';
      const done = (fn: () => void) => {
        clearTimeout(timer);
        a.onloadedmetadata = null;
        a.onerror = null;
        try {
          a.removeAttribute('src');
          a.load();
        } catch {}
        fn();
      };
      const timer = setTimeout(() => done(() => reject(new AudioLoadError('decode'))), 10000);
      a.onloadedmetadata = () => done(() => resolve(Number.isFinite(a.duration) ? a.duration : 0));
      a.onerror = () => done(() => reject(new AudioLoadError('unsupported')));
      a.src = url;
    });
  }

  /**
   * Cihazdan seçilen ses dosyasını müzik olarak ayarlar (source: 'device'). 30 sn sınırı yoktur;
   * Reels'te süre videonun toplam süresiyle sınırlanır. Hata: AudioLoadError.
   */
  public async setMusicFromFile(file: File | Blob, info?: { title?: string; artist?: string }): Promise<StoryAudioMeta> {
    if (this.destroyed) throw new DOMException('Engine destroyed', 'AbortError');
    const name = file instanceof File ? file.name : '';
    const looksAudio = (file.type || '').startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm|mp4)$/i.test(name);
    if (!looksAudio) throw new AudioLoadError('unsupported');
    const url = URL.createObjectURL(file);
    let total = 0;
    try {
      total = await this.probeAudioDuration(url);
    } catch (err) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      throw err;
    }
    if (this.destroyed) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      throw new DOMException('Engine destroyed', 'AbortError');
    }
    const timelineTotal = this.shareMode === 'reels' ? this.getTotalTimelineDuration() : 0;
    const totalDuration = total > 0 ? total : timelineTotal || 30;
    const duration = timelineTotal > 0 ? Math.min(totalDuration, timelineTotal) : totalDuration;
    const meta: StoryAudioMeta = {
      id: `device_${Date.now().toString(36)}`,
      title: info?.title || name.replace(/\.[^.]+$/, '') || 'Ses',
      artist: info?.artist || '',
      streamUrl: url,
      startTime: 0,
      duration,
      totalDuration,
      source: 'device',
      timelineStart: 0,
      timelineEnd: Number(duration.toFixed(2)),
    };
    this.setMusic(meta);
    return { ...meta };
  }

  public getMusic(): StoryAudioMeta | null {
    return this.musicMeta ? { ...this.musicMeta } : null;
  }

  private createMusicStickerLayer(audioMeta: StoryAudioMeta, x: number, y: number): MusicStickerLayer {
    // Önceki müzik çıkartması varsa kaldır
    this.overlayLayers = this.overlayLayers.filter((l) => !(l instanceof MusicStickerLayer));
    const layer = new MusicStickerLayer({
      audioMeta,
      x,
      y,
      onUpdate: () => this.requestRender(),
    });
    const totalDur = Math.max(3, this.getTotalTimelineDuration() || 15);
    layer.timelineStart =
      typeof audioMeta.timelineStart === 'number' ? audioMeta.timelineStart : 0;
    layer.timelineEnd =
      typeof audioMeta.timelineEnd === 'number' && audioMeta.timelineEnd > layer.timelineStart
        ? audioMeta.timelineEnd
        : totalDur;
    this.overlayLayers.push(layer);
    this.interactionManager.setSelectedLayer(layer);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    return layer;
  }

  /**
   * Otomatik Öne Getirme (Auto Z-Index):
   * Dokunulan katman dizinin en sonuna taşınır.
   */
  public bringToFront(layer: BaseLayer) {
    if (layer.type === 'media') return;
    const idx = this.overlayLayers.indexOf(layer);
    if (idx !== -1 && idx < this.overlayLayers.length - 1) {
      this.overlayLayers.splice(idx, 1);
      this.overlayLayers.push(layer);
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
  }

  public reorderOverlayLayer(layerId: string, direction: 'up' | 'down') {
    const idx = this.overlayLayers.findIndex((l) => l.id === layerId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= this.overlayLayers.length) return;
    const [moved] = this.overlayLayers.splice(idx, 1);
    this.overlayLayers.splice(targetIdx, 0, moved);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  /**
   * Merkez Mıknatısı Hizalama Çizgisi:
   * Fotoğraf/nesne merkeze oturduğunda 300ms ince kılavuz çizgisi gösterilir.
   */
  public setSnapGuide(snap: SnapGuideState) {
    if (this.snapGuide.x === snap.x && this.snapGuide.y === snap.y) return;
    this.snapGuide = snap;
    if (this.snapGuideTimer) {
      clearTimeout(this.snapGuideTimer);
      this.snapGuideTimer = null;
    }
    if (snap.x || snap.y) {
      this.snapGuideTimer = setTimeout(() => {
        this.snapGuide = { x: false, y: false };
        this.requestRender();
      }, 200);
    }
    this.requestRender();
    this.emit('snap-guide', snap);
  }

  /**
   * Bir üst katmanı kaldırır. Katman nesnesi yok edilmez: daha önce alınmış bir snapshot ile geri gelebilir.
   * Müzik sticker'ı silinirse müzik de kaldırılır ('music-change' null).
   * Taban medya katmanı bu yolla kaldırılamaz.
   */
  public removeLayer(layerId: string) {
    if (this.mediaLayer && this.mediaLayer.id === layerId) return;
    const target = this.overlayLayers.find((l) => l.id === layerId);
    if (!target) return;

    const sel = this.interactionManager.getSelectedLayer();
    if (sel && sel.id === layerId) {
      this.interactionManager.setSelectedLayer(null);
    }
    target.isInteracting = false;
    this.overlayLayers = this.overlayLayers.filter((l) => l.id !== layerId);

    if (target instanceof MusicStickerLayer && this.musicMeta) {
      this.musicMeta = null;
      this.emit('music-change', null);
    }

    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public getSelectedLayer(): BaseLayer | null {
    return this.interactionManager.getSelectedLayer();
  }

  /** Üst katmanların (z-sırasıyla, alttan üste) kopya dizisi. */
  public getOverlayLayers(): BaseLayer[] {
    return [...this.overlayLayers];
  }

  /** Üst katmanın opaklığını (0..1) ayarlar; önizleme ve export'ta uygulanır. */
  public setLayerOpacity(layerId: string, value: number): void {
    const layer = this.overlayLayers.find((l) => l.id === layerId);
    if (!layer) return;
    layer.opacity = Math.max(0, Math.min(1, value));
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  /** Fotoğraf/çıkartma katmanının görselini değiştirir; konum, ölçek ve süre korunur. */
  public async replaceOverlayImage(layerId: string, source: Blob | File | string): Promise<boolean> {
    const layer = this.overlayLayers.find((l) => l.id === layerId);
    if (!(layer instanceof OverlayImageLayer) || this.destroyed) return false;
    const media = await MediaSourceManager.load(source, 'image');
    if (this.destroyed) {
      MediaSourceManager.release(media);
      return false;
    }
    this.registerMedia(media);
    this.overlayMedia.set(layer, media);
    layer.setImage(media.element as HTMLImageElement);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    return true;
  }

  public getLayerById(layerId: string): BaseLayer | null {
    return this.overlayLayers.find((l) => l.id === layerId) || null;
  }

  /**
   * Metin katmanını tek adımda günceller (tek render + tek 'change').
   * Boş metin katmanı SİLMEZ; UI isterse removeLayer çağırır.
   */
  public updateText(
    layerId: string,
    patch: { text?: string; style?: Partial<TextStyle>; fontPreset?: FontPreset; bgPreset?: TextBgPreset }
  ): TextLayer | null {
    const layer = this.overlayLayers.find((l) => l.id === layerId);
    if (!(layer instanceof TextLayer)) return null;
    if (patch.fontPreset) layer.setFontPreset(patch.fontPreset, () => this.requestRender());
    if (patch.bgPreset) layer.setBgPreset(patch.bgPreset);
    if (patch.style) layer.setStyle(patch.style);
    if (typeof patch.text === 'string') layer.setText(patch.text);
    if ((patch.style?.color || patch.fontPreset || patch.bgPreset) && (layer.fontPreset === 'neon' || layer.bgPreset === 'neon')) {
      layer.setStyle({ shadowColor: layer.style.color });
    }
    layer.visible = true;
    layer.temporalVisible = true;
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    return layer;
  }

  public selectLayer(layer: BaseLayer | null) {
    this.interactionManager.setSelectedLayer(layer);
  }

  public selectLayerById(layerId: string | null): BaseLayer | null {
    if (!layerId) {
      this.interactionManager.setSelectedLayer(null);
      this.invalidateStaticCache();
      this.requestRender();
      return null;
    }
    const found = this.overlayLayers.find((l) => l.id === layerId) || null;
    this.interactionManager.setSelectedLayer(found);
    this.invalidateStaticCache();
    this.requestRender();
    return found;
  }

  /**
   * Bir sonraki karede TEK çizim planlar (D2). Aynı karede bekleyen 'transform' / 'drag-move'
   * olayları da burada yayınlanır. Oynatma döngüsü zaten bu karede çiziyorsa ikinci çizim yapılmaz.
   */
  public requestRender() {
    this.invalidateStaticCache();
    if (this.isDirty || this.destroyed) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    this.isDirty = true;

    this.renderRafId = requestAnimationFrame(() => {
      this.renderRafId = null;
      try {
        if (this.destroyed) return;
        if (!this.isLoopRenderingThisFrame()) {
          this.render();
        }
      } finally {
        this.isDirty = false;
      }
      this.emit('render');
      if (this.hasPendingTransform) {
        const layer = this.pendingTransformLayer;
        this.hasPendingTransform = false;
        this.pendingTransformLayer = null;
        this.emit('transform', layer);
      }
      if (this.pendingDragMove) {
        const info = this.pendingDragMove;
        this.pendingDragMove = null;
        this.emit('drag-move', info);
      }
    });
  }

  /** Oynatma döngüsü bu karede zaten render() çağıracaksa true. */
  private isLoopRenderingThisFrame(): boolean {
    if (this.videoLoopId === null || this.isExportingVideo) return false;
    const ml = this.mediaLayer;
    if (!ml) return false;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) return this.isNlePlaying;
    if (ml.isMotionPhoto) return ml.virtualPlaying;
    const v = ml.getVideoElement();
    return Boolean(v && !v.paused && !v.ended);
  }

  /**
   * Tuval arkasındaki dinamik radyal gradyan:
   * - Arka plan varsayılan olarak saf siyah (#000000).
   * - Renkli efektlerde merkeze odaklı, kenarlara doğru yumuşakça siyaha eriyen radyal gradyan (0% centerColor -> 75% #000000).
   * - Renksiz efektlerde doğrudan saf siyah.
   */
  public renderAmbientBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const preset = FILTER_PRESETS[this.activeFilterIndex] || FILTER_PRESETS[0];

    if (!preset.hasColor || !preset.bgCenterColor || preset.bgCenterColor === '#000000') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const cacheKey = `${width}x${height}:${preset.bgCenterColor}`;
    if (typeof document !== 'undefined') {
      if (!this.ambientBgCacheCanvas) {
        this.ambientBgCacheCanvas = document.createElement('canvas');
        this.ambientBgCacheCtx = this.ambientBgCacheCanvas.getContext('2d', { alpha: false });
      }
      if (this.ambientBgCacheKey !== cacheKey && this.ambientBgCacheCtx) {
        this.ambientBgCacheCanvas.width = width;
        this.ambientBgCacheCanvas.height = height;
        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const radius = Math.hypot(width, height) * 0.55;
        const radGrad = this.ambientBgCacheCtx.createRadialGradient(
          centerX, centerY, 10,
          centerX, centerY, radius
        );
        radGrad.addColorStop(0, preset.bgCenterColor);
        radGrad.addColorStop(0.75, '#000000');
        radGrad.addColorStop(1, '#000000');
        this.ambientBgCacheCtx.fillStyle = radGrad;
        this.ambientBgCacheCtx.fillRect(0, 0, width, height);
        this.ambientBgCacheKey = cacheKey;
      }
      if (this.ambientBgCacheCanvas) {
        ctx.drawImage(this.ambientBgCacheCanvas, 0, 0, width, height);
        return;
      }
    }

    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Math.hypot(width, height) * 0.55;

    const radGrad = ctx.createRadialGradient(
      centerX, centerY, 10,
      centerX, centerY, radius
    );
    radGrad.addColorStop(0, preset.bgCenterColor);
    radGrad.addColorStop(0.75, '#000000');
    radGrad.addColorStop(1, '#000000');

    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, width, height);
  }

  private getActiveEffectsSignature(t: number): string {
    const ml = this.mediaLayer;
    if (!ml) return '';
    if (ml.effectClips.length === 0) return ml.reelsEffect;
    let sig = '';
    for (let i = 0; i < ml.effectClips.length; i++) {
      const c = ml.effectClips[i];
      if (c.effect !== 'none' && t >= c.startTime && t < c.endTime) {
        sig += `${c.id}:${c.effect}:${c.intensity ?? 80}|`;
      }
    }
    return sig;
  }

  private hasDynamicOverlay(): boolean {
    for (let i = 0; i < this.overlayLayers.length; i++) {
      const l = this.overlayLayers[i];
      if (l.isInteracting) return true;
      if (l instanceof TextLayer && l.pulseScale !== 1.0) return true;
    }
    return false;
  }

  // [MODIFIED BY Bedirhan]
  public syncTemporalVisibility(t?: number): boolean {
    const curT = typeof t === 'number' ? t : this.getCurrentTime();
    let changed = false;
    if (this.mediaLayer) {
      this.mediaLayer.timelineTime = curT;
      const nextEffKey = this.getActiveEffectsSignature(curT);
      if (nextEffKey !== this.lastActiveEffectsKey) {
        this.lastActiveEffectsKey = nextEffKey;
        this.staticSceneCacheDirty = true;
        changed = true;
      }
    }
    for (let i = 0; i < this.overlayLayers.length; i++) {
      const layer = this.overlayLayers[i];
      const nextVis =
        this.shareMode === 'reels' ? layer.isVisibleAtTime(curT) : true;
      if (layer.temporalVisible !== nextVis) {
        layer.temporalVisible = nextVis;
        changed = true;
      }
    }
    if (changed) {
      this.invalidateStaticCache();
    }
    return changed;
  }

  private ensureStaticSceneCache(width: number, height: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.staticSceneCacheCanvas) {
      this.staticSceneCacheCanvas = document.createElement('canvas');
      this.staticSceneCacheCtx = this.staticSceneCacheCanvas.getContext('2d');
      this.staticSceneCacheDirty = true;
    }
    if (
      this.staticSceneCacheCanvas.width !== width ||
      this.staticSceneCacheCanvas.height !== height
    ) {
      this.staticSceneCacheCanvas.width = width;
      this.staticSceneCacheCanvas.height = height;
      this.staticSceneCacheDirty = true;
    }
    if (this.staticSceneCacheDirty && this.staticSceneCacheCtx) {
      const cCtx = this.staticSceneCacheCtx;
      cCtx.clearRect(0, 0, width, height);
      this.renderAmbientBackground(cCtx, width, height);
      if (this.mediaLayer && this.mediaLayer.visible) {
        this.safeRenderLayer(this.mediaLayer, cCtx, width, height);
      }
      for (let i = 0; i < this.overlayLayers.length; i++) {
        const layer = this.overlayLayers[i];
        if (layer.visible && layer.temporalVisible) {
          this.safeRenderLayer(layer, cCtx, width, height);
        }
      }
      this.staticSceneCacheDirty = false;
    }
    return this.staticSceneCacheCanvas;
  }

  private ensureOverlayCache(width: number, height: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || this.overlayLayers.length === 0) return null;
    if (!this.overlayCacheCanvas) {
      this.overlayCacheCanvas = document.createElement('canvas');
      this.overlayCacheCtx = this.overlayCacheCanvas.getContext('2d');
      this.overlayCacheDirty = true;
    }
    if (
      this.overlayCacheCanvas.width !== width ||
      this.overlayCacheCanvas.height !== height
    ) {
      this.overlayCacheCanvas.width = width;
      this.overlayCacheCanvas.height = height;
      this.overlayCacheDirty = true;
    }
    if (this.overlayCacheDirty && this.overlayCacheCtx) {
      const oCtx = this.overlayCacheCtx;
      oCtx.clearRect(0, 0, width, height);
      for (let i = 0; i < this.overlayLayers.length; i++) {
        const layer = this.overlayLayers[i];
        if (layer.visible && layer.temporalVisible) {
          this.safeRenderLayer(layer, oCtx, width, height);
        }
      }
      this.overlayCacheDirty = false;
      this.overlayCacheVersion++;
    }
    return this.overlayCacheCanvas;
  }

  /**
   * Video karesi hazır değilken (seek sürüyor / veri yok) tuvali silip siyah kare basmayı önler:
   * son çizilen kare korunur, kare hazır olunca yeniden çizilir. Sonsuz beklemeyi önlemek için
   * en fazla ~1.5 sn (90 kare) ertelenir.
   */
  private shouldHoldLastFrame(): boolean {
    if (this.isExportingVideo || !this.hasDrawnVideoFrame) return false;
    const ml = this.mediaLayer;
    if (!ml || ml.isMotionPhoto) return false;
    const v = ml.getVideoElement();
    if (!v || v.error) return false;
    if (v.readyState >= 2 && !v.seeking) return false;
    if (this.holdFrameCount >= 90) return false;
    this.holdFrameCount++;
    if (!this.holdRetryScheduled && typeof requestAnimationFrame !== 'undefined') {
      this.holdRetryScheduled = true;
      requestAnimationFrame(() => {
        this.holdRetryScheduled = false;
        if (!this.destroyed) this.requestRender();
      });
    }
    return true;
  }

  /**
   * Tek bir katmanı güvenle çizer: çizim sırasında oluşan hata (örn. çözülememiş görsel,
   * sıfır boyutlu önbellek) karenin geri kalanını ve tuvalin durumunu bozmaz. Aksi halde
   * clearRect sonrası fırlatılan hata tuvali boş (siyah) bırakıp titreme yapardı.
   */
  private safeRenderLayer(
    layer: { render(ctx: CanvasRenderingContext2D, w: number, h: number): void },
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    ctx.save();
    try {
      const op = (layer as { opacity?: number }).opacity;
      if (typeof op === 'number' && op < 1) ctx.globalAlpha *= Math.max(0, op);
      layer.render(ctx, width, height);
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[CanvasEngine] layer render failed', err);
    } finally {
      ctx.restore();
    }
  }

  private hasDrawnVideoFrame = false;
  private holdFrameCount = 0;
  private holdRetryScheduled = false;

  public render() {
    if (this.shouldHoldLastFrame()) return;
    this.holdFrameCount = 0;
    this.syncTemporalVisibility();
    {
      const v = this.mediaLayer?.getVideoElement();
      if (v && v.readyState >= 2 && !v.seeking) this.hasDrawnVideoFrame = true;
    }
    this.ctx.setTransform(this.previewScaleX, 0, 0, this.previewScaleY, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);

    const ml = this.mediaLayer;
    const sel = this.interactionManager.getSelectedLayer();

    // 5sn statik fotoğraf->video modunda değişmeyen katmanları tek offscreen tampondan bas
    if (
      ml &&
      ml.isMotionPhoto &&
      !ml.isActiveEffectTimeDependentAt(ml.timelineTime) &&
      !ml.isInteracting &&
      !this.hasDynamicOverlay()
    ) {
      const cached = this.ensureStaticSceneCache(this.width, this.height);
      if (cached) {
        this.ctx.drawImage(cached, 0, 0, this.width, this.height);
      }
    } else {
      // 1. Aktif filtreye özel dinamik ışık süzmesi ve atmosferik arka plan
      this.renderAmbientBackground(this.ctx, this.width, this.height);

      // 2. Katmanlar (Görsel / Metin / Çıkartmalar - Zamansal Görünürlük Kontrollü)
      if (ml && ml.visible) {
        this.safeRenderLayer(ml, this.ctx, this.width, this.height);
      }
      if (this.overlayLayers.length > 0) {
        if (!this.hasDynamicOverlay()) {
          const overlayCached = this.ensureOverlayCache(this.width, this.height);
          if (overlayCached) {
            this.ctx.drawImage(overlayCached, 0, 0, this.width, this.height);
          }
        } else {
          for (let i = 0; i < this.overlayLayers.length; i++) {
            const layer = this.overlayLayers[i];
            if (layer.visible && layer.temporalVisible) {
              this.safeRenderLayer(layer, this.ctx, this.width, this.height);
            }
          }
        }
      }
    }

    // 3. Merkez Mıknatısı İnce Kılavuz Çizgileri (0.3s)
    if (this.snapGuide.x) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(this.width * 0.5, 0);
      this.ctx.lineTo(this.width * 0.5, this.height);
      this.ctx.stroke();
      this.ctx.restore();
    }
    if (this.snapGuide.y) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(0, this.height * 0.5);
      this.ctx.lineTo(this.width, this.height * 0.5);
      this.ctx.stroke();
      this.ctx.restore();
    }

    if (sel && sel.visible && sel.temporalVisible && !sel.locked) {
      sel.renderSelectionHighlight(this.ctx, this.width, this.height);
    }
  }

  public renderClean(targetCtx: CanvasRenderingContext2D, width: number, height: number) {
    const ml = this.mediaLayer;

    // 5 saniyelik statik fotoğraf->video dönüşümünde değişmeyen katmanları tek offscreen tamponda önbelleğe al
    if (ml && ml.isMotionPhoto && !ml.isActiveEffectTimeDependentAt(ml.timelineTime)) {
      const cached = this.ensureStaticSceneCache(width, height);
      if (cached) {
        targetCtx.drawImage(cached, 0, 0, width, height);
        return;
      }
    }

    // Dışa aktarmada da aynı büyüleyici ışık süzmesi ve arka plan atmosferi korunur (kılavuz çizgileri basılmaz)
    this.renderAmbientBackground(targetCtx, width, height);

    if (ml && ml.visible) {
      ml.render(targetCtx, width, height);
    }

    if (this.overlayLayers.length > 0) {
      if (!this.hasDynamicOverlay()) {
        const overlayCached = this.ensureOverlayCache(width, height);
        if (overlayCached) {
          targetCtx.drawImage(overlayCached, 0, 0, width, height);
        }
      } else {
        for (let i = 0; i < this.overlayLayers.length; i++) {
          const layer = this.overlayLayers[i];
          if (layer.visible && layer.temporalVisible) {
            this.safeRenderLayer(layer, targetCtx, width, height);
          }
        }
      }
    }
  }

  /**
   * Zero-Seek Export Hat 2/3: Sadece atmosferik arka planı ve baz medya katmanını (veya harici WebCodecs VideoFrame'i) çizer.
   */
  public drawBaseMedia(
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    externalFrame?: CanvasImageSource
  ): void {
    this.nleTimelineTime = t;
    const ml = this.mediaLayer;
    if (ml) {
      ml.timelineTime = t;
    }

    if (ml && ml.visible && ml.renderFullFrameFast(targetCtx, width, height, externalFrame)) return;

    this.renderAmbientBackground(targetCtx, width, height);

    if (ml && ml.visible) {
      ml.render(targetCtx, width, height, externalFrame);
    }
  }

  /**
   * Zero-Seek Export Hat 2/3: Zamansal görünürlüğü senkronize eder ve tüm metin/sticker katmanlarını
   * tek bir GPU dokusu (overlayCacheCanvas) olarak hedef tuvale 0ms'de damgalar.
   */
  public drawCachedOverlays(
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number
  ): void {
    this.syncTemporalVisibility(t);
    if (this.overlayLayers.length === 0) return;

    const overlayCached = this.ensureOverlayCache(width, height);
    if (overlayCached) {
      targetCtx.drawImage(overlayCached, 0, 0, width, height);
    } else {
      for (let i = 0; i < this.overlayLayers.length; i++) {
        const layer = this.overlayLayers[i];
        if (layer.visible && layer.temporalVisible) {
          this.safeRenderLayer(layer, targetCtx, width, height);
        }
      }
    }
  }

  /** WP-15 GPU export: drawBaseMedia ile aynı zaman durumunu kurar (çizim GPU kompozitöründe yapılır). */
  public prepareExportFrame(t: number): void {
    this.nleTimelineTime = t;
    if (this.mediaLayer) this.mediaLayer.timelineTime = t;
  }

  /**
   * WP-15 GPU export: zamansal görünürlüğü eşitler ve statik overlay önbelleğini (metin/sticker) döndürür.
   * `version` önbellek yeniden çizildiğinde artar; kompozitör dokuyu yalnızca o zaman yeniden yükler.
   */
  public getExportOverlay(
    width: number,
    height: number,
    t: number
  ): { canvas: HTMLCanvasElement; version: number } | null {
    this.syncTemporalVisibility(t);
    if (this.overlayLayers.length === 0) return null;
    let any = false;
    for (let i = 0; i < this.overlayLayers.length; i++) {
      const l = this.overlayLayers[i];
      if (l.visible && l.temporalVisible) {
        any = true;
        break;
      }
    }
    if (!any) return null;
    const c = this.ensureOverlayCache(width, height);
    return c ? { canvas: c, version: this.overlayCacheVersion } : null;
  }

  /**
   * Zero-Seek Export Hat 1: Sahnenin tamamen statik (Fotoğraf + sabit metin/çıkartma/efekt)
   * olup olmadığını tespit eder. True dönerse sahne yalnızca 1 kez çizilir (N=1) ve VideoFrame klonlanır.
   */
  public isPureStaticExport(): boolean {
    const ml = this.mediaLayer;
    if (!ml || !ml.isMotionPhoto) return false;

    const totalDur = this.getTotalTimelineDuration();

    if (ml.isActiveEffectTimeDependentAt(0)) return false;
    for (let i = 0; i < this.videoClips.length; i++) {
      const a = this.videoClips[i].animation;
      if (a && ((a.in && a.in !== 'none') || (a.out && a.out !== 'none'))) return false;
    }

    for (let i = 0; i < ml.effectClips.length; i++) {
      const c = ml.effectClips[i];
      if (c.effect === 'none') continue;
      if (ml.isActiveEffectTimeDependentAt((c.startTime + c.endTime) * 0.5)) {
        return false;
      }
      if (c.startTime > 0.05 || c.endTime < totalDur - 0.05) {
        return false;
      }
    }

    for (let i = 0; i < this.overlayLayers.length; i++) {
      const layer = this.overlayLayers[i];
      if (!layer.visible) continue;
      if (layer.timelineStart > 0.05 || layer.timelineEnd < totalDur - 0.05) {
        return false;
      }
    }

    return true;
  }

  // [START] CREATED BY Bedirhan
  // ─────────────────────────────────────────────────────────────
  // NLE ÇOKLU KLİP (MAGNETIC RIPPLE TRACK) & ZAMANSAL MOTOR METOTLARI
  // ─────────────────────────────────────────────────────────────

  public getVideoClips(): VideoTrackClip[] {
    return this.videoClips.map((c) => ({ ...c }));
  }

  public setVideoClips(clips: VideoTrackClip[]): void {
    if (!clips || clips.length === 0) return;
    this.videoClips = clips.map((c) => ({
      ...c,
      duration: Number(
        Math.max(0.2, (c.sourceEnd - c.sourceStart) / Math.max(0.25, c.playbackRate || 1)).toFixed(2)
      ),
    }));
    const totalDur = this.getTotalTimelineDuration();
    if (this.nleTimelineTime > totalDur) {
      this.nleTimelineTime = Math.max(0, totalDur - 0.05);
    }
    this.activePlayingClipId = null;
    this.reviveReleasedClipMedia();
    this.syncMediaLayerWithClips();
    this.collectUnusedClipMedia();
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  /** Serbest bırakılmış medyaya işaret eden klipler için yeniden yükleme başlatır (undo). */
  private reviveReleasedClipMedia() {
    for (let i = 0; i < this.videoClips.length; i++) {
      const m = this.videoClips[i].media;
      if (m && this.releasedMedia.has(m)) this.reviveMedia(m);
    }
  }

  /** Klip medyasının gerçek süresi (sn). Fotoğraf klibi için MAX_VIDEO_SEC. */
  private getClipMediaDuration(clip: VideoTrackClip): number {
    if (clip.isMotionPhoto) return MAX_VIDEO_SEC;
    const m = clip.media;
    if (m) {
      if (Number.isFinite(m.duration) && (m.duration || 0) > 0) return m.duration as number;
      if (m.element instanceof HTMLVideoElement && Number.isFinite(m.element.duration) && m.element.duration > 0) {
        return m.element.duration;
      }
    }
    const mlDur = this.mediaLayer && (!m || this.mediaLayer.media === m) ? this.mediaLayer.getDuration() : 0;
    return mlDur > 0 ? mlDur : MAX_VIDEO_SEC;
  }

  private sumClipDurations(excludeId?: string): number {
    let sum = 0;
    for (let i = 0; i < this.videoClips.length; i++) {
      const c = this.videoClips[i];
      if (excludeId && c.id === excludeId) continue;
      sum += Math.max(0.2, c.duration);
    }
    return sum;
  }

  /** Reels: MAX_VIDEO_SEC'e kadar kalan timeline süresi (sn). */
  public getRemainingTimelineCapacity(): number {
    return Math.max(0, Number((MAX_VIDEO_SEC - this.sumClipDurations()).toFixed(2)));
  }

  public getTotalTimelineDuration(): number {
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const sum = this.videoClips.reduce((acc, c) => acc + Math.max(0.2, c.duration), 0);
      return Number(Math.max(0.5, Math.min(MAX_VIDEO_SEC, sum)).toFixed(2));
    }
    const ml = this.mediaLayer;
    if (!ml) return 0;
    const end = ml.trimEnd > 0 ? ml.trimEnd : ml.getDuration();
    return Math.max(0.1, end - ml.trimStart);
  }

  public getActiveClipAtTime(t: number): {
    clip: VideoTrackClip;
    index: number;
    clipTimelineStart: number;
    clipTimelineEnd: number;
    localSourceTime: number;
  } | null {
    if (this.videoClips.length === 0) return null;
    const clampedT = Math.max(0, t);
    let acc = 0;
    for (let i = 0; i < this.videoClips.length; i++) {
      const clip = this.videoClips[i];
      const dur = Math.max(0.2, clip.duration);
      const end = acc + dur;
      const isLast = i === this.videoClips.length - 1;
      if (clampedT < end - 0.0005 || isLast) {
        const localOffset = Math.max(0, Math.min(dur, clampedT - acc));
        const localSourceTime = Math.max(
          clip.sourceStart,
          Math.min(clip.sourceEnd, clip.sourceStart + localOffset * (clip.playbackRate || 1))
        );
        return {
          clip,
          index: i,
          clipTimelineStart: Number(acc.toFixed(2)),
          clipTimelineEnd: Number(end.toFixed(2)),
          localSourceTime: Number(localSourceTime.toFixed(3)),
        };
      }
      acc = end;
    }
    return null;
  }

  private syncMediaLayerWithClips(): void {
    const ml = this.mediaLayer;
    if (!ml || this.videoClips.length === 0) return;
    const totalDur = this.getTotalTimelineDuration();
    if (ml.isMotionPhoto) {
      ml.media.duration = Math.max(5, totalDur);
      ml.trimStart = 0;
      ml.trimEnd = totalDur;
    }
    // Klip süreleri değişmiş olabilir: aktif klibin aralığını / görsel durumunu tazele
    const act = this.getActiveClipAtTime(this.nleTimelineTime);
    if (act) this.applyClipVisuals(ml, act.clip);
  }

  public splitActiveClipAt(t?: number, targetClipId?: string): VideoTrackClip | null {
    const clipB = this.splitClipInternal(t, targetClipId);
    if (!clipB) return null;
    this.emit('video-time', this.getVideoState());
    this.emit('change');
    return clipB;
  }

  /** Bölme işlemi; olay YAYMAZ (çağıran tek 'change' yayar). */
  private splitClipInternal(t?: number, targetClipId?: string): VideoTrackClip | null {
    const splitTime = typeof t === 'number' ? t : this.getCurrentTime();
    const active = this.getActiveClipAtTime(splitTime);
    if (!active) return null;
    if (targetClipId && active.clip.id !== targetClipId) return null;

    const offsetInClip = splitTime - active.clipTimelineStart;
    const remainingInClip = active.clipTimelineEnd - splitTime;
    if (offsetInClip < 0.25 || remainingInClip < 0.25) {
      return null;
    }

    const rate = active.clip.playbackRate || 1.0;
    const splitSource = Number((active.clip.sourceStart + offsetInClip * rate).toFixed(2));
    const durA = Number(Math.max(0.2, (splitSource - active.clip.sourceStart) / rate).toFixed(2));
    const durB = Number(Math.max(0.2, (active.clip.sourceEnd - splitSource) / rate).toFixed(2));

    const clipA: VideoTrackClip = {
      ...active.clip,
      sourceEnd: splitSource,
      duration: durA,
      transform: active.clip.transform ? { ...active.clip.transform } : undefined,
      animation: active.clip.animation ? { ...active.clip.animation, out: 'none' } : undefined,
    };

    const clipB: VideoTrackClip = {
      ...active.clip,
      id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      sourceStart: splitSource,
      duration: durB,
      transform: active.clip.transform ? { ...active.clip.transform } : undefined,
      animation: active.clip.animation ? { ...active.clip.animation, in: 'none' } : undefined,
    };

    this.videoClips.splice(active.index, 1, clipA, clipB);
    this.syncMediaLayerWithClips();
    return clipB;
  }

  public removeClip(id: string): boolean {
    if (this.videoClips.length <= 1) return false;
    const idx = this.videoClips.findIndex((c) => c.id === id);
    if (idx === -1) return false;

    this.videoClips.splice(idx, 1);
    const totalDur = this.getTotalTimelineDuration();
    this.nleTimelineTime = Math.max(0, Math.min(this.nleTimelineTime, totalDur - 0.05));
    this.syncMediaLayerWithClips();
    // Silinen klibin medyası taban katmanda kalmasın; sonra kullanılmayan medyayı topla (D3)
    const active = this.getActiveClipAtTime(this.nleTimelineTime);
    if (active) this.applyClipTransformToMediaLayer(active.clip);
    this.activePlayingClipId = null;
    this.collectUnusedClipMedia();
    this.seekVideo(this.nleTimelineTime).catch(() => {});
    this.emit('video-time', this.getVideoState());
    this.emit('change');
    return true;
  }

  /** Klibi kopyalar. Toplam süre MAX_VIDEO_SEC'i aşacaksa null döner (B8). */
  public duplicateClip(id: string): VideoTrackClip | null {
    const idx = this.videoClips.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const orig = this.videoClips[idx];
    if (Math.max(0.2, orig.duration) > this.getRemainingTimelineCapacity() + 0.01) return null;
    const clone: VideoTrackClip = {
      ...orig,
      id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      transform: orig.transform ? { ...orig.transform } : undefined,
      cropRect: orig.cropRect ? { ...orig.cropRect } : undefined,
    };
    this.videoClips.splice(idx + 1, 0, clone);
    this.syncMediaLayerWithClips();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
    return clone;
  }

  /**
   * Reels'e klip ekler. Kalan kapasite (MAX_VIDEO_SEC) 0.5 sn'den azsa medya yüklenmeden null döner;
   * aksi halde yeni klip kalan kapasiteye kırpılır (B8). Yükleme hatası: MediaLoadError.
   */
  public async appendVideoClip(source: string | Blob | File): Promise<VideoTrackClip | null> {
    if (!this.mediaLayer || this.destroyed) return null;
    if (this.getRemainingTimelineCapacity() < 0.5) return null;
    this.pauseVideo();
    const token = this.loadToken;
    const newMedia = await MediaSourceManager.load(source);
    if (this.destroyed || token !== this.loadToken || !this.mediaLayer) {
      MediaSourceManager.release(newMedia);
      return null;
    }
    const capacity = this.getRemainingTimelineCapacity();
    if (capacity < 0.5) {
      MediaSourceManager.release(newMedia);
      return null;
    }
    this.registerMedia(newMedia);
    const isPhoto = newMedia.type === 'image';
    const rawDur = Math.min(
      capacity,
      isPhoto
        ? 5
        : Math.max(0.5, Math.min(MAX_VIDEO_SEC, Number.isFinite(newMedia.duration) && (newMedia.duration || 0) > 0 ? (newMedia.duration as number) : 5))
    );

    let thumbnailUrl: string | undefined;
    try {
      if (typeof document !== 'undefined') {
        const tCanvas = document.createElement('canvas');
        tCanvas.width = 160;
        tCanvas.height = 160;
        const tCtx = tCanvas.getContext('2d');
        if (tCtx) {
          tCtx.drawImage(newMedia.element, 0, 0, 160, 160);
          thumbnailUrl = tCanvas.toDataURL('image/jpeg', 0.72);
        }
      }
    } catch {}

    const newClip: VideoTrackClip = {
      id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      sourceMediaId: newMedia.objectUrl || `media_${Date.now()}`,
      sourceStart: 0,
      sourceEnd: Number(rawDur.toFixed(2)),
      duration: Number(rawDur.toFixed(2)),
      playbackRate: 1.0,
      volume: 1.0,
      muted: isPhoto,
      isMotionPhoto: isPhoto,
      transform: {
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
      },
      fitMode: 'cover',
      cropRect: { x: 0, y: 0, width: 1, height: 1 },
      media: newMedia,
      thumbnailUrl,
      thumbnails: thumbnailUrl ? [thumbnailUrl] : undefined,
    };

    this.videoClips.push(newClip);
    this.syncMediaLayerWithClips();
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');

    // Video ise film şeridinde gerçek ardışık kareler görünmesi için arka planda 8 kare üret
    if (!isPhoto) {
      generateVideoThumbnails(source, {
        count: 8,
        onThumbnail: (thumbs) => {
          if (this.destroyed) return;
          const idx = this.videoClips.findIndex((c) => c.id === newClip.id);
          if (idx !== -1 && thumbs.length > 0) {
            this.videoClips[idx] = {
              ...this.videoClips[idx],
              thumbnailUrl: thumbs[0],
              thumbnails: thumbs,
            };
            this.emit('change');
          }
        },
      }).catch(() => {});
    }

    return newClip;
  }

  public applyClipTransformToMediaLayer(clip: VideoTrackClip): boolean {
    const ml = this.mediaLayer;
    if (!ml) return false;
    let changed = false;

    if (clip.media && ml.media !== clip.media) {
      const prevVideo = ml.getVideoElement();
      if (prevVideo && !prevVideo.paused) {
        try {
          prevVideo.pause();
        } catch {}
      }
      ml.media = clip.media;
      ml.isMotionPhoto = Boolean(clip.isMotionPhoto);
      changed = true;
    }

    const nextFit = clip.fitMode || 'cover';
    if (ml.fitMode !== nextFit) {
      ml.fitMode = nextFit;
      changed = true;
    }

    const nextCrop = clip.cropRect || { x: 0, y: 0, width: 1, height: 1 };
    const curCrop = ml.cropRect || { x: 0, y: 0, width: 1, height: 1 };
    if (
      Math.abs(curCrop.x - nextCrop.x) > 0.0005 ||
      Math.abs(curCrop.y - nextCrop.y) > 0.0005 ||
      Math.abs(curCrop.width - nextCrop.width) > 0.0005 ||
      Math.abs(curCrop.height - nextCrop.height) > 0.0005
    ) {
      ml.cropRect = { ...nextCrop };
      changed = true;
    }

    if (clip.transform && !ml.isInteracting) {
      const t = clip.transform;
      if (
        Math.abs(ml.transform.x - t.x) > 0.0005 ||
        Math.abs(ml.transform.y - t.y) > 0.0005 ||
        Math.abs(ml.transform.scale - t.scale) > 0.0005 ||
        Math.abs(ml.transform.rotation - t.rotation) > 0.0005 ||
        ml.transform.flipH !== t.flipH ||
        ml.transform.flipV !== t.flipV
      ) {
        ml.transform = { ...t };
        changed = true;
      }
    }
    if (this.applyClipVisuals(ml, clip)) changed = true;
    if (changed) {
      this.invalidateStaticCache();
    }
    return changed;
  }

  /** Klibe özel opaklık / animasyon / ayar / filtre / rötuş durumunu taban katmana yazar (çizim yolu ortak). */
  private applyClipVisuals(ml: MediaLayer, clip: VideoTrackClip): boolean {
    let changed = false;
    const op = typeof clip.opacity === 'number' ? clip.opacity : 1;
    if (ml.clipOpacity !== op) {
      ml.clipOpacity = op;
      changed = true;
    }
    if (ml.clipAnimation !== clip.animation) {
      ml.clipAnimation = clip.animation;
      changed = true;
    }
    if (ml.clipAdjustments !== clip.adjustments) {
      ml.clipAdjustments = clip.adjustments;
      changed = true;
    }
    const rt = typeof clip.retouch === 'number' ? clip.retouch : 0;
    if (ml.clipRetouch !== rt) {
      ml.clipRetouch = rt;
      changed = true;
    }
    let start = 0;
    for (let i = 0; i < this.videoClips.length; i++) {
      const c = this.videoClips[i];
      if (c.id === clip.id) break;
      start += Math.max(0.2, c.duration);
    }
    const end = start + Math.max(0.2, clip.duration);
    if (Math.abs(ml.clipRange.start - start) > 0.0005 || Math.abs(ml.clipRange.end - end) > 0.0005) {
      ml.clipRange = { start, end };
      changed = true;
    }
    // Klibe özel filtre (animasyonsuz); yoksa genel filtreye dön
    if (typeof clip.filterIndex === 'number') {
      const total = FILTER_PRESETS.length;
      const idx = ((clip.filterIndex % total) + total) % total;
      const preset = FILTER_PRESETS[idx];
      ml.applyPresetImmediate(preset);
      if (!this.appliedClipFilter || this.lastClipFilterIdx !== idx) changed = true;
      this.appliedClipFilter = true;
      this.lastClipFilterIdx = idx;
    } else if (this.appliedClipFilter) {
      const preset = FILTER_PRESETS[this.activeFilterIndex];
      ml.applyPresetImmediate(preset);
      this.appliedClipFilter = false;
      this.lastClipFilterIdx = -1;
      changed = true;
    }
    return changed;
  }

  public setCropOverlayOpen(open: boolean): void {
    if (!this.mediaLayer) return;
    if (this.mediaLayer.isCropOverlayOpen !== open) {
      this.mediaLayer.isCropOverlayOpen = open;
      this.invalidateStaticCache();
      this.requestRender();
    }
  }

  public updateClipCropRect(
    clipId: string,
    cropRect: { x: number; y: number; width: number; height: number }
  ): void {
    const idx = this.videoClips.findIndex((c) => c.id === clipId);
    if (idx === -1) return;
    const x = Math.max(0, Math.min(0.85, Number(cropRect.x.toFixed(4))));
    const y = Math.max(0, Math.min(0.85, Number(cropRect.y.toFixed(4))));
    const width = Math.max(0.15, Math.min(1 - x, Number(cropRect.width.toFixed(4))));
    const height = Math.max(0.15, Math.min(1 - y, Number(cropRect.height.toFixed(4))));
    const clamped = { x, y, width, height };
    this.videoClips[idx] = {
      ...this.videoClips[idx],
      cropRect: clamped,
    };
    if (this.mediaLayer) {
      this.mediaLayer.cropRect = { ...clamped };
    }
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public updateClipTransform(
    clipId: string,
    partialTransform?: Partial<LayerTransform>,
    fitMode?: FitMode
  ): void {
    const idx = this.videoClips.findIndex((c) => c.id === clipId);
    if (idx === -1) return;
    const clip = this.videoClips[idx];
    const currentTransform: LayerTransform = clip.transform || {
      x: this.mediaLayer?.transform.x ?? 0.5,
      y: this.mediaLayer?.transform.y ?? 0.5,
      scale: this.mediaLayer?.transform.scale ?? 1,
      rotation: this.mediaLayer?.transform.rotation ?? 0,
      flipH: this.mediaLayer?.transform.flipH ?? false,
      flipV: this.mediaLayer?.transform.flipV ?? false,
    };
    let nextTransform: LayerTransform = {
      ...currentTransform,
      ...(partialTransform || {}),
    };
    const nextFitMode: FitMode = fitMode || clip.fitMode || this.mediaLayer?.fitMode || 'cover';
    // Reels fotoğraf klibi her zaman kareyi kaplar (C1)
    const clipMedia = clip.media || this.mediaLayer?.media;
    if (this.shareMode === 'reels' && clip.isMotionPhoto && clipMedia) {
      nextTransform = CanvasEngine.clampTransformToCover(nextTransform, clipMedia, nextFitMode, this.width, this.height);
    }

    this.videoClips[idx] = {
      ...clip,
      transform: nextTransform,
      fitMode: nextFitMode,
    };

    if (this.mediaLayer) {
      this.mediaLayer.transform = { ...nextTransform };
      this.mediaLayer.fitMode = nextFitMode;
    }

    this.invalidateStaticCache();
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public resetClipTransform(clipId: string): void {
    this.updateClipCropRect(clipId, { x: 0, y: 0, width: 1, height: 1 });
    this.updateClipTransform(
      clipId,
      {
        x: 0.5,
        y: 0.5,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
      },
      'cover'
    );
  }

  public reorderClips(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.videoClips.length ||
      toIndex >= this.videoClips.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = this.videoClips.splice(fromIndex, 1);
    this.videoClips.splice(toIndex, 0, moved);
    this.syncMediaLayerWithClips();
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public updateClipTrim(id: string, newSourceStart: number, newSourceEnd: number): void {
    const idx = this.videoClips.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const clip = this.videoClips[idx];
    // B9: klibin KENDİ medya süresiyle sınırla (aktif medyanınkiyle değil)
    const maxMediaDur = Math.max(0.5, this.getClipMediaDuration(clip));
    const rate = Math.max(0.25, clip.playbackRate || 1);
    let s = Math.max(0, Math.min(newSourceStart, maxMediaDur - 0.3));
    let e = Math.max(s + 0.3, Math.min(newSourceEnd, maxMediaDur));
    // B8: toplam timeline MAX_VIDEO_SEC'i aşamaz; kullanıcının sürüklediği kenar sınırlanır
    const maxSpan = Math.max(0.3, (MAX_VIDEO_SEC - this.sumClipDurations(clip.id)) * rate);
    if (e - s > maxSpan) {
      const startMoved = Math.abs(newSourceStart - clip.sourceStart) > Math.abs(newSourceEnd - clip.sourceEnd);
      if (startMoved) s = Math.max(0, e - maxSpan);
      else e = s + maxSpan;
    }
    this.videoClips[idx] = {
      ...clip,
      sourceStart: Number(s.toFixed(2)),
      sourceEnd: Number(e.toFixed(2)),
      duration: Number(((e - s) / rate).toFixed(2)),
    };
    this.syncMediaLayerWithClips();
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public updateClipSpeed(id: string, rate: number): void {
    let clampedRate = Math.max(0.25, Math.min(3.0, rate));
    // B8: yavaşlatma toplam süreyi MAX_VIDEO_SEC üstüne çıkaramaz
    const targets = this.videoClips.filter((c) => !id || c.id === id);
    const span = targets.reduce((acc, c) => acc + Math.max(0, c.sourceEnd - c.sourceStart), 0);
    const capacity = MAX_VIDEO_SEC - (id ? this.sumClipDurations(id) : 0);
    if (span > 0 && capacity > 0.2) {
      const minRate = span / capacity;
      if (clampedRate < minRate) clampedRate = Math.min(3.0, Math.ceil(minRate * 100) / 100);
    }
    this.videoClips = this.videoClips.map((c) => {
      if (id && c.id !== id) return c;
      const dur = Number(Math.max(0.2, (c.sourceEnd - c.sourceStart) / clampedRate).toFixed(2));
      return {
        ...c,
        playbackRate: clampedRate,
        duration: dur,
      };
    });
    if (this.mediaLayer) {
      this.mediaLayer.setPlaybackRate(clampedRate);
    }
    this.syncMediaLayerWithClips();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public updateClipVolume(id: string, volume: number, muted?: boolean): void {
    const clampedVol = Math.max(0, Math.min(1, volume));
    this.videoClips = this.videoClips.map((c) => {
      if (id && c.id !== id) return c;
      const nextMuted = typeof muted === 'boolean' ? muted : clampedVol === 0;
      return {
        ...c,
        volume: clampedVol,
        muted: nextMuted,
      };
    });
    if (this.mediaLayer) {
      this.mediaLayer.setVolume(clampedVol, muted);
      this.reconcileSoundBlockAfterVolumeChange();
    }
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  // ─────────────────────────────────────────────────────────────
  // Reels: klip başına düzenleme araçları (hepsi tek 'change' yayar)
  // ─────────────────────────────────────────────────────────────
  private patchClip(id: string, patch: Partial<VideoTrackClip>): VideoTrackClip | null {
    const idx = this.videoClips.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.videoClips[idx] = { ...this.videoClips[idx], ...patch };
    const clip = this.videoClips[idx];
    const active = this.getActiveClipAtTime(this.nleTimelineTime);
    if (this.mediaLayer && active && active.clip.id === id) {
      this.applyClipTransformToMediaLayer(clip);
    }
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
    return clip;
  }

  /** Klip opaklığı 0..1. */
  public updateClipOpacity(id: string, opacity: number): void {
    this.patchClip(id, { opacity: Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1)) });
  }

  /**
   * Klip giriş/çıkış animasyonu. Verilmeyen alanlar mevcut değeri korur. durationSec 0.1–2 (varsayılan 0.5),
   * klip süresinin yarısını geçemez. Önizleme ve dışa aktarımda aynı çizim yolundan geçer.
   */
  public updateClipAnimation(
    id: string,
    anim: { in?: ClipAnimationKind; out?: ClipAnimationKind; durationSec?: number }
  ): void {
    const clip = this.videoClips.find((c) => c.id === id);
    if (!clip) return;
    const prev: ClipAnimation = clip.animation || {};
    const next: ClipAnimation = {
      in: anim.in ?? prev.in ?? 'none',
      out: anim.out ?? prev.out ?? 'none',
      durationSec: Math.max(0.1, Math.min(2, anim.durationSec ?? prev.durationSec ?? 0.5)),
    };
    const none = next.in === 'none' && next.out === 'none';
    this.patchClip(id, { animation: none ? undefined : next });
  }

  /** Klibi 90° saat yönünde döndürür (kare her zaman kaplanır). */
  public rotateClip90(id: string): void {
    const clip = this.videoClips.find((c) => c.id === id);
    if (!clip) return;
    const cur: LayerTransform = clip.transform || { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipH: false, flipV: false };
    const rotation = (((Math.round((cur.rotation || 0) / 90) * 90 + 90) % 360) + 360) % 360;
    const media = clip.media || this.mediaLayer?.media;
    const fit: FitMode = clip.fitMode || 'cover';
    const next = media
      ? CanvasEngine.clampTransformToCover({ ...cur, rotation }, media, fit, this.width, this.height)
      : { ...cur, rotation };
    this.updateClipTransform(id, next, fit);
  }

  /** Klibi yatay ('h') veya dikey ('v') çevirir. */
  public flipClip(id: string, axis: 'h' | 'v'): void {
    const clip = this.videoClips.find((c) => c.id === id);
    if (!clip) return;
    const cur: LayerTransform = clip.transform || { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipH: false, flipV: false };
    this.updateClipTransform(id, axis === 'h' ? { flipH: !cur.flipH } : { flipV: !cur.flipV });
  }

  /**
   * Klibe özel ayarlar (genel ayarlara EKLENİR). Anahtarlar: brightness/contrast/saturation/warmth -100..100,
   * vignette/sharpness 0..100. Hepsi 0 olursa klip ayarı kaldırılır. Genel ayar için setPostAdjustments().
   */
  public updateClipAdjustments(id: string, partial: Partial<Record<ClipAdjustmentKey, number>>): void {
    const clip = this.videoClips.find((c) => c.id === id);
    if (!clip) return;
    const merged: Partial<PostAdjustmentState> = { ...(clip.adjustments || {}) };
    (Object.keys(partial) as ClipAdjustmentKey[]).forEach((k) => {
      const v = partial[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      const lo = k === 'vignette' || k === 'sharpness' ? 0 : -100;
      merged[k] = Math.max(lo, Math.min(100, Math.round(v)));
    });
    const allZero = (Object.keys(merged) as ClipAdjustmentKey[]).every((k) => !merged[k]);
    this.patchClip(id, { adjustments: allZero ? undefined : merged });
  }

  /** Klibe özel filtre (FILTER_PRESETS indeksi). null = klip filtresini kaldır (genel filtre geçerli). */
  public setClipFilter(id: string, index: number | null): void {
    if (index === null) {
      this.patchClip(id, { filterIndex: undefined });
      return;
    }
    const total = FILTER_PRESETS.length;
    this.patchClip(id, { filterIndex: ((Math.round(index) % total) + total) % total });
  }

  /** Rötuş 0..1: yumuşatılmış kopya orijinalle harmanlanır + hafif parlaklık. 0 = kapalı. */
  public updateClipRetouch(id: string, amount: number): void {
    const v = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
    this.patchClip(id, { retouch: v > 0.005 ? v : undefined });
  }

  private makeClipThumb(media: EditorMedia): string | undefined {
    try {
      if (typeof document === 'undefined') return undefined;
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 160;
      const x = c.getContext('2d');
      if (!x) return undefined;
      x.drawImage(media.element, 0, 0, 160, 160);
      return c.toDataURL('image/jpeg', 0.72);
    } catch {
      return undefined;
    }
  }

  /**
   * Zaman çizelgesindeki t anında klibin karesini dondurur: klibi t'de böler ve araya
   * durationSec (varsayılan 3) saniyelik fotoğraf klibi koyar. Süre kalan kapasiteye (MAX_VIDEO_SEC)
   * kırpılır; kapasite < 0.5 sn, klip video değil veya t klibin içinde değilse null döner.
   * Yeni (dondurulmuş) klibi döndürür; zaman çizelgesi onun başına gider.
   */
  public async freezeFrameAt(id: string, t: number, durationSec = 3): Promise<VideoTrackClip | null> {
    if (this.destroyed || this.shareMode !== 'reels' || !this.mediaLayer) return null;
    const first = this.getActiveClipAtTime(t);
    if (!first || first.clip.id !== id) return null;
    if (first.clip.isMotionPhoto || first.clip.media?.type !== 'video') return null;
    if (this.getRemainingTimelineCapacity() < 0.5) return null;
    this.pauseVideo();
    const token = this.loadToken;
    const ml = this.mediaLayer;
    const srcMedia = first.clip.media as EditorMedia;
    const video = srcMedia.element as HTMLVideoElement;
    this.applyClipTransformToMediaLayer(first.clip);
    await ml.seek(first.localSourceTime);
    if (this.destroyed || token !== this.loadToken) return null;

    const vw = video.videoWidth || srcMedia.width;
    const vh = video.videoHeight || srcMedia.height;
    if (!vw || !vh) return null;
    const k = Math.min(1, 1920 / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(vw * k));
    canvas.height = Math.max(2, Math.round(vh * k));
    const cctx = canvas.getContext('2d');
    if (!cctx) return null;
    cctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
    canvas.width = 1;
    canvas.height = 1;
    if (!blob || this.destroyed || token !== this.loadToken) return null;

    const imgMedia = await MediaSourceManager.load(blob, 'image');
    const again = this.getActiveClipAtTime(t);
    const cap = this.getRemainingTimelineCapacity();
    if (this.destroyed || token !== this.loadToken || !again || again.clip.id !== id || cap < 0.5) {
      MediaSourceManager.release(imgMedia);
      return null;
    }
    this.registerMedia(imgMedia);
    const dur = Number(Math.min(Math.max(0.5, durationSec), cap).toFixed(2));
    const thumb = this.makeClipThumb(imgMedia);

    // Bölme: uçlara çok yakınsa bölmeden başına/sonuna ekle
    const offsetInClip = t - again.clipTimelineStart;
    const remaining = again.clipTimelineEnd - t;
    let insertIdx: number;
    if (offsetInClip < 0.25) insertIdx = again.index;
    else if (remaining < 0.25) insertIdx = again.index + 1;
    else {
      const clipB = this.splitClipInternal(t, id);
      if (!clipB) {
        this.releaseMediaNow(imgMedia);
        return null;
      }
      insertIdx = this.videoClips.findIndex((c) => c.id === clipB.id);
    }
    const src = again.clip;
    const freeze: VideoTrackClip = {
      id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      sourceMediaId: imgMedia.objectUrl || `media_${Date.now()}`,
      sourceStart: 0,
      sourceEnd: dur,
      duration: dur,
      playbackRate: 1,
      volume: 1,
      muted: true,
      isMotionPhoto: true,
      transform: src.transform ? { ...src.transform } : { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipH: false, flipV: false },
      fitMode: src.fitMode || 'cover',
      cropRect: src.cropRect ? { ...src.cropRect } : { x: 0, y: 0, width: 1, height: 1 },
      media: imgMedia,
      thumbnailUrl: thumb,
      thumbnails: thumb ? [thumb] : undefined,
      opacity: src.opacity,
      adjustments: src.adjustments ? { ...src.adjustments } : undefined,
      filterIndex: src.filterIndex,
      retouch: src.retouch,
    };
    this.videoClips.splice(insertIdx, 0, freeze);
    let start = 0;
    for (let i = 0; i < insertIdx; i++) start += Math.max(0.2, this.videoClips[i].duration);
    this.nleTimelineTime = start;
    this.activePlayingClipId = null;
    this.syncMediaLayerWithClips();
    this.applyClipTransformToMediaLayer(freeze);
    this.collectUnusedClipMedia();
    this.invalidateStaticCache();
    this.requestRender();
    this.seekVideo(start).catch(() => {});
    this.emit('video-time', this.getVideoState());
    this.emit('change');
    return freeze;
  }

  /**
   * Klibin medyasını yeni dosyayla değiştirir (aynı zaman çizelgesi yuvası). Süre korunur; yeni kaynaktan
   * kısaysa kısaltılır. Dönüşüm/kırpma sıfırlanır, opaklık/animasyon/ayar/filtre/rötuş korunur. Eski medya,
   * undo için tutulan son 3 medyanın dışına çıkınca serbest bırakılır. Hata: MediaLoadError. Klip yoksa null.
   */
  public async replaceClipMedia(id: string, source: File | Blob | string): Promise<VideoTrackClip | null> {
    if (this.destroyed || this.shareMode !== 'reels' || !this.mediaLayer) return null;
    if (!this.videoClips.some((c) => c.id === id)) return null;
    this.pauseVideo();
    const token = this.loadToken;
    const newMedia = await MediaSourceManager.load(source);
    const idx = this.videoClips.findIndex((c) => c.id === id);
    if (this.destroyed || token !== this.loadToken || idx === -1) {
      MediaSourceManager.release(newMedia);
      return null;
    }
    this.registerMedia(newMedia);
    const old = this.videoClips[idx];
    const isPhoto = newMedia.type === 'image';
    const rate = isPhoto ? 1 : Math.max(0.25, old.playbackRate || 1);
    let sourceEnd: number;
    if (isPhoto) {
      sourceEnd = Math.max(0.5, old.duration);
    } else {
      const nd = Number.isFinite(newMedia.duration) && (newMedia.duration || 0) > 0 ? (newMedia.duration as number) : 5;
      sourceEnd = Math.max(0.5, Math.min(nd, MAX_VIDEO_SEC, old.duration * rate));
    }
    sourceEnd = Number(sourceEnd.toFixed(2));
    const thumb = this.makeClipThumb(newMedia);
    const next: VideoTrackClip = {
      ...old,
      sourceMediaId: newMedia.objectUrl || `media_${Date.now()}`,
      sourceStart: 0,
      sourceEnd,
      playbackRate: rate,
      duration: Number(Math.max(0.2, sourceEnd / rate).toFixed(2)),
      isMotionPhoto: isPhoto,
      muted: isPhoto ? true : old.isMotionPhoto ? false : old.muted,
            transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, flipH: false, flipV: false },
      fitMode: 'cover',
      cropRect: { x: 0, y: 0, width: 1, height: 1 },
      media: newMedia,
      thumbnailUrl: thumb,
      thumbnails: thumb ? [thumb] : undefined,
    };
    this.videoClips[idx] = next;
    this.activePlayingClipId = null;
    this.syncMediaLayerWithClips();
    const active = this.getActiveClipAtTime(this.nleTimelineTime);
    if (active && active.clip.id === id) this.applyClipTransformToMediaLayer(next);
    this.collectUnusedClipMedia();
    this.invalidateStaticCache();
    this.requestRender();
    this.seekVideo(this.nleTimelineTime).catch(() => {});
    this.emit('video-time', this.getVideoState());
    this.emit('change');

    if (!isPhoto) {
      generateVideoThumbnails(source, {
        count: 8,
        onThumbnail: (thumbs) => {
          if (this.destroyed || thumbs.length === 0) return;
          const i2 = this.videoClips.findIndex((c) => c.id === id && c.media === newMedia);
          if (i2 !== -1) {
            this.videoClips[i2] = { ...this.videoClips[i2], thumbnailUrl: thumbs[0], thumbnails: thumbs };
            this.emit('video-time', this.getVideoState());
          }
        },
      }).catch(() => {});
    }
    return next;
  }

  /**
   * Klibi gerçekten ters çevirir: aralığı WebCodecs ile çözer, kareleri tersten H.264/MP4'e kodlar ve
   * klibin medyasını sonuçla değiştirir (klip sessiz olur; hız/dönüşüm/görsel ayarlar korunur).
   * onProgress 0..1. signal iptal ederse DOMException('AbortError') fırlatır ve hiçbir şey değişmez.
   * Hatalar: ReverseClipError (code: 'unsupported' | 'not-video' | 'decode' | 'encode').
   * Klip bu sırada silindiyse null.
   */
  public async reverseClip(
    id: string,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal
  ): Promise<VideoTrackClip | null> {
    if (this.destroyed || this.shareMode !== 'reels') return null;
    const clip = this.videoClips.find((c) => c.id === id);
    if (!clip) return null;
    if (clip.isMotionPhoto || !clip.media || clip.media.type !== 'video') {
      throw new ReverseClipError('not-video');
    }
    this.pauseVideo();
    const token = this.loadToken;
    const oldMedia = clip.media;
    const blob = await reverseVideoRange(
      oldMedia,
      clip.sourceStart,
      Math.min(clip.sourceEnd, clip.sourceStart + MAX_VIDEO_SEC),
      onProgress,
      signal
    );
    if (this.destroyed || token !== this.loadToken) throw new DOMException('Reverse cancelled', 'AbortError');
    if (signal?.aborted) throw new DOMException('Reverse cancelled', 'AbortError');
    let newMedia: EditorMedia;
    try {
      newMedia = await MediaSourceManager.load(blob, 'video');
    } catch {
      throw new ReverseClipError('decode', 'reversed clip could not be loaded');
    }
    const idx = this.videoClips.findIndex((c) => c.id === id && c.media === oldMedia);
    if (this.destroyed || token !== this.loadToken || idx === -1) {
      MediaSourceManager.release(newMedia);
      return null;
    }
    this.registerMedia(newMedia);
    const cur = this.videoClips[idx];
    const rate = Math.max(0.25, cur.playbackRate || 1);
    const span = Math.min(cur.sourceEnd - cur.sourceStart, MAX_VIDEO_SEC);
    const nd = Number.isFinite(newMedia.duration) && (newMedia.duration || 0) > 0 ? (newMedia.duration as number) : span;
    const sourceEnd = Number(Math.max(0.3, Math.min(nd, span + 0.05)).toFixed(2));
    const next: VideoTrackClip = {
      ...cur,
      sourceMediaId: newMedia.objectUrl || `media_${Date.now()}`,
      sourceStart: 0,
      sourceEnd,
      duration: Number(Math.max(0.2, sourceEnd / rate).toFixed(2)),
      muted: true,
      media: newMedia,
      thumbnails: cur.thumbnails ? [...cur.thumbnails].reverse() : undefined,
      thumbnailUrl: cur.thumbnails && cur.thumbnails.length > 0 ? cur.thumbnails[cur.thumbnails.length - 1] : cur.thumbnailUrl,
    };
    this.videoClips[idx] = next;
    this.activePlayingClipId = null;
    this.syncMediaLayerWithClips();
    const active = this.getActiveClipAtTime(this.nleTimelineTime);
    if (active && active.clip.id === id) this.applyClipTransformToMediaLayer(next);
    this.collectUnusedClipMedia();
    this.invalidateStaticCache();
    this.requestRender();
    this.seekVideo(this.nleTimelineTime).catch(() => {});
    this.emit('video-time', this.getVideoState());
    this.emit('change');
    return next;
  }

  public getOverlayTrackItems(): OverlayTrackItem[] {
    const items: OverlayTrackItem[] = [];
    for (let i = 0; i < this.overlayLayers.length; i++) {
      const layer = this.overlayLayers[i];
      if (layer instanceof MusicStickerLayer) continue;

      if (layer instanceof TextLayer) {
        const rawText = (layer.style.text || 'Metin').trim();
        const isTagOrSticker = rawText.startsWith('@');
        items.push({
          id: `ov_${layer.id}`,
          layerId: layer.id,
          type: isTagOrSticker ? 'sticker' : 'text',
          timelineStart: layer.timelineStart,
          timelineEnd: layer.timelineEnd,
          label: rawText || 'Metin',
          color: isTagOrSticker ? '#10b981' : '#f59e0b',
        });
      } else if (layer instanceof OverlayImageLayer) {
        items.push({
          id: `ov_${layer.id}`,
          layerId: layer.id,
          type: 'photo',
          timelineStart: layer.timelineStart,
          timelineEnd: layer.timelineEnd,
          label: 'Fotoğraf / PIP',
          previewUrl: layer.image?.src,
          color: '#a855f7',
        });
      }
    }
    return items;
  }

  public updateOverlayTrackTiming(layerId: string, start: number, end: number): void {
    const layer = this.overlayLayers.find((l) => l.id === layerId);
    if (!layer) return;
    const safeStart = Math.max(0, Number(start.toFixed(2)));
    const safeEnd = Math.max(safeStart + 0.3, Number(end.toFixed(2)));
    layer.timelineStart = safeStart;
    layer.timelineEnd = safeEnd;
    this.syncTemporalVisibility();
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public splitOverlayLayerAt(layerId: string, t?: number): BaseLayer | null {
    const splitTime = typeof t === 'number' ? t : this.getCurrentTime();
    const idx = this.overlayLayers.findIndex((l) => l.id === layerId);
    if (idx === -1) return null;
    const orig = this.overlayLayers[idx];
    if (splitTime <= orig.timelineStart + 0.25 || splitTime >= orig.timelineEnd - 0.25) {
      return null;
    }

    const origEnd = orig.timelineEnd;
    orig.timelineEnd = Number(splitTime.toFixed(2));

    let clone: BaseLayer | null = null;
    if (orig instanceof TextLayer) {
      const nextText = new TextLayer({
        style: { ...orig.style },
        fontPreset: orig.fontPreset,
        bgPreset: orig.bgPreset,
        x: orig.transform.x,
        y: orig.transform.y,
        scale: orig.transform.scale,
        rotation: orig.transform.rotation,
      });
      nextText.timelineStart = Number(splitTime.toFixed(2));
      nextText.timelineEnd = origEnd;
      clone = nextText;
    } else if (orig instanceof OverlayImageLayer) {
      const nextImg = new OverlayImageLayer({
        image: orig.image,
        shapeMode: orig.shapeMode,
        transform: { ...orig.transform },
      });
      nextImg.timelineStart = Number(splitTime.toFixed(2));
      nextImg.timelineEnd = origEnd;
      clone = nextImg;
    }

    if (clone) {
      this.overlayLayers.splice(idx + 1, 0, clone);
      this.interactionManager.setSelectedLayer(clone);
      this.syncTemporalVisibility();
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
    return clone;
  }

  public duplicateOverlayLayer(layerId: string): BaseLayer | null {
    const idx = this.overlayLayers.findIndex((l) => l.id === layerId);
    if (idx === -1) return null;
    const orig = this.overlayLayers[idx];
    const totalDur = Math.max(5, this.getTotalTimelineDuration());
    const span = Math.max(0.5, orig.timelineEnd - orig.timelineStart);
    let nextStart = orig.timelineEnd;
    let nextEnd = nextStart + span;
    if (nextEnd > totalDur) {
      nextStart = orig.timelineStart;
      nextEnd = orig.timelineEnd;
    }

    let clone: BaseLayer | null = null;
    if (orig instanceof TextLayer) {
      const nextText = new TextLayer({
        style: { ...orig.style },
        fontPreset: orig.fontPreset,
        bgPreset: orig.bgPreset,
        x: Math.min(0.85, orig.transform.x + 0.04),
        y: Math.min(0.85, orig.transform.y + 0.04),
        scale: orig.transform.scale,
        rotation: orig.transform.rotation,
      });
      nextText.timelineStart = Number(nextStart.toFixed(2));
      nextText.timelineEnd = Number(nextEnd.toFixed(2));
      clone = nextText;
    } else if (orig instanceof OverlayImageLayer) {
      const nextImg = new OverlayImageLayer({
        image: orig.image,
        shapeMode: orig.shapeMode,
        transform: {
          ...orig.transform,
          x: Math.min(0.85, orig.transform.x + 0.04),
          y: Math.min(0.85, orig.transform.y + 0.04),
        },
      });
      nextImg.timelineStart = Number(nextStart.toFixed(2));
      nextImg.timelineEnd = Number(nextEnd.toFixed(2));
      clone = nextImg;
    }

    if (clone) {
      this.overlayLayers.splice(idx + 1, 0, clone);
      this.interactionManager.setSelectedLayer(clone);
      this.syncTemporalVisibility();
      this.invalidateStaticCache();
      this.requestRender();
      this.emit('change');
    }
    return clone;
  }

  public renderAtTime(t: number): void {
    this.nleTimelineTime = Math.max(0, Math.min(t, this.getTotalTimelineDuration()));
    const active = this.getActiveClipAtTime(this.nleTimelineTime);
    if (active) {
      this.applyClipTransformToMediaLayer(active.clip);
    }
    this.syncTemporalVisibility(this.nleTimelineTime);
    this.render();
  }

  public getCurrentTime(): number {
    const ml = this.mediaLayer;
    if (!ml) return 0;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      return this.nleTimelineTime;
    }
    return ml.getCurrentTime();
  }

  public getVideoState(): VideoState {
    const ml = this.mediaLayer;
    if (!ml) {
      return {
        isVideo: false,
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
        playbackRate: 1.0,
        volume: 1.0,
        muted: false,
        currentTime: 0,
        isPlaying: false,
      };
    }

    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const totalDur = this.getTotalTimelineDuration();
      const active = this.getActiveClipAtTime(this.nleTimelineTime) || {
        clip: this.videoClips[0],
      };

      return {
        isVideo: true,
        isMotionPhoto: Boolean(active.clip.isMotionPhoto),
        duration: totalDur,
        trimStart: 0,
        trimEnd: totalDur,
        playbackRate: active.clip.playbackRate || 1.0,
        volume: active.clip.isMotionPhoto ? 0 : active.clip.volume,
        muted: active.clip.isMotionPhoto ? true : active.clip.muted,
        currentTime: this.nleTimelineTime,
        isPlaying: this.isNlePlaying,
      };
    }

    if (ml.isMotionPhoto) {
      const duration = ml.getDuration();
      return {
        isVideo: true,
        isMotionPhoto: true,
        duration,
        trimStart: ml.trimStart,
        trimEnd: ml.trimEnd > 0 ? ml.trimEnd : duration,
        playbackRate: ml.playbackRate,
        volume: 0,
        muted: true,
        currentTime: ml.virtualTime,
        isPlaying: ml.virtualPlaying,
      };
    }

    const video = ml.getVideoElement();
    if (!video) {
      return {
        isVideo: false,
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
        playbackRate: 1.0,
        volume: 1.0,
        muted: false,
        currentTime: 0,
        isPlaying: false,
      };
    }

    const duration = ml.getDuration();
    return {
      isVideo: true,
      isMotionPhoto: false,
      duration,
      trimStart: ml.trimStart,
      trimEnd: ml.trimEnd > 0 ? ml.trimEnd : duration,
      playbackRate: ml.playbackRate,
      volume: ml.volume,
      muted: ml.muted,
      currentTime: video.currentTime || 0,
      isPlaying: !video.paused && !video.ended,
    };
  }

  public setTrim(start: number, end: number) {
    // Hikaye modunda video kare kırpma / trimming kesinlikle devre dışıdır
    if (this.shareMode === 'story' || !this.mediaLayer) return;
    if (this.shareMode === 'reels' && this.videoClips.length === 1) {
      this.updateClipTrim(this.videoClips[0].id, start, end);
      return;
    }
    this.mediaLayer.setTrim(start, end);
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public setSpeed(rate: number) {
    if (this.shareMode === 'story' || !this.mediaLayer) return;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const active = this.getActiveClipAtTime(this.nleTimelineTime);
      this.updateClipSpeed(active ? active.clip.id : this.videoClips[0].id, rate);
      return;
    }
    this.mediaLayer.setPlaybackRate(rate);
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public setVolume(volume: number, muted?: boolean) {
    if (!this.mediaLayer) return;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const active = this.getActiveClipAtTime(this.nleTimelineTime);
      this.updateClipVolume(active ? active.clip.id : this.videoClips[0].id, volume, muted);
      return;
    }
    this.mediaLayer.setVolume(volume, muted);
    this.reconcileSoundBlockAfterVolumeChange();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public async seekVideo(t: number): Promise<void> {
    if (!this.mediaLayer) return;
    // Son hedef kazanır: hızlı scrub sırasında ara hedefler atılır, seek kuyruğu birikmez
    this.pendingSeekTime = t;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      this.nleTimelineTime = Math.max(0, Math.min(t, this.getTotalTimelineDuration()));
    }
    if (this.seekInFlight) return;
    this.seekInFlight = true;
    try {
      while (this.pendingSeekTime !== null) {
        const target = this.pendingSeekTime;
        this.pendingSeekTime = null;
        await this.performSeek(target);
      }
    } finally {
      this.seekInFlight = false;
    }
  }

  private async performSeek(t: number): Promise<void> {
    if (!this.mediaLayer) return;

    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const totalDur = this.getTotalTimelineDuration();
      const targetT = Math.max(0, Math.min(t, totalDur));
      this.nleTimelineTime = targetT;
      const active = this.getActiveClipAtTime(targetT);
      if (active) {
        this.applyClipTransformToMediaLayer(active.clip);
        if (this.mediaLayer.isMotionPhoto) {
          this.mediaLayer.virtualTime = active.localSourceTime;
        } else {
          await this.mediaLayer.seek(active.localSourceTime);
        }
      }
      // Seek sürerken oynatma başladıysa veya yeni hedef geldiyse eski kareyi basma
      if (this.isNlePlaying || this.pendingSeekTime !== null || !this.mediaLayer) return;
      this.nleTimelineTime = targetT;
      this.syncTemporalVisibility(targetT);
      this.render();
      this.emit('video-progress', targetT);
      return;
    }

    await this.mediaLayer.seek(t);
    if (this.pendingSeekTime !== null || !this.mediaLayer) return;
    this.render();
    this.emit('video-progress', this.mediaLayer.getCurrentTime());
  }

  /** C-01: son ısıtılan sonraki klip (id + hedef kaynak zamanı). */
  private prewarmedClip: { id: string; video: HTMLVideoElement } | null = null;
  private static readonly PREWARM_LEAD_S = 0.6;

  /**
   * C-01: Klip sınırından ~0.6 sn önce sıradaki klibin video elementini hazırlar (preload + giriş
   * noktasına seek => ilk kare çözülür). Geçişte activateClipForPlayback zaten doğru konumda olan
   * elementte yeniden seek yapmaz; böylece sınırda donma olmaz.
   */
  private prewarmNextClip(active: { clip: VideoTrackClip; clipTimelineEnd: number }): void {
    const remaining = active.clipTimelineEnd - this.nleTimelineTime;
    if (remaining > CanvasEngine.PREWARM_LEAD_S || remaining < 0) return;
    const total = this.getTotalTimelineDuration();
    const nextT = active.clipTimelineEnd >= total - 0.001 ? 0 : active.clipTimelineEnd + 0.001;
    const next = this.getActiveClipAtTime(nextT);
    if (!next || next.clip.id === active.clip.id || next.clip.isMotionPhoto) return;
    const media = next.clip.media;
    if (!media || media.type !== 'video' || !(media.element instanceof HTMLVideoElement)) return;
    if (this.mediaLayer && media === this.mediaLayer.media) return;
    if (this.prewarmedClip && this.prewarmedClip.id === next.clip.id) return;
    const video = media.element;
    this.prewarmedClip = { id: next.clip.id, video };
    try {
      video.preload = 'auto';
      video.muted = true;
      video.playbackRate = next.clip.playbackRate || 1.0;
      if (Math.abs(video.currentTime - next.localSourceTime) > 0.05) {
        video.currentTime = next.localSourceTime;
      }
    } catch {}
  }

  private activateClipForPlayback(active: {
    clip: VideoTrackClip;
    localSourceTime: number;
  }): void {
    const ml = this.mediaLayer;
    if (!ml) return;

    this.activePlayingClipId = active.clip.id;
    if (this.prewarmedClip && this.prewarmedClip.id === active.clip.id) this.prewarmedClip = null;
    this.applyClipTransformToMediaLayer(active.clip);

    if (ml.isMotionPhoto) {
      ml.virtualTime = active.localSourceTime;
      ml.virtualPlaying = true;
      return;
    }

    ml.virtualPlaying = false;
    const video = ml.getVideoElement();
    if (!video) return;

    const targetRate = active.clip.playbackRate || 1.0;
    try {
      video.playbackRate = targetRate;
      video.volume = active.clip.volume;
      // B5: otomatik oynatma engeli yalnızca elementi sessize alır, klip tercihi değişmez
      video.muted = Boolean(active.clip.muted) || this.soundBlocked;
      if (Math.abs(video.currentTime - active.localSourceTime) > 0.05) {
        video.currentTime = active.localSourceTime;
      }
    } catch {}

    if (video.paused || video.ended) {
      this.playElementWithFallback(video, Boolean(active.clip.muted)).catch(() => {});
    }
  }

  /** Dışa aktarma sırasında istenen oynatma, aktarma bitince başlar (B10). */
  private resumeAfterExport = false;

  /**
   * Oynatmayı başlatır / sürdürür (Hikaye videosu, hareketli fotoğraf veya Reels NLE).
   * Sesli oynatma reddedilirse sessiz oynar ve 'sound-blocked' yayınlar; tercih kalıcı değişmez.
   * Dışa aktarma sürerken çağrılırsa aktarma bitince oynatılır.
   */
  public async playVideo(): Promise<void> {
    if (!this.mediaLayer || this.destroyed) return;
    this.playIntent = true;
    this.resumeOnVisible = false;

    if (this.isExportingVideo) {
      this.resumeAfterExport = true;
      return;
    }

    this.clearMediaSession();

    // Oynatma başladığında tüm etkileşim bayraklarını sıfırla (Transform sonrası kilitlenmeyi önler)
    if (!this.interactionManager.isGestureActive()) {
      this.mediaLayer.isInteracting = false;
      for (let i = 0; i < this.overlayLayers.length; i++) {
        this.overlayLayers[i].isInteracting = false;
      }
    }

    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const totalDur = this.getTotalTimelineDuration();
      if (this.nleTimelineTime < 0 || this.nleTimelineTime >= totalDur - 0.04) {
        this.nleTimelineTime = 0;
      }
      this.isNlePlaying = true;
      this.activePlayingClipId = null;
      this.lastVirtualTickTime = performance.now();

      const active = this.getActiveClipAtTime(this.nleTimelineTime);
      if (active) {
        this.activateClipForPlayback(active);
      }

      this.startVideoLoop();
      this.emit('video-time', this.getVideoState());
      return;
    }

    if (this.mediaLayer.isMotionPhoto) {
      if (
        this.mediaLayer.virtualTime < this.mediaLayer.trimStart ||
        this.mediaLayer.virtualTime >= this.mediaLayer.trimEnd
      ) {
        this.mediaLayer.virtualTime = this.mediaLayer.trimStart;
      }
      this.mediaLayer.virtualPlaying = true;
      this.lastVirtualTickTime = performance.now();
      this.startVideoLoop();
      this.emit('video-time', this.getVideoState());
      return;
    }

    const ml = this.mediaLayer;
    const video = ml.getVideoElement();
    if (!video) return;

    const end = ml.trimEnd > 0 ? ml.trimEnd : ml.getDuration();
    try {
      if (video.ended || video.currentTime < ml.trimStart || (end > 0 && video.currentTime >= end - 0.02)) {
        video.currentTime = ml.trimStart;
      }
      video.playbackRate = ml.playbackRate;
      video.volume = ml.volume;
    } catch {}

    await this.playElementWithFallback(video, ml.muted);

    // Bekleme sırasında durdurulduysa veya motor yok edildiyse döngüyü başlatma
    if (this.destroyed || !this.playIntent || this.mediaLayer !== ml || this.isExportingVideo) {
      if (!this.playIntent && !video.paused) {
        try { video.pause(); } catch {}
      }
      return;
    }

    this.startVideoLoop();
    this.emit('video-time', this.getVideoState());
  }

  /** Oynatmayı durdurur; niyeti değiştirmez (görünürlük ve iç kullanım için). Bir şey durduysa true. */
  private pauseInternal(): boolean {
    const wasPlaying = this.isPlaying() || this.videoLoopId !== null;
    this.isNlePlaying = false;
    this.activePlayingClipId = null;

    if (this.mediaLayer) {
      this.mediaLayer.virtualPlaying = false;
      const activeVideo = this.mediaLayer.getVideoElement();
      if (activeVideo && !activeVideo.paused) {
        try {
          activeVideo.pause();
        } catch {}
      }
    }

    for (let i = 0; i < this.videoClips.length; i++) {
      const cMedia = this.videoClips[i].media;
      if (cMedia && cMedia.type === 'video' && cMedia.element instanceof HTMLVideoElement) {
        if (!cMedia.element.paused) {
          try {
            cMedia.element.pause();
          } catch {}
        }
      }
    }

    this.stopVideoLoop();
    this.clearMediaSession();
    if (wasPlaying) this.emit('video-time', this.getVideoState());
    return wasPlaying;
  }

  /** Oynatmayı durdurur. Görünürlük dönüşünde otomatik devam etmez; playVideo() ile sürer. */
  public pauseVideo(): void {
    // C-02: sayfa gizlenirken (page.tsx / BackgroundAudioGuard görünürlük işleyicileri bizden önce
    // çalışıp pauseVideo çağırabilir) oynuyorduysak, görünür olunca devam etmek için işaretle.
    const hiddenAutoPause =
      typeof document !== 'undefined' && document.hidden && this.isPlaying() && !this.isExportingVideo;
    this.playIntent = false;
    this.resumeOnVisible = hiddenAutoPause;
    this.resumeAfterExport = false;
    this.pauseInternal();
  }

  /** Gerçekten oynuyor mu (Hikaye video elementi, hareketli fotoğraf veya Reels NLE). */
  public isPlaying(): boolean {
    const ml = this.mediaLayer;
    if (!ml) return false;
    if (this.shareMode === 'reels' && this.videoClips.length > 0) return this.isNlePlaying;
    if (ml.isMotionPhoto) return ml.virtualPlaying;
    const v = ml.getVideoElement();
    return Boolean(v && !v.paused && !v.ended);
  }

  public async toggleVideoPlay(): Promise<boolean> {
    if (this.isPlaying()) {
      this.pauseVideo();
      return false;
    }
    if (!this.mediaLayer) return false;
    const hasTimeline =
      (this.shareMode === 'reels' && this.videoClips.length > 0) ||
      this.mediaLayer.isMotionPhoto ||
      Boolean(this.mediaLayer.getVideoElement());
    if (!hasTimeline) return false;
    await this.playVideo();
    return this.isPlaying();
  }

  public setExportingVideo(exporting: boolean): void {
    const wasExporting = this.isExportingVideo;
    this.isExportingVideo = exporting;
    this.lastExportSourceTime = -1;
    this.lastExportClipId = '';
    this.invalidateStaticCache();
    if (exporting) {
      const intent = this.playIntent;
      this.pauseInternal();
      // Aktarma öncesi oynuyorsa niyet korunur; UI aktarma sonrası playVideo() çağırabilir
      this.playIntent = intent;
      if (this.mediaLayer) {
        Object.assign(this.mediaLayer.currentValues, this.mediaLayer.targetValues);
      }
    } else if (wasExporting) {
      if (this.resumeAfterExport) {
        this.resumeAfterExport = false;
        // Exporter renderAtTime ile kareyi geri yükledikten sonra başlat
        setTimeout(() => {
          if (!this.destroyed && !this.isExportingVideo && this.playIntent) {
            this.playVideo().catch(() => {});
          }
        }, 0);
      }
      this.requestRender();
    }
  }

  /** Dışa aktarma sürüyor mu. */
  public isExporting(): boolean {
    return this.isExportingVideo;
  }

  private startVideoLoop(): void {
    this.stopVideoLoop();
    this.lastVirtualTickTime = performance.now();

    const tick = () => {
      if (this.isExportingVideo || this.destroyed) {
        this.videoLoopId = null;
        return;
      }
      const ml = this.mediaLayer;
      if (!ml) {
        this.videoLoopId = null;
        return;
      }

      if (this.shareMode === 'reels' && this.videoClips.length > 0) {
        if (!this.isNlePlaying) {
          this.videoLoopId = null;
          this.emit('video-time', this.getVideoState());
          return;
        }

        const now = performance.now();
        const dt = Math.min(0.1, Math.max(0, (now - this.lastVirtualTickTime) / 1000));
        this.lastVirtualTickTime = now;
        const totalDur = this.getTotalTimelineDuration();

        let active = this.getActiveClipAtTime(this.nleTimelineTime);

        // Aktif klip bir video ise, oynatma saati donanımsal video.currentTime üzerinden pürüzsüz 60 FPS akar
        if (active && !active.clip.isMotionPhoto) {
          if (this.activePlayingClipId !== active.clip.id) {
            this.activateClipForPlayback(active);
          } else {
            this.applyClipTransformToMediaLayer(active.clip);
            const video = ml.getVideoElement();
            if (video) {
              this.prewarmNextClip(active);
              const targetRate = active.clip.playbackRate || 1.0;
              if (Math.abs(video.playbackRate - targetRate) > 0.01) {
                video.playbackRate = targetRate;
              }
              if (Math.abs(video.volume - active.clip.volume) > 0.01) {
                video.volume = active.clip.volume;
              }
              // B5: engelliyken her karede sesi açıp kapatma salınımı yapma
              const effectiveMuted = Boolean(active.clip.muted) || this.soundBlocked;
              if (video.muted !== effectiveMuted) {
                video.muted = effectiveMuted;
              }
              if (video.paused && !video.seeking) {
                this.playElementWithFallback(video, Boolean(active.clip.muted)).catch(() => {});
              }

              // Klip bitişi kontrolü: video klip sonuna ulaştığında sıradaki klibe kesintisiz geç
              if (video.currentTime >= active.clip.sourceEnd - 0.03 || video.ended) {
                this.nleTimelineTime = active.clipTimelineEnd;
                if (this.nleTimelineTime >= totalDur) {
                  this.nleTimelineTime = 0;
                  this.activePlayingClipId = null;
                }
                const nextActive = this.getActiveClipAtTime(this.nleTimelineTime);
                if (nextActive) {
                  this.activateClipForPlayback(nextActive);
                  active = nextActive;
                }
              } else if (!video.seeking) {
                // Video oynarken timeline zamanı doğrudan videonun gerçek zaman damgasına kilitlenir;
                // Asla ara seek yapılmaz, böylece 60 FPS takılmasız ve donmasız akar!
                const elapsedInClip = Math.max(
                  0,
                  (video.currentTime - active.clip.sourceStart) / targetRate
                );
                this.nleTimelineTime = Number((active.clipTimelineStart + elapsedInClip).toFixed(3));
                if (this.nleTimelineTime >= totalDur) {
                  this.nleTimelineTime = 0;
                  this.activePlayingClipId = null;
                }
              }
            }
          }
        } else {
          // Hareketli fotoğraf veya statik klip ise dt ile ilerle
          this.nleTimelineTime += dt;
          if (this.nleTimelineTime >= totalDur) {
            this.nleTimelineTime = 0;
            this.activePlayingClipId = null;
          }
          active = this.getActiveClipAtTime(this.nleTimelineTime);
          if (active) {
            if (this.activePlayingClipId !== active.clip.id) {
              this.activateClipForPlayback(active);
            } else {
              this.applyClipTransformToMediaLayer(active.clip);
              if (ml.isMotionPhoto) {
                ml.virtualTime = active.localSourceTime;
              }
            }
          }
        }

        this.syncTemporalVisibility(this.nleTimelineTime);
        this.render();
        this.emit('video-progress', this.nleTimelineTime);
        this.videoLoopId = requestAnimationFrame(tick);
        return;
      }

      if (ml.isMotionPhoto) {
        if (!ml.virtualPlaying) {
          this.videoLoopId = null;
          this.emit('video-time', this.getVideoState());
          return;
        }
        const now = performance.now();
        const dt = Math.max(0, (now - this.lastVirtualTickTime) / 1000);
        this.lastVirtualTickTime = now;

        const end = ml.trimEnd > 0 ? ml.trimEnd : ml.getDuration();
        ml.virtualTime += dt * (ml.playbackRate || 1.0);
        if (ml.virtualTime >= end) {
          ml.virtualTime = ml.trimStart;
        }

        // Statik 5sn fotoğrafta yalnızca efekt zamana bağlıysa veya önbellek kirliyse yeniden çiz
        if (ml.isActiveEffectTimeDependentAt(ml.virtualTime) || this.staticSceneCacheDirty) {
          this.render();
        }
        this.emit('video-progress', ml.virtualTime);
        this.videoLoopId = requestAnimationFrame(tick);
        return;
      }

      const video = ml.getVideoElement();
      if (!video) {
        this.videoLoopId = null;
        return;
      }

      if (!video.paused) {
        const end = ml.trimEnd > 0 ? ml.trimEnd : ml.getDuration();
        if (end > 0 && (video.currentTime >= end - 0.02 || video.ended)) {
          video.currentTime = ml.trimStart;
          video.play().catch(() => {});
        }
        this.render();
        this.emit('video-progress', video.currentTime || 0);
        this.videoLoopId = requestAnimationFrame(tick);
      } else {
        if (video.ended) {
          video.currentTime = ml.trimStart;
          video.play().then(() => {
            this.videoLoopId = requestAnimationFrame(tick);
          }).catch(() => {
            this.videoLoopId = null;
            this.emit('video-time', this.getVideoState());
          });
          return;
        }
        this.videoLoopId = null;
        this.emit('video-time', this.getVideoState());
      }
    };
    this.videoLoopId = requestAnimationFrame(tick);
  }

  private stopVideoLoop(): void {
    this.prewarmedClip = null;
    if (this.videoLoopId !== null) {
      cancelAnimationFrame(this.videoLoopId);
      this.videoLoopId = null;
    }
  }

  public async renderFrameAt(
    targetCtx: CanvasRenderingContext2D,
    t: number,
    width?: number,
    height?: number
  ): Promise<void> {
    const w = width || this.width;
    const h = height || this.height;
    const ml = this.mediaLayer;

    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      this.nleTimelineTime = t;
      const visChanged = this.syncTemporalVisibility(t);
      const active = this.getActiveClipAtTime(t);
      if (ml && active) {
        const clipChanged = this.applyClipTransformToMediaLayer(active.clip);
        ml.timelineTime = t;
        const isAnimated = ml.isActiveEffectTimeDependentAt(t);

        if (ml.isMotionPhoto) {
          ml.virtualTime = t;
          if (!visChanged && !clipChanged && !isAnimated && this.lastExportClipId === active.clip.id) {
            return;
          }
          this.lastExportClipId = active.clip.id;
        } else {
          // Gerçek video kliplerde (< 15ms / skipRedraw) atlaması kesinlikle yapılmaz; her kare frame-locked olarak seek edilip tuvale çizilir
          await ml.seek(active.localSourceTime);
          this.lastExportSourceTime = active.localSourceTime;
          this.lastExportClipId = active.clip.id;
        }
      }
      targetCtx.clearRect(0, 0, w, h);
      this.renderClean(targetCtx, w, h);
      return;
    }

    if (ml) {
      const visChanged = this.syncTemporalVisibility(t);
      ml.timelineTime = t;
      const isAnimated = ml.isActiveEffectTimeDependentAt(t);
      if (ml.isMotionPhoto) {
        ml.virtualTime = t;
        if (!visChanged && !isAnimated && this.lastExportSourceTime >= 0) {
          return;
        }
        this.lastExportSourceTime = t;
      } else {
        // Gerçek videoda (< 15ms / skipRedraw) atlaması yapılmaz; her kare mutlaka seek edilip tuvale çizilir
        await ml.seek(t);
        this.lastExportSourceTime = t;
      }
    }
    targetCtx.clearRect(0, 0, w, h);
    this.renderClean(targetCtx, w, h);
  }
  // [END] CREATED BY Bedirhan

  public async exportImage(options?: ExportImageOptions): Promise<Blob> {
    return ImageExporter.exportToBlob(
      this.canvas,
      (targetCtx, w, h) => this.renderClean(targetCtx, w, h),
      {
        mimeType: 'image/webp',
        quality: 0.92,
        width: this.width,
        height: this.height,
        ...(options || {})
      }
    );
  }

  public async downloadImage(filename = 'sigalmedia_tasarim.jpg', options?: ExportImageOptions) {
    const blob = await this.exportImage(options);
    ImageExporter.downloadBlob(blob, filename);
  }

  // ─────────────────────────────────────────────────────────────
  // WP1: Undo / redo temeli
  // ─────────────────────────────────────────────────────────────
  private static cloneClip(c: VideoTrackClip): VideoTrackClip {
    return {
      ...c,
      transform: c.transform ? { ...c.transform } : undefined,
      cropRect: c.cropRect ? { ...c.cropRect } : undefined,
      thumbnails: c.thumbnails ? [...c.thumbnails] : undefined,
      animation: c.animation ? { ...c.animation } : undefined,
      adjustments: c.adjustments ? { ...c.adjustments } : undefined,
    };
  }

  /**
   * Belgenin anlık görüntüsü: üst katmanlar (nesne referansı + durum kopyası; sonradan silinenler de
   * geri gelir), taban medya dönüşümü/ayarları, klipler, zamanlamalar, filtre, müzik ve seçim.
   * Oynatma durumu ve geçici etkileşim bayrakları dahil değildir.
   */
  public snapshot(): EngineSnapshot {
    const ml = this.mediaLayer;
    const sel = this.interactionManager.getSelectedLayer();
    return {
      version: 1,
      mode: this.shareMode,
      postAspect: this.postAspect,
      baseMediaKey: this.baseMediaKey,
      layers: this.overlayLayers.map((layer) => ({ layer, state: layer.getState() })),
      media: ml
        ? {
            transform: { ...ml.transform },
            fitMode: ml.fitMode,
            filters: { ...ml.filters },
            postAdjustments: { ...ml.postAdjustments },
            reelsEffect: ml.reelsEffect,
            effectClips: ml.getEffectClips(),
            trimStart: ml.trimStart,
            trimEnd: ml.trimEnd,
            playbackRate: ml.playbackRate,
            volume: ml.volume,
            muted: ml.muted,
            cropRect: ml.cropRect ? { ...ml.cropRect } : undefined,
          }
        : null,
      clips: this.videoClips.map((c) => CanvasEngine.cloneClip(c)),
      filterIndex: this.activeFilterIndex,
      filterIntensity: this.filterIntensity,
      music: this.musicMeta ? { ...this.musicMeta } : null,
      selectedLayerId: sel && sel.type !== 'media' ? sel.id : null,
      timelineTime: this.nleTimelineTime,
    };
  }

  /**
   * snapshot() ile alınmış durumu geri yükler. Oynatmayı durdurmaz.
   * Farklı mod veya farklı taban medya (loadMedia sonrası) için false döner ve hiçbir şey yapmaz.
   * Serbest bırakılmış klip medyası kaynağından arka planda yeniden yüklenir.
   */
  public restore(snap: EngineSnapshot | null | undefined): boolean {
    if (!snap || snap.version !== 1 || this.destroyed) return false;
    if (snap.mode !== this.shareMode || snap.baseMediaKey !== this.baseMediaKey) return false;

    if (this.shareMode === 'post' && snap.postAspect !== this.postAspect) {
      this.postAspect = snap.postAspect;
      this.applyLogicalSize();
    }

    // 1. Üst katmanlar (silinmiş olanlar dahil, z-sırası korunur)
    this.overlayLayers = snap.layers.map(({ layer, state }) => {
      layer.applyState(state);
      layer.temporalVisible = true;
      return layer;
    });

    // 2. Taban medya
    const ml = this.mediaLayer;
    if (ml && snap.media) {
      const m = snap.media;
      ml.isInteracting = false;
      ml.transform = { ...m.transform };
      ml.fitMode = m.fitMode;
      ml.filters = { ...m.filters };
      ml.postAdjustments = { ...m.postAdjustments };
      ml.reelsEffect = m.reelsEffect;
      ml.setEffectClips(m.effectClips);
      ml.trimStart = m.trimStart;
      ml.trimEnd = m.trimEnd;
      ml.setPlaybackRate(m.playbackRate);
      ml.volume = m.volume;
      ml.muted = m.muted;
      const v = ml.getVideoElement();
      if (v && this.shareMode !== 'reels') {
        v.volume = m.volume;
        v.muted = m.muted || this.soundBlocked;
      }
      ml.cropRect = m.cropRect ? { ...m.cropRect } : undefined;
    }

    // 3. Filtre (animasyonsuz)
    const total = FILTER_PRESETS.length;
    this.activeFilterIndex = ((snap.filterIndex % total) + total) % total;
    this.filterIntensity = typeof snap.filterIntensity === 'number' ? Math.max(0, Math.min(1, snap.filterIntensity)) : 1;
    if (ml) {
      ml.filterIntensity = this.filterIntensity;
      const preset = FILTER_PRESETS[this.activeFilterIndex];
      ml.applyPresetImmediate(preset);
    }

    // 4. Klipler
    if (snap.clips.length > 0) {
      this.videoClips = snap.clips.map((c) => CanvasEngine.cloneClip(c));
      this.reviveReleasedClipMedia();
    }
    this.activePlayingClipId = null;
    this.syncMediaLayerWithClips();
    const totalDur = this.getTotalTimelineDuration();
    this.nleTimelineTime = Math.max(0, Math.min(snap.timelineTime, Math.max(0, totalDur - 0.05)));
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const active = this.getActiveClipAtTime(this.nleTimelineTime);
      if (active) {
        this.applyClipTransformToMediaLayer(active.clip);
        if (ml && ml.isMotionPhoto) ml.virtualTime = active.localSourceTime;
      }
    }
    this.collectUnusedClipMedia();

    // 5. Müzik
    const prevMusic = this.musicMeta;
    this.musicMeta = snap.music ? { ...snap.music } : null;
    if (Boolean(prevMusic) !== Boolean(this.musicMeta) || (prevMusic && this.musicMeta && prevMusic.id !== this.musicMeta.id)) {
      this.emit('music-change', this.getMusic());
    }

    // 6. Seçim
    const nextSel = snap.selectedLayerId
      ? this.overlayLayers.find((l) => l.id === snap.selectedLayerId) || null
      : null;
    for (let i = 0; i < this.overlayLayers.length; i++) {
      this.overlayLayers[i].selected = false;
    }
    this.interactionManager.setSelectedLayer(nextSel);

    this.syncTemporalVisibility(this.shareMode === 'reels' ? this.nleTimelineTime : undefined);
    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
    this.emit('video-time', this.getVideoState());
    return true;
  }

  /** Abone olur. Aboneliği kaldıran bir fonksiyon döner (off ile de kaldırılabilir). */
  public on<K extends EngineEvent>(event: K, fn: EventListener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn as unknown as (args: unknown) => void);
    return () => this.off(event, fn);
  }

  public off<K extends EngineEvent>(event: K, fn: EventListener<K>) {
    this.listeners.get(event)?.delete(fn as unknown as (args: unknown) => void);
  }

  /**
   * Reels: hiçbir zamanlı öğe (metin/çıkartma/fotoğraf katmanı, efekt klibi) videonun toplam
   * süresini geçemez. Her 'change' öncesi çalışır; böylece sürükleme, klip kırpma/silme,
   * hız değişimi ve undo sonrası taşan öğeler otomatik olarak video sonuna kırpılır.
   * Bir şey değiştiyse true döner.
   */
  private clampTimedItemsToTimeline(): boolean {
    if (this.shareMode !== 'reels' || this.videoClips.length === 0) return false;
    const total = this.getTotalTimelineDuration();
    if (!(total > 0)) return false;
    const MIN_SPAN = Math.min(0.3, total);
    const clampRange = (start: number, end: number): [number, number] => {
      let e = Math.min(end, total);
      let s = Math.max(0, Math.min(start, total - MIN_SPAN));
      if (e < s + MIN_SPAN) e = Math.min(total, s + MIN_SPAN);
      s = Number(s.toFixed(2));
      e = Number(e.toFixed(2));
      return [s, e];
    };

    let changed = false;
    for (const layer of this.overlayLayers) {
      if (layer instanceof MusicStickerLayer) continue;
      if (layer.timelineEnd <= total + 0.005 && layer.timelineStart <= total - MIN_SPAN + 0.005) continue;
      const [s, e] = clampRange(layer.timelineStart, layer.timelineEnd);
      if (s !== layer.timelineStart || e !== layer.timelineEnd) {
        layer.timelineStart = s;
        layer.timelineEnd = e;
        changed = true;
      }
    }

    const ml = this.mediaLayer;
    if (ml) {
      const effects = ml.getEffectClips();
      let effectsChanged = false;
      const nextEffects: ReelsEffectClip[] = [];
      for (const c of effects) {
        // Video sonunun ötesinde başlayan efekt anlamsız: kaldır
        if (c.startTime >= total - 0.05) {
          effectsChanged = true;
          continue;
        }
        if (c.endTime > total + 0.005) {
          nextEffects.push({ ...c, endTime: Number(total.toFixed(2)) });
          effectsChanged = true;
        } else {
          nextEffects.push(c);
        }
      }
      if (effectsChanged) {
        ml.setEffectClips(nextEffects);
        changed = true;
      }
    }

    if (changed) {
      this.syncTemporalVisibility();
      this.requestRender();
    }
    return changed;
  }

  public emit<K extends EngineEvent>(event: K, ...args: EngineEventMap[K]) {
    if (event === 'change') {
      this.clampTimedItemsToTimeline();
      this.invalidateStaticCache();
    }
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    // Bir dinleyicinin hatası motoru (rAF/oynatma döngüsü) kilitlememeli
    Array.from(set).forEach((fn) => {
      try {
        (fn as unknown as (...a: unknown[]) => void)(...args);
      } catch (err) {
        if (typeof console !== 'undefined') console.error(`[CanvasEngine] '${String(event)}' listener error`, err);
      }
    });
  }

  /** Motor yok edildiyse true. */
  public isDestroyed(): boolean {
    return this.destroyed;
  }

  // [MODIFIED BY Bedirhan]
  /**
   * Tüm kaynakları serbest bırakır: rAF döngüleri, zamanlayıcılar, görünürlük dinleyicisi, pointer
   * dinleyicileri, tüm medya (taban, klip, overlay) ve blob URL'leri. İdempotenttir.
   */
  public destroy() {
    if (this.destroyed) return;
    this.pauseInternal();
    this.destroyed = true;
    this.loadToken++;
    this.playIntent = false;
    this.resumeOnVisible = false;
    this.resumeAfterExport = false;
    this.stopVideoLoop();
    if (this.renderRafId !== null) {
      try { cancelAnimationFrame(this.renderRafId); } catch {}
      this.renderRafId = null;
    }
    this.isDirty = false;
    if (this.snapGuideTimer) {
      clearTimeout(this.snapGuideTimer);
      this.snapGuideTimer = null;
    }
    this.canvas.removeEventListener('pointerup', this.onCanvasPointerUp);
    this.previewResizeObserver?.disconnect();
    this.previewResizeObserver = null;
    if (this.previewDprMql && this.onPreviewDprChange) {
      try { this.previewDprMql.removeEventListener('change', this.onPreviewDprChange); } catch {}
    }
    this.previewDprMql = null;
    this.onPreviewDprChange = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange, true);
    }
    if (this.mediaLayer) {
      this.mediaLayer.destroy();
    }
    this.interactionManager.destroy();
    this.listeners.clear();

    for (const media of Array.from(this.mediaRegistry)) {
      this.releaseMediaNow(media);
    }
    this.mediaRegistry.clear();
    this.overlayMedia.clear();
    this.orphanMedia = [];
    this.revivingMedia.clear();

    this.mediaLayer = null;
    this.overlayLayers = [];
    this.cachedAllLayers = [];
    this.videoClips = [];
    this.musicMeta = null;
    this.gcDeviceMusicUrls(true);
    this.pendingTransformLayer = null;
    this.hasPendingTransform = false;
    this.pendingDragMove = null;
    // iOS: offscreen tuval belleğini hemen bırak
    for (const c of [this.staticSceneCacheCanvas, this.overlayCacheCanvas, this.ambientBgCacheCanvas]) {
      if (c) {
        c.width = 0;
        c.height = 0;
      }
    }
    this.staticSceneCacheCanvas = null;
    this.staticSceneCacheCtx = null;
    this.overlayCacheCanvas = null;
    this.overlayCacheCtx = null;
    this.ambientBgCacheCanvas = null;
    this.ambientBgCacheCtx = null;
    try {
      this.ctx.clearRect(0, 0, this.width, this.height);
    } catch {}
  }
}
