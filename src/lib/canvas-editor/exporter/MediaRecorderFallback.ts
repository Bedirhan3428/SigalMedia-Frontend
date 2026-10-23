// [START] CREATED BY Bedirhan
// [MODIFIED BY Umut]
import { CanvasEngine } from '../Engine';
import { StoryAudioMeta, VideoTrackClip } from '../types';
import { applyMusicFadeToGain } from '../utils/musicFade';

export interface MediaRecorderExportOptions {
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  music?: StoryAudioMeta | null;
  musicVolume?: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

// [START] CREATED BY Umut
export interface SequentialPlaybackEncoderParams {
  engine: CanvasEngine;
  exportCanvas: HTMLCanvasElement;
  exportCtx: CanvasRenderingContext2D;
  exportWidth: number;
  exportHeight: number;
  fps: number;
  outputDuration: number;
  videoEncoder: VideoEncoder;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  getEncoderError?: () => Error | null;
}

export interface ParallelAudioMuxTarget {
  addAudioChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void;
}

type RVFCHandle = number;
type RVFCCallback = (now: DOMHighResTimeStamp, metadata: { mediaTime?: number }) => void;
type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: RVFCCallback) => RVFCHandle;
  cancelVideoFrameCallback?: (handle: RVFCHandle) => void;
};
// [END] CREATED BY Umut

export class MediaRecorderFallback {
  // [START] CREATED BY Umut
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

