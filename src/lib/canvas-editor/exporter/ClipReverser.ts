import { FastDemuxer, DemuxedSample, DemuxedVideoTrack } from './FastDemuxer';
import { EditorMedia, MAX_VIDEO_SEC } from '../types';

/**
 * Ters çevirme hatası. `code`:
 *  - 'unsupported': WebCodecs / codec / kaynak okunamadı (UI toast göstermeli)
 *  - 'not-video'  : klip bir video değil
 *  - 'decode' | 'encode': işlem sırasında hata
 * İptal (AbortSignal) için DOMException('AbortError') fırlatılır.
 */
export type ReverseClipErrorCode = 'unsupported' | 'not-video' | 'decode' | 'encode';

export class ReverseClipError extends Error {
  public readonly code: ReverseClipErrorCode;
  constructor(code: ReverseClipErrorCode, message?: string) {
    super(message || `reverse-clip:${code}`);
    this.name = 'ReverseClipError';
    this.code = code;
  }
}

export function isReverseClipError(err: unknown): err is ReverseClipError {
  return err instanceof ReverseClipError;
}

/** Ters klip çıktısının uzun kenarı (px). Bellek için sınırlıdır. */
export const REVERSE_MAX_DIM = 1080;
/** Bir GOP bu kadar kareyi aşarsa (bellek) işlem reddedilir. */
const MAX_GOP_FRAMES = 300;

const H264_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42E028', 'avc1.420028'];

const abortError = () => new DOMException('Reverse cancelled', 'AbortError');

export function isReverseSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof VideoDecoder !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof createImageBitmap !== 'undefined'
  );
}

async function readBuffer(media: EditorMedia, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    if (media.source instanceof Blob) return await media.source.arrayBuffer();
    if (typeof media.source === 'string' && media.source) {
      const r = await fetch(media.source, { signal });
      if (r.ok) return await r.arrayBuffer();
    }
    if (media.element instanceof HTMLVideoElement && media.element.src) {
      const r = await fetch(media.element.src, { signal });
      if (r.ok) return await r.arrayBuffer();
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
  }
  return null;
}

/** Aynı GOP'a (keyframe ile başlayan dizi) ait örnekleri gruplar. */
function groupGops(samples: DemuxedSample[]): DemuxedSample[][] {
  const gops: DemuxedSample[][] = [];
  for (const s of samples) {
    if (s.isKeyframe || gops.length === 0) gops.push([s]);
    else gops[gops.length - 1].push(s);
  }
  return gops;
}

/**
 * Bir video klibin [startSec, endSec) kaynak aralığını WebCodecs ile çözer, kareleri GOP GOP
 * sondan başa doğru ters sırayla H.264'e yeniden kodlar ve yalnızca-video bir MP4 Blob döndürür.
 * Tüm kareler / bitmap'ler / decoder / encoder her yolda (iptal dahil) serbest bırakılır.
 */
