import {
  EditorMedia,
  MediaType,
  MediaLoadErrorCode,
  MAX_IMAGE_DECODE_PX,
  MAX_IMAGE_DECODE_AREA,
  MEDIA_LOAD_TIMEOUT_MS,
} from './types';

/**
 * Medya yükleme hatası. UI `code` alanına göre kısa bir toast gösterir:
 * - 'timeout': 15 sn içinde yüklenemedi
 * - 'unsupported': biçim/codec desteklenmiyor
 * - 'decode': dosya bozuk veya çözülemedi
 */
export class MediaLoadError extends Error {
  public readonly code: MediaLoadErrorCode;
  public readonly mediaType: MediaType;

  constructor(code: MediaLoadErrorCode, mediaType: MediaType, message?: string) {
    super(message || `Media load failed (${mediaType}): ${code}`);
    this.name = 'MediaLoadError';
    this.code = code;
    this.mediaType = mediaType;
  }
}

export function isMediaLoadError(err: unknown): err is MediaLoadError {
  return err instanceof MediaLoadError;
}

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv', '3gp'];
const ALPHA_IMAGE_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

function getExtension(name: string): string {
  const clean = name.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

function isRemoteUrl(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://');
}

function loadImageElement(src: string, crossOrigin: boolean, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let settled = false;
    const finish = (err: MediaLoadError | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (err) {
        img.src = '';
        reject(err);
      } else {
        resolve(img);
      }
    };
    const timer = setTimeout(() => finish(new MediaLoadError('timeout', 'image')), timeoutMs);
    img.onload = () => {
      if (!(img.naturalWidth || img.width) || !(img.naturalHeight || img.height)) {
        finish(new MediaLoadError('decode', 'image'));
        return;
      }
      finish(null);
    };
    img.onerror = () => finish(new MediaLoadError('decode', 'image'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

export class MediaSourceManager {
  /**
   * Görseli yükler; uzun kenar MAX_IMAGE_DECODE_PX'i (veya alan ~16M px'i) aşıyorsa küçültür.
   * Dönen medyanın `objectUrl` alanı varsa sahibi (motor) `release()` ile serbest bırakmalıdır.
   */
  public static async loadImage(source: string | Blob | File): Promise<EditorMedia> {
    if (typeof source !== 'string' && source.type && !source.type.startsWith('image/')) {
      throw new MediaLoadError('unsupported', 'image');
    }

    let objectUrl: string | null = null;
    let src: string;
    if (typeof source === 'string') {
      src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      src = objectUrl;
    }

    let img: HTMLImageElement;
    try {
      img = await loadImageElement(src, typeof source === 'string' && isRemoteUrl(source), MEDIA_LOAD_TIMEOUT_MS);
    } catch (err) {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch {}
      }
      // HEIC gibi tarayıcının çözemediği biçimler
      if (
        err instanceof MediaLoadError &&
        err.code === 'decode' &&
        typeof source !== 'string' &&
        /heic|heif/i.test(source.type || (source instanceof File ? source.name : ''))
      ) {
        throw new MediaLoadError('unsupported', 'image');
      }
      throw err;
    }

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    const target = this.getDownscaleTarget(natW, natH);

    if (target) {
      const mime =
        typeof source !== 'string' && ALPHA_IMAGE_TYPES.includes(source.type) ? 'image/png' : 'image/jpeg';
      const downscaled = await this.downscaleImage(img, target.width, target.height, mime);
      if (downscaled) {
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }
        img.src = '';
        return {
          type: 'image',
          element: downscaled.img,
          width: downscaled.img.naturalWidth || target.width,
          height: downscaled.img.naturalHeight || target.height,
          source: downscaled.blob,
          objectUrl: downscaled.objectUrl,
          originalWidth: natW,
          originalHeight: natH,
        };
      }
      // Küçültme başarısızsa orijinalle devam et (iOS'ta çizimde sorun çıkabilir ama editör açık kalır)
    }

    return {
      type: 'image',
      element: img,
      width: natW,
      height: natH,
      source,
      objectUrl: objectUrl || undefined,
      originalWidth: natW,
      originalHeight: natH,
    };
  }

  /** Küçültme gerekiyorsa hedef boyutu döner, gerekmiyorsa null. */
  public static getDownscaleTarget(w: number, h: number): { width: number; height: number } | null {
    if (!w || !h) return null;
    const longSide = Math.max(w, h);
    const scale = Math.min(1, MAX_IMAGE_DECODE_PX / longSide, Math.sqrt(MAX_IMAGE_DECODE_AREA / (w * h)));
    if (scale >= 0.999) return null;
    return {
      width: Math.max(1, Math.floor(w * scale)),
      height: Math.max(1, Math.floor(h * scale)),
    };
  }

  private static async downscaleImage(
    img: HTMLImageElement,
    width: number,
    height: number,
    mime: string
  ): Promise<{ img: HTMLImageElement; blob: Blob; objectUrl: string } | null> {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let drawn = false;
    // 1. createImageBitmap + resize seçenekleri (destekleniyorsa). Safari resize'ı yok sayabilir:
    //    dönen bitmap hedef boyutta değilse yine de tuvale ölçekli çizilir.
    if (typeof createImageBitmap === 'function') {
      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(img, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high',
        });
        ctx.drawImage(bitmap, 0, 0, width, height);
        drawn = true;
      } catch {
        drawn = false;
      } finally {
        try { bitmap?.close(); } catch {}
      }
    }
    // 2. Yedek: doğrudan offscreen tuvale çiz
    if (!drawn) {
      try {
        ctx.drawImage(img, 0, 0, width, height);
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) {
      canvas.width = 0;
      canvas.height = 0;
      return null;
    }

    const blob = await canvasToBlob(canvas, mime, 0.92);
    // iOS: büyük tuval belleğini hemen bırak
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return null;

    const objectUrl = URL.createObjectURL(blob);
    try {
      const out = await loadImageElement(objectUrl, false, MEDIA_LOAD_TIMEOUT_MS);
      return { img: out, blob, objectUrl };
    } catch {
      try { URL.revokeObjectURL(objectUrl); } catch {}
      return null;
    }
  }

  // [MODIFIED BY Bedirhan]
  /**
   * Videoyu yükler. 15 sn içinde ilk kare (veya iOS'ta yalnızca metadata) gelmezse
   * MediaLoadError('timeout') ile reddeder. Hatada tüm kaynaklar temizlenir.
   */
  public static async loadVideo(source: string | Blob | File): Promise<EditorMedia> {
    if (typeof document === 'undefined') {
      throw new MediaLoadError('unsupported', 'video');
    }
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      if (typeof source === 'string' && isRemoteUrl(source)) {
        video.crossOrigin = 'anonymous';
      }
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.muted = false;
      video.loop = false;
      video.preload = 'auto';

      let objectUrl: string | null = null;
      let settled = false;
      let metadataGraceTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanupListeners = () => {
        clearTimeout(timeoutTimer);
        if (metadataGraceTimer) clearTimeout(metadataGraceTimer);
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        resolve({
          type: 'video',
          element: video,
          width: video.videoWidth || 1080,
          height: video.videoHeight || 1920,
          duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0,
          source,
          objectUrl: objectUrl || undefined,
        });
      };

      const fail = (code: MediaLoadErrorCode) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        try {
          video.removeAttribute('src');
          video.load();
        } catch {}
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch {}
        }
        reject(new MediaLoadError(code, 'video'));
      };

      const onLoadedData = () => succeed();

      // iOS Safari kullanıcı jesti olmadan loadeddata'yı geciktirebilir; metadata yeterli
      const onLoadedMetadata = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        if (metadataGraceTimer) clearTimeout(metadataGraceTimer);
        metadataGraceTimer = setTimeout(succeed, 1500);
      };

      const onError = () => {
        const code = video.error?.code;
        // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED, 3 = MEDIA_ERR_DECODE
        fail(code === 4 ? 'unsupported' : 'decode');
      };

      const timeoutTimer = setTimeout(() => fail('timeout'), MEDIA_LOAD_TIMEOUT_MS);

      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('error', onError);

      if (typeof source === 'string') {
        video.src = source;
      } else {
        objectUrl = URL.createObjectURL(source);
        video.src = objectUrl;
      }
      try {
        video.load();
      } catch {}
    });
  }

  public static async load(source: string | Blob | File, forcedType?: MediaType): Promise<EditorMedia> {
    if (forcedType === 'video') return this.loadVideo(source);
    if (forcedType === 'image') return this.loadImage(source);

    if (typeof source !== 'string') {
      const mime = source.type || '';
      if (mime.startsWith('video/')) return this.loadVideo(source);
      if (mime.startsWith('image/')) return this.loadImage(source);
      // iOS bazen boş MIME verir: uzantıya bak
      const name = source instanceof File ? source.name : '';
      if (VIDEO_EXTENSIONS.includes(getExtension(name))) return this.loadVideo(source);
      if (mime) throw new MediaLoadError('unsupported', 'image');
    } else if (VIDEO_EXTENSIONS.includes(getExtension(source))) {
      return this.loadVideo(source);
    }

    try {
      return await this.loadImage(source);
    } catch (imgErr) {
      try {
        return await this.loadVideo(source);
      } catch {
        throw imgErr;
      }
    }
  }

  /**
   * Medyanın tuttuğu kaynakları serbest bırakır (video durdurulur, src boşaltılır, blob URL iptal edilir).
   * İdempotenttir. Serbest bırakılan medya bir daha çizilmemelidir.
   */
  public static release(media: EditorMedia | null | undefined): void {
    if (!media) return;
    const el = media.element;
    try {
      if (el instanceof HTMLVideoElement) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } else if (el instanceof HTMLImageElement) {
        // Zaman çizelgesi önizlemeleri de bu URL'yi kullanabilir; yalnızca motor sahibi çağırır
        el.removeAttribute('src');
      }
    } catch {}
    if (media.objectUrl) {
      try {
        URL.revokeObjectURL(media.objectUrl);
      } catch {}
    }
  }
}
