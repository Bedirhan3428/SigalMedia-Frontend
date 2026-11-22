// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
import { CanvasEngine } from '../Engine';
import { EditorMedia, StoryAudioMeta, VideoTrackClip } from '../types';
import { FastDemuxer, DemuxedSample, DemuxedVideoTrack } from './FastDemuxer';
import { applyMusicFadeToGain } from '../utils/musicFade';
import { MediaRecorderFallback } from './MediaRecorderFallback';
import { RemuxExporter } from './RemuxExporter';

export type ExportResolution = '1080p' | '720p' | 'auto';
export type ExportWarning = 'downscaled-720p';

export interface ExportStats {
  width: number;
  height: number;
  bitrate: number;
  frames: number;
  totalMs: number;
  decodeMs: number;
  drawMs: number;
  /** drawMs içinde: canvas -> I420 dönüşümü (readback + renk uzayı) */
  convertMs: number;
  /** drawMs içinde: getImageData readback */
  readbackMs: number;
  encodeMs: number;
  /** Kaynak kareleri WebCodecs imleciyle mi (hızlı) yoksa seek yedek yoluyla mı alındı */
  usedFrameCursor: boolean;
  /** Çıktı I420 bt709 limited-range olarak etiketlendi mi (E-06) */
  taggedBt709Limited: boolean;
  /** [WP-16] Kaynak görüntü kodeği (ör. avc1.640028, hvc1.1.6.L120.90) */
  sourceCodec?: string;
  /** [WP-16] Kullanılan yol */
  path?: 'remux' | 'fast-cursor' | 'seek' | 'gpu';
}

export interface ExportVideoOptions {
  /** Açık boyut verilirse resolution'ı geçersiz kılar (çift sayıya yuvarlanır). Normalde verilmez. */
  width?: number;
  height?: number;
  fps?: number;
  /** bit/sn. Verilmezse çözünürlüğe göre: 1080p 7 Mbps, 720p 4 Mbps */
  bitrate?: number;
  /**
   * 'auto' (varsayılan) ve '1080p': 1080x1920; '720p': 720x1280. Encoder 1080p desteklemezse
   * 720p'ye düşülür ve onWarning('downscaled-720p') çağrılır.
   */
  resolution?: ExportResolution;
  music?: StoryAudioMeta | null;
  musicVolume?: number;
  onProgress?: (progress: number) => void;
  onWarning?: (code: ExportWarning) => void;
  onStats?: (stats: ExportStats) => void;
  signal?: AbortSignal;
}

// High → Main → Baseline: aynı bitrate'te High profil belirgin şekilde daha net görüntü verir.
const H264_CODEC_CANDIDATES = [
  'avc1.640028', // High Profile Level 4.0
  'avc1.4d0028', // Main Profile Level 4.0
  'avc1.42E028', // Constrained Baseline Level 4.0
  'avc1.420028', // Baseline Profile Level 4.0
  'avc1.64002a', // High Profile Level 4.2
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.42E01F', // Constrained Baseline Level 3.1
  'avc1.42001f', // Baseline Profile Level 3.1
  'avc1.640032', // High Profile Level 5.0
];

const OUTPUT_FPS = 30;
const PREFETCH_FRAMES = 12;
// Çözünürlük başına varsayılan bitrate (H.264 High, 30 fps dikey): 1080p ~7 Mbps, 720p ~4 Mbps
const BITRATE_1080P = 7_000_000;
const BITRATE_720P = 4_000_000;
const SIZE_1080P = { width: 1080, height: 1920 };
const SIZE_720P = { width: 720, height: 1280 };

function defaultBitrateFor(height: number): number {
  return height >= 1500 ? BITRATE_1080P : BITRATE_720P;
}

/**
 * Tuval (sRGB tam aralık RGBA) -> I420, BT.709 limited range (Y 16-235, UV 16-240). Chroma 2x2 ortalama.
 * Pikseller tek seferde Uint32 olarak okunur (little-endian: R | G<<8 | B<<16 | A<<24).
 */