export async function reverseVideoRange(
  media: EditorMedia,
  startSec: number,
  endSec: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  if (media.type !== 'video') throw new ReverseClipError('not-video');
  if (!isReverseSupported()) throw new ReverseClipError('unsupported', 'WebCodecs not available');
  if (signal?.aborted) throw abortError();

  const span = Math.min(Math.max(0.1, endSec - startSec), MAX_VIDEO_SEC);
  const end = startSec + span;

  const buf = await readBuffer(media, signal);
  if (signal?.aborted) throw abortError();
  if (!buf) throw new ReverseClipError('unsupported', 'source unreadable');
  const track: DemuxedVideoTrack | null = FastDemuxer.demux(buf);
  if (!track || track.samples.length === 0) throw new ReverseClipError('unsupported', 'demux failed');

  const offsetUs = track.ptsOffsetUs;
  const rangeSamples = FastDemuxer.getSamplesForRange(track, startSec + offsetUs / 1e6, end + offsetUs / 1e6);
  if (rangeSamples.length === 0) throw new ReverseClipError('decode', 'no samples');

  // Aralık içindeki sunum zamanları (µs, offset düşülmüş), artan sıra
  const startUs = Math.round(startSec * 1e6);
  const endUs = Math.round(end * 1e6);
  const ptsList = rangeSamples
    .map((s) => s.timestampUs - offsetUs)
    .filter((p) => p >= startUs - 1 && p < endUs)
    .sort((a, b) => a - b);
  if (ptsList.length < 2) throw new ReverseClipError('decode', 'too few frames');
  const pMax = ptsList[ptsList.length - 1];
  const avgDur = Math.max(1000, Math.round((pMax - ptsList[0]) / (ptsList.length - 1)));
  const totalFrames = ptsList.length;
  const durByPts = new Map<number, number>();
  for (let k = 1; k < ptsList.length; k++) durByPts.set(ptsList[k], Math.max(1000, ptsList[k] - ptsList[k - 1]));

  // Çıktı boyutu: dönüş uygulanmış, uzun kenar ≤ REVERSE_MAX_DIM, çift sayı
  const rot = ((track.rotation % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const srcW = swapped ? track.height || track.codedHeight : track.width || track.codedWidth;
  const srcH = swapped ? track.width || track.codedWidth : track.height || track.codedHeight;
  const scale = Math.min(1, REVERSE_MAX_DIM / Math.max(srcW, srcH));
  const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
  const outH = Math.max(2, Math.round((srcH * scale) / 2) * 2);
  const fps = Math.max(1, Math.min(60, Math.round(track.fps || 30)));

  // Encoder yapılandırması
  let encConfig: VideoEncoderConfig | null = null;
  const bitrate = Math.min(8_000_000, Math.max(1_500_000, Math.round(outW * outH * fps * 0.09)));
  for (const hw of ['prefer-hardware', 'no-preference'] as HardwareAcceleration[]) {
    for (const codec of H264_CODECS) {
      const cand: VideoEncoderConfig = {
        codec,
        width: outW,
        height: outH,
        bitrate,
        framerate: fps,
        latencyMode: 'quality',
        hardwareAcceleration: hw,
        avc: { format: 'avc' },
      };
      try {
        const sup = await VideoEncoder.isConfigSupported(cand);
        if (sup.supported) {
          encConfig = sup.config || cand;
          break;
        }
      } catch {
        // sonraki aday
      }
    }
    if (encConfig) break;
  }
  if (!encConfig) throw new ReverseClipError('unsupported', 'no H.264 encoder');

  const decConfig: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.codedWidth,
    codedHeight: track.codedHeight,
    description: track.description,
    hardwareAcceleration: 'prefer-hardware',
  };
  try {
    const sup = await VideoDecoder.isConfigSupported(decConfig);
    if (!sup.supported) throw new ReverseClipError('unsupported', 'decoder config');
  } catch (err) {
    if (err instanceof ReverseClipError) throw err;
    throw new ReverseClipError('unsupported', 'decoder config');
  }

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  if (signal?.aborted) throw abortError();

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: outW, height: outH, frameRate: fps },
    fastStart: 'in-memory',
  });

  let encoder: VideoEncoder | null = null;
  let decoder: VideoDecoder | null = null;
  let workCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  let fatal: Error | null = null;
  let held: ImageBitmap[] = [];
  let pendingFrames: VideoFrame[] = [];

  const releaseHeld = () => {
    for (const b of held) {
      try {
        b.close();
      } catch {}
    }
    held = [];
    for (const f of pendingFrames) {
      try {
        f.close();
      } catch {}
    }
    pendingFrames = [];
  };

  try {
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (e) {
          fatal = e instanceof Error ? e : new Error(String(e));
        }
      },
      error: (e) => {
        fatal = e instanceof Error ? e : new Error(String(e));
      },
    });
    encoder.configure(encConfig);

    decoder = new VideoDecoder({
      output: (frame) => {
        pendingFrames.push(frame);
      },
      error: (e) => {
        fatal = e instanceof Error ? e : new Error(String(e));
      },
    });
    decoder.configure(decConfig);

    workCanvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(outW, outH)
        : Object.assign(document.createElement('canvas'), { width: outW, height: outH });
    const wctx = workCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!wctx) throw new ReverseClipError('unsupported', 'canvas 2d');

    const gops = groupGops(rangeSamples);
    let encoded = 0;

    for (let g = gops.length - 1; g >= 0; g--) {
      if (signal?.aborted) throw abortError();
      const gop = gops[g];
      if (gop.length > MAX_GOP_FRAMES) throw new ReverseClipError('unsupported', 'GOP too long');

      // 1) GOP'u çöz (flush ile tüm kareler çıkar)
      for (const s of gop) {
        if (s.data.byteLength === 0) continue;
        decoder.decode(
          new EncodedVideoChunk({
            type: s.isKeyframe ? 'key' : 'delta',
            timestamp: s.timestampUs,
            duration: s.durationUs,
            data: s.data,
          })
        );
      }
      await decoder.flush();
      if (fatal) throw new ReverseClipError('decode', (fatal as Error).message);
      if (signal?.aborted) throw abortError();

      // 2) Kareleri küçült/döndür -> ImageBitmap, VideoFrame'i hemen kapat
      const frames = pendingFrames;
      pendingFrames = [];
      frames.sort((a, b) => a.timestamp - b.timestamp);
      const kept: Array<{ bmp: ImageBitmap; pts: number }> = [];
      for (const f of frames) {
        try {
          const pts = f.timestamp - offsetUs;
          if (pts < startUs - 1 || pts >= endUs) continue;
          wctx.save();
          wctx.clearRect(0, 0, outW, outH);
          wctx.translate(outW / 2, outH / 2);
          wctx.rotate((rot * Math.PI) / 180);
          const dw = swapped ? outH : outW;
          const dh = swapped ? outW : outH;
          wctx.drawImage(f, -dw / 2, -dh / 2, dw, dh);
          wctx.restore();
          const bmp = await createImageBitmap(workCanvas as CanvasImageSource as ImageBitmapSource);
          held.push(bmp);
          kept.push({ bmp, pts });
        } finally {
          try {
            f.close();
          } catch {}
        }
      }

      // 3) Ters sırada kodla
      for (let i = kept.length - 1; i >= 0; i--) {
        if (signal?.aborted) throw abortError();
        if (fatal) throw new ReverseClipError('encode', (fatal as Error).message);
        const { bmp, pts } = kept[i];
        // Ters sırada bu kare, kaynaktaki bir önceki karenin süresi kadar görünür
        const dur = durByPts.get(pts) ?? avgDur;
        const vf = new VideoFrame(bmp, {
          timestamp: Math.max(0, pMax - pts),
          duration: dur,
        });
        try {
          encoder.encode(vf, { keyFrame: encoded % (fps * 2) === 0 });
        } finally {
          vf.close();
        }
        encoded++;
        // Geri basınç
        while (encoder.encodeQueueSize > 6) {
          if (signal?.aborted) throw abortError();
          await new Promise<void>((r) => setTimeout(r, 4));
        }
      }
      releaseHeld();
      onProgress?.(Math.min(0.98, encoded / totalFrames));
    }

    await encoder.flush();
    if (fatal) throw new ReverseClipError('encode', (fatal as Error).message);
    muxer.finalize();
    onProgress?.(1);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (err) {
    if (err instanceof ReverseClipError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ReverseClipError('decode', err instanceof Error ? err.message : String(err));
  } finally {
    releaseHeld();
    try {
      if (decoder && decoder.state !== 'closed') decoder.close();
    } catch {}
    try {
      if (encoder && encoder.state !== 'closed') encoder.close();
    } catch {}
    workCanvas = null;
  }
}
