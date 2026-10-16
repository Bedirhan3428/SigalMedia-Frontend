/**
 * Ses dosyasını istemcide tamamen indirir (Range döngüsü) ve blob URL olarak önbelleğe alır.
 * Sunucu tam yanıt (R2/disk) da dönse, 512 KB'lık parçalar (Google CDN) da dönse çalışır.
 */

const MAX_CACHED = 3;
const blobCache = new Map<string, string>(); // trackId -> blob URL (LRU: ekleme sırası)

export function getCachedAudioUrl(trackId: string): string | null {
  const url = blobCache.get(trackId);
  if (!url) return null;
  blobCache.delete(trackId);
  blobCache.set(trackId, url);
  return url;
}

function putCachedAudioUrl(trackId: string, url: string): void {
  const prev = blobCache.get(trackId);
  if (prev && prev !== url) URL.revokeObjectURL(prev);
  blobCache.delete(trackId);
  blobCache.set(trackId, url);
  while (blobCache.size > MAX_CACHED) {
    const oldestKey = blobCache.keys().next().value as string;
    const oldestUrl = blobCache.get(oldestKey);
    blobCache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

export async function fetchFullAudio(url: string, signal: AbortSignal): Promise<Blob> {
  const parts: ArrayBuffer[] = [];
  let received = 0;
  let total = Infinity;
  let type = 'audio/mp4';

  while (received < total) {
    const res = await fetch(url, { headers: { Range: `bytes=${received}-` }, signal });
    if (res.status === 416) break;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ct = res.headers.get('content-type');
    if (ct && ct.startsWith('audio/')) type = ct;

    const cr = res.headers.get('content-range');
    const m = cr?.match(/\/(\d+)\s*$/);
    if (m) total = parseInt(m[1], 10);

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) break;
    parts.push(buf);
    received += buf.byteLength;

    if (!m) break; // 200 tam yanıt
  }

  if (received === 0 || (isFinite(total) && received < total)) {
    throw new Error('Eksik ses verisi');
  }
  return new Blob(parts, { type });
}

/**
 * Şarkıyı tam indirip blob URL döner (önbellekte varsa anında).
 */
export async function loadFullAudioUrl(
  trackId: string,
  streamUrl: string,
  signal: AbortSignal
): Promise<string> {
  const cached = getCachedAudioUrl(trackId);
  if (cached) return cached;
  const blob = await fetchFullAudio(streamUrl, signal);
  const url = URL.createObjectURL(blob);
  putCachedAudioUrl(trackId, url);
  return url;
}
