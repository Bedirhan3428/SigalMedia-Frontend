// [START] WP-16 remux kısa yolu
/**
 * RemuxExporter.ts
 * Zaman çizelgesi kaynağın aynısıysa (overlay, metin, sticker, filtre, ayar, müzik, ses/hız değişikliği,
 * dönüşüm ve kırpma yok) H.264 görüntü örneklerini ve AAC ses paketlerini yeniden kodlamadan yeni bir
 * MP4'e kopyalar. Kırpma, keyframe'e hizalanır (en fazla bir kare sapma); daha büyük sapmada veya
 * herhangi bir uyumsuzlukta null döner ve çağıran normal (yeniden kodlayan) yola devam eder.
 *
 * Kaynak B-frame içeriyorsa (ctts) ilk sunum gecikmesi ve ses priming'i, çıktıya eklenen edit list
 * (edts/elst) ile telafi edilir; böylece süre ve A/V hizası kaynakla aynı kalır.
 */
import type { CanvasEngine } from '../Engine';
import type { EditorMedia, LayerTransform, VideoTrackClip } from '../types';
import { DEFAULT_POST_ADJUSTMENTS } from '../types';
import { DEFAULT_FILTERS } from '../layers/MediaLayer';
import { FastDemuxer, DemuxedAudioTrack, DemuxedSample, DemuxedVideoTrack } from './FastDemuxer';
import type { ExportStats, ExportVideoOptions } from './VideoExporter';

const OUTPUT_FPS = 30;
const SIZE_1080P = { width: 1080, height: 1920 };
const SIZE_720P = { width: 720, height: 1280 };
/** WP-37: düzenlemesiz kaynak bu bitrate'e kadar olduğu gibi yayınlanır; üstü normal yolda ~5 Mbps'e kodlanır (yükleme boyutu) */
const MAX_REMUX_BITRATE = 8_000_000;
/** Açık boyut/çözünürlük istenirse (indirme vb.) eski katı kurallar: tam boyut, 30 fps, 20 Mbps */
const MAX_REMUX_BITRATE_STRICT = 20_000_000;
/** WP-37: düzenlemesiz kaynak: kısa kenar en çok 1080, uzun kenar en çok 2400 (örn. 1080x2400); fazlası kodlanır */
const MAX_SHORT_SIDE = 1080;
const MAX_LONG_SIDE = 2400;
const TOL_US = 1000;

interface ClipPlan {
  clip: VideoTrackClip;
  media: EditorMedia;
}

interface SourceData {
  video: DemuxedVideoTrack;
  audio: DemuxedAudioTrack | null;
  /** Kapsayıcıda herhangi bir ses izi var mı (AAC olmasa da) */
  hasAudioTrack: boolean;
}

/** WP-37: kısa yolun kaynak kısıtlarını belirleyen bağlam */
interface RunCtx {
  /** Açık width/height/resolution: eski katı boyut/fps/bitrate kuralları */
  explicit: boolean;
  mode: string;
  logical: { width: number; height: number };
}

interface MuxOp {
  dtsUs: number;
  kind: 'v' | 'a';
  data: Uint8Array;
  key: boolean;
  ptsUs: number;
  durUs: number;
}

const abortError = () => new DOMException('Export iptal edildi', 'AbortError');
const near = (a: number | undefined, b: number, eps = 1e-3) => Math.abs((a ?? b) - b) <= eps;

function isIdentityTransform(t: LayerTransform | null | undefined): boolean {
  if (!t) return true;
  const rot = (((t.rotation || 0) % 360) + 360) % 360;
  return near(t.x, 0.5) && near(t.y, 0.5) && near(t.scale, 1) && (rot < 0.05 || rot > 359.95) && !t.flipH && !t.flipV;
}

function isFullCrop(r: { x: number; y: number; width: number; height: number } | undefined, media?: EditorMedia): boolean {
  if (!r) return true;
  if (near(r.x, 0) && near(r.y, 0) && near(r.width, 1) && near(r.height, 1)) return true;
  return Boolean(media && near(r.x, 0, 0.5) && near(r.y, 0, 0.5) && near(r.width, media.width, 0.5) && near(r.height, media.height, 0.5));
}

function hasAdjustments(adj: object | undefined): boolean {
  if (!adj) return false;
  const def = DEFAULT_POST_ADJUSTMENTS as unknown as Record<string, unknown>;
  return Object.entries(adj).some(([k, v]) => v !== undefined && def[k] !== v);
}

