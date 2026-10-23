// [START] CREATED BY Bedirhan
/**
 * Medya elementinin o anki karesinden küçük bir JPEG önizleme üretir (object-cover).
 * Filtre / efekt seçicilerindeki küçük resimler için kullanılır.
 */
export function captureFramePreview(
  source: HTMLImageElement | HTMLVideoElement | null | undefined,
  width = 72,
  height = 128
): string | null {
  if (!source || typeof document === 'undefined') return null;
  const srcW =
    source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth || source.width;
  const srcH =
    source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight || source.height;
  if (!srcW || !srcH) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const scale = Math.max(width / srcW, height / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    ctx.drawImage(source, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    // CORS ile kirlenmiş tuval
    return null;
  }
}
// [END] CREATED BY Bedirhan
