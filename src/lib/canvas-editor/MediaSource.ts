import { EditorMedia, MediaType } from './types';

export class MediaSourceManager {
  public static async loadImage(source: string | Blob | File): Promise<EditorMedia> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
        img.crossOrigin = 'anonymous';
      }

      let objectUrl: string | null = null;
      if (typeof source === 'string') {
        img.src = source;
      } else {
        objectUrl = URL.createObjectURL(source);
        img.src = objectUrl;
      }

      img.onload = () => {
        resolve({
          type: 'image',
          element: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      };

      img.onerror = (err) => {
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }
        reject(new Error('Failed to load image source: ' + err));
      };
    });
  }

  public static async loadVideo(source: string | Blob | File): Promise<EditorMedia> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
        video.crossOrigin = 'anonymous';
      }
      video.playsInline = true;
      video.muted = true;
      video.loop = true;
      video.preload = 'auto';

      let objectUrl: string | null = null;
      if (typeof source === 'string') {
        video.src = source;
      } else {
        objectUrl = URL.createObjectURL(source);
        video.src = objectUrl;
      }

      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve({
          type: 'video',
          element: video,
          width: video.videoWidth || 1920,
          height: video.videoHeight || 1080,
          duration: video.duration || 0
        });
      };

      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', (err) => {
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }
        reject(new Error('Failed to load video source: ' + err));
      });
    });
  }

  public static async load(source: string | Blob | File, forcedType?: MediaType): Promise<EditorMedia> {
    if (forcedType === 'video') return this.loadVideo(source);
    if (forcedType === 'image') return this.loadImage(source);

    if (source instanceof File) {
      if (source.type.startsWith('video/')) {
        return this.loadVideo(source);
      }
      return this.loadImage(source);
    }

    if (typeof source === 'string') {
      const ext = source.split('.').pop()?.toLowerCase() || '';
      if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) {
        return this.loadVideo(source);
      }
    }

    try {
      return await this.loadImage(source);
    } catch {
      return await this.loadVideo(source);
    }
  }
}