function sameBytes(a?: Uint8Array, b?: Uint8Array): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- Minimal ISO-BMFF yazımı (edit list ekleme) -------------------------------------------

interface Box {
  type: string;
  offset: number;
  size: number;
  content: number;
}

function readBoxes(dv: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p);
    let header = 8;
    if (size === 1) {
      size = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12);
      header = 16;
    } else if (size === 0) size = end - p;
    if (size < header || p + size > end) break;
    const type = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
    out.push({ type, offset: p, size, content: p + header });
    p += size;
  }
  return out;
}

const child = (dv: DataView, b: Box | undefined, type: string) =>
  b ? readBoxes(dv, b.content, b.offset + b.size).find((x) => x.type === type) : undefined;

function trakHandler(dv: DataView, trak: Box): string {
  const hdlr = child(dv, child(dv, trak, 'mdia'), 'hdlr');
  if (!hdlr) return '';
  const p = hdlr.content + 8;
  return String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
}

/**
 * mp4-muxer çıktısına her iz için tek girdili bir elst ekler: sunum, medya zamanı `mediaTimeUs`'den
 * başlar ve `durationUs` sürer. moov, mdat'tan önceyse (fastStart) stco ofsetleri de kaydırılır.
 */
export function addEditLists(
  input: ArrayBuffer,
  edits: Partial<Record<'vide' | 'soun', { mediaTimeUs: number; durationUs: number }>>
): ArrayBuffer {
  const dv = new DataView(input);
  const top = readBoxes(dv, 0, input.byteLength);
  const moov = top.find((b) => b.type === 'moov');
  const mdat = top.find((b) => b.type === 'mdat');
  if (!moov || moov.content - moov.offset !== 8) throw new Error('moov missing');
  const traks = readBoxes(dv, moov.content, moov.offset + moov.size).filter((b) => b.type === 'trak');

  const EDTS = 36;
  const inserts: { at: number; trak: Box; handler: 'vide' | 'soun'; mediaTimeUs: number; durationUs: number }[] = [];
  for (const trak of traks) {
    const h = trakHandler(dv, trak);
    if (h !== 'vide' && h !== 'soun') continue;
    const e = edits[h];
    if (!e) continue;
    if (child(dv, trak, 'edts')) throw new Error('edts exists');
    const tkhd = child(dv, trak, 'tkhd');
    if (!tkhd || trak.content - trak.offset !== 8) throw new Error('tkhd missing');
    inserts.push({ at: tkhd.offset + tkhd.size, trak, handler: h, ...e });
  }
  if (inserts.length === 0) return input;
  inserts.sort((a, b) => a.at - b.at);

  const grow = EDTS * inserts.length;
  const out = new Uint8Array(input.byteLength + grow);
  const odv = new DataView(out.buffer);
  const src = new Uint8Array(input);
  const shiftOf = (pos: number) => EDTS * inserts.filter((i) => i.at <= pos).length;
  let readPos = 0;
  let writePos = 0;
  const elstBodies: { pos: number; ins: (typeof inserts)[number] }[] = [];
  for (const ins of inserts) {
    out.set(src.subarray(readPos, ins.at), writePos);
    writePos += ins.at - readPos;
    readPos = ins.at;
    elstBodies.push({ pos: writePos, ins });
    // edts > elst iskeleti; süre ve media_time aşağıda yazılır
    odv.setUint32(writePos, EDTS);
    out.set([0x65, 0x64, 0x74, 0x73], writePos + 4); // 'edts'
    odv.setUint32(writePos + 8, EDTS - 8);
    out.set([0x65, 0x6c, 0x73, 0x74], writePos + 12); // 'elst'
    odv.setUint32(writePos + 16, 0); // version 0, flags 0
    odv.setUint32(writePos + 20, 1); // entry_count
    odv.setUint32(writePos + 32, 0x00010000); // media_rate 1.0
    writePos += EDTS;
  }
  out.set(src.subarray(readPos), writePos);

  // Boyutlar: moov ve elst eklenen trak'lar
  odv.setUint32(moov.offset, moov.size + grow);
  for (const ins of inserts) {
    const tp = ins.trak.offset + shiftOf(ins.trak.offset);
    odv.setUint32(tp, ins.trak.size + EDTS);
  }

  // Yeni yapıyı oku; tkhd/mvhd süreleri, elst içeriği ve stco kaydırması
  const nMoov = readBoxes(odv, 0, out.byteLength).find((b) => b.type === 'moov');
  if (!nMoov) throw new Error('moov lost');
  const nChildren = readBoxes(odv, nMoov.content, nMoov.offset + nMoov.size);
  const mvhd = nChildren.find((b) => b.type === 'mvhd');
  if (!mvhd) throw new Error('mvhd missing');
  const mvVer = odv.getUint8(mvhd.content);
  const movieTs = odv.getUint32(mvhd.content + (mvVer === 1 ? 20 : 12));
  const moovBeforeMdat = mdat ? moov.offset < mdat.offset : false;
  let maxDur = 0;

  for (const trak of nChildren.filter((b) => b.type === 'trak')) {
    const h = trakHandler(odv, trak);
    const tkhd = child(odv, trak, 'tkhd');
    const mdia = child(odv, trak, 'mdia');
    const mdhd = child(odv, mdia, 'mdhd');
    if (!tkhd || !mdhd) continue;
    const tkVer = odv.getUint8(tkhd.content);
    const tkDurPos = tkhd.content + (tkVer === 1 ? 28 : 20);
    const mdVer = odv.getUint8(mdhd.content);
    const mediaTs = odv.getUint32(mdhd.content + (mdVer === 1 ? 20 : 12));
    const body = elstBodies.find((x) => x.ins.handler === h);
    let dur = tkVer === 1 ? odv.getUint32(tkDurPos + 4) : odv.getUint32(tkDurPos);
    if (body) {
      dur = Math.max(1, Math.round((body.ins.durationUs * movieTs) / 1e6));
      const mediaTime = Math.max(0, Math.round((body.ins.mediaTimeUs * mediaTs) / 1e6));
      odv.setUint32(body.pos + 24, dur); // segment_duration (movie timescale)
      odv.setInt32(body.pos + 28, mediaTime); // media_time (media timescale)
      if (tkVer === 1) {
        odv.setUint32(tkDurPos, 0);
        odv.setUint32(tkDurPos + 4, dur);
      } else odv.setUint32(tkDurPos, dur);
    }
    maxDur = Math.max(maxDur, dur);

    if (moovBeforeMdat) {
      const stbl = child(odv, child(odv, mdia, 'minf'), 'stbl');
      const stco = child(odv, stbl, 'stco');
      const co64 = child(odv, stbl, 'co64');
      if (stco) {
        const n = odv.getUint32(stco.content + 4);
        for (let i = 0; i < n; i++) {
          const q = stco.content + 8 + i * 4;
          odv.setUint32(q, odv.getUint32(q) + grow);
        }
      } else if (co64) {
        const n = odv.getUint32(co64.content + 4);
        for (let i = 0; i < n; i++) {
          const q = co64.content + 8 + i * 8;
          const v = odv.getUint32(q) * 4294967296 + odv.getUint32(q + 4) + grow;
          odv.setUint32(q, Math.floor(v / 4294967296));
          odv.setUint32(q + 4, v >>> 0);
        }
      }
    }
  }
  if (mvVer === 1) {
    odv.setUint32(mvhd.content + 24, 0);
    odv.setUint32(mvhd.content + 28, maxDur);
  } else odv.setUint32(mvhd.content + 16, maxDur);
  return out.buffer;
}

