import { BaseLayer } from './layers/BaseLayer';
import { MediaLayer } from './layers/MediaLayer';
import { TextLayer } from './layers/TextLayer';
import { OverlayImageLayer } from './layers/OverlayImageLayer';
import { MusicStickerLayer } from './layers/MusicStickerLayer';
import { MediaSourceManager } from './MediaSource';
import { InteractionManager } from './interaction/InteractionManager';
import { ImageExporter, ExportImageOptions } from './exporter/ImageExporter';
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
} from './types';

// [MODIFIED BY Bedirhan]
export type EngineEventMap = {
  'render': [];
  'select': [layer: BaseLayer | null];
  'change': [];
  'double-tap': [layer?: BaseLayer];
  'single-tap': [layer: BaseLayer];
  'filter-swipe': [direction: string, filterName: string];
  'drag-move': [info: { layer: BaseLayer; clientX: number; clientY: number; isDragging: boolean }];
  'drag-end': [info: { layer: BaseLayer; clientX: number; clientY: number }];
  'snap-guide': [snap: SnapGuideState];
  'video-time': [state: VideoState];
  'video-progress': [currentTime: number];
};

export type EngineEvent = keyof EngineEventMap;
export type EventListener<K extends EngineEvent = EngineEvent> = (...args: EngineEventMap[K]) => void;

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
  private listeners: Map<EngineEvent, Set<(args: unknown) => void>> = new Map();

  // Merkez Mıknatısı Hizalama Çizgisi Durumu
  private snapGuide: SnapGuideState = { x: false, y: false };
  private snapGuideTimer: ReturnType<typeof setTimeout> | null = null;

  // [START] CREATED BY Bedirhan
  private videoLoopId: number | null = null;
  private isExportingVideo = false;
  private shareMode: ShareMode = 'story';
  private lastVirtualTickTime: number = 0;

  // 5sn Fotoğraf->Video Statik Katman Offscreen Önbelleği (Tek Seferlik Tahsis)
  private staticSceneCacheCanvas: HTMLCanvasElement | null = null;
  private staticSceneCacheCtx: CanvasRenderingContext2D | null = null;
  private staticSceneCacheDirty = true;

  private overlayCacheCanvas: HTMLCanvasElement | null = null;
  private overlayCacheCtx: CanvasRenderingContext2D | null = null;
  private overlayCacheDirty = true;
  // [END] CREATED BY Bedirhan

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context from canvas');
    this.ctx = ctx;

    this.width = options.width || 1080;
    this.height = options.height || 1080;
    this.fitMode = options.fitMode || 'contain';

    this.updateCanvasResolution();

    this.interactionManager = new InteractionManager({
      canvas: this.canvas,
      getLayers: () => this.getAllLayers(),
      getContext: () => this.ctx,
      onStateChange: () => {
        this.invalidateStaticCache();
        this.requestRender();
        this.emit('change');
      },
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
        this.emit('drag-move', info);
      },
      onDragEnd: (info) => {
        this.invalidateStaticCache();
        this.emit('drag-end', info);
      }
    });

    this.requestRender();
  }

  // [START] CREATED BY Bedirhan
  public invalidateStaticCache(): void {
    this.staticSceneCacheDirty = true;
    this.overlayCacheDirty = true;
  }
  // [END] CREATED BY Bedirhan

  // [MODIFIED BY Bedirhan]
  public updateCanvasResolution(width?: number, height?: number) {
    const nextW = width || this.width;
    const nextH = height || this.height;
    const changed =
      nextW !== this.width ||
      nextH !== this.height ||
      this.canvas.width !== nextW ||
      this.canvas.height !== nextH;

    this.width = nextW;
    this.height = nextH;

    if (changed) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.invalidateStaticCache();
      this.requestRender();
    }
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
  public setShareMode(mode: ShareMode) {
    this.shareMode = mode;
    this.invalidateStaticCache();
    if (mode === 'story' && this.mediaLayer && this.mediaLayer.media.type === 'video') {
      const dur = this.mediaLayer.getDuration();
      this.mediaLayer.trimStart = 0;
      this.mediaLayer.trimEnd = dur > 0 ? Math.min(dur, 60) : 0;
      this.mediaLayer.setPlaybackRate(1.0);
    }
  }

  public getShareMode(): ShareMode {
    return this.shareMode;
  }
  // [END] CREATED BY Bedirhan

  // [MODIFIED BY Bedirhan]
  public async loadMedia(source: string | Blob | File, forcedType?: MediaType, autoResizeCanvas = false): Promise<EditorMedia> {
    this.stopVideoLoop();
    if (this.mediaLayer) {
      this.mediaLayer.destroy();
      this.mediaLayer = null;
    }

    const media = await MediaSourceManager.load(source, forcedType);

    if (autoResizeCanvas && media.width && media.height) {
      this.updateCanvasResolution(media.width, media.height);
    }

    this.mediaLayer = new MediaLayer(media, { fitMode: this.fitMode });
    const currentPreset = FILTER_PRESETS[this.activeFilterIndex];
    if (currentPreset) {
      this.mediaLayer.setPreset(currentPreset, () => this.requestRender());
    }

    if (this.shareMode === 'reels' && media.type === 'image') {
      this.mediaLayer.enableMotionPhoto(5);
    }

    this.render();
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
    this.fitMode = fitMode;
    if (this.mediaLayer) {
      this.mediaLayer.fitMode = fitMode;
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
      this.render();
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
      this.render();
      this.requestRender();
      this.emit('change');
    }
  }

  public getMediaRotation(): number {
    const sel = this.interactionManager.getSelectedLayer();
    const target = sel || this.mediaLayer;
    return target ? target.transform.rotation : 0;
  }

  public flipMediaHorizontal() {
    if (this.mediaLayer) {
      this.mediaLayer.flipHorizontal();
      this.render();
      this.requestRender();
      this.emit('change');
    }
  }

  // [START] CREATED BY Bedirhan
  public flipMediaVertical() {
    if (this.mediaLayer) {
      this.mediaLayer.flipVertical();
      this.render();
      this.requestRender();
      this.emit('change');
    }
  }

  public setPostAdjustments(adj: Partial<PostAdjustmentState>) {
    if (!this.mediaLayer) return;
    this.mediaLayer.setPostAdjustments(adj);
    this.invalidateStaticCache();
    this.render();
    this.requestRender();
    this.emit('change');
  }

  public resetPostAdjustments() {
    if (!this.mediaLayer) return;
    this.mediaLayer.resetPostAdjustments();
    this.invalidateStaticCache();
    this.render();
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
    this.render();
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
    this.render();
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
      this.render();
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
    this.requestRender();
    this.emit('change');
  }

  public resetFilters() {
    if (!this.mediaLayer) return;
    this.mediaLayer.resetFilters();
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
    this.requestRender();
    this.emit('change');
    return preset.name;
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
    this.requestRender();
    this.emit('change');
    return preset.name;
  }

  public async addOverlayImage(
    source: string | Blob | File | HTMLImageElement,
    x = 0.5,
    y = 0.5
  ): Promise<OverlayImageLayer> {
    let imgElement: HTMLImageElement;

    if (source instanceof HTMLImageElement) {
      imgElement = source;
    } else {
      const media = await MediaSourceManager.load(source, 'image');
      imgElement = media.element as HTMLImageElement;
    }

    const layer = new OverlayImageLayer({
      image: imgElement,
      transform: { x, y, scale: 1.0, rotation: 0 }
    });

    this.overlayLayers.push(layer);
    this.interactionManager.setSelectedLayer(layer);
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

    this.overlayLayers.push(layer);
    this.interactionManager.setSelectedLayer(layer);
    this.requestRender();
    this.emit('change');
    return layer;
  }

  public addMusicSticker(audioMeta: StoryAudioMeta, x = 0.5, y = 0.65): MusicStickerLayer {
    // Önceki müzik çıkartması varsa kaldır
    this.overlayLayers = this.overlayLayers.filter((l) => !(l instanceof MusicStickerLayer));
    const layer = new MusicStickerLayer({
      audioMeta,
      x,
      y,
      onUpdate: () => this.requestRender(),
    });
    this.overlayLayers.push(layer);
    this.interactionManager.setSelectedLayer(layer);
    this.requestRender();
    this.emit('change');
    return layer;
  }

  public getMusicSticker(): MusicStickerLayer | null {
    const found = this.overlayLayers.find((l) => l instanceof MusicStickerLayer);
    return (found as MusicStickerLayer) || null;
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
      this.requestRender();
      this.emit('change');
    }
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

  public removeLayer(layerId: string) {
    const sel = this.interactionManager.getSelectedLayer();
    if (sel && sel.id === layerId) {
      this.interactionManager.setSelectedLayer(null);
    }

    if (this.mediaLayer && this.mediaLayer.id === layerId) {
      this.mediaLayer = null;
    } else {
      this.overlayLayers = this.overlayLayers.filter((l) => l.id !== layerId);
    }

    this.requestRender();
    this.emit('change');
  }

  public getSelectedLayer(): BaseLayer | null {
    return this.interactionManager.getSelectedLayer();
  }

  public selectLayer(layer: BaseLayer | null) {
    this.interactionManager.setSelectedLayer(layer);
  }

  public requestRender() {
    if (this.isDirty) return;
    this.isDirty = true;

    requestAnimationFrame(() => {
      this.render();
      this.isDirty = false;
      this.emit('render');
    });
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

  // [MODIFIED BY Bedirhan]
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
        this.mediaLayer.render(cCtx, width, height);
      }
      for (let i = 0; i < this.overlayLayers.length; i++) {
        const layer = this.overlayLayers[i];
        if (layer.visible) {
          layer.render(cCtx, width, height);
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
        if (layer.visible) {
          layer.render(oCtx, width, height);
        }
      }
      this.overlayCacheDirty = false;
    }
    return this.overlayCacheCanvas;
  }

  public render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const ml = this.mediaLayer;
    const sel = this.interactionManager.getSelectedLayer();

    // 5sn statik fotoğraf->video modunda değişmeyen katmanları tek offscreen tampondan bas
    if (ml && ml.isMotionPhoto && !ml.isTimeDependentEffect() && !ml.isInteracting) {
      const cached = this.ensureStaticSceneCache(this.width, this.height);
      if (cached) {
        this.ctx.drawImage(cached, 0, 0, this.width, this.height);
      }
    } else {
      // 1. Aktif filtreye özel dinamik ışık süzmesi ve atmosferik arka plan
      this.renderAmbientBackground(this.ctx, this.width, this.height);

      // 2. Katmanlar (Görsel / Metin / Çıkartmalar)
      if (ml && ml.visible) {
        ml.render(this.ctx, this.width, this.height);
      }
      for (let i = 0; i < this.overlayLayers.length; i++) {
        const layer = this.overlayLayers[i];
        if (layer.visible) {
          layer.render(this.ctx, this.width, this.height);
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

    if (sel && sel.visible && !sel.locked) {
      sel.renderSelectionHighlight(this.ctx, this.width, this.height);
    }
  }

  public renderClean(targetCtx: CanvasRenderingContext2D, width: number, height: number) {
    const ml = this.mediaLayer;

    // 5 saniyelik statik fotoğraf->video dönüşümünde değişmeyen katmanları tek offscreen tamponda önbelleğe al
    if (ml && ml.isMotionPhoto) {
      if (!ml.isTimeDependentEffect()) {
        const cached = this.ensureStaticSceneCache(width, height);
        if (cached) {
          targetCtx.clearRect(0, 0, width, height);
          targetCtx.drawImage(cached, 0, 0, width, height);
          return;
        }
      } else {
        targetCtx.clearRect(0, 0, width, height);
        this.renderAmbientBackground(targetCtx, width, height);
        if (ml.visible) {
          ml.render(targetCtx, width, height);
        }
        const overlayCached = this.ensureOverlayCache(width, height);
        if (overlayCached) {
          targetCtx.drawImage(overlayCached, 0, 0, width, height);
        }
        return;
      }
    }

    targetCtx.clearRect(0, 0, width, height);

    // Dışa aktarmada da aynı büyüleyici ışık süzmesi ve arka plan atmosferi korunur (kılavuz çizgileri basılmaz)
    this.renderAmbientBackground(targetCtx, width, height);

    if (ml && ml.visible) {
      ml.render(targetCtx, width, height);
    }
    for (let i = 0; i < this.overlayLayers.length; i++) {
      const layer = this.overlayLayers[i];
      if (layer.visible) {
        layer.render(targetCtx, width, height);
      }
    }
  }

  // [START] CREATED BY Bedirhan
  public getCurrentTime(): number {
    const ml = this.mediaLayer;
    if (!ml) return 0;
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
    this.mediaLayer.setTrim(start, end);
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public setSpeed(rate: number) {
    if (this.shareMode === 'story' || !this.mediaLayer) return;
    this.mediaLayer.setPlaybackRate(rate);
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public setVolume(volume: number, muted?: boolean) {
    if (!this.mediaLayer) return;
    this.mediaLayer.setVolume(volume, muted);
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public async seekVideo(t: number): Promise<void> {
    if (!this.mediaLayer) return;
    await this.mediaLayer.seek(t);
    this.render();
    this.emit('video-progress', this.mediaLayer.getCurrentTime());
  }

  public async playVideo(): Promise<void> {
    if (!this.mediaLayer) return;

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

    const video = this.mediaLayer.getVideoElement();
    if (!video) return;

    if (video.currentTime < this.mediaLayer.trimStart || video.currentTime >= this.mediaLayer.trimEnd) {
      video.currentTime = this.mediaLayer.trimStart;
    }
    video.playbackRate = this.mediaLayer.playbackRate;
    video.volume = this.mediaLayer.volume;
    video.muted = this.mediaLayer.muted;

    try {
      await video.play();
    } catch {
      video.muted = true;
      this.mediaLayer.muted = true;
      try {
        await video.play();
      } catch {}
    }

    this.startVideoLoop();
    this.emit('video-time', this.getVideoState());
  }

  public pauseVideo(): void {
    if (this.mediaLayer?.isMotionPhoto) {
      this.mediaLayer.virtualPlaying = false;
      this.stopVideoLoop();
      this.emit('video-time', this.getVideoState());
      return;
    }
    const video = this.mediaLayer?.getVideoElement();
    if (video && !video.paused) {
      video.pause();
    }
    this.stopVideoLoop();
    this.emit('video-time', this.getVideoState());
  }

  public async toggleVideoPlay(): Promise<boolean> {
    if (this.mediaLayer?.isMotionPhoto) {
      if (this.mediaLayer.virtualPlaying) {
        this.pauseVideo();
        return false;
      } else {
        await this.playVideo();
        return true;
      }
    }

    const video = this.mediaLayer?.getVideoElement();
    if (!video) return false;
    if (video.paused || video.ended) {
      await this.playVideo();
      return true;
    } else {
      this.pauseVideo();
      return false;
    }
  }

  public setExportingVideo(exporting: boolean): void {
    this.isExportingVideo = exporting;
    this.invalidateStaticCache();
    if (exporting) {
      this.pauseVideo();
      if (this.mediaLayer) {
        Object.assign(this.mediaLayer.currentValues, this.mediaLayer.targetValues);
      }
    }
  }

  private startVideoLoop(): void {
    this.stopVideoLoop();
    this.lastVirtualTickTime = performance.now();

    const tick = () => {
      if (this.isExportingVideo) {
        this.videoLoopId = null;
        return;
      }
      const ml = this.mediaLayer;
      if (!ml) {
        this.videoLoopId = null;
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
        if (ml.isTimeDependentEffect() || this.staticSceneCacheDirty) {
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
    if (ml) {
      if (ml.isMotionPhoto) {
        ml.virtualTime = t;
      } else {
        await ml.seek(t);
      }
    }
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
        ...(options || {})
      }
    );
  }

  public async downloadImage(filename = 'sigalmedia_tasarim.jpg', options?: ExportImageOptions) {
    const blob = await this.exportImage(options);
    ImageExporter.downloadBlob(blob, filename);
  }

  public on<K extends EngineEvent>(event: K, fn: EventListener<K>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn as unknown as (args: unknown) => void);
  }

  public off<K extends EngineEvent>(event: K, fn: EventListener<K>) {
    this.listeners.get(event)?.delete(fn as unknown as (args: unknown) => void);
  }

  private emit<K extends EngineEvent>(event: K, ...args: EngineEventMap[K]) {
    if (event === 'change') {
      this.invalidateStaticCache();
    }
    this.listeners.get(event)?.forEach((fn) => {
      (fn as unknown as (...a: unknown[]) => void)(...args);
    });
  }

  // [MODIFIED BY Bedirhan]
  public destroy() {
    this.stopVideoLoop();
    if (this.mediaLayer) {
      this.mediaLayer.destroy();
    }
    this.interactionManager.destroy();
    this.listeners.clear();
    this.mediaLayer = null;
    this.overlayLayers = [];
    this.cachedAllLayers = [];
    this.staticSceneCacheCanvas = null;
    this.staticSceneCacheCtx = null;
    this.overlayCacheCanvas = null;
    this.overlayCacheCtx = null;
    try {
      this.ctx.clearRect(0, 0, this.width, this.height);
    } catch {}
  }
}
