// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
import { CanvasEngine } from '../Engine';
import { EditorMedia, StoryAudioMeta, VideoTrackClip } from '../types';
import { FastDemuxer, DemuxedSample, DemuxedVideoTrack } from './FastDemuxer';
import { applyMusicFadeToGain } from '../utils/musicFade';
import { MediaRecorderFallback } from './MediaRecorderFallback';

export interface ExportVideoOptions {
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  resolution?: '1080p' | '720p';
  music?: StoryAudioMeta | null;
  musicVolume?: number;
  onProgress?: (progress: number) => void;
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
// 720x1280 @ 30 FPS dikey video için yeterli; 6 Mbps dosyayı ~3 kat şişiriyordu
const DEFAULT_BITRATE = 2_500_000;
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

    const config: VideoDecoderConfig = {
      codec: this.track.codec,
      codedWidth: this.track.codedWidth,
      codedHeight: this.track.codedHeight,
      description: this.track.description,
      hardwareAcceleration: 'prefer-hardware',
    };
    try {
      const support = await VideoDecoder.isConfigSupported(config);
      if (!support.supported) return false;
    } catch {
      return false;
    }

    try {
      this.decoder = new VideoDecoder({
        output: (frame) => {
          this.queue.push(frame);
          this.outCount++;
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
    while (
      this.nextSampleIdx < this.samples.length &&
      dec.decodeQueueSize < 6 &&
      this.fedCount - this.outCount < 10
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
    bitrate: number
  ): Promise<{ config: VideoEncoderConfig; width: number; height: number } | null> {
    if (!this.isWebCodecsSupported()) return null;

    const targetW = (preferredWidth || 720) & ~1;
    const targetH = (preferredHeight || 1280) & ~1;

    // latencyMode 'quality': 'realtime' modu hız kontrolü için kare DÜŞÜRÜR (3-5 FPS çıktının kök nedeni)
    const attempts: Array<{ width: number; height: number; bitrate: number }> = [
      { width: targetW, height: targetH, bitrate },
      { width: 720, height: 1280, bitrate: Math.min(bitrate, DEFAULT_BITRATE) },
    ];

    for (const attempt of attempts) {
      for (const hw of ['prefer-hardware', 'no-preference'] as HardwareAcceleration[]) {
        for (const codec of H264_CODEC_CANDIDATES) {
          const candidate: VideoEncoderConfig = {
            codec,
            width: attempt.width,
            height: attempt.height,
            bitrate: attempt.bitrate,
            bitrateMode: 'variable',
            framerate: OUTPUT_FPS,
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
    const state = engine.getVideoState();
    if (!state.isVideo) {
      throw new Error('Aktif medya bir video değil');
    }

    const preferredW = options?.width || 720;
    const preferredH = options?.height || 1280;
    const bitrate = options?.bitrate || DEFAULT_BITRATE;
    const signal = options?.signal;

    const supportedVideo = await this.findSupportedVideoConfig(preferredW, preferredH, bitrate);

    if (!supportedVideo) {
      return MediaRecorderFallback.exportToBlob(engine, {
        width: preferredW,
        height: preferredH,
        fps: OUTPUT_FPS,
        bitrate,
        music: options?.music,
        musicVolume: options?.musicVolume,
        onProgress: options?.onProgress,
        signal,
      });
    }

    const { config: videoConfig, width: exportWidth, height: exportHeight } = supportedVideo;
    const fps = OUTPUT_FPS;
    const isReelsNle =
      engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0;
    const clips = this.resolveExportClips(engine);
    const outputDuration = Math.max(
      0.2,
      Math.min(
        60,
        clips.reduce((acc, c) => acc + Math.max(0.05, c.duration), 0)
      )
    );
    const totalFrames = Math.max(1, Math.round(outputDuration * fps));
    const frameDurationUs = Math.round(1_000_000 / fps);
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
            muxer.addAudioChunk(chunk, meta);
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

        for (let offset = 0; offset < renderedAudio.length; offset += chunkFrames) {
          if (signal?.aborted) throw abortError();
          const frameCount = Math.min(chunkFrames, renderedAudio.length - offset);
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
                  const vf = await cursor.frameAt(sourceSec, signal);
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

            if (needsDraw) {
              exportCtx.clearRect(0, 0, exportWidth, exportHeight);
              engine.drawBaseMedia(exportCtx, exportWidth, exportHeight, outTimeSec, externalFrame);
              engine.drawCachedOverlays(exportCtx, exportWidth, exportHeight, outTimeSec);
              staticFrameClipId = isVideoClip ? null : clip.id;
            }

            const videoFrame = new VideoFrame(exportCanvas, {
              timestamp: Math.round(frameIdx * frameDurationUs),
              duration: frameDurationUs,
            });
            try {
              videoEncoder.encode(videoFrame, { keyFrame: frameIdx % (fps * 2) === 0 });
            } finally {
              videoFrame.close();
            }

            await this.drainEncoder(videoEncoder, 6, signal);

            const rawProgress = Math.min(0.97, (frameIdx + 1) / totalFrames);
            const pct = Math.floor(rawProgress * 100);
            if (pct !== lastReportedPct) {
              lastReportedPct = pct;
              options?.onProgress?.(rawProgress);
            }

            if (frameIdx % 15 === 14) {
              await this.yieldToMain();
            }
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