// --- Remux kısa yolu --------------------------------------------------------------------------

export class RemuxExporter {
  /** QA/teşhis: son denemede kısa yolun neden kullanılmadığı ('' = kullanıldı) */
  public static lastSkipReason = '';

  private static skip(reason: string): null {
    RemuxExporter.lastSkipReason = reason;
    (globalThis as { __lastRemuxSkip?: string }).__lastRemuxSkip = reason;
    return null;
  }

  private static isExplicit(options?: ExportVideoOptions): boolean {
    return Boolean((options?.width && options?.height) || options?.resolution === '720p');
  }

  private static targetSize(options?: ExportVideoOptions): { width: number; height: number } {
    if (options?.width && options?.height) return { width: options.width & ~1, height: options.height & ~1 };
    return options?.resolution === '720p' ? SIZE_720P : SIZE_1080P;
  }

  /** Kısa yol için zaman çizelgesi koşulları (senkron, ucuz kontroller) */
  private static planClips(engine: CanvasEngine, options?: ExportVideoOptions): ClipPlan[] | string {
    const state = engine.getVideoState();
    if (!state.isVideo || state.isMotionPhoto) return 'not-video';
    if (options?.bitrate) return 'explicit-bitrate';
    if (options?.fps && options.fps !== OUTPUT_FPS) return 'fps-option';
    if (options?.music && options.music.streamUrl && (options.musicVolume ?? 0.85) > 0) return 'music';
    if (engine.getMusic()) return 'music';
    if (engine.getOverlayLayers().some((l) => l.visible)) return 'overlays';
    if (engine.getFilterIndex() !== 0) return 'filter';
    if (engine.getReelsEffect() !== 'none') return 'effect';
    if (engine.getEffectClips().some((c) => c.effect !== 'none')) return 'effect';
    if (hasAdjustments(engine.getPostAdjustments())) return 'adjustments';
    if (!isIdentityTransform(engine.getMediaTransform())) return 'transform';

    const ml = engine.getMediaLayer();
    if (!ml) return 'no-media-layer';
    const f = ml.filters as unknown as Record<string, number | undefined>;
    const df = DEFAULT_FILTERS as unknown as Record<string, number | undefined>;
    if (Object.keys(f).some((k) => (f[k] ?? 0) !== (df[k] ?? 0))) return 'filters';
    if (!isFullCrop(ml.cropRect, ml.media)) return 'crop';
    if (ml.opacity < 0.999) return 'opacity';
    if (ml.clipAnimation && ((ml.clipAnimation.in ?? 'none') !== 'none' || (ml.clipAnimation.out ?? 'none') !== 'none')) return 'animation';
    if (hasAdjustments(ml.clipAdjustments)) return 'adjustments';

    let clips: VideoTrackClip[];
    if (engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0) {
      clips = engine.getVideoClips().filter((c) => c.duration > 0.01);
    } else {
      const media = engine.getMedia() || undefined;
      const trimEnd = state.trimEnd > state.trimStart ? state.trimEnd : state.duration;
      clips = [
        {
          id: 'single_export_clip',
          sourceMediaId: media?.objectUrl || 'main_media',
          sourceStart: state.trimStart,
          sourceEnd: trimEnd,
          duration: trimEnd - state.trimStart,
          playbackRate: state.playbackRate || 1,
          volume: state.volume,
          muted: state.muted,
          isMotionPhoto: Boolean(state.isMotionPhoto),
          media,
        },
      ];
    }
    if (clips.length === 0) return 'no-clips';

    const plans: ClipPlan[] = [];
    let total = 0;
    for (const c of clips) {
      const media = c.media;
      if (!media || media.type !== 'video' || c.isMotionPhoto) return 'clip-media';
      if (!near(c.playbackRate || 1, 1)) return 'speed';
      if (!isIdentityTransform(c.transform)) return 'transform';
      if (!isFullCrop(c.cropRect, media)) return 'crop';
      if (c.opacity !== undefined && c.opacity < 0.999) return 'opacity';
      if (c.animation && ((c.animation.in ?? 'none') !== 'none' || (c.animation.out ?? 'none') !== 'none')) return 'animation';
      if (hasAdjustments(c.adjustments)) return 'adjustments';
      if (c.filterIndex !== undefined && c.filterIndex !== 0) return 'filter';
      if (c.retouch && c.retouch > 0.005) return 'retouch';
      const silent = c.muted || c.volume <= 0;
      if (!silent && !near(c.volume, 1, 0.01)) return 'volume';
      if (c.sourceEnd - c.sourceStart <= 0.05) return 'clip-range';
      total += c.sourceEnd - c.sourceStart;
      plans.push({ clip: c, media });
    }
    const silent0 = plans[0].clip.muted || plans[0].clip.volume <= 0;
    if (plans.some((p) => (p.clip.muted || p.clip.volume <= 0) !== silent0)) return 'mixed-mute';
    if (total > 60.05) return 'too-long';

    // WP-37: boyut/en-boy denetimi kaynak çözüldükten sonra run() içinde yapılır (açık boyut yoksa kaynak boyutu korunur)
    if (this.isExplicit(options)) {
      const target = this.targetSize(options);
      const logical = engine.getLogicalSize();
      if (Math.abs(logical.width / logical.height - target.width / target.height) > 0.005) return 'canvas-aspect';
    }
    return plans;
  }

