// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
import { CanvasEngine } from '../Engine';
import { StoryAudioMeta } from '../types';
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

const H264_CODEC_CANDIDATES = [
  'avc1.640033', // High Profile Level 5.1 (1080p60+)
  'avc1.640032', // High Profile Level 5.0 (1080p60)
  'avc1.4d0032', // Main Profile Level 5.0 (1080p60)
  'avc1.420032', // Baseline Profile Level 5.0
  'avc1.64002a', // High Profile Level 4.2 (1080p60)
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.42002a', // Baseline Profile Level 4.2
  'avc1.42E02a', // Constrained Baseline Level 4.2
  'avc1.420028', // Baseline Profile Level 4.0
  'avc1.42E01F', // Constrained Baseline Level 3.1 (720p)
];

export class VideoExporter {
  // [START] CREATED BY Bedirhan
  private static sharedExportCanvas: HTMLCanvasElement | null = null;
  private static sharedExportCtx: CanvasRenderingContext2D | null = null;

  private static getExportSurface(width: number, height: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } {
    if (!this.sharedExportCanvas) {
      this.sharedExportCanvas = document.createElement('canvas');
      this.sharedExportCtx = this.sharedExportCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
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
    return {
      canvas: this.sharedExportCanvas,
      ctx: this.sharedExportCtx,
    };
  }
  // [END] CREATED BY Bedirhan

  public static isWebCodecsSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined'
    );
  }

  private static isLowPowerDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) {
      return true;
    }
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2) {
      return true;
    }
    return false;
  }

  private static async findSupportedVideoConfig(
    preferredWidth: number,
    preferredHeight: number,
    fps: number,
    bitrate: number
  ): Promise<{ config: VideoEncoderConfig; width: number; height: number; fps: number } | null> {
    if (!this.isWebCodecsSupported()) return null;

    const attempts = [
      { width: preferredWidth & ~1, height: preferredHeight & ~1, fps, bitrate },
      { width: 720, height: 1280, fps, bitrate: Math.min(bitrate, 8_000_000) },
      { width: preferredWidth & ~1, height: preferredHeight & ~1, fps: 30, bitrate: Math.min(bitrate, 10_000_000) },
      { width: 720, height: 1280, fps: 30, bitrate: 6_000_000 },
    ];

    for (const attempt of attempts) {
      for (const codec of H264_CODEC_CANDIDATES) {
        const candidate: VideoEncoderConfig = {
          codec,
          width: attempt.width,
          height: attempt.height,
          bitrate: attempt.bitrate,
          framerate: attempt.fps,
          hardwareAcceleration: 'prefer-hardware',
          avc: { format: 'avc' },
        };
        try {
          const support = await VideoEncoder.isConfigSupported(candidate);
          if (support.supported) {
            return {
              config: support.config || candidate,
              width: attempt.width,
              height: attempt.height,
              fps: attempt.fps,
            };
          }
        } catch {
          // Try next codec
        }
      }
    }

    return null;
  }

  private static async renderMixedAudio(
    engine: CanvasEngine,
    outputDuration: number,
    music?: StoryAudioMeta | null,
    musicVolume = 0.85,
    signal?: AbortSignal
  ): Promise<AudioBuffer | null> {
    if (typeof OfflineAudioContext === 'undefined') return null;

    const state = engine.getVideoState();
    const media = engine.getMedia();
    const hasVideoAudio = !state.muted && state.volume > 0;
    const hasMusicAudio = Boolean(music && music.streamUrl && musicVolume > 0);

    if (!hasVideoAudio && !hasMusicAudio) {
      return null;
    }

    const sampleRate = 44100;
    const totalSamples = Math.max(1, Math.ceil(outputDuration * sampleRate));
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    let hasAnySource = false;

    const trimStart = state.trimStart;
    const trimEnd = state.trimEnd > trimStart ? state.trimEnd : state.duration;
    const playbackRate = state.playbackRate || 1.0;

    if (hasVideoAudio && media) {
      try {
        let arrayBuf: ArrayBuffer | null = null;
        if (media.source instanceof Blob) {
          arrayBuf = await media.source.arrayBuffer();
        } else if (typeof media.source === 'string') {
          const resp = await fetch(media.source, { signal });
          if (resp.ok) arrayBuf = await resp.arrayBuffer();
        } else if (media.element instanceof HTMLVideoElement && media.element.src) {
          const resp = await fetch(media.element.src, { signal });
          if (resp.ok) arrayBuf = await resp.arrayBuffer();
        }

        if (arrayBuf && arrayBuf.byteLength > 0) {
          const decodedVideoAudio = await offlineCtx.decodeAudioData(arrayBuf.slice(0));
          const sourceNode = offlineCtx.createBufferSource();
          sourceNode.buffer = decodedVideoAudio;
          sourceNode.playbackRate.value = playbackRate;

          const gainNode = offlineCtx.createGain();
          gainNode.gain.value = Math.max(0, Math.min(1, state.volume));

          sourceNode.connect(gainNode);
          gainNode.connect(offlineCtx.destination);

          const trimDur = Math.max(0.1, trimEnd - trimStart);
          sourceNode.start(0, trimStart, trimDur);
          hasAnySource = true;
        }
      } catch {
        // Video might not have an audio track; continue gracefully
      }
    }

    if (hasMusicAudio && music?.streamUrl) {
      try {
        const resp = await fetch(music.streamUrl, { signal });
        if (resp.ok) {
          const musicBuf = await resp.arrayBuffer();
          if (musicBuf.byteLength > 0) {
            const decodedMusic = await offlineCtx.decodeAudioData(musicBuf.slice(0));
            const musicNode = offlineCtx.createBufferSource();
            musicNode.buffer = decodedMusic;

            const musicGain = offlineCtx.createGain();
            musicGain.gain.value = Math.max(0, Math.min(1, musicVolume));

            musicNode.connect(musicGain);
            musicGain.connect(offlineCtx.destination);

            // CapCut tarzı ses klibi zaman aralığı (timelineStart .. timelineEnd)
            const clipStart =
              typeof music.timelineStart === 'number' ? music.timelineStart : trimStart;
            const clipEnd =
              typeof music.timelineEnd === 'number' && music.timelineEnd > clipStart
                ? music.timelineEnd
                : trimEnd;
            const activeStart = Math.max(trimStart, clipStart);
            const activeEnd = Math.min(trimEnd, clipEnd);

            if (activeEnd > activeStart) {
              const delayInOutSec = Math.max(0, (activeStart - trimStart) / playbackRate);
              const playDurInOutSec = Math.max(
                0.05,
                Math.min(outputDuration - delayInOutSec, (activeEnd - activeStart) / playbackRate)
              );
              const songOffsetSec =
                Math.max(0, music.startTime || 0) + Math.max(0, trimStart - clipStart);
              musicNode.start(delayInOutSec, songOffsetSec, playDurInOutSec);
              hasAnySource = true;
            }
          }
        }
      } catch {
        // Music stream CORS or decode failure; continue with video export
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

    const use720p =
      options?.resolution === '720p' ||
      (!options?.resolution && this.isLowPowerDevice());
    const preferredW = options?.width || (use720p ? 720 : 1080);
    const preferredH = options?.height || (use720p ? 1280 : 1920);
    const requestedFps = options?.fps || 60;
    const bitrate = options?.bitrate || (use720p ? 8_000_000 : 14_000_000);
    const signal = options?.signal;

    const supportedVideo = await this.findSupportedVideoConfig(
      preferredW,
      preferredH,
      requestedFps,
      bitrate
    );

    if (!supportedVideo) {
      return MediaRecorderFallback.exportToBlob(engine, {
        width: preferredW,
        height: preferredH,
        fps: requestedFps,
        bitrate,
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
      fps,
    } = supportedVideo;
    const trimStart = state.trimStart;
    const trimEnd = state.trimEnd > trimStart ? state.trimEnd : state.duration;
    const playbackRate = state.playbackRate || 1.0;
    const sourceTrimDuration = Math.max(0.1, Math.min(60, trimEnd - trimStart));
    const outputDuration = Math.max(0.1, sourceTrimDuration / playbackRate);
    const totalFrames = Math.max(1, Math.round(outputDuration * fps));

    engine.setExportingVideo(true);

    let videoEncoder: VideoEncoder | null = null;
    let audioEncoder: AudioEncoder | null = null;

    try {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }

      // 1. Ses miksajı ve AAC AudioEncoder kontrolü
      let renderedAudio: AudioBuffer | null = null;
      let audioConfigSupported = false;
      const aacConfig: AudioEncoderConfig = {
        codec: 'mp4a.40.2',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitrate: 192_000,
      };

      if (typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
        try {
          const support = await AudioEncoder.isConfigSupported(aacConfig);
          audioConfigSupported = Boolean(support.supported);
        } catch {
          audioConfigSupported = false;
        }
      }

      if (audioConfigSupported) {
        renderedAudio = await this.renderMixedAudio(
          engine,
          outputDuration,
          options?.music,
          options?.musicVolume ?? 0.85,
          signal
        );
      }

      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }

      // [MODIFIED BY Bedirhan]
      // 2. mp4-muxer kurulumu (tarayıcıda dinamik import, SSR'dan izole)
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: 'avc',
          width: exportWidth,
          height: exportHeight,
        },
        audio: renderedAudio
          ? {
              codec: 'aac',
              numberOfChannels: 2,
              sampleRate: 44100,
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

        // [MODIFIED BY Bedirhan]
        // Sesi 4096 örnekli bloklar halinde kodla (Bellek tahsisini döngü dışına çıkar)
        const ch0 = renderedAudio.getChannelData(0);
        const ch1 =
          renderedAudio.numberOfChannels > 1
            ? renderedAudio.getChannelData(1)
            : renderedAudio.getChannelData(0);
        const chunkFrames = 4096;
        const reusablePlanar = new Float32Array(chunkFrames * 2);

        for (let offset = 0; offset < renderedAudio.length; offset += chunkFrames) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          const frameCount = Math.min(chunkFrames, renderedAudio.length - offset);
          const planarView =
            frameCount === chunkFrames
              ? reusablePlanar
              : reusablePlanar.subarray(0, frameCount * 2);
          planarView.set(ch0.subarray(offset, offset + frameCount), 0);
          planarView.set(ch1.subarray(offset, offset + frameCount), frameCount);

          const timestampUs = Math.round((offset / 44100) * 1_000_000);
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: 44100,
            numberOfFrames: frameCount,
            numberOfChannels: 2,
            timestamp: timestampUs,
            data: planarView,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
      }

      // 3. Paylaşımlı çizim tuvali (Döngü dışında tek seferlik boyutlandırma ve tahsis)
      const { canvas: exportCanvas, ctx: exportCtx } = this.getExportSurface(
        exportWidth,
        exportHeight
      );

      const frameDurationUs = Math.round((1 / fps) * 1_000_000);
      const mediaLayer = engine.getMediaLayer();
      const isStaticMotionPhoto = Boolean(
        state.isMotionPhoto && mediaLayer && !mediaLayer.isTimeDependentEffect()
      );

      // 5 saniyelik statik fotoğraf->video dönüşümünde tüm sahneyi döngü dışında 1 kez çiz ve önbelleğe al
      if (isStaticMotionPhoto) {
        await engine.renderFrameAt(exportCtx, trimStart, exportWidth, exportHeight);
      }

      // 4. Kare kare render ve H.264 encode döngüsü
      for (let i = 0; i < totalFrames; i++) {
        if (signal?.aborted) {
          throw new DOMException('Export cancelled', 'AbortError');
        }
        if (encoderError) {
          throw encoderError;
        }

        const outTimeSec = i / fps;
        if (!isStaticMotionPhoto) {
          const sourceTimeSec = Math.min(trimEnd, trimStart + outTimeSec * playbackRate);
          await engine.renderFrameAt(exportCtx, sourceTimeSec, exportWidth, exportHeight);
        }

        const timestampUs = Math.round(outTimeSec * 1_000_000);
        const videoFrame = new VideoFrame(exportCanvas, {
          timestamp: timestampUs,
          duration: frameDurationUs,
        });

        try {
          videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
        } finally {
          videoFrame.close();
        }

        // Kuyruk doluluğu kontrolü (Backpressure - 60 FPS yüksek hızlı donanım kuyruğu)
        while (videoEncoder.encodeQueueSize > 16) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          await new Promise((r) => setTimeout(r, 2));
        }

        options?.onProgress?.(Math.min(0.96, (i + 1) / totalFrames));

        // Yalnızca 16 karede bir UI thread'e nefes ver
        if ((i & 15) === 15) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

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
    }
  }
}
// [END] CREATED BY Bedirhan