function rgbaToI420Bt709Limited(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  out: Uint8Array,
  yStart = 0,
  yEnd = height
): void {
  const px = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height);
  const ySize = width * height;
  const cw = width >> 1;
  const uOff = ySize;
  const vOff = ySize + cw * (height >> 1);
  for (let y = yStart; y < yEnd; y += 2) {
    const row0 = y * width;
    const row1 = row0 + width;
    const cRow = (y >> 1) * cw;
    for (let x = 0; x < width; x += 2) {
      const i0 = row0 + x;
      const i1 = row1 + x;
      const p00 = px[i0], p01 = px[i0 + 1], p10 = px[i1], p11 = px[i1 + 1];
      const r00 = p00 & 255, g00 = (p00 >> 8) & 255, b00 = (p00 >> 16) & 255;
      const r01 = p01 & 255, g01 = (p01 >> 8) & 255, b01 = (p01 >> 16) & 255;
      const r10 = p10 & 255, g10 = (p10 >> 8) & 255, b10 = (p10 >> 16) & 255;
      const r11 = p11 & 255, g11 = (p11 >> 8) & 255, b11 = (p11 >> 16) & 255;
      out[i0] = ((47 * r00 + 157 * g00 + 16 * b00 + 128) >> 8) + 16;
      out[i0 + 1] = ((47 * r01 + 157 * g01 + 16 * b01 + 128) >> 8) + 16;
      out[i1] = ((47 * r10 + 157 * g10 + 16 * b10 + 128) >> 8) + 16;
      out[i1 + 1] = ((47 * r11 + 157 * g11 + 16 * b11 + 128) >> 8) + 16;
      const r = r00 + r01 + r10 + r11;
      const g = g00 + g01 + g10 + g11;
      const b = b00 + b01 + b10 + b11;
      const ci = cRow + (x >> 1);
      out[uOff + ci] = ((-26 * r - 86 * g + 112 * b + 512) >> 10) + 128;
      out[vOff + ci] = ((112 * r - 102 * g - 10 * b + 512) >> 10) + 128;
    }
  }
}

const AUDIO_SAMPLE_RATE = 44100;

function abortError(): DOMException {
  return new DOMException('Export cancelled', 'AbortError');
}

/**
 * Tek bir klip aralığı için WebCodecs donanım çözücüsünden kareleri sırayla "çeken" imleç.
 * Kareler sunum (PTS) sırasıyla gelir; frameAt(t) her zaman t anını kapsayan gerçek kareyi döndürür.
 * Böylece kör döngü / kopya kare / seek iptali olmadan 1:1 kare eşleşmesi sağlanır.
 */
class DecodedFrameCursor {
  private decoder: VideoDecoder | null = null;
  private queue: VideoFrame[] = [];
  private current: VideoFrame | null = null;
  private nextSampleIdx = 0;
  private fedCount = 0;
  private outCount = 0;
  private flushed = false;
  private error: Error | null = null;
  private waiter: (() => void) | null = null;

  constructor(
    private readonly track: DemuxedVideoTrack,
    private readonly samples: DemuxedSample[]
  ) {}

  public async open(): Promise<boolean> {
    if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
      return false;
    }
    if (this.samples.length === 0) return false;

    // 'prefer-hardware' donanım dekoderi olmayan cihazda (ve headless Chromium'da) "unsupported" döner;
    // eskiden bu durumda ~0.3 s/kare süren seek yoluna düşülüyordu (E-02 kök nedeni).
    // Önce donanım, sonra tercihsiz (yazılım) dekoder denenir.
    let config: VideoDecoderConfig | null = null;
    for (const hw of ['prefer-hardware', 'no-preference'] as HardwareAcceleration[]) {
      const candidate: VideoDecoderConfig = {
        codec: this.track.codec,
        codedWidth: this.track.codedWidth,
        codedHeight: this.track.codedHeight,
        description: this.track.description,
        hardwareAcceleration: hw,
      };
      try {
        const support = await VideoDecoder.isConfigSupported(candidate);
        if (support.supported) {
          config = candidate;
          break;
        }
      } catch {
        // sonraki tercih
      }
    }
    if (!config) return false;

    try {
      this.decoder = new VideoDecoder({
        output: (frame) => {
          this.queue.push(frame);
          this.outCount++;
          this.feed();
          this.wake();
        },
        error: (err) => {
          this.error = err instanceof Error ? err : new Error(String(err));
          this.wake();
        },
      });
      this.decoder.configure(config);
      return true;
    } catch {
      this.close();
      return false;
    }
  }

  private wake(): void {
    const w = this.waiter;
    this.waiter = null;
    if (w) w();
  }

  private waitForOutput(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (this.waiter === done) this.waiter = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.waiter = done;
    });
  }

  private feed(): void {
    const dec = this.decoder;
    if (!dec) return;
    // Önden okuma: çözülmüş kare kuyruğu en fazla ~PREFETCH_FRAMES kare (1080p'de ~25 MB) ile sınırlı
    while (
      this.nextSampleIdx < this.samples.length &&
      dec.decodeQueueSize < 8 &&
      this.fedCount - this.outCount + this.queue.length < PREFETCH_FRAMES
    ) {
      const s = this.samples[this.nextSampleIdx++];
      if (s.data.byteLength === 0) continue;
      dec.decode(
        new EncodedVideoChunk({
          type: s.isKeyframe ? 'key' : 'delta',
          timestamp: s.timestampUs,
          duration: s.durationUs,
          data: s.data,
        })
      );
      this.fedCount++;
    }
  }

  /** sourceSec: <video>.currentTime ile aynı zaman ekseni */
  public async frameAt(sourceSec: number, signal?: AbortSignal): Promise<VideoFrame | null> {
    const dec = this.decoder;
    if (!dec) return null;
    const targetUs = Math.round(sourceSec * 1_000_000) + this.track.ptsOffsetUs + 1500;
    let idleMs = 0;
    this.feed();

    for (;;) {
      if (signal?.aborted) throw abortError();
      if (this.error) throw this.error;

      while (this.queue.length > 0 && this.queue[0].timestamp <= targetUs) {
        if (this.current) this.current.close();
        this.current = this.queue.shift() as VideoFrame;
        idleMs = 0;
      }

      // Kuyrukta t'den sonraki bir kare varsa 'current' t anını kesin olarak kapsar
      if (this.queue.length > 0) return this.current ?? this.queue[0];
      if (this.flushed) return this.current;

      if (this.nextSampleIdx < this.samples.length) {
        const before = this.outCount;
        this.feed();
        if (this.outCount === before) {
          await this.waitForOutput(40);
          if (this.outCount === before) {
            idleMs += 40;
            if (idleMs > 4000) throw new Error('Decoder stalled');
          }
        }
      } else {
        await dec.flush();
        this.flushed = true;
      }
    }
  }

  public close(): void {
    this.wake();
    if (this.current) {
      try {
        this.current.close();
      } catch {}
      this.current = null;
    }
    for (const f of this.queue) {
      try {
        f.close();
      } catch {}
    }
    this.queue = [];
    if (this.decoder) {
      try {
        if (this.decoder.state !== 'closed') this.decoder.close();
      } catch {}
      this.decoder = null;
    }
  }
}