  /**
   * WP-37: zaman çizelgesi 'düz' (overlay/filtre/ayar/müzik/dönüşüm/kırpma/hız yok) ve tüm klipler aynı en-boy
   * oranındaysa kaynağın görüntü oranını (w/h) döndürür; değilse null. Normal yol bunu, 9:16 olmayan düzenlemesiz
   * kaynağı 1080x1920'ye dolgulayıp büyütmeden kendi oranında kodlamak için kullanır.
   */
  public static plainSourceAspect(engine: CanvasEngine, options?: ExportVideoOptions): number | null {
    if (this.isExplicit(options)) return null;
    let plans: ClipPlan[] | string;
    try {
      plans = this.planClips(engine, options);
    } catch {
      return null;
    }
    if (typeof plans === 'string') return null;
    const aspect = (m: EditorMedia) => (m.width || 0) / (m.height || 1);
    const a0 = aspect(plans[0].media);
    if (!(a0 > 0) || plans.some((p) => Math.abs(aspect(p.media) - a0) > 0.005)) return null;
    return a0;
  }

  private static async readBuffer(media: EditorMedia, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    try {
      if (media.source instanceof Blob) return await media.source.arrayBuffer();
      const url =
        typeof media.source === 'string' && media.source.length > 0
          ? media.source
          : media.element instanceof HTMLVideoElement
            ? media.element.src
            : '';
      if (!url) return null;
      const resp = await fetch(url, { signal });
      return resp.ok ? await resp.arrayBuffer() : null;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      return null;
    }
  }

