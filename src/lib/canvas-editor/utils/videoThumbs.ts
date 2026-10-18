// [START] CREATED BY Bedirhan
export interface VideoThumbnailOptions {
  count?: number;
  width?: number;
  height?: number;
  signal?: AbortSignal;
  onThumbnail?: (thumbnails: string[]) => void;
}

export async function generateVideoThumbnails(
  source: string | Blob | File,
  options?: VideoThumbnailOptions
): Promise<string[]> {
  if (typeof document === 'undefined') return [];

  const count = Math.max(4, Math.min(options?.count || 8, 16));
  const thumbWidth = options?.width || 84;
  const thumbHeight = options?.height || 148;
  const signal = options?.signal;

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.preload = 'auto';

  let createdUrl: string | null = null;
  if (typeof source === 'string') {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      video.crossOrigin = 'anonymous';
    }
    video.src = source;
  } else {
    createdUrl = URL.createObjectURL(source);
    video.src = createdUrl;
  }

  const canvas = document.createElement('canvas');
  canvas.width = thumbWidth;
  canvas.height = thumbHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (createdUrl) {
      try { URL.revokeObjectURL(createdUrl); } catch {}
    }
    return [];
  }

  const thumbnails: string[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Thumbnail video load error'));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration, 60) : 1;
    const vw = video.videoWidth || thumbWidth;
    const vh = video.videoHeight || thumbHeight;

    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;

      const t = count === 1 ? 0 : (i / (count - 1)) * Math.max(0.05, duration - 0.1);
      await seekHiddenVideo(video, t);
      if (signal?.aborted) break;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, thumbWidth, thumbHeight);

      const scale = Math.max(thumbWidth / vw, thumbHeight / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (thumbWidth - dw) / 2;
      const dy = (thumbHeight - dh) / 2;

      ctx.drawImage(video, dx, dy, dw, dh);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.55);
      thumbnails.push(dataUrl);
      options?.onThumbnail?.([...thumbnails]);

      await new Promise((r) => setTimeout(r, 0));
    }
  } catch {
    // Ignore abort or decode errors and return generated frames so far
  } finally {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {}
    if (createdUrl) {
      try {
        URL.revokeObjectURL(createdUrl);
      } catch {}
    }
  }

  return thumbnails;
}

function seekHiddenVideo(video: HTMLVideoElement, targetTime: number): Promise<void> {
  if (Math.abs(video.currentTime - targetTime) < 0.01 && video.readyState >= 2) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener('seeked', finish);
      resolve();
    };
    const timer = setTimeout(finish, 250);
    video.addEventListener('seeked', finish, { once: true });
    video.currentTime = targetTime;
  });
}
// [END] CREATED BY Bedirhan
