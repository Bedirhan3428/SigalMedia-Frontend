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
  'avc1.64002a', // High Profile Level 4.2
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.42002a', // Baseline Profile Level 4.2
  'avc1.42E02a', // Constrained Baseline Level 4.2
  'avc1.420028', // Baseline Profile Level 4.0
  'avc1.42E01F', // Constrained Baseline Level 3.1 (720p)
];

export class VideoExporter {
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
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) {
      return true;
    }
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) {
      return true;
    }
    return false;
  }

  private static async findSupportedVideoConfig(
    preferredWidth: number,
    preferredHeight: number,
    fps: number,
    bitrate: number
  ): Promise<{ config: VideoEncoderConfig; width: number; height: number } | null> {
    if (!this.isWebCodecsSupported()) return null;

    const resolutions = [
      { width: preferredWidth & ~1, height: preferredHeight & ~1, bitrate },
      { width: 720, height: 1280, bitrate: Math.min(bitrate, 3_500_000) },
    ];

    for (const res of resolutions) {
      for (const codec of H264_CODEC_CANDIDATES) {
        const candidate: VideoEncoderConfig = {
          codec,
          width: res.width,
          height: res.height,
          bitrate: res.bitrate,
          framerate: fps,
          avc: { format: 'avc' },
        };
        try {
          const support = await VideoEncoder.isConfigSupported(candidate);
          if (support.supported) {
            return {
              config: support.config || candidate,
              width: res.width,
              height: res.height,
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
          sourceNode.playbackRate.value = state.playbackRate || 1.0;

          const gainNode = offlineCtx.createGain();
          gainNode.gain.value = Math.max(0, Math.min(1, state.volume));

          sourceNode.connect(gainNode);
          gainNode.connect(offlineCtx.destination);

          const trimDur = Math.max(0.1, state.trimEnd - state.trimStart);
          sourceNode.start(0, state.trimStart, trimDur);
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

            musicNode.start(0, music.startTime || 0, outputDuration);
            hasAnySource = true;
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
    const fps = options?.fps || 30;
    const bitrate = options?.bitrate || (use720p ? 3_500_000 : 5_500_000);
    const signal = options?.signal;

    const supportedVideo = await this.findSupportedVideoConfig(
      preferredW,
      preferredH,
      fps,
      bitrate
    );

    if (!supportedVideo) {
      return MediaRecorderFallback.exportToBlob(engine, {
        width: 720,
        height: 1280,
        fps,
        bitrate: 3_500_000,
        music: options?.music,
        musicVolume: options?.musicVolume,
        onProgress: options?.onProgress,
        signal,
      });
    }

    const { config: videoConfig, width: exportWidth, height: exportHeight } = supportedVideo;
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
        bitrate: 128_000,
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

        // Sesi 4096 örnekli bloklar halinde kodla
        const ch0 = renderedAudio.getChannelData(0);
        const ch1 =
          renderedAudio.numberOfChannels > 1
            ? renderedAudio.getChannelData(1)
            : renderedAudio.getChannelData(0);
        const chunkFrames = 4096;
        for (let offset = 0; offset < renderedAudio.length; offset += chunkFrames) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          const frameCount = Math.min(chunkFrames, renderedAudio.length - offset);
          const planar = new Float32Array(frameCount * 2);
          planar.set(ch0.subarray(offset, offset + frameCount), 0);
          planar.set(ch1.subarray(offset, offset + frameCount), frameCount);

          const timestampUs = Math.round((offset / 44100) * 1_000_000);
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: 44100,
            numberOfFrames: frameCount,
            numberOfChannels: 2,
            timestamp: timestampUs,
            data: planar,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
      }

      // 3. Çizim tuvali (OffscreenCanvas veya gizli HTMLCanvasElement)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportWidth;
      exportCanvas.height = exportHeight;
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) {
        throw new Error('Export 2D context oluşturulamadı');
      }

      const frameDurationUs = Math.round((1 / fps) * 1_000_000);

      // 4. Kare kare render ve H.264 encode döngüsü
      for (let i = 0; i < totalFrames; i++) {
        if (signal?.aborted) {
          throw new DOMException('Export cancelled', 'AbortError');
        }
        if (encoderError) {
          throw encoderError;
        }

        const outTimeSec = i / fps;
        const sourceTimeSec = Math.min(trimEnd, trimStart + outTimeSec * playbackRate);

        await engine.renderFrameAt(exportCtx, sourceTimeSec, exportWidth, exportHeight);

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

        // Kuyruk doluluğu kontrolü (Backpressure)
        while (videoEncoder.encodeQueueSize > 8) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          await new Promise((r) => setTimeout(r, 8));
        }

        options?.onProgress?.(Math.min(0.96, (i + 1) / totalFrames));

        // Her karede UI thread'e nefes ver
        await new Promise((r) => setTimeout(r, 0));
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