  /**
   * Kaynağın renk etiketini bir keyframe çözerek okur (SPS VUI). Belirtilmemiş alanlar bt709 kabul
   * edilir (tarayıcı da öyle gösterir). Çözülemezse kapsayıcıdaki colr ya da bt709 limited.
   */
  private static async probeColorSpace(track: DemuxedVideoTrack, key: DemuxedSample): Promise<VideoColorSpaceInit> {
    const base: VideoColorSpaceInit = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false };
    const merge = (cs?: VideoColorSpaceInit | null): VideoColorSpaceInit => ({
      primaries: cs?.primaries ?? base.primaries,
      transfer: cs?.transfer ?? base.transfer,
      matrix: cs?.matrix ?? base.matrix,
      fullRange: cs?.fullRange ?? base.fullRange,
    });
    if (track.colorSpace) return merge(track.colorSpace);
    if (typeof VideoDecoder === 'undefined') return base;
    let got: VideoColorSpaceInit | null = null;
    let decoder: VideoDecoder | null = null;
    try {
      decoder = new VideoDecoder({
        output: (frame) => {
          if (!got) got = frame.colorSpace.toJSON();
          frame.close();
        },
        error: () => {},
      });
      decoder.configure({ codec: track.codec, codedWidth: track.codedWidth, codedHeight: track.codedHeight, description: track.description });
      decoder.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data: key.data }));
      await Promise.race([decoder.flush(), new Promise((r) => setTimeout(r, 800))]);
    } catch {
      // etiket okunamadı: varsayılan
    } finally {
      try {
        if (decoder && decoder.state !== 'closed') decoder.close();
      } catch {}
    }
    return merge(got);
  }

  /**
   * Uygunsa kaynağı yeniden kodlamadan kopyalayıp MP4 döndürür; değilse null (normal yol).
   * İptal (AbortError) dışarı fırlatılır.
   */
  public static async tryExport(engine: CanvasEngine, options?: ExportVideoOptions): Promise<Blob | null> {
    const t0 = performance.now();
    let plans: ClipPlan[] | string;
    try {
      plans = this.planClips(engine, options);
    } catch {
      return this.skip('plan-error');
    }
    if (typeof plans === 'string') return this.skip(plans);
    try {
      const ctx: RunCtx = { explicit: this.isExplicit(options), mode: engine.getShareMode(), logical: engine.getLogicalSize() };
      return await this.run(plans, options, t0, ctx);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      return this.skip('error: ' + (err instanceof Error ? err.message : String(err)).slice(0, 120));
    }
  }

  private static async run(plans: ClipPlan[], options: ExportVideoOptions | undefined, t0: number, ctx: RunCtx): Promise<Blob | null> {
    const signal = options?.signal;
    let audible = !(plans[0].clip.muted || plans[0].clip.volume <= 0);

    // 1. Kaynakları oku ve sök (medya başına bir kez)
    const cache = new Map<EditorMedia, SourceData | null>();
    for (const p of plans) {
      if (cache.has(p.media)) continue;
      const buf = await this.readBuffer(p.media, signal);
      if (signal?.aborted) throw abortError();
      const video = buf ? FastDemuxer.demux(buf) : null;
      const audio = buf && audible ? FastDemuxer.demuxAudio(buf) : null;
      const hasAudioTrack = buf && audible ? FastDemuxer.hasAudioTrack(buf) : false;
      cache.set(p.media, video ? { video, audio, hasAudioTrack } : null);
    }
    const sources = plans.map((p) => cache.get(p.media) ?? null);
    if (sources.some((s) => !s)) return this.skip('demux');
    const src0 = sources[0] as SourceData;
    const v0 = src0.video;
    if (v0.codecFamily !== 'avc') return this.skip('codec ' + v0.codec);
    const rot = ((v0.rotation % 360) + 360) % 360;
    const swapped = rot === 90 || rot === 270;
    const dispW = swapped ? v0.codedHeight : v0.codedWidth;
    const dispH = swapped ? v0.codedWidth : v0.codedHeight;
    if (ctx.explicit) {
      const target = this.targetSize(options);
      if (dispW !== target.width || dispH !== target.height) return this.skip(`size ${dispW}x${dispH}`);
    } else {
      // WP-37: düzenlemesiz kaynak: oynatıcılar 9:16 olmayanı object-cover / bulanık zeminle gösterir; yalnızca çok büyükler kodlanır
      if (Math.min(dispW, dispH) > MAX_SHORT_SIDE || Math.max(dispW, dispH) > MAX_LONG_SIDE) return this.skip(`size ${dispW}x${dispH}`);
      // Gönderi: tuval oranı (1:1, 4:5...) bir düzenlemedir; kaynak oranı tuvalle aynı değilse kadraj gerekir
      if (ctx.mode === 'post' && Math.abs(ctx.logical.width / ctx.logical.height - dispW / dispH) > 0.005) return this.skip('canvas-aspect');
    }
    // Ses: kaynakta hiç ses izi yoksa çıktı da sessiz olur; AAC dışı ses izi varsa normal yol (yeniden kodlar)
    if (audible) {
      const all = sources as SourceData[];
      const withAudio = all.filter((s) => s.audio).length;
      if (withAudio === 0) {
        if (all.some((s) => s.hasAudioTrack)) return this.skip('audio-not-aac');
        audible = false;
      } else if (withAudio !== all.length) {
        return this.skip(all.some((s) => !s.audio && s.hasAudioTrack) ? 'audio-not-aac' : 'mixed-audio');
      }
    }
    const a0 = src0.audio;

    let srcFrameUs = 1e6 / OUTPUT_FPS;
    for (const s of sources as SourceData[]) {
      const v = s.video;
      if (v.codec !== v0.codec || !sameBytes(v.description, v0.description) || v.codedWidth !== v0.codedWidth || v.codedHeight !== v0.codedHeight || v.rotation !== v0.rotation) {
        return this.skip('codec-config-mismatch');
      }
      const n = v.samples.length;
      if (n < 2) return this.skip('few-samples');
      const avg = (v.samples[n - 1].dtsUs - v.samples[0].dtsUs) / (n - 1);
      if (avg <= 0) return this.skip('timestamps');
      const fps = 1e6 / avg;
      // WP-37: sabit ya da değişken kare hızı (kaynak zaman damgaları korunur); katı modda eski 30 fps kuralı
      if (ctx.explicit ? Math.abs(fps - OUTPUT_FPS) > 0.1 : fps < 5 || fps > 61) return this.skip(`fps ${fps.toFixed(2)}`);
      if (s === sources[0]) srcFrameUs = avg;
      const bytes = v.samples.reduce((acc, x) => acc + x.size, 0);
      if ((bytes * 8) / Math.max(0.1, v.durationSec) > (ctx.explicit ? MAX_REMUX_BITRATE_STRICT : MAX_REMUX_BITRATE)) return this.skip('bitrate');
      if (audible) {
        const a = s.audio;
        if (!a || a.codec !== a0!.codec || a.sampleRate !== a0!.sampleRate || a.numberOfChannels !== a0!.numberOfChannels || !sameBytes(a.description, a0!.description)) {
          return this.skip('audio-config-mismatch');
        }
      }
    }

    // 2. Kliplerin örneklerini seç ve çıkış zamanlarını hesapla
    const ts = v0.timescale || 90000;
    const ex = (us: number) => (Math.round((us * ts) / 1e6) * 1e6) / ts;
    const ops: MuxOp[] = [];
    let acc = 0;
    let videoDelayUs = 0;
    let lastVideoDts = -Infinity;
    let audioSkipUs = 0;
    let audioEnd = 0;
    let firstKey: DemuxedSample | null = null;
    const frameDur = srcFrameUs;

    for (let ci = 0; ci < plans.length; ci++) {
      const { clip } = plans[ci];
      const { video: v, audio: a } = sources[ci] as SourceData;
      const isFirst = ci === 0;
      const isLast = ci === plans.length - 1;
      const smp = v.samples;
      const off = v.ptsOffsetUs;
      const startRaw = clip.sourceStart * 1e6 + off;
      // Kaynağın sunum sonu: en geç biten karenin pts + süresi (mdhd süresi DTS tabanlıdır, B-frame gecikmesini içermez)
      let presEndRaw = 0;
      for (const s of smp) presEndRaw = Math.max(presEndRaw, s.ptsUs + s.durationUs);
      const endRaw = Math.min(clip.sourceEnd * 1e6 + off, presEndRaw);

      let k = -1;
      for (let i = 0; i < smp.length; i++) {
        if (smp[i].isKeyframe && smp[i].ptsUs <= startRaw + TOL_US) k = i;
        if (smp[i].dtsUs > startRaw + 2e6) break;
      }
      if (k < 0) return this.skip('no-keyframe');
      if (startRaw - smp[k].ptsUs > frameDur + TOL_US) return this.skip('keyframe-gap');
      const presStart = smp[k].ptsUs;
      let last = -1;
      for (let i = k; i < smp.length; i++) if (smp[i].ptsUs < endRaw - TOL_US) last = i;
      if (last < k) return this.skip('empty-clip');
      const lenUs = endRaw - presStart;
      if (lenUs <= frameDur) return this.skip('clip-too-short');

      if (isFirst) {
        videoDelayUs = ex(smp[k].ptsUs) - ex(smp[k].dtsUs);
        firstKey = smp[k];
      }
      const shift = acc + videoDelayUs - ex(presStart);
      for (let i = k; i <= last; i++) {
        const s = smp[i];
        if (!isFirst && s.ptsUs < presStart) return this.skip('leading-frames');
        if (!isLast && s.ptsUs >= endRaw - TOL_US) return this.skip('tail-frames');
        const dts = ex(s.dtsUs) + shift;
        const pts = ex(s.ptsUs) + shift;
        if (pts < dts - 1 || dts <= lastVideoDts || dts < -1) return this.skip('timestamps');
        lastVideoDts = dts;
        ops.push({ kind: 'v', dtsUs: Math.max(0, dts), ptsUs: Math.max(0, pts), durUs: ex(s.durationUs), data: s.data, key: i === k || s.isKeyframe, });
      }

      if (audible && a) {
        const aSmp = a.samples;
        const aTs = a.timescale || a.sampleRate;
        const exa = (us: number) => (Math.round((us * aTs) / 1e6) * 1e6) / aTs;
        const aStart = presStart - off + a.ptsOffsetUs;
        const aEnd = endRaw - off + a.ptsOffsetUs;
        let j = -1;
        for (let i = 0; i < aSmp.length; i++) {
          if (aSmp[i].ptsUs <= aStart + 1) j = i;
          else break;
        }
        if (j < 0) j = 0;
        if (isFirst) {
          j = Math.max(0, j - 1); // AAC decoder ön yüklemesi: bir paket önceden başla, elst ile atla
          audioSkipUs = exa(aStart) - exa(aSmp[j].ptsUs);
          if (audioSkipUs < 0) audioSkipUs = 0;
        }
        const half = exa(aSmp[0].durationUs) / 2;
        for (let i = j; i < aSmp.length && aSmp[i].ptsUs < aEnd; i++) {
          const s = aSmp[i];
          const ideal = isFirst ? exa(s.ptsUs) - exa(aSmp[j].ptsUs) : exa(s.ptsUs) - exa(aStart) + acc + audioSkipUs;
          if (ideal < audioEnd - half) continue;
          const t = Math.max(ideal, audioEnd);
          const d = exa(s.durationUs);
          ops.push({ kind: 'a', dtsUs: t, ptsUs: t, durUs: d, data: s.data, key: true });
          audioEnd = t + d;
        }
      }
      acc += lenUs;
    }
    if (signal?.aborted) throw abortError();
    if (!firstKey) return this.skip('no-keyframe');
    options?.onProgress?.(0.3);

    // 3. Renk etiketi ve mux
    const colorSpace = await this.probeColorSpace(v0, firstKey);
    if (/^(pq|hlg)$/.test(String(colorSpace.transfer)) || String(colorSpace.primaries) === 'bt2020') return this.skip('hdr');
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    if (signal?.aborted) throw abortError();
    const target2 = new ArrayBufferTarget();
    const muxer = new Muxer({
      target: target2,
      video: {
        codec: 'avc',
        width: v0.codedWidth,
        height: v0.codedHeight,
        rotation: rot as 0 | 90 | 180 | 270,
      },
      audio: audible && a0 ? { codec: 'aac', numberOfChannels: a0.numberOfChannels, sampleRate: a0.sampleRate } : undefined,
      fastStart: 'in-memory',
    });
    const videoMeta: EncodedVideoChunkMetadata = {
      decoderConfig: {
        codec: v0.codec,
        codedWidth: v0.codedWidth,
        codedHeight: v0.codedHeight,
        description: v0.description ? v0.description.slice() : undefined,
        colorSpace,
      },
    };
    const audioMeta: EncodedAudioChunkMetadata | undefined =
      audible && a0
        ? { decoderConfig: { codec: a0.codec, sampleRate: a0.sampleRate, numberOfChannels: a0.numberOfChannels, description: a0.description.slice() } }
        : undefined;

    // DTS sırasıyla iç içe (interleaved) yaz
    const vOps = ops.filter((o) => o.kind === 'v');
    const aOps = ops.filter((o) => o.kind === 'a');
    let vi = 0;
    let ai = 0;
    let videoBytes = 0;
    while (vi < vOps.length || ai < aOps.length) {
      const takeVideo = ai >= aOps.length || (vi < vOps.length && vOps[vi].dtsUs <= aOps[ai].dtsUs);
      if (takeVideo) {
        const o = vOps[vi];
        muxer.addVideoChunkRaw(o.data, o.key ? 'key' : 'delta', o.ptsUs, o.durUs, vi === 0 ? videoMeta : undefined, o.ptsUs - o.dtsUs);
        videoBytes += o.data.byteLength;
        vi++;
      } else {
        const o = aOps[ai];
        muxer.addAudioChunkRaw(o.data, 'key', o.ptsUs, o.durUs, ai === 0 ? audioMeta : undefined);
        ai++;
      }
    }
    muxer.finalize();

    const totalUs = acc;
    const out = addEditLists(target2.buffer, {
      vide: { mediaTimeUs: videoDelayUs, durationUs: totalUs },
      ...(aOps.length > 0 ? { soun: { mediaTimeUs: audioSkipUs, durationUs: Math.min(totalUs, audioEnd - audioSkipUs) } } : {}),
    });

    options?.onProgress?.(1);
    const stats = {
      width: dispW,
      height: dispH,
      bitrate: Math.round((videoBytes * 8) / Math.max(0.1, totalUs / 1e6)),
      frames: vOps.length,
      totalMs: performance.now() - t0,
      decodeMs: 0,
      drawMs: 0,
      convertMs: 0,
      readbackMs: 0,
      encodeMs: 0,
      usedFrameCursor: false,
      taggedBt709Limited: colorSpace.matrix === 'bt709' && !colorSpace.fullRange,
      sourceCodec: v0.codec,
      path: 'remux',
    } as ExportStats;
    RemuxExporter.lastSkipReason = '';
    (globalThis as { __lastRemuxSkip?: string }).__lastRemuxSkip = '';
    options?.onStats?.(stats);
    (globalThis as { __lastExportStats?: ExportStats }).__lastExportStats = stats;
    return new Blob([out], { type: 'video/mp4' });
  }
}
// [END] WP-16 remux kısa yolu