  public static async waitForEncoderDrain(
    videoEncoder: VideoEncoder,
    signal?: AbortSignal,
    maxQueue = 12
  ): Promise<void> {
    while (videoEncoder.state === 'configured' && videoEncoder.encodeQueueSize > maxQueue) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try {
            videoEncoder.removeEventListener('dequeue', finish);
          } catch {}
          resolve();
        };
        try {
          videoEncoder.addEventListener('dequeue', finish, { once: true });
        } catch {}
        setTimeout(finish, 8);
      });
    }
  }

  /**
   * Tek Seferlik Seek (Zero-Seek Kuralı):
   * Video elementi yalnızca klip başlangıcına (trimStart / sourceStart) 1 kez çekilir.
   * Kare döngüsü içinde asla video.currentTime = t yapılmaz!
   */
  public static async seekVideoOnce(
    video: HTMLVideoElement,
    targetTimeSec: number,
    signal?: AbortSignal
  ): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException('Export cancelled', 'AbortError');
    }
    const clampedTarget = Math.max(0, targetTimeSec);
    if (Math.abs(video.currentTime - clampedTarget) <= 0.03 && !video.seeking) {
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('seeked', finish);
        video.removeEventListener('error', finish);
        resolve();
      };
      const timer = setTimeout(finish, 350);
      const onDone = () => {
        clearTimeout(timer);
        finish();
      };
      video.addEventListener('seeked', onDone, { once: true });
      video.addEventListener('error', onDone, { once: true });
      try {
        video.currentTime = clampedTarget;
      } catch {
        clearTimeout(timer);
        finish();
      }
    });
  }

  /**
   * Donanım çözücünün desteklediği en yüksek sıralı oynatma hızını (4x - 8x) seçer.
   */
  private static applyHighSpeedPlaybackRate(video: HTMLVideoElement, baseRate = 1.0): number {
    const candidates = [
      Math.min(8.0, Math.max(4.0, baseRate * 6.0)),
      4.0,
      2.0,
      1.0,
    ];
    for (const rate of candidates) {
      try {
        video.playbackRate = rate;
        if (video.playbackRate >= 1.0) {
          return video.playbackRate;
        }
      } catch {
        // Tarayıcı yüksek çarpanı reddederse bir alt çarpana düş
      }
    }
    return 1.0;
  }

  /**
   * Engine üzerinde @Bedirhan'ın ayrıştırdığı drawBaseMedia + drawCachedOverlays varsa onu,
   * yoksa renderClean'i çağırarak tek hamlede tuvali günceller (0 seek).
   */
  private static drawCurrentFrameZeroSeek(
    engine: CanvasEngine,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timelineTimeSec: number
  ): void {
    engine.syncTemporalVisibility(timelineTimeSec);
    const anyEngine = engine as unknown as {
      drawBaseMedia?: (c: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
      drawCachedOverlays?: (c: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
    };
    if (
      typeof anyEngine.drawBaseMedia === 'function' &&
      typeof anyEngine.drawCachedOverlays === 'function'
    ) {
      anyEngine.drawBaseMedia(ctx, width, height, timelineTimeSec);
      anyEngine.drawCachedOverlays(ctx, width, height, timelineTimeSec);
    } else {
      engine.renderClean(ctx, width, height);
    }
  }

  /**
   * HAT 3: Sıralı Akış Fallback'i (WebCodecs VideoEncoder Boru Hattı İçin)
   * Demuxer'ın açamadığı durumlarda <video> elementini trimStart'a YALNIZCA 1 KEZ alır,
   * playbackRate = 4.0 (veya 8.0) ile doğal GOP sırasıyla oynatır ve requestVideoFrameCallback
   * ile yakalanan kareleri doğrudan VideoEncoder kuyruğuna basar.
   */
  public static async streamSequentialPlaybackToEncoder(
    params: SequentialPlaybackEncoderParams
  ): Promise<void> {
    const {
      engine,
      exportCanvas,
      exportCtx,
      exportWidth,
      exportHeight,
      fps,
      outputDuration,
      videoEncoder,
      onProgress,
      signal,
      getEncoderError,
    } = params;

    const state = engine.getVideoState();
    const isReelsNle =
      engine.getShareMode() === 'reels' && engine.getVideoClips().length > 0;
    const totalFrames = Math.max(1, Math.round(outputDuration * fps));
    const frameDurationUs = Math.round((1 / fps) * 1_000_000);
    const keyFrameInterval = Math.max(30, fps * 2);

    interface SegmentTask {
      clip: VideoTrackClip | null;
      sourceStart: number;
      sourceEnd: number;
      playbackRate: number;
      timelineStart: number;
      duration: number;
      frameCount: number;
      isMotionPhoto: boolean;
    }

    const segments: SegmentTask[] = [];
    if (isReelsNle) {
      let accTime = 0;
      const clips = engine.getVideoClips();
      let allocatedFrames = 0;
      for (let idx = 0; idx < clips.length; idx++) {
        const clip = clips[idx];
        const dur = Math.max(0.1, clip.duration);
        const isLast = idx === clips.length - 1;
        const fCount = isLast
          ? Math.max(1, totalFrames - allocatedFrames)
          : Math.max(1, Math.round(dur * fps));
        allocatedFrames += fCount;
        segments.push({
          clip,
          sourceStart: clip.sourceStart,
          sourceEnd: Math.max(clip.sourceStart + 0.05, clip.sourceEnd),
          playbackRate: clip.playbackRate || 1.0,
          timelineStart: accTime,
          duration: dur,
          frameCount: fCount,
          isMotionPhoto: Boolean(clip.isMotionPhoto),
        });
        accTime += dur;
      }
    } else {
      const trimStart = state.trimStart;
      const trimEnd = state.trimEnd > trimStart ? state.trimEnd : state.duration;
      segments.push({
        clip: null,
        sourceStart: trimStart,
        sourceEnd: Math.max(trimStart + 0.05, trimEnd),
        playbackRate: state.playbackRate || 1.0,
        timelineStart: 0,
        duration: outputDuration,
        frameCount: totalFrames,
        isMotionPhoto: Boolean(state.isMotionPhoto),
      });
    }

    let globalFrameIndex = 0;
    let lastReportedPct = -1;

    const reportFrameProgress = () => {
      if (!onProgress) return;
      const rawProgress = Math.min(0.96, globalFrameIndex / totalFrames);
      const pct = Math.floor(rawProgress * 100);
      if (pct !== lastReportedPct) {
        lastReportedPct = pct;
        onProgress(rawProgress);
      }
    };

    const encodeCurrentCanvasFrame = async () => {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      const encErr = getEncoderError?.();
      if (encErr) throw encErr;

      await this.waitForEncoderDrain(videoEncoder, signal, 12);

      const timestampUs = Math.round((globalFrameIndex / fps) * 1_000_000);
      const vFrame = new VideoFrame(exportCanvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });
      try {
        videoEncoder.encode(vFrame, {
          keyFrame: globalFrameIndex % keyFrameInterval === 0,
        });
      } finally {
        vFrame.close();
      }
      globalFrameIndex++;
      reportFrameProgress();
    };

    for (const seg of segments) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled', 'AbortError');
      }
      if (seg.clip) {
        engine.applyClipTransformToMediaLayer(seg.clip);
      }
      const mediaLayer = engine.getMediaLayer();

      // Statik / MotionPhoto segmenti: Zero-Seek & Zero-Redraw Frame Cloning
      if (seg.isMotionPhoto || !mediaLayer?.getVideoElement()) {
        let initialDrawn = false;
        for (let localIdx = 0; localIdx < seg.frameCount; localIdx++) {
          const timelineTimeSec = seg.timelineStart + localIdx / fps;
          const visChanged = engine.syncTemporalVisibility(timelineTimeSec);
          const isAnim = mediaLayer
            ? mediaLayer.isActiveEffectTimeDependentAt(timelineTimeSec)
            : false;
          if (!initialDrawn || visChanged || isAnim) {
            if (mediaLayer) {
              mediaLayer.virtualTime = timelineTimeSec;
              mediaLayer.timelineTime = timelineTimeSec;
            }
            this.drawCurrentFrameZeroSeek(
              engine,
              exportCtx,
              exportWidth,
              exportHeight,
              timelineTimeSec
            );
            initialDrawn = true;
          }
          await encodeCurrentCanvasFrame();
          if ((localIdx & 31) === 31) {
            await this.yieldToMain();
          }
        }
        continue;
      }

      // Gerçek Video Segmenti: Yalnızca 1 Kez Seek + 4x-8x Doğal GOP Oynatma + requestVideoFrameCallback
      const video = mediaLayer.getVideoElement() as VideoWithRVFC | null;
      if (!video) continue;

      const prevMuted = video.muted;
      const prevRate = video.playbackRate;

      try {
        video.pause();
        video.muted = true;

        // KURAL: Sadece başlangıç noktasına 1 kez seek yapılır!
        await this.seekVideoOnce(video, seg.sourceStart, signal);

        // İlk kareyi hemen çiz
        mediaLayer.timelineTime = seg.timelineStart;
        this.drawCurrentFrameZeroSeek(
          engine,
          exportCtx,
          exportWidth,
          exportHeight,
          seg.timelineStart
        );

        const activeRate = this.applyHighSpeedPlaybackRate(video, seg.playbackRate);
        const sourceStepPerFrame = seg.playbackRate / fps;
        let emittedInSegment = 0;

        await new Promise<void>((resolve, reject) => {
          let finished = false;
          let rvfcHandle: RVFCHandle | null = null;
          let watchdogId: ReturnType<typeof setTimeout> | null = null;
          let processingTick = false;

          const cleanupSeg = () => {
            finished = true;
            if (
              rvfcHandle !== null &&
              typeof video.cancelVideoFrameCallback === 'function'
            ) {
              try {
                video.cancelVideoFrameCallback(rvfcHandle);
              } catch {}
              rvfcHandle = null;
            }
            if (watchdogId !== null) {
              clearTimeout(watchdogId);
              watchdogId = null;
            }
            try {
              video.pause();
            } catch {}
          };

          const onAbort = () => {
            cleanupSeg();
            reject(new DOMException('Export cancelled', 'AbortError'));
          };

          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener('abort', onAbort, { once: true });

          const scheduleNextFrame = () => {
            if (finished) return;
            if (typeof video.requestVideoFrameCallback === 'function') {
              rvfcHandle = video.requestVideoFrameCallback((_now, meta) => {
                void onVideoFrame(meta?.mediaTime ?? video.currentTime);
              });
            }
            if (watchdogId !== null) clearTimeout(watchdogId);
            watchdogId = setTimeout(() => {
              void onVideoFrame(video.currentTime);
            }, 16);
          };

          const onVideoFrame = async (currentMediaTime: number) => {
            if (finished || processingTick) return;
            processingTick = true;
            try {
              if (signal?.aborted) {
                onAbort();
                return;
              }
              const encErr = getEncoderError?.();
              if (encErr) {
                cleanupSeg();
                signal?.removeEventListener('abort', onAbort);
                reject(encErr);
                return;
              }

              const reachedEnd =
                currentMediaTime >= seg.sourceEnd - 0.02 ||
                video.ended ||
                emittedInSegment >= seg.frameCount;

              // Bu mediaTime'a kadar gelmiş olan çıktı karelerini yakala ve kodla
              let drewForThisMediaTime = false;
              while (emittedInSegment < seg.frameCount) {
                const targetSourceTime =
                  seg.sourceStart + emittedInSegment * sourceStepPerFrame;
                if (!reachedEnd && targetSourceTime > currentMediaTime + sourceStepPerFrame * 0.55) {
                  break;
                }

                const timelineTimeSec = seg.timelineStart + emittedInSegment / fps;
                const visChanged = engine.syncTemporalVisibility(timelineTimeSec);
                const isAnim = mediaLayer.isActiveEffectTimeDependentAt(timelineTimeSec);

                if (!drewForThisMediaTime || visChanged || isAnim) {
                  mediaLayer.timelineTime = timelineTimeSec;
                  this.drawCurrentFrameZeroSeek(
                    engine,
                    exportCtx,
                    exportWidth,
                    exportHeight,
                    timelineTimeSec
                  );
                  drewForThisMediaTime = true;
                }

                // Backpressure yüksekse videoyu anlık beklet, kuyruk boşalınca devam et
                if (videoEncoder.encodeQueueSize > 12 && !video.paused) {
                  try {
                    video.pause();
                  } catch {}
                }

                await encodeCurrentCanvasFrame();
                emittedInSegment++;
              }

              if (emittedInSegment >= seg.frameCount || reachedEnd) {
                cleanupSeg();
                signal?.removeEventListener('abort', onAbort);
                resolve();
                return;
              }

              if (video.paused && !video.ended && !finished) {
                video.playbackRate = activeRate;
                video.play().catch(() => {});
              }

              scheduleNextFrame();
            } catch (err) {
              cleanupSeg();
              signal?.removeEventListener('abort', onAbort);
              reject(err);
            } finally {
              processingTick = false;
            }
          };

          video
            .play()
            .then(() => {
              scheduleNextFrame();
            })
            .catch(() => {
              // Autoplay engeli veya hata durumunda ilk kareyi baz alarak tamamla
              void onVideoFrame(seg.sourceEnd);
            });
        });

        // Kalan son birkaç kare varsa mevcut GPU yüzeyinden tamamla
        while (emittedInSegment < seg.frameCount) {
          const timelineTimeSec = seg.timelineStart + emittedInSegment / fps;
          if (engine.syncTemporalVisibility(timelineTimeSec)) {
            this.drawCurrentFrameZeroSeek(
              engine,
              exportCtx,
              exportWidth,
              exportHeight,
              timelineTimeSec
            );
          }
          await encodeCurrentCanvasFrame();
          emittedInSegment++;
        }
      } finally {
        try {
          video.pause();
          video.playbackRate = prevRate;
          video.muted = prevMuted;
        } catch {}
      }
    }
  }

  /**
   * Paralel Ses Miksajı (OfflineAudioContext) + AAC (mp4a.40.2) Kodlama & mp4-muxer Senkronizasyonu:
   * Video GPU'da kodlanırken paralel çalışabilir veya önceden çözülmüş AudioBuffer'ı
   * 4096'lık planar bloklar halinde mp4-muxer'a zaman damgası senkronuyla yazar.
   */
  public static async encodeAudioBufferToMuxer(
    renderedAudio: AudioBuffer,
    muxer: ParallelAudioMuxTarget,
    aacConfig: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 128_000,
    },
    signal?: AbortSignal,
    onError?: (err: Error) => void
  ): Promise<void> {
    if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
      return;
    }

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (err) => {
        const normalized = err instanceof Error ? err : new Error(String(err));
        onError?.(normalized);
      },
    });

    try {
      audioEncoder.configure(aacConfig);

      const sampleRate = renderedAudio.sampleRate || 44100;
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

        const timestampUs = Math.round((offset / sampleRate) * 1_000_000);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: frameCount,
          numberOfChannels: 2,
          timestamp: timestampUs,
          data: planarView,
        });
        try {
          audioEncoder.encode(audioData);
        } finally {
          audioData.close();
        }

        if (audioEncoder.encodeQueueSize > 24) {
          await this.yieldToMain();
        }
      }

      await audioEncoder.flush();
    } finally {
      try {
        if (audioEncoder.state !== 'closed') {
          audioEncoder.close();
        }
      } catch {}
    }
  }

  /**
   * OfflineAudioContext ile video kliplerinin ve müziğin (bölünmüş segmentler dahil)
   * 44.1kHz stereo miksajını üretir.
   */
  public static async renderMixedAudio(
    engine: CanvasEngine,
    outputDuration: number,
    music?: StoryAudioMeta | null,
    musicVolume = 0.85,
    signal?: AbortSignal
  ): Promise<AudioBuffer | null> {
    if (typeof OfflineAudioContext === 'undefined') return null;

    const state = engine.getVideoState();
    const media = engine.getMedia();
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
        // Video ses kanalı içermiyor olabilir; sessizce devam et
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
              const fadeRange = {
                start: Math.max(0, Math.min(...music.segments.map((sg) => sg.timelineStart))),
                end: Math.min(outputDuration, Math.max(...music.segments.map((sg) => sg.timelineEnd))),
              };
              for (const seg of music.segments) {
                const segStart = Math.max(0, seg.timelineStart);
                const segEnd = Math.min(outputDuration, seg.timelineEnd);
                if (segEnd > segStart + 0.05) {
                  const musicNode = offlineCtx.createBufferSource();
                  musicNode.buffer = decodedMusic;
                  const musicGain = offlineCtx.createGain();
                  applyMusicFadeToGain(
                    musicGain,
                    music,
                    Math.max(0, Math.min(1, musicVolume)),
                    segStart,
                    segEnd,
                    fadeRange
                  );
                  musicNode.connect(musicGain);
                  musicGain.connect(offlineCtx.destination);

                  const offset = Math.max(0, seg.songOffset || 0);
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
                  Math.min(
                    outputDuration - delayInOutSec,
                    (activeEnd - activeStart) / effectiveRate
                  )
                );
                const songOffsetSec =
                  Math.max(0, music.startTime || 0) + Math.max(0, trimStart - clipStart);
                applyMusicFadeToGain(
                  musicGain,
                  music,
                  Math.max(0, Math.min(1, musicVolume)),
                  delayInOutSec,
                  delayInOutSec + playDurInOutSec,
                  { start: delayInOutSec, end: delayInOutSec + playDurInOutSec }
                );
                musicNode.start(delayInOutSec, songOffsetSec, playDurInOutSec);
                hasAnySource = true;
              }
            }
          }
        }
      } catch {
        // Müzik akışı CORS veya decode hatası; video export'a devam et
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
   * mp4-muxer oturumunu ve paralel AAC ses kodlama görevini tek adımda hazırlar.
   */
  public static async prepareMuxerSession(params: {
    engine: CanvasEngine;
    exportWidth: number;
    exportHeight: number;
    outputDuration: number;
    music?: StoryAudioMeta | null;
    musicVolume?: number;
    signal?: AbortSignal;
    onError?: (err: Error) => void;
  }): Promise<{
    muxer: {
      addVideoChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
      addAudioChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void;
      finalize: () => void;
    };
    encodeAudioParallel: () => Promise<void>;
    toBlob: () => Blob;
  }> {
    const {
      engine,
      exportWidth,
      exportHeight,
      outputDuration,
      music,
      musicVolume = 0.85,
      signal,
      onError,
    } = params;

    const aacConfig: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      sampleRate: 44100,
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
      ? await this.renderMixedAudio(engine, outputDuration, music, musicVolume, signal)
      : null;

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

    return {
      muxer,
      encodeAudioParallel: async () => {
        if (!renderedAudio) return;
        await this.encodeAudioBufferToMuxer(
          renderedAudio,
          muxer,
          aacConfig,
          signal,
          onError
        );
      },
      toBlob: () => {
        muxer.finalize();
        return new Blob([target.buffer], { type: 'video/mp4' });
      },
    };
  }
  // [END] CREATED BY Umut

  public static getSupportedMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return 'video/mp4';
    const candidates = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return '';
  }

  // [MODIFIED BY Umut]
  public static async exportToBlob(
    engine: CanvasEngine,
    options?: MediaRecorderExportOptions
  ): Promise<Blob> {
    const state = engine.getVideoState();
    if (!state.isVideo) {
      throw new Error('Aktif medya bir video değil');
    }

    const width = options?.width || 720;
    const height = options?.height || 1280;
    // Akıllı FPS Seçimi: Standart 30 FPS ve 2.5 Mbps
    const fps = options?.fps && options.fps <= 30 ? options.fps : 30;
    const bitrate = options?.bitrate || 2_500_000;
    const signal = options?.signal;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx =
      exportCanvas.getContext('2d', { alpha: false, desynchronized: true }) ||
      exportCanvas.getContext('2d');
    if (!exportCtx) {
      throw new Error('Export canvas oluşturulamadı');
    }
    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = 'high';

    const trimStart = state.trimStart;
    const trimEnd = state.trimEnd > trimStart ? state.trimEnd : state.duration;
    const playbackRate = state.playbackRate || 1.0;
    const outputDuration = Math.max(0.2, (trimEnd - trimStart) / playbackRate);

    // [MODIFIED BY Bedirhan]
    engine.setExportingVideo(true);
    const mediaLayer = engine.getMediaLayer();
    const video = mediaLayer?.getVideoElement() as VideoWithRVFC | null | undefined;
    const isMotionPhoto = Boolean(state.isMotionPhoto);
    if (!video && !isMotionPhoto) {
      engine.setExportingVideo(false);
      throw new Error('Video elementi bulunamadı');
    }

    const canvasStream = exportCanvas.captureStream(fps);
    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(canvasStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: bitrate,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return new Promise<Blob>(async (resolve, reject) => {
      let rafId: number | null = null;
      let rvfcId: RVFCHandle | null = null;
      let stopped = false;

      const cleanup = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (
          rvfcId !== null &&
          video &&
          typeof video.cancelVideoFrameCallback === 'function'
        ) {
          try {
            video.cancelVideoFrameCallback(rvfcId);
          } catch {}
          rvfcId = null;
        }
        canvasStream.getTracks().forEach((t) => t.stop());
        if (video) video.pause();
        engine.setExportingVideo(false);
      };

      const onAbort = () => {
        if (stopped) return;
        stopped = true;
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {}
        cleanup();
        reject(new DOMException('Export cancelled', 'AbortError'));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      recorder.onerror = () => {
        if (stopped) return;
        stopped = true;
        cleanup();
        reject(new Error('MediaRecorder kaydı başarısız oldu'));
      };

      recorder.onstop = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        if (stopped && signal?.aborted) return;
        stopped = true;
        cleanup();
        options?.onProgress?.(1);
        const outBlob = new Blob(chunks, {
          type: mimeType.startsWith('video/webm') ? 'video/webm' : 'video/mp4',
        });
        resolve(outBlob);
      };

      try {
        // Yalnızca 1 kez başlangıç noktasına seek yapılır (Zero-Seek Kuralı)
        if (video && !isMotionPhoto) {
          await this.seekVideoOnce(video, trimStart, signal);
          video.playbackRate = playbackRate;
          video.muted = true;
        }

        this.drawCurrentFrameZeroSeek(engine, exportCtx, width, height, trimStart);
        recorder.start(80);

        if (video && !isMotionPhoto) {
          await video.play();
        }

        const startWall = performance.now();
        const renderTick = () => {
          if (stopped) return;
          const elapsed = (performance.now() - startWall) / 1000;
          const progress = Math.min(0.99, elapsed / outputDuration);
          options?.onProgress?.(progress);

          const curT = isMotionPhoto
            ? Math.min(trimEnd, trimStart + elapsed * playbackRate)
            : video?.currentTime ?? trimStart;

          if (isMotionPhoto && mediaLayer) {
            mediaLayer.virtualTime = curT;
          }

          this.drawCurrentFrameZeroSeek(engine, exportCtx, width, height, curT);

          const videoFinished = video
            ? video.currentTime >= trimEnd - 0.02 || video.ended
            : false;
          if (videoFinished || elapsed >= outputDuration) {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
            return;
          }

          if (video && typeof video.requestVideoFrameCallback === 'function') {
            rvfcId = video.requestVideoFrameCallback(() => renderTick());
          } else {
            rafId = requestAnimationFrame(renderTick);
          }
        };

        if (video && typeof video.requestVideoFrameCallback === 'function') {
          rvfcId = video.requestVideoFrameCallback(() => renderTick());
        } else {
          rafId = requestAnimationFrame(renderTick);
        }
      } catch (err) {
        if (!stopped) {
          stopped = true;
          cleanup();
          reject(err);
        }
      }
    });
  }
}
// [END] CREATED BY Bedirhan
