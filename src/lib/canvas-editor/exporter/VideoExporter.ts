// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
import { CanvasEngine } from '../Engine';
import { StoryAudioMeta, VideoTrackClip } from '../types';
import { FastDemuxer, DemuxedVideoTrack } from './FastDemuxer';
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

// H.264 Baseline Profile öncelikli: B-Frame referans araması yapmadığı için donanım encoder'da %40 daha hızlıdır
const H264_CODEC_CANDIDATES = [
  'avc1.42001f', // Baseline Profile Level 3.1 (720p30 Ultra-Fast Hardware Encode)
  'avc1.42E01F', // Constrained Baseline Level 3.1 (720p30)
  'avc1.420028', // Baseline Profile Level 4.0
  'avc1.42E028', // Constrained Baseline Level 4.0
  'avc1.42002a', // Baseline Profile Level 4.2
  'avc1.42E02a', // Constrained Baseline Level 4.2
  'avc1.4d002a', // Main Profile Level 4.2
  'avc1.64002a', // High Profile Level 4.2
  'avc1.420032', // Baseline Profile Level 5.0
  'avc1.4d0032', // Main Profile Level 5.0
  'avc1.640032', // High Profile Level 5.0
  'avc1.640033', // High Profile Level 5.1
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
    this.sharedExportCtx.imageSmoothingEnabled = true;
    this.sharedExportCtx.imageSmoothingQuality = 'high';
    return {
      canvas: this.sharedExportCanvas,
      ctx: this.sharedExportCtx,
    };
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

  private static async getSourceVideoBuffer(
    engine: CanvasEngine,
    signal?: AbortSignal
  ): Promise<ArrayBuffer | null> {
    const media = engine.getMedia();
    if (!media || engine.getVideoState().isMotionPhoto) return null;
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
    } catch {
      // Kaynak okunamadıysa null dön
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
    fps: number,
    bitrate: number
  ): Promise<{ config: VideoEncoderConfig; width: number; height: number; fps: number } | null> {
    if (!this.isWebCodecsSupported()) return null;

    const targetW = (preferredWidth || 720) & ~1;
    const targetH = (preferredHeight || 1280) & ~1;
    // GÖREV B-FIX3: Çıktı kare hızı sabit 30 FPS (framerate: 30) olarak kilitlendi
    const targetFps = 30;

    const attempts: Array<{
      width: number;
      height: number;
      fps: number;
      bitrate: number;
      latencyMode?: LatencyMode;
    }> = [
      { width: targetW, height: targetH, fps: targetFps, bitrate, latencyMode: 'realtime' },
      { width: targetW, height: targetH, fps: targetFps, bitrate },
      { width: 720, height: 1280, fps: 30, bitrate: Math.min(bitrate, 4_800_000), latencyMode: 'realtime' },
      { width: 720, height: 1280, fps: 30, bitrate: Math.min(bitrate, 4_800_000) },
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
          ...(attempt.latencyMode ? { latencyMode: attempt.latencyMode } : {}),
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
          // Sonraki codec adayını dene
        }
      }
    }

    return null;
  }

  private static async renderMixedAudio(
    engine: CanvasEngine,
    outputDuration: number,
    sourceVideoBuffer: ArrayBuffer | null,
    music?: StoryAudioMeta | null,
    musicVolume = 0.85,
    signal?: AbortSignal
  ): Promise<AudioBuffer | null> {
    if (typeof OfflineAudioContext === 'undefined') return null;

    const state = engine.getVideoState();
    const isReelsNle =
      engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0;
    const clips = engine.getVideoClips();
    const hasVideoAudio = isReelsNle
      ? clips.some((c) => !c.isMotionPhoto && !c.muted && c.volume > 0)
      : !state.isMotionPhoto && !state.muted && state.volume > 0;
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

    if (hasVideoAudio) {
      try {
        const arrayBuf = sourceVideoBuffer ?? (await this.getSourceVideoBuffer(engine, signal));

        if (arrayBuf && arrayBuf.byteLength > 0) {
          const decodedVideoAudio = await offlineCtx.decodeAudioData(arrayBuf.slice(0));

          if (isReelsNle) {
            let accOutTime = 0;
            for (const clip of clips) {
              const clipOutDur = Math.max(0.1, clip.duration);
              if (!clip.isMotionPhoto && !clip.muted && clip.volume > 0) {
                const sourceNode = offlineCtx.createBufferSource();
                sourceNode.buffer = decodedVideoAudio;
                sourceNode.playbackRate.value = clip.playbackRate || 1.0;

                const gainNode = offlineCtx.createGain();
                gainNode.gain.value = Math.max(0, Math.min(1, clip.volume));

                sourceNode.connect(gainNode);
                gainNode.connect(offlineCtx.destination);

                const sourceDur = Math.max(0.1, clip.sourceEnd - clip.sourceStart);
                sourceNode.start(accOutTime, clip.sourceStart, sourceDur);
                hasAnySource = true;
              }
              accOutTime += clipOutDur;
            }
          } else {
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
        }
      } catch {
        // Videoda ses kanalı yoksa sessizce devam et
      }
    }

    if (hasMusicAudio && music?.streamUrl) {
      try {
        const resp = await fetch(music.streamUrl, { signal });
        if (resp.ok) {
          const musicBuf = await resp.arrayBuffer();
          if (musicBuf.byteLength > 0) {
            const decodedMusic = await offlineCtx.decodeAudioData(musicBuf.slice(0));

            if (isReelsNle && music.segments && music.segments.length > 0) {
              for (const seg of music.segments) {
                const segStart = Math.max(0, seg.timelineStart);
                const segEnd = Math.min(outputDuration, seg.timelineEnd);
                if (segEnd > segStart + 0.05) {
                  const musicNode = offlineCtx.createBufferSource();
                  musicNode.buffer = decodedMusic;
                  const musicGain = offlineCtx.createGain();
                  musicGain.gain.value = Math.max(0, Math.min(1, musicVolume));
                  musicNode.connect(musicGain);
                  musicGain.connect(offlineCtx.destination);

                  const offset = Math.max(
                    0,
                    (music.startTime || 0) + (seg.songOffset || 0)
                  );
                  musicNode.start(segStart, offset, segEnd - segStart);
                  hasAnySource = true;
                }
              }
            } else {
              const musicNode = offlineCtx.createBufferSource();
              musicNode.buffer = decodedMusic;

              const musicGain = offlineCtx.createGain();
              musicGain.gain.value = Math.max(0, Math.min(1, musicVolume));

              musicNode.connect(musicGain);
              musicGain.connect(offlineCtx.destination);

              const clipStart =
                typeof music.timelineStart === 'number' ? music.timelineStart : trimStart;
              const clipEnd =
                typeof music.timelineEnd === 'number' && music.timelineEnd > clipStart
                  ? music.timelineEnd
                  : trimEnd;
              const activeStart = Math.max(trimStart, clipStart);
              const activeEnd = Math.min(trimEnd, clipEnd);

              if (activeEnd > activeStart) {
                const effectiveRate = isReelsNle ? 1.0 : playbackRate;
                const delayInOutSec = Math.max(0, (activeStart - trimStart) / effectiveRate);
                const playDurInOutSec = Math.max(
                  0.05,
                  Math.min(outputDuration - delayInOutSec, (activeEnd - activeStart) / effectiveRate)
                );
                const songOffsetSec =
                  Math.max(0, music.startTime || 0) + Math.max(0, trimStart - clipStart);
                musicNode.start(delayInOutSec, songOffsetSec, playDurInOutSec);
                hasAnySource = true;
              }
            }
          }
        }
      } catch {
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

  /**
   * HAT 2: Sequential WebCodecs Pipeline (FastDemuxer + Donanım VideoDecoder -> GPU VideoFrame -> VideoEncoder)
   * Sıfır DOM <video> seek maliyetiyle GOP sırasına göre ardışık donanım decode/encode yapar.
   */
  private static async trySequentialWebCodecsExport(params: {
    engine: CanvasEngine;
    demuxed: DemuxedVideoTrack;
    clips: VideoTrackClip[];
    exportCanvas: HTMLCanvasElement;
    exportCtx: CanvasRenderingContext2D;
    exportWidth: number;
    exportHeight: number;
    fps: number;
    totalFrames: number;
    frameDurationUs: number;
    videoEncoder: VideoEncoder;
    getEncoderError: () => Error | null;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  }): Promise<boolean> {
    if (
      typeof VideoDecoder === 'undefined' ||
      typeof EncodedVideoChunk === 'undefined'
    ) {
      return false;
    }

    const {
      engine,
      demuxed,
      clips,
      exportCanvas,
      exportCtx,
      exportWidth,
      exportHeight,
      fps,
      totalFrames,
      frameDurationUs,
      videoEncoder,
      getEncoderError,
      onProgress,
      signal,
    } = params;

    const decoderConfig: VideoDecoderConfig = {
      codec: demuxed.codec,
      codedWidth: demuxed.width,
      codedHeight: demuxed.height,
      description: demuxed.description,
      hardwareAcceleration: 'prefer-hardware',
    };

    try {
      const support = await VideoDecoder.isConfigSupported(decoderConfig);
      if (!support.supported) {
        return false;
      }
    } catch {
      return false;
    }

    let globalOutFrameIdx = 0;
    let lastReportedPct = -1;
    let clipOutStartSec = 0;

    const reportFrameProgress = (frameIdx: number) => {
      const rawProgress = Math.min(0.96, (frameIdx + 1) / totalFrames);
      const pct = Math.floor(rawProgress * 100);
      if (pct !== lastReportedPct) {
        lastReportedPct = pct;
        onProgress?.(rawProgress);
      }
    };

    for (let cIdx = 0; cIdx < clips.length; cIdx++) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }

      const clip = clips[cIdx];
      if (engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0) {
        engine.applyClipTransformToMediaLayer(clip);
      }
      const clipRate = Math.max(0.25, clip.playbackRate || 1.0);
      const clipOutEndSec = clipOutStartSec + clip.duration;
      const clipEndFrameIdx =
        cIdx === clips.length - 1
          ? totalFrames
          : Math.min(totalFrames, Math.round(clipOutEndSec * fps));

      if (clipEndFrameIdx <= globalOutFrameIdx) {
        clipOutStartSec = clipOutEndSec;
        continue;
      }

      const samples = FastDemuxer.getSamplesForRange(
        demuxed,
        clip.sourceStart,
        clip.sourceEnd
      );
      if (samples.length === 0) {
        return false;
      }

      let decoderError: Error | null = null;
      let hasDrawnAnyFrameInClip = false;

      const renderAndEncodeWithFrame = (
        outIdx: number,
        decodedFrame?: VideoFrame
      ) => {
        const outTimeSec = outIdx / fps;
        // GÖREV B-FIX2: Video kliplerde skipRedraw kapalıdır; her kare mutlaka exportCanvas üzerine çizilir
        exportCtx.clearRect(0, 0, exportWidth, exportHeight);
        engine.drawBaseMedia(
          exportCtx,
          exportWidth,
          exportHeight,
          outTimeSec,
          decodedFrame
        );
        engine.drawCachedOverlays(exportCtx, exportWidth, exportHeight, outTimeSec);

        const outVf = new VideoFrame(exportCanvas, {
          timestamp: Math.round(outTimeSec * 1_000_000),
          duration: frameDurationUs,
        });
        try {
          videoEncoder.encode(outVf, { keyFrame: outIdx % (fps * 2) === 0 });
        } finally {
          outVf.close();
        }
        reportFrameProgress(outIdx);
      };

      const videoDecoder = new VideoDecoder({
        output: (decodedFrame) => {
          try {
            const frameSec = decodedFrame.timestamp / 1_000_000;
            const frameEndSec =
              (decodedFrame.timestamp + (decodedFrame.duration || 33_333)) /
              1_000_000;

            // Keyframe pre-roll aşamasındaki kareler: eğer ilk çıktı karesine çok yakınsa baz olarak çiz
            if (frameEndSec < clip.sourceStart - 0.02) {
              return;
            }

            while (globalOutFrameIdx < clipEndFrameIdx) {
              const outTimeSec = globalOutFrameIdx / fps;
              const targetSourceSec = Math.min(
                clip.sourceEnd,
                clip.sourceStart + Math.max(0, outTimeSec - clipOutStartSec) * clipRate
              );

              // Hedef kaynak zamanı bu karenin kapsama alanındaysa veya geçmişte kaldıysa üret
              if (targetSourceSec <= frameEndSec + 0.008 || frameSec >= clip.sourceEnd - 0.02) {
                renderAndEncodeWithFrame(globalOutFrameIdx, decodedFrame);
                hasDrawnAnyFrameInClip = true;
                globalOutFrameIdx++;
              } else {
                break;
              }
            }

            // Eğer henüz hiçbir çıktı karesi üretilmediyse ama kare clip.sourceStart civarındaysa tuvali hazırla
            if (!hasDrawnAnyFrameInClip && frameSec >= clip.sourceStart - 0.05) {
              const outTimeSec = globalOutFrameIdx / fps;
              exportCtx.clearRect(0, 0, exportWidth, exportHeight);
              engine.drawBaseMedia(
                exportCtx,
                exportWidth,
                exportHeight,
                outTimeSec,
                decodedFrame
              );
              engine.drawCachedOverlays(exportCtx, exportWidth, exportHeight, outTimeSec);
              hasDrawnAnyFrameInClip = true;
            }
          } catch (err) {
            decoderError = err instanceof Error ? err : new Error(String(err));
          } finally {
            // Kritik: GPU VideoFrame havuzunun tıkanmaması için anında kapat
            decodedFrame.close();
          }
        },
        error: (err) => {
          decoderError = err instanceof Error ? err : new Error(String(err));
        },
      });

      try {
        videoDecoder.configure(decoderConfig);

        for (let sIdx = 0; sIdx < samples.length; sIdx++) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          if (decoderError || getEncoderError()) {
            break;
          }

          const s = samples[sIdx];
          const chunk = new EncodedVideoChunk({
            type: s.isKeyframe ? 'key' : 'delta',
            timestamp: s.timestampUs,
            duration: s.durationUs,
            data: s.data,
          });
          videoDecoder.decode(chunk);

          // Donanım decoder ve encoder kuyruklarını dengede tut (Backpressure)
          while (
            videoDecoder.decodeQueueSize > 14 ||
            videoEncoder.encodeQueueSize > 12
          ) {
            if (signal?.aborted) {
              throw new DOMException('Export cancelled', 'AbortError');
            }
            if (decoderError || getEncoderError()) break;
            await this.yieldToMain();
          }
        }

        if (!decoderError && !getEncoderError()) {
          await videoDecoder.flush();
        }
      } catch (err) {
        try {
          if (videoDecoder.state !== 'closed') videoDecoder.close();
        } catch {}
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        return false;
      } finally {
        try {
          if (videoDecoder.state !== 'closed') videoDecoder.close();
        } catch {}
      }

      if (decoderError) {
        // İlk klipte hiç kare basılmadan hata aldıysa Hat 3'e düş
        if (globalOutFrameIdx === 0 && !hasDrawnAnyFrameInClip) {
          return false;
        }
      }

      // Klip sonundaki kalan son 1-2 kuyruk karesini (varsa) son çizilen tuvalden tamamla
      if (!hasDrawnAnyFrameInClip && globalOutFrameIdx === 0) {
        return false;
      }

      while (globalOutFrameIdx < clipEndFrameIdx) {
        if (signal?.aborted) {
          throw new DOMException('Export cancelled', 'AbortError');
        }
        renderAndEncodeWithFrame(globalOutFrameIdx, undefined);
        globalOutFrameIdx++;
        while (videoEncoder.encodeQueueSize > 12) {
          await this.yieldToMain();
        }
      }

      clipOutStartSec = clipOutEndSec;
    }

    return globalOutFrameIdx >= totalFrames;
  }

  /**
   * HAT 3: Sequential Forward Playback (Sıfır Geriye Seek / Tek Seferlik Başlangıç Seek + Ardışık İleri Akış)
   * FastDemuxer ile ayrılamayan (örn. WebM, fMP4) videolar için kare-kare rastgele seek yapmak yerine
   * klip başına yalnızca 1 kez başlangıca konumlanır ve ileri yönde doğal GOP sırasıyla kare yakalar.
   */
  private static async exportWithSequentialForwardPlayback(params: {
    engine: CanvasEngine;
    clips: VideoTrackClip[];
    exportCanvas: HTMLCanvasElement;
    exportCtx: CanvasRenderingContext2D;
    exportWidth: number;
    exportHeight: number;
    fps: number;
    totalFrames: number;
    frameDurationUs: number;
    videoEncoder: VideoEncoder;
    getEncoderError: () => Error | null;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    const {
      engine,
      clips,
      exportCanvas,
      exportCtx,
      exportWidth,
      exportHeight,
      fps,
      totalFrames,
      frameDurationUs,
      videoEncoder,
      getEncoderError,
      onProgress,
      signal,
    } = params;

    const media = engine.getMedia();
    const videoEl =
      media?.element instanceof HTMLVideoElement ? media.element : null;

    let globalOutFrameIdx = 0;
    let lastReportedPct = -1;
    let clipOutStartSec = 0;

    const seekOnce = async (v: HTMLVideoElement, targetSec: number) => {
      const clamped = Math.max(
        0,
        Math.min(v.duration || targetSec, targetSec)
      );
      if (Math.abs(v.currentTime - clamped) <= 0.015) return;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          v.removeEventListener('seeked', finish);
          resolve();
        };
        v.addEventListener('seeked', finish, { once: true });
        v.currentTime = clamped;
        setTimeout(finish, 180);
      });
    };

    for (let cIdx = 0; cIdx < clips.length; cIdx++) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }

      const clip = clips[cIdx];
      const clipRate = Math.max(0.25, clip.playbackRate || 1.0);
      const clipOutEndSec = clipOutStartSec + clip.duration;
      const clipEndFrameIdx =
        cIdx === clips.length - 1
          ? totalFrames
          : Math.min(totalFrames, Math.round(clipOutEndSec * fps));

      if (videoEl && !clip.isMotionPhoto) {
        videoEl.pause();
        videoEl.muted = true;
        // Klip başında YALNIZCA 1 KEZ seek yap
        await seekOnce(videoEl, clip.sourceStart);
      }

      while (globalOutFrameIdx < clipEndFrameIdx) {
        if (signal?.aborted) {
          throw new DOMException('Export cancelled', 'AbortError');
        }
        const encErr = getEncoderError();
        if (encErr) throw encErr;

        const outTimeSec = globalOutFrameIdx / fps;
        const targetSourceSec = Math.min(
          clip.sourceEnd,
          clip.sourceStart + Math.max(0, outTimeSec - clipOutStartSec) * clipRate
        );

        if (videoEl && !clip.isMotionPhoto) {
          // Yalnızca ileri yönde (monotonik) küçük adım ilerle
          if (targetSourceSec - videoEl.currentTime > 0.02) {
            await seekOnce(videoEl, targetSourceSec);
          }
        }

        exportCtx.clearRect(0, 0, exportWidth, exportHeight);
        engine.drawBaseMedia(exportCtx, exportWidth, exportHeight, outTimeSec);
        engine.drawCachedOverlays(exportCtx, exportWidth, exportHeight, outTimeSec);

        const videoFrame = new VideoFrame(exportCanvas, {
          timestamp: Math.round(outTimeSec * 1_000_000),
          duration: frameDurationUs,
        });

        try {
          videoEncoder.encode(videoFrame, {
            keyFrame: globalOutFrameIdx % (fps * 2) === 0,
          });
        } finally {
          videoFrame.close();
        }

        while (videoEncoder.encodeQueueSize > 12) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          await this.yieldToMain();
        }

        const rawProgress = Math.min(0.96, (globalOutFrameIdx + 1) / totalFrames);
        const pct = Math.floor(rawProgress * 100);
        if (pct !== lastReportedPct) {
          lastReportedPct = pct;
          onProgress?.(rawProgress);
        }

        if (globalOutFrameIdx % 24 === 23) {
          await this.yieldToMain();
        }

        globalOutFrameIdx++;
      }

      clipOutStartSec = clipOutEndSec;
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

    // GÖREV B-FIX3: 720p (720x1280) ve sabit 30 FPS standardı (kaynak 30 FPS videolarla 1:1 tam kare eşleşmesi)
    const preferredW = options?.width || 720;
    const preferredH = options?.height || 1280;
    const requestedFps = 30;
    const bitrate = options?.bitrate || 4_800_000;
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
    const isReelsNle =
      engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0;
    const trimStart = state.trimStart;
    const trimEnd = state.trimEnd > trimStart ? state.trimEnd : state.duration;
    const playbackRate = state.playbackRate || 1.0;
    const sourceTrimDuration = Math.max(0.1, Math.min(60, trimEnd - trimStart));
    const outputDuration = isReelsNle
      ? Math.max(0.2, Math.min(60, engine.getTotalTimelineDuration()))
      : Math.max(0.1, sourceTrimDuration / playbackRate);
    const totalFrames = Math.max(1, Math.round(outputDuration * fps));

    engine.setExportingVideo(true);

    let videoEncoder: VideoEncoder | null = null;
    let audioEncoder: AudioEncoder | null = null;

    try {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }

      // 1. Kaynak video belleğini, ses miksajını ve mp4-muxer yüklemesini paralel hazırla
      const aacConfig: AudioEncoderConfig = {
        codec: 'mp4a.40.2',
        sampleRate: 44100,
        numberOfChannels: 2,
        bitrate: 192_000,
      };

      const audioSupportPromise =
        typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined'
          ? AudioEncoder.isConfigSupported(aacConfig)
              .then((s) => Boolean(s.supported))
              .catch(() => false)
          : Promise.resolve(false);

      const [audioConfigSupported, { Muxer, ArrayBufferTarget }, sourceVideoBuffer] =
        await Promise.all([
          audioSupportPromise,
          import('mp4-muxer'),
          this.getSourceVideoBuffer(engine, signal),
        ]);

      const renderedAudio = audioConfigSupported
        ? await this.renderMixedAudio(
            engine,
            outputDuration,
            sourceVideoBuffer,
            options?.music,
            options?.musicVolume ?? 0.85,
            signal
          )
        : null;

      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }

      // 2. mp4-muxer kurulumu
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

      // 3. Paylaşımlı 720p çizim tuvali (Döngü dışında tek seferlik boyutlandırma ve tahsis)
      const { canvas: exportCanvas, ctx: exportCtx } = this.getExportSurface(
        exportWidth,
        exportHeight
      );
      const frameDurationUs = Math.round((1 / fps) * 1_000_000);

      // ─────────────────────────────────────────────────────────────
      // "FRAME-LOCKED" GERÇEK 30 FPS SENKRONİZE RENDER PIPELINE
      // ─────────────────────────────────────────────────────────────
      if (engine.isPureStaticExport()) {
        // HAT 1: ZERO-REDRAW FRAME CLONING (~0.2s - Yalnızca Statik Fotoğraf 'image' Kliplerinde!)
        // Sahneyi döngü dışında YALNIZCA 1 KEZ (N=1) çiz, döngü içinde sadece GPU VideoFrame referansı klonla!
        exportCtx.clearRect(0, 0, exportWidth, exportHeight);
        engine.drawBaseMedia(exportCtx, exportWidth, exportHeight, 0);
        engine.drawCachedOverlays(exportCtx, exportWidth, exportHeight, 0);

        let lastReportedPct = -1;
        for (let i = 0; i < totalFrames; i++) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          if (encoderError) throw encoderError;

          const videoFrame = new VideoFrame(exportCanvas, {
            timestamp: i * frameDurationUs,
            duration: frameDurationUs,
          });

          try {
            videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
          } finally {
            videoFrame.close();
          }

          while (videoEncoder.encodeQueueSize > 12) {
            if (signal?.aborted) {
              throw new DOMException('Export cancelled', 'AbortError');
            }
            await this.yieldToMain();
          }

          const rawProgress = Math.min(0.96, (i + 1) / totalFrames);
          const pct = Math.floor(rawProgress * 100);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            options?.onProgress?.(rawProgress);
          }
        }
      } else if (state.isMotionPhoto) {
        // HAT 1B: Dinamik Efektli veya Zamanlı Katmanlı Fotoğraf (Sıfır <video> seek!)
        let lastReportedPct = -1;
        for (let i = 0; i < totalFrames; i++) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          if (encoderError) throw encoderError;

          const outTimeSec = i / fps;
          exportCtx.clearRect(0, 0, exportWidth, exportHeight);
          engine.drawBaseMedia(exportCtx, exportWidth, exportHeight, outTimeSec);
          engine.drawCachedOverlays(exportCtx, exportWidth, exportHeight, outTimeSec);

          const videoFrame = new VideoFrame(exportCanvas, {
            timestamp: Math.round(outTimeSec * 1_000_000),
            duration: frameDurationUs,
          });

          try {
            videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
          } finally {
            videoFrame.close();
          }

          while (videoEncoder.encodeQueueSize > 12) {
            if (signal?.aborted) {
              throw new DOMException('Export cancelled', 'AbortError');
            }
            await this.yieldToMain();
          }

          const rawProgress = Math.min(0.96, (i + 1) / totalFrames);
          const pct = Math.floor(rawProgress * 100);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            options?.onProgress?.(rawProgress);
          }

          if (i % 24 === 23) {
            await this.yieldToMain();
          }
        }
      } else {
        // GÖREV B-FIX1, B-FIX2 & B-FIX3: Gerçek Video Klipleri (Frame-Locked 30 FPS 1:1 Senkronizasyon)
        // Video kliplerde skipRedraw kesinlikle kapalıdır; her kare gerçek seeked olayı beklenerek (600ms emniyet sınırı, sıfır seek abort)
        // exportCanvas üzerine çizilir ve 30 FPS kaynak videoyla 1:1 tam kare eşleşmesi sağlanır.
        const mediaEl = engine.getMedia()?.element;
        if (mediaEl instanceof HTMLVideoElement) {
          try {
            mediaEl.pause();
            mediaEl.muted = true;
          } catch {}
        }

        let lastReportedPct = -1;
        for (let i = 0; i < totalFrames; i++) {
          if (signal?.aborted) {
            throw new DOMException('Export cancelled', 'AbortError');
          }
          if (encoderError) {
            throw encoderError;
          }

          const outTimeSec = i / fps;
          const sourceTimeSec = isReelsNle
            ? Math.min(outputDuration, outTimeSec)
            : Math.min(trimEnd, trimStart + outTimeSec * playbackRate);

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

          while (videoEncoder.encodeQueueSize > 12) {
            if (signal?.aborted) {
              throw new DOMException('Export cancelled', 'AbortError');
            }
            await this.yieldToMain();
          }

          const rawProgress = Math.min(0.96, (i + 1) / totalFrames);
          const pct = Math.floor(rawProgress * 100);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            options?.onProgress?.(rawProgress);
          }
        }
      }

      if (encoderError) {
        throw encoderError;
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