export class VideoExporter {
  // [START] CREATED BY Bedirhan
  private static sharedExportCanvas: HTMLCanvasElement | null = null;
  private static sharedExportCtx: CanvasRenderingContext2D | null = null;
  private static rotateCanvas: HTMLCanvasElement | null = null;
  private static rotateCtx: CanvasRenderingContext2D | null = null;

  private static getExportSurface(width: number, height: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } {
    if (!this.sharedExportCanvas) {
      this.sharedExportCanvas = document.createElement('canvas');
      // desynchronized kullanılmaz: VideoFrame(canvas) yakalaması bayat tampon döndürebiliyor
      this.sharedExportCtx = this.sharedExportCanvas.getContext('2d', { alpha: false });
    }
    if (!this.sharedExportCtx) {
      throw new Error('Export 2D context oluşturulamadı');
    }
    if (
      this.sharedExportCanvas.width !== width ||
      this.sharedExportCanvas.height !== height
    ) {
      this.sharedExportCanvas.width = width;
      this.sharedExportCanvas.height = height;
    }
    this.sharedExportCtx.imageSmoothingEnabled = true;
    this.sharedExportCtx.imageSmoothingQuality = 'high';
    return {
      canvas: this.sharedExportCanvas,
      ctx: this.sharedExportCtx,
    };
  }

