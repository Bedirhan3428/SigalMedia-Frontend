import { BaseLayer } from './layers/BaseLayer';
import { MediaLayer, DEFAULT_FILTERS } from './layers/MediaLayer';
import { TextLayer } from './layers/TextLayer';
import { MediaSourceManager } from './MediaSource';
import { InteractionManager } from './interaction/InteractionManager';
import { ImageExporter, ExportImageOptions } from './exporter/ImageExporter';
import {
  EngineOptions,
  EditorMedia,
  MediaFilters,
  MediaType,
  TextStyle,
  FitMode
} from './types';

export type EngineEvent = 'render' | 'select' | 'change' | 'double-tap' | 'single-tap';
export type EventListener = (...args: any[]) => void;

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private fitMode: FitMode;

  private mediaLayer: MediaLayer | null = null;
  private overlayLayers: BaseLayer[] = [];
  private interactionManager: InteractionManager;

  private isDirty = false;
  private listeners: Map<EngineEvent, Set<EventListener>> = new Map();

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
        this.emit('single-tap', layer);
      }
    });

    this.requestRender();
  }

  public updateCanvasResolution(width?: number, height?: number) {
    if (width) this.width = width;
    if (height) this.height = height;

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.requestRender();
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }

  public getAllLayers(): BaseLayer[] {
    const list: BaseLayer[] = [];
    if (this.mediaLayer) list.push(this.mediaLayer);
    list.push(...this.overlayLayers);
    return list;
  }

  public async loadMedia(source: string | Blob | File, forcedType?: MediaType, autoResizeCanvas = false): Promise<EditorMedia> {
    const media = await MediaSourceManager.load(source, forcedType);

    if (autoResizeCanvas && media.width && media.height) {
      this.updateCanvasResolution(media.width, media.height);
    }

    this.mediaLayer = new MediaLayer(media, { fitMode: this.fitMode });
    this.render();
    this.requestRender();
    this.emit('change');
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
      let norm = (degrees % 360 + 360) % 360;
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

  public getFilters(): MediaFilters {
    return this.mediaLayer ? { ...this.mediaLayer.filters } : { ...DEFAULT_FILTERS };
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

  public render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const layers = this.getAllLayers();
    for (const layer of layers) {
      if (layer.visible) {
        layer.render(this.ctx, this.width, this.height);
      }
    }

    const sel = this.interactionManager.getSelectedLayer();
    if (sel && sel.visible && !sel.locked) {
      sel.renderSelectionHighlight(this.ctx, this.width, this.height);
    }
  }

  public renderClean(targetCtx: CanvasRenderingContext2D, width: number, height: number) {
    targetCtx.clearRect(0, 0, width, height);
    const layers = this.getAllLayers();
    for (const layer of layers) {
      if (layer.visible) {
        layer.render(targetCtx, width, height);
      }
    }
  }

  public async exportImage(options?: ExportImageOptions): Promise<Blob> {
    return ImageExporter.exportToBlob(
      this.canvas,
      (targetCtx, w, h) => this.renderClean(targetCtx, w, h),
      options
    );
  }

  public async downloadImage(filename = 'sigalmedia_tasarim.jpg', options?: ExportImageOptions) {
    const blob = await this.exportImage(options);
    ImageExporter.downloadBlob(blob, filename);
  }

  public on(event: EngineEvent, fn: EventListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
  }

  public off(event: EngineEvent, fn: EventListener) {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: EngineEvent, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  public destroy() {
    this.interactionManager.destroy();
    this.listeners.clear();
  }
}
