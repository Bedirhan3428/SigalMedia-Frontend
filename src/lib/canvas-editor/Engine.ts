import { BaseLayer } from './layers/BaseLayer';
import { MediaLayer } from './layers/MediaLayer';
import { TextLayer } from './layers/TextLayer';
import { OverlayImageLayer } from './layers/OverlayImageLayer';
import { MusicStickerLayer } from './layers/MusicStickerLayer';
import { MediaSourceManager } from './MediaSource';
import { InteractionManager } from './interaction/InteractionManager';
import { ImageExporter, ExportImageOptions } from './exporter/ImageExporter';
import { generateVideoThumbnails } from './utils/videoThumbs';
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
  OverlayTrackItem,
  LayerTransform,
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

  private ambientBgCacheCanvas: HTMLCanvasElement | null = null;
  private ambientBgCacheCtx: CanvasRenderingContext2D | null = null;
  private ambientBgCacheKey = '';

  private lastActiveEffectsKey = '';
  private lastExportSourceTime = -1;
  private lastExportClipId = '';
  private seekInFlight = false;
  private pendingSeekTime: number | null = null;
  // [END] CREATED BY Bedirhan

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    const ctx =
      this.canvas.getContext('2d', { desynchronized: true }) ||
      this.canvas.getContext('2d');
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
      onPointerDownCapture: () => {
        if (this.shareMode === 'reels' && (this.isNlePlaying || this.videoLoopId !== null)) {
          this.pauseVideo();
        }
      },
      onStateChange: () => {
        if (this.shareMode === 'reels' && this.mediaLayer && this.videoClips.length > 0) {
          const active = this.getActiveClipAtTime(this.nleTimelineTime);
          if (active) {
            this.videoClips[active.index] = {
              ...this.videoClips[active.index],
              transform: { ...this.mediaLayer.transform },
              fitMode: this.mediaLayer.fitMode,
            };
          }
        }
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

    const initDur = Math.max(0.5, this.mediaLayer.getDuration() || 5);
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

    this.invalidateStaticCache();
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
      this.invalidateStaticCache();
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
      this.invalidateStaticCache();
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
      this.invalidateStaticCache();
      this.render();
      this.requestRender();
      this.emit('change');
    }
  }

  // [START] CREATED BY Bedirhan
  public flipMediaVertical() {
    if (this.mediaLayer) {
      this.mediaLayer.flipVertical();
      this.invalidateStaticCache();
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
      this.invalidateStaticCache();
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

    this.assignDefaultOverlayTiming(layer);

    this.overlayLayers.push(layer);
    this.interactionManager.setSelectedLayer(layer);
    this.invalidateStaticCache();
    this.render();
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
    this.render();
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
    this.render();
    this.requestRender();
    this.emit('change');
    return layer;
  }

  private assignDefaultOverlayTiming(layer: BaseLayer) {
    if (this.shareMode === 'reels') {
      const totalDur = Math.max(5, this.getTotalTimelineDuration() || 5);
      layer.timelineStart = 0;
      layer.timelineEnd = Number(totalDur.toFixed(2));
      layer.temporalVisible = true;
    } else {
      layer.timelineStart = 0;
      layer.timelineEnd = 60;
      layer.temporalVisible = true;
    }
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

    this.invalidateStaticCache();
    this.requestRender();
    this.emit('change');
  }

  public getSelectedLayer(): BaseLayer | null {
    return this.interactionManager.getSelectedLayer();
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

  public requestRender() {
    this.invalidateStaticCache();
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
        this.mediaLayer.render(cCtx, width, height);
      }
      for (let i = 0; i < this.overlayLayers.length; i++) {
        const layer = this.overlayLayers[i];
        if (layer.visible && layer.temporalVisible) {
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
        if (layer.visible && layer.temporalVisible) {
          layer.render(oCtx, width, height);
        }
      }
      this.overlayCacheDirty = false;
    }
    return this.overlayCacheCanvas;
  }

  public render() {
    this.syncTemporalVisibility();
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
        ml.render(this.ctx, this.width, this.height);
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
              layer.render(this.ctx, this.width, this.height);
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
            layer.render(targetCtx, width, height);
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
          layer.render(targetCtx, width, height);
        }
      }
    }
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
    this.syncMediaLayerWithClips();
    this.requestRender();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
  }

  public getTotalTimelineDuration(): number {
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      const sum = this.videoClips.reduce((acc, c) => acc + Math.max(0.2, c.duration), 0);
      return Number(Math.max(0.5, Math.min(60, sum)).toFixed(2));
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
  }

  public splitActiveClipAt(t?: number, targetClipId?: string): VideoTrackClip | null {
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
    };

    const clipB: VideoTrackClip = {
      ...active.clip,
      id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      sourceStart: splitSource,
      duration: durB,
      transform: active.clip.transform ? { ...active.clip.transform } : undefined,
    };

    this.videoClips.splice(active.index, 1, clipA, clipB);
    this.syncMediaLayerWithClips();
    this.emit('video-time', this.getVideoState());
    this.emit('change');
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
    this.seekVideo(this.nleTimelineTime).catch(() => {});
    this.emit('video-time', this.getVideoState());
    this.emit('change');
    return true;
  }

  public duplicateClip(id: string): VideoTrackClip | null {
    const idx = this.videoClips.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const orig = this.videoClips[idx];
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

  public async appendVideoClip(source: string | Blob | File): Promise<VideoTrackClip | null> {
    if (!this.mediaLayer) return null;
    this.pauseVideo();
    const newMedia = await MediaSourceManager.load(source);
    const isPhoto = newMedia.type === 'image';
    const rawDur = isPhoto
      ? 5
      : Math.max(0.5, Math.min(60, Number.isFinite(newMedia.duration) && (newMedia.duration || 0) > 0 ? (newMedia.duration as number) : 5));

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
    if (changed) {
      this.invalidateStaticCache();
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
    const nextTransform: LayerTransform = {
      ...currentTransform,
      ...(partialTransform || {}),
    };
    const nextFitMode: FitMode = fitMode || clip.fitMode || this.mediaLayer?.fitMode || 'cover';

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
    const maxMediaDur = clip.isMotionPhoto
      ? 60
      : Math.max(0.5, this.mediaLayer?.media.duration || 60);
    const s = Math.max(0, Math.min(newSourceStart, maxMediaDur - 0.3));
    const e = Math.max(s + 0.3, Math.min(newSourceEnd, maxMediaDur));
    const rate = Math.max(0.25, clip.playbackRate || 1);
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
    const clampedRate = Math.max(0.25, Math.min(3.0, rate));
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
    }
    this.emit('video-time', this.getVideoState());
    this.emit('change');
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

  private activateClipForPlayback(active: {
    clip: VideoTrackClip;
    localSourceTime: number;
  }): void {
    const ml = this.mediaLayer;
    if (!ml) return;

    this.activePlayingClipId = active.clip.id;
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
      video.muted = active.clip.muted;
      if (Math.abs(video.currentTime - active.localSourceTime) > 0.05) {
        video.currentTime = active.localSourceTime;
      }
    } catch {}

    if (video.paused || video.ended) {
      video.play().catch(() => {
        video.muted = true;
        ml.muted = true;
        video.play().catch(() => {});
      });
    }
  }

  public async playVideo(): Promise<void> {
    if (!this.mediaLayer) return;

    // Oynatma başladığında tüm etkileşim bayraklarını sıfırla (Transform sonrası kilitlenmeyi önler)
    this.mediaLayer.isInteracting = false;
    for (let i = 0; i < this.overlayLayers.length; i++) {
      this.overlayLayers[i].isInteracting = false;
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
    this.emit('video-time', this.getVideoState());
  }

  public async toggleVideoPlay(): Promise<boolean> {
    if (this.shareMode === 'reels' && this.videoClips.length > 0) {
      if (this.isNlePlaying) {
        this.pauseVideo();
        return false;
      } else {
        await this.playVideo();
        return true;
      }
    }

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
    this.lastExportSourceTime = -1;
    this.lastExportClipId = '';
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

        this.nleTimelineTime += dt;
        if (this.nleTimelineTime >= totalDur) {
          this.nleTimelineTime = 0;
          this.activePlayingClipId = null;
        }

        const active = this.getActiveClipAtTime(this.nleTimelineTime);
        if (active) {
          if (this.activePlayingClipId !== active.clip.id) {
            // Yeni klibe (Fotoğraf -> Video veya Video -> Fotoğraf veya Video1 -> Video2) kesintisiz geçiş
            this.activateClipForPlayback(active);
          } else {
            this.applyClipTransformToMediaLayer(active.clip);
            if (ml.isMotionPhoto) {
              ml.virtualTime = active.localSourceTime;
            } else {
              const video = ml.getVideoElement();
              if (video) {
                const targetRate = active.clip.playbackRate || 1.0;
                if (Math.abs(video.playbackRate - targetRate) > 0.01) {
                  video.playbackRate = targetRate;
                }
                if (Math.abs(video.volume - active.clip.volume) > 0.01) {
                  video.volume = active.clip.volume;
                }
                if (video.muted !== active.clip.muted) {
                  video.muted = active.clip.muted;
                }
                if (video.paused && !video.seeking) {
                  video.play().catch(() => {
                    video.muted = true;
                    video.play().catch(() => {});
                  });
                }
                if (Math.abs(video.currentTime - active.localSourceTime) > 0.28 && !video.seeking) {
                  try {
                    video.currentTime = active.localSourceTime;
                  } catch {}
                }
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

  public emit<K extends EngineEvent>(event: K, ...args: EngineEventMap[K]) {
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
    this.ambientBgCacheCanvas = null;
    this.ambientBgCacheCtx = null;
    try {
      this.ctx.clearRect(0, 0, this.width, this.height);
    } catch {}
  }
}
