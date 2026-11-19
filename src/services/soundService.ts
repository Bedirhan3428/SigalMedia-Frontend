/**
 * iTunes Search API istemcisi.
 * Anahtar gerektirmez; arama, önizleme sesi ve kapak görselleri CORS açık (ACAO: *),
 * bu yüzden tarayıcıdan doğrudan çağrılır ve exporter'lar sesi fetch + decode edebilir.
 */

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const ITUNES_COUNTRY = 'TR';
const DEFAULT_QUERY = 'türkçe pop';

/** iTunes önizlemeleri 30 saniyedir; kırpıcı bu süre içinde kalmalı */
export const PREVIEW_SEC = 30;

export interface SoundTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // saniye (önizleme süresi)
  durationFormatted: string; // ör. "0:30"
  thumbnail?: string;
  streamUrl: string; // iTunes previewUrl
}

interface ITunesTrack {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

/**
 * Format seconds to mm:ss format
 */
export function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function mapTrack(item: ITunesTrack): SoundTrack | null {
  if (item.wrapperType !== 'track' || !item.trackId || !item.previewUrl) return null;
  return {
    id: String(item.trackId),
    title: item.trackName || 'Bilinmeyen şarkı',
    artist: item.artistName || '',
    album: item.collectionName || '',
    duration: PREVIEW_SEC,
    durationFormatted: formatSeconds(PREVIEW_SEC),
    thumbnail: item.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/600x600bb.'),
    streamUrl: item.previewUrl,
  };
}

// İstemci tarafı arama önbelleği (tekrarlayan aramalar anında döner, Apple rate limitini korur)
const clientSearchCache = new Map<string, { data: SoundTrack[]; timestamp: number }>();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 dakika

/**
 * iTunes'ta şarkı arama
 */
export async function searchTracks(query: string, limit = 20, signal?: AbortSignal): Promise<SoundTrack[]> {
  const trimmed = query.trim();
  const searchQ = trimmed.length > 0 ? trimmed : DEFAULT_QUERY;
  const cacheKey = `${searchQ.toLowerCase()}_${limit}`;

  const cached = clientSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  const params = new URLSearchParams({
    term: searchQ,
    media: 'music',
    entity: 'song',
    country: ITUNES_COUNTRY,
    limit: String(limit),
  });

  try {
    const timeout = AbortSignal.timeout(6000);
    const res = await fetch(`${ITUNES_SEARCH_URL}?${params.toString()}`, {
      method: 'GET',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) return [];

    const json = await res.json();
    const results: ITunesTrack[] = Array.isArray(json?.results) ? json.results : [];
    const seen = new Set<string>();
    const tracks: SoundTrack[] = [];
    for (const item of results) {
      const track = mapTrack(item);
      if (track && !seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }

    if (tracks.length > 0) {
      clientSearchCache.set(cacheKey, { data: tracks, timestamp: Date.now() });
    }
    return tracks;
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      return [];
    }
    console.warn('[soundService] searchTracks error:', err);
    return [];
  }
}
