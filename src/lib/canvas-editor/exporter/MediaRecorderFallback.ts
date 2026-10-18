// [START] CREATED BY Bedirhan
import { CanvasEngine } from '../Engine';
import { StoryAudioMeta } from '../types';

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

export class MediaRecorderFallback {
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
    const fps = options?.fps || 30;
    const bitrate = options?.bitrate || 4_000_000;
    const signal = options?.signal;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      throw new Error('Export canvas oluşturulamadı');
    }

    const trimStart = state.trimStart;
    const trimEnd = state.trimEnd > trimStart ? state.trimEnd : state.duration;
    const playbackRate = state.playbackRate || 1.0;
    const outputDuration = Math.max(0.2, (trimEnd - trimStart) / playbackRate);

    // [MODIFIED BY Bedirhan]
    engine.setExportingVideo(true);
    const mediaLayer = engine.getMediaLayer();
    const video = mediaLayer?.getVideoElement();
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
      let stopped = false;

      const cleanup = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
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
        await engine.renderFrameAt(exportCtx, trimStart, width, height);
        if (video) {
          video.playbackRate = playbackRate;
          video.muted = true;
        }
        recorder.start(100);
        if (video) {
          await video.play();
        }

        const startWall = performance.now();
        const renderTick = () => {
          if (stopped) return;
          const elapsed = (performance.now() - startWall) / 1000;
          const progress = Math.min(0.99, elapsed / outputDuration);
          options?.onProgress?.(progress);

          if (isMotionPhoto && mediaLayer) {
            mediaLayer.virtualTime = Math.min(trimEnd, trimStart + elapsed * playbackRate);
          }

          engine.renderClean(exportCtx, width, height);

          const videoFinished = video ? (video.currentTime >= trimEnd - 0.02 || video.ended) : false;
          if (videoFinished || elapsed >= outputDuration) {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
            return;
          }
          rafId = requestAnimationFrame(renderTick);
        };

        rafId = requestAnimationFrame(renderTick);
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