  /** Telefon videolarındaki tkhd dönüşünü uygular (VideoFrame ham/döndürülmemiş gelir) */
  private static orientFrame(frame: VideoFrame, rotation: number): CanvasImageSource {
    if (!rotation) return frame;
    const fw = frame.displayWidth;
    const fh = frame.displayHeight;
    const swap = rotation === 90 || rotation === 270;
    const w = swap ? fh : fw;
    const h = swap ? fw : fh;
    if (!this.rotateCanvas) {
      this.rotateCanvas = document.createElement('canvas');
      this.rotateCtx = this.rotateCanvas.getContext('2d', { alpha: false });
    }
    const ctx = this.rotateCtx;
    if (!ctx) return frame;
    if (this.rotateCanvas.width !== w || this.rotateCanvas.height !== h) {
      this.rotateCanvas.width = w;
      this.rotateCanvas.height = h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(frame, -fw / 2, -fh / 2, fw, fh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return this.rotateCanvas;
  }

  private static yieldToMain(): Promise<void> {
    if (typeof MessageChannel !== 'undefined') {
      return new Promise<void>((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => resolve();
        ch.port2.postMessage(null);
      });
    }
    return new Promise<void>((r) => setTimeout(r, 0));
  }

  private static async drainEncoder(
    encoder: VideoEncoder,
    maxQueue: number,
    signal?: AbortSignal
  ): Promise<void> {
    while (encoder.encodeQueueSize > maxQueue) {
      if (signal?.aborted) throw abortError();
      await new Promise<void>((resolve) => {
        const target = encoder as unknown as EventTarget;
        const done = () => {
          clearTimeout(timer);
          target.removeEventListener('dequeue', done);
          resolve();
        };
        const timer = setTimeout(done, 6);
        target.addEventListener('dequeue', done);
      });
    }
  }

  private static async readMediaBuffer(
    media: EditorMedia | undefined | null,
    signal?: AbortSignal
  ): Promise<ArrayBuffer | null> {
    if (!media || media.type !== 'video') return null;
    try {
      if (media.source instanceof Blob) {
        return await media.source.arrayBuffer();
      }
      if (typeof media.source === 'string' && media.source.length > 0) {
        const resp = await fetch(media.source, { signal });
        if (resp.ok) return await resp.arrayBuffer();
      }
      if (media.element instanceof HTMLVideoElement && media.element.src) {
        const resp = await fetch(media.element.src, { signal });
        if (resp.ok) return await resp.arrayBuffer();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
    }
    return null;
  }
  // [END] CREATED BY Bedirhan

  public static isWebCodecsSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined'
    );
  }

  private static async findSupportedVideoConfig(
    preferredWidth: number,
    preferredHeight: number,
    bitrate: number | undefined
  ): Promise<{
    config: VideoEncoderConfig;
    width: number;
    height: number;
    bitrate: number;
    downscaled: boolean;
  } | null> {
    if (!this.isWebCodecsSupported()) return null;

    const targetW = (preferredWidth || SIZE_720P.width) & ~1;
    const targetH = (preferredHeight || SIZE_720P.height) & ~1;

    // Encoder hedef boyutu desteklemezse 720p'ye düşülür (çağıran onWarning ile bilgilendirilir)
    const attempts: Array<{ width: number; height: number; bitrate: number }> = [
      { width: targetW, height: targetH, bitrate: bitrate || defaultBitrateFor(targetH) },
    ];
    if (targetH > SIZE_720P.height) {
      attempts.push({
        ...SIZE_720P,
        bitrate: bitrate ? Math.min(bitrate, BITRATE_720P) : BITRATE_720P,
      });
    }

    for (let a = 0; a < attempts.length; a++) {
      const attempt = attempts[a];
      for (const hw of ['prefer-hardware', 'no-preference'] as HardwareAcceleration[]) {
        for (const codec of H264_CODEC_CANDIDATES) {
          const candidate: VideoEncoderConfig = {
            codec,
            width: attempt.width,
            height: attempt.height,
            bitrate: attempt.bitrate,
            bitrateMode: 'variable',
            framerate: OUTPUT_FPS,
            // 'realtime' kare düşürebildiği için 'quality' kullanılır
            latencyMode: 'quality',
            hardwareAcceleration: hw,
            avc: { format: 'avc' },
          };
          try {
            const support = await VideoEncoder.isConfigSupported(candidate);
            if (support.supported) {
              return {
                config: support.config || candidate,
                width: attempt.width,
                height: attempt.height,
                bitrate: attempt.bitrate,
                downscaled: a > 0,
              };
            }
          } catch {
            // Sonraki adayı dene
          }
        }
      }
    }

    return null;
  }

  /** Çıktı boyutu: açık width/height > resolution ('auto' = 1080x1920, Hikaye görseliyle tutarlı) */
  private static resolveTargetSize(options?: ExportVideoOptions): {
    width: number;
    height: number;
  } {
    if (options?.width && options?.height) {
      return { width: options.width & ~1, height: options.height & ~1 };
    }
    const res = options?.resolution ?? 'auto';
    if (res === '1080p') return SIZE_1080P;
    if (res === '720p') return SIZE_720P;
    return SIZE_1080P;
  }

  /** Dışa aktarılacak klip listesi (Reels NLE veya tek parça Hikaye/Gönderi videosu) */
  private static resolveExportClips(engine: CanvasEngine): VideoTrackClip[] {
    const isReelsNle =
      engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0;
    if (isReelsNle) {
      return engine.getVideoClips().filter((c) => c.duration > 0.01);
    }
    const state = engine.getVideoState();
    const media = engine.getMedia() || undefined;
    const trimStart = state.trimStart;
    const trimEnd = state.trimEnd > trimStart ? state.trimEnd : state.duration;
    const rate = Math.max(0.25, state.playbackRate || 1.0);
    const sourceDur = Math.max(0.1, Math.min(60 * rate, trimEnd - trimStart));
    return [
      {
        id: 'single_export_clip',
        sourceMediaId: media?.objectUrl || 'main_media',
        sourceStart: trimStart,
        sourceEnd: trimStart + sourceDur,
        duration: Math.min(60, sourceDur / rate),
        playbackRate: rate,
        volume: state.volume,
        muted: state.muted,
        isMotionPhoto: Boolean(state.isMotionPhoto),
        media,
      },
    ];
  }

  private static async renderMixedAudio(params: {
    clips: VideoTrackClip[];
    isReelsNle: boolean;
    outputDuration: number;
    getBuffer: (media: EditorMedia | undefined) => Promise<ArrayBuffer | null>;
    music?: StoryAudioMeta | null;
    musicVolume: number;
    signal?: AbortSignal;
  }): Promise<AudioBuffer | null> {
    const { clips, isReelsNle, outputDuration, getBuffer, music, musicVolume, signal } = params;
    if (typeof OfflineAudioContext === 'undefined') return null;

    const audibleClips = clips.filter(
      (c) => !c.isMotionPhoto && !c.muted && c.volume > 0 && c.media?.type === 'video'
    );
    const hasMusicAudio = Boolean(music && music.streamUrl && musicVolume > 0);
    if (audibleClips.length === 0 && !hasMusicAudio) return null;

    const totalSamples = Math.max(1, Math.ceil(outputDuration * AUDIO_SAMPLE_RATE));
    const offlineCtx = new OfflineAudioContext(2, totalSamples, AUDIO_SAMPLE_RATE);
    let hasAnySource = false;

    // 1. Klip sesleri: her klip KENDİ medya kaynağından çözülür (çoklu medya desteği)
    if (audibleClips.length > 0) {
      const decodedCache = new Map<EditorMedia, AudioBuffer | null>();
      let accOutTime = 0;
      for (const clip of clips) {
        if (signal?.aborted) throw abortError();
        const clipOutDur = Math.max(0.05, clip.duration);
        if (audibleClips.includes(clip) && clip.media) {
          let decoded = decodedCache.get(clip.media);
          if (decoded === undefined) {
            decoded = null;
            try {
              const buf = await getBuffer(clip.media);
              if (buf && buf.byteLength > 0) {
                decoded = await offlineCtx.decodeAudioData(buf.slice(0));
              }
            } catch (err) {
              if (err instanceof DOMException && err.name === 'AbortError') throw err;
              decoded = null; // Ses kanalı olmayan video
            }
            decodedCache.set(clip.media, decoded);
          }
          if (decoded) {
            const node = offlineCtx.createBufferSource();
            node.buffer = decoded;
            node.playbackRate.value = Math.max(0.25, clip.playbackRate || 1.0);
            const gain = offlineCtx.createGain();
            gain.gain.value = Math.max(0, Math.min(1, clip.volume));
            node.connect(gain);
            gain.connect(offlineCtx.destination);
            const sourceDur = Math.max(0.05, clip.sourceEnd - clip.sourceStart);
            node.start(accOutTime, clip.sourceStart, sourceDur);
            hasAnySource = true;
          }
        }
        accOutTime += clipOutDur;
      }
    }

    // 2. Müzik
    if (hasMusicAudio && music?.streamUrl) {
      try {
        const resp = await fetch(music.streamUrl, { signal });
        if (resp.ok) {
          const musicBuf = await resp.arrayBuffer();
          if (musicBuf.byteLength > 0) {
            const decodedMusic = await offlineCtx.decodeAudioData(musicBuf.slice(0));
            const vol = Math.max(0, Math.min(1, musicVolume));

            const segments =
              isReelsNle && music.segments && music.segments.length > 0
                ? music.segments.map((s) => ({
                    start: s.timelineStart,
                    end: s.timelineEnd,
                    offset: s.songOffset || 0,
                  }))
                : (() => {
                    const segStart =
                      typeof music.timelineStart === 'number' ? music.timelineStart : 0;
                    const segEnd =
                      typeof music.timelineEnd === 'number' && music.timelineEnd > segStart
                        ? music.timelineEnd
                        : outputDuration;
                    return [{ start: segStart, end: segEnd, offset: music.startTime || 0 }];
                  })();

            const fadeRange = {
              start: Math.max(0, Math.min(...segments.map((sg) => sg.start))),
              end: Math.min(outputDuration, Math.max(...segments.map((sg) => sg.end))),
            };
            for (const seg of segments) {
              const segStart = Math.max(0, seg.start);
              const segEnd = Math.min(outputDuration, seg.end);
              if (segEnd <= segStart + 0.05) continue;
              const node = offlineCtx.createBufferSource();
              node.buffer = decodedMusic;
              const gain = offlineCtx.createGain();
              applyMusicFadeToGain(gain, music, vol, segStart, segEnd, fadeRange);
              node.connect(gain);
              gain.connect(offlineCtx.destination);
              node.start(segStart, Math.max(0, seg.offset), segEnd - segStart);
              hasAnySource = true;
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        // Müzik akışı hatasında video exportuna devam et
      }
    }

    if (!hasAnySource) return null;

    try {
      return await offlineCtx.startRendering();
    } catch {
      return null;
    }
  }

  public static async exportToBlob(
    engine: CanvasEngine,
    options?: ExportVideoOptions
  ): Promise<Blob> {
    // [WP-16] Düzenlemesiz H.264 kaynak: yeniden kodlamadan kopyala (uygun değilse null, normal yol)
    const remuxed = await RemuxExporter.tryExport(engine, options); if (remuxed) return remuxed;
    const state = engine.getVideoState();
    if (!state.isVideo) {
      throw new Error('Aktif medya bir video değil');
    }

    const signal = options?.signal;
    const clips = this.resolveExportClips(engine);
    const targetSize = this.resolveTargetSize(options);

    const supportedVideo = await this.findSupportedVideoConfig(
      targetSize.width,
      targetSize.height,
      options?.bitrate
    );

    if (!supportedVideo) {
      return MediaRecorderFallback.exportToBlob(engine, {
        width: targetSize.width,
        height: targetSize.height,
        fps: OUTPUT_FPS,
        bitrate: options?.bitrate || defaultBitrateFor(targetSize.height),
        music: options?.music,
        musicVolume: options?.musicVolume,
        onProgress: options?.onProgress,
        signal,
      });
    }

    const {
      config: videoConfig,
      width: exportWidth,
      height: exportHeight,
      bitrate: exportBitrate,
    } = supportedVideo;
    if (supportedVideo.downscaled) options?.onWarning?.('downscaled-720p');
    const fps = OUTPUT_FPS;
    const isReelsNle =
      engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0;
    const outputDuration = Math.max(
      0.2,
      Math.min(
        60,
        clips.reduce((acc, c) => acc + Math.max(0.05, c.duration), 0)
      )
    );
    const totalFrames = Math.max(1, Math.round(outputDuration * fps));
    const frameDurationUs = Math.round(1_000_000 / fps);
    const videoEndUs = totalFrames * frameDurationUs;
    const restoreTime = engine.getCurrentTime();

    engine.setExportingVideo(true);

    let videoEncoder: VideoEncoder | null = null;
    let audioEncoder: AudioEncoder | null = null;

    // Kaynak dosya belleği ve demux sonucu medya başına tek sefer okunur (ses + görüntü ortak)
    const bufferCache = new Map<EditorMedia, Promise<ArrayBuffer | null>>();
    const getBuffer = (media: EditorMedia | undefined) => {
      if (!media) return Promise.resolve(null);
      let p = bufferCache.get(media);
      if (!p) {
        p = this.readMediaBuffer(media, signal);
        bufferCache.set(media, p);
      }
      return p;
    };
    const demuxCache = new Map<EditorMedia, DemuxedVideoTrack | null>();
    const getDemuxed = async (media: EditorMedia | undefined) => {
      if (!media || media.type !== 'video') return null;
      if (demuxCache.has(media)) return demuxCache.get(media) ?? null;
      const buf = await getBuffer(media);
      const track = buf ? FastDemuxer.demux(buf) : null;
      demuxCache.set(media, track);
      return track;
    };

    try {
      if (signal?.aborted) throw abortError();

      const aacConfig: AudioEncoderConfig = {
        codec: 'mp4a.40.2',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfChannels: 2,
        bitrate: 128_000,
      };

      const audioSupportPromise =
        typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined'
          ? AudioEncoder.isConfigSupported(aacConfig)
              .then((s) => Boolean(s.supported))
              .catch(() => false)
          : Promise.resolve(false);

      const [audioConfigSupported, { Muxer, ArrayBufferTarget }] = await Promise.all([
        audioSupportPromise,
        import('mp4-muxer'),
      ]);

      const renderedAudio = audioConfigSupported
        ? await this.renderMixedAudio({
            clips,
            isReelsNle,
            outputDuration,
            getBuffer,
            music: options?.music,
            musicVolume: options?.musicVolume ?? 0.85,
            signal,
          })
        : null;

      if (signal?.aborted) throw abortError();

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: 'avc',
          width: exportWidth,
          height: exportHeight,
          frameRate: fps,
        },
        audio: renderedAudio
          ? {
              codec: 'aac',
              numberOfChannels: 2,
              sampleRate: AUDIO_SAMPLE_RATE,
            }
          : undefined,
        fastStart: 'in-memory',
      });

      let encoderError: Error | null = null;

      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (err) => {
          encoderError = err instanceof Error ? err : new Error(String(err));
        },
      });
      videoEncoder.configure(videoConfig);

      if (renderedAudio) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            // E-05: AAC paket dolgusu sesi videodan uzatıyordu; ses, video bitiş anına (kare sayısı x süre) kırpılır
            if (chunk.timestamp >= videoEndUs) return;
            const dur = chunk.duration ?? 0;
            if (dur > 0 && chunk.timestamp + dur > videoEndUs) {
              const data = new Uint8Array(chunk.byteLength);
              chunk.copyTo(data);
              muxer.addAudioChunkRaw(
                data,
                chunk.type,
                chunk.timestamp,
                videoEndUs - chunk.timestamp,
                meta
              );
            } else {
              muxer.addAudioChunk(chunk, meta);
            }
          },
          error: (err) => {
            encoderError = err instanceof Error ? err : new Error(String(err));
          },
        });
        audioEncoder.configure(aacConfig);

        const ch0 = renderedAudio.getChannelData(0);
        const ch1 =
          renderedAudio.numberOfChannels > 1
            ? renderedAudio.getChannelData(1)
            : renderedAudio.getChannelData(0);
        const chunkFrames = 4096;
        const reusablePlanar = new Float32Array(chunkFrames * 2);

        const audioLength = Math.min(
          renderedAudio.length,
          Math.ceil((videoEndUs / 1_000_000) * AUDIO_SAMPLE_RATE)
        );
        for (let offset = 0; offset < audioLength; offset += chunkFrames) {
          if (signal?.aborted) throw abortError();
          const frameCount = Math.min(chunkFrames, audioLength - offset);
          const planarView =
            frameCount === chunkFrames
              ? reusablePlanar
              : reusablePlanar.subarray(0, frameCount * 2);
          planarView.set(ch0.subarray(offset, offset + frameCount), 0);
          planarView.set(ch1.subarray(offset, offset + frameCount), frameCount);

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: AUDIO_SAMPLE_RATE,
            numberOfFrames: frameCount,
            numberOfChannels: 2,
            timestamp: Math.round((offset / AUDIO_SAMPLE_RATE) * 1_000_000),
            data: planarView,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
      }

      const { canvas: exportCanvas, ctx: exportCtx } = this.getExportSurface(
        exportWidth,
        exportHeight
      );
      const ml = engine.getMediaLayer();

      // ─────────────────────────────────────────────────────────────
      // TEK BİRLEŞİK KARE-DOĞRU PIPELINE
      // Video klip  → WebCodecs çekme imleci (gerçek kare) | desteklenmezse kare-kilitli seek
      // Foto klip   → sahne değişmediği sürece yeniden çizim yok, yalnızca encode
      // ─────────────────────────────────────────────────────────────
      const stats: ExportStats = {
        width: exportWidth,
        height: exportHeight,
        bitrate: exportBitrate,
        frames: totalFrames,
        totalMs: 0,
        decodeMs: 0,
        drawMs: 0,
        convertMs: 0,
        readbackMs: 0,
        encodeMs: 0,
        usedFrameCursor: false,
        taggedBt709Limited: false,
      };
      const tStart = performance.now();

      // E-06: Canvas -> I420 BT.709 limited-range. Canvas karesi doğrudan verilirse encoder sRGB/tam aralık
      // (yuvj420p) etiketler. I420 üretilemezse (eski tarayıcı) canvas karesine geri düşülür.
      const colorSpace = {
        primaries: 'bt709',
        transfer: 'bt709',
        matrix: 'bt709',
        fullRange: false,
      } as const;
      let i420Ok = true;
      let i420Buf: Uint8Array | null = null;
      let i420Fresh = false;
      // N-3: ana iş parçacığını ~8 ms'lik dilimlerle bırak; arayüz (rAF) export sırasında akıcı kalsın
      let lastYieldAt = performance.now();
      const sliceYield = async (): Promise<void> => {
        if (performance.now() - lastYieldAt < 8) return;
        await this.yieldToMain();
        lastYieldAt = performance.now();
      };
      const makeVideoFrame = async (timestamp: number, canvasChanged: boolean): Promise<VideoFrame> => {
        if (i420Ok) {
          try {
            if (!i420Buf) i420Buf = new Uint8Array((exportWidth * exportHeight * 3) >> 1);
            if (canvasChanged || !i420Fresh) {
              const tConv = performance.now();
              const img = exportCtx.getImageData(0, 0, exportWidth, exportHeight);
              const tRead = performance.now();
              stats.readbackMs += tRead - tConv;
              await sliceYield();
              const tConv2 = performance.now();
              for (let y0 = 0; y0 < exportHeight; y0 += 256) {
                rgbaToI420Bt709Limited(img.data, exportWidth, exportHeight, i420Buf, y0, Math.min(exportHeight, y0 + 256));
                await sliceYield();
              }
              stats.convertMs += performance.now() - tConv2;
              i420Fresh = true;
            }
            const f = new VideoFrame(i420Buf, {
              format: 'I420',
              codedWidth: exportWidth,
              codedHeight: exportHeight,
              timestamp,
              duration: frameDurationUs,
              colorSpace,
            });
            stats.taggedBt709Limited = true;
            return f;
          } catch {
            i420Ok = false;
          }
        }
        return new VideoFrame(exportCanvas, { timestamp, duration: frameDurationUs });
      };
      let frameIdx = 0;
      let clipOutStartSec = 0;
      let lastReportedPct = -1;
      let staticFrameClipId: string | null = null;

      for (let cIdx = 0; cIdx < clips.length && frameIdx < totalFrames; cIdx++) {
        if (signal?.aborted) throw abortError();
        const clip = clips[cIdx];
        const clipOutEndSec = clipOutStartSec + Math.max(0.05, clip.duration);
        const clipEndFrame =
          cIdx === clips.length - 1
            ? totalFrames
            : Math.min(totalFrames, Math.round(clipOutEndSec * fps));

        if (isReelsNle) {
          engine.applyClipTransformToMediaLayer(clip);
        }

        const rate = Math.max(0.25, clip.playbackRate || 1.0);
        const isVideoClip = !clip.isMotionPhoto && clip.media?.type === 'video';
        const clipMedia = clip.media;
        const videoEl =
          isVideoClip && clipMedia && clipMedia.element instanceof HTMLVideoElement
            ? clipMedia.element
            : null;

        let cursor: DecodedFrameCursor | null = null;
        let rotation = 0;
        if (isVideoClip) {
          if (videoEl) {
            try {
              videoEl.pause();
              videoEl.muted = true;
            } catch {}
          }
          const track = await getDemuxed(clip.media);
          if (track) {
            const offsetSec = track.ptsOffsetUs / 1_000_000;
            const samples = FastDemuxer.getSamplesForRange(
              track,
              clip.sourceStart + offsetSec,
              clip.sourceEnd + offsetSec
            );
            const c = new DecodedFrameCursor(track, samples);
            if (await c.open()) {
              cursor = c;
              rotation = track.rotation;
            } else {
              c.close();
            }
          }
          staticFrameClipId = null;
        }

        try {
          for (; frameIdx < clipEndFrame; frameIdx++) {
            if (signal?.aborted) throw abortError();
            if (encoderError) throw encoderError;

            const outTimeSec = frameIdx / fps;
            const localOut = Math.max(0, outTimeSec - clipOutStartSec);
            const sourceSec = Math.min(
              Math.max(clip.sourceStart, clip.sourceEnd - 0.001),
              clip.sourceStart + localOut * rate
            );

            let externalFrame: CanvasImageSource | undefined;
            let needsDraw = true;

            if (isVideoClip) {
              if (cursor) {
                try {
                  const tDec = performance.now();
                  const vf = await cursor.frameAt(sourceSec, signal);
                  stats.decodeMs += performance.now() - tDec;
                  if (vf) stats.usedFrameCursor = true;
                  if (vf) externalFrame = this.orientFrame(vf, rotation);
                } catch (err) {
                  if (err instanceof DOMException && err.name === 'AbortError') throw err;
                  cursor.close();
                  cursor = null;
                }
              }
              if (!cursor && ml) {
                // Kare-kilitli yedek yol: gerçek 'seeked' beklenir, sonra çizilir
                await ml.seek(sourceSec);
              }
            } else {
              const sceneChanged = engine.syncTemporalVisibility(outTimeSec);
              const animated = ml ? ml.isActiveEffectTimeDependentAt(outTimeSec) : false;
              needsDraw = sceneChanged || animated || staticFrameClipId !== clip.id;
            }

            const tDraw = performance.now();
            if (needsDraw) {
              exportCtx.clearRect(0, 0, exportWidth, exportHeight);
              engine.drawBaseMedia(exportCtx, exportWidth, exportHeight, outTimeSec, externalFrame);
              engine.drawCachedOverlays(exportCtx, exportWidth, exportHeight, outTimeSec);
              staticFrameClipId = isVideoClip ? null : clip.id;
            }

            if (needsDraw) i420Fresh = false;
            await sliceYield();
            const videoFrame = await makeVideoFrame(Math.round(frameIdx * frameDurationUs), needsDraw);
            stats.drawMs += performance.now() - tDraw;
            const tEnc = performance.now();
            try {
              videoEncoder.encode(videoFrame, { keyFrame: frameIdx % (fps * 2) === 0 });
            } finally {
              videoFrame.close();
            }

            await this.drainEncoder(videoEncoder, 6, signal);
            stats.encodeMs += performance.now() - tEnc;

            const rawProgress = Math.min(0.97, (frameIdx + 1) / totalFrames);
            const pct = Math.floor(rawProgress * 100);
            if (pct !== lastReportedPct) {
              lastReportedPct = pct;
              options?.onProgress?.(rawProgress);
            }

            await sliceYield();
          }
        } finally {
          cursor?.close();
        }

        clipOutStartSec = clipOutEndSec;
      }

      if (encoderError) throw encoderError;

      await videoEncoder.flush();
      videoEncoder.close();
      videoEncoder = null;

      if (audioEncoder) {
        await audioEncoder.flush();
        audioEncoder.close();
        audioEncoder = null;
      }

      muxer.finalize();
      options?.onProgress?.(1);
      stats.totalMs = performance.now() - tStart;
      options?.onStats?.(stats);
      // Teşhis için (QA harness): son export istatistiği
      (globalThis as { __lastExportStats?: ExportStats }).__lastExportStats = stats;

      return new Blob([target.buffer], { type: 'video/mp4' });
    } finally {
      if (videoEncoder) {
        try {
          if (videoEncoder.state !== 'closed') videoEncoder.close();
        } catch {}
      }
      if (audioEncoder) {
        try {
          if (audioEncoder.state !== 'closed') audioEncoder.close();
        } catch {}
      }
      engine.setExportingVideo(false);
      try {
        engine.renderAtTime(restoreTime);
      } catch {}
    }
  }
}
// [END] CREATED BY Bedirhan
