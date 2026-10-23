export const CLIENT_SOUND_SERVICE_URL =
  process.env.NEXT_PUBLIC_AUDIO_SERVICE_URL ||
  process.env.AUDIO_SERVICE_URL ||
  'https://sound.sigalmedia.com.tr';

export const CLIENT_SOUND_API_KEY =
  process.env.NEXT_PUBLIC_AUDIO_SERVICE_API_KEY ||
  process.env.AUDIO_SERVICE_API_KEY ||
  'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

export const SOUND_SERVICE_URL = CLIENT_SOUND_SERVICE_URL;
export const SOUND_API_KEY = CLIENT_SOUND_API_KEY;

export interface SoundTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  durationFormatted: string; // e.g. "3:45"
  thumbnail?: string;
  streamUrl: string;
}

export interface HotChunk {
  start: number;
  duration: number;
  hits?: number;
  intensity?: number;
  isHotspot?: boolean;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  text: string;
}

export interface LyricsResponse {
  success: boolean;
  source: 'lrclib' | 'youtube';
  videoId: string;
  title: string;
  artist: string;
  lyrics: LyricLine[];
}

export interface CommitResult {
  success: boolean;
  audioUrl?: string;
  chunkKey?: string;
  shuttled?: boolean;
  error?: string;
}

export interface AudioStatusResponse {
  success: boolean;
  videoId?: string;
  ready: boolean;
  r2Ready?: boolean;
  source?: 'r2' | 'local' | 'pending';
}

/**
 * Format seconds to mm:ss format
 */
export function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Parses duration string (e.g. "3:45" or number) into seconds
 */
export function parseDurationToSeconds(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parts = val.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const num = parseInt(val, 10);
    if (!isNaN(num)) return num;
  }
  return 180; // default 3 min fallback
}

// İstemci tarafı hızlı arama önbelleği (Tekrarlayan aramaları 0ms yapar)
const clientSearchCache = new Map<string, { data: SoundTrack[]; timestamp: number }>();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10 dakika

/**
 * Ses mikroservisinde şarkı arama
 */
export async function searchTracks(query: string, limit = 20, signal?: AbortSignal): Promise<SoundTrack[]> {
  const trimmed = query.trim();
  const searchQ = trimmed.length > 0 ? trimmed : 'Tarkan';
  const cacheKey = `${searchQ.toLowerCase()}_${limit}`;

  // 1. Önbellekte varsa anında (0ms) dön
  const cached = clientSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const isClient = typeof window !== 'undefined';
    // İstemcide CORS destekli doğrudan servis URL'sini dene (en hızlı, Next.js proxy gecikmesiz)
    const directUrl = `${CLIENT_SOUND_SERVICE_URL.replace(/\/+$/, '')}/api/audio/search?q=${encodeURIComponent(
      searchQ
    )}&limit=${limit}&apiKey=${encodeURIComponent(CLIENT_SOUND_API_KEY)}`;
    const proxyUrl = `/api/music/proxy?type=search&q=${encodeURIComponent(searchQ)}&limit=${limit}`;

    let res: Response | null = null;

    if (isClient) {
      try {
        res = await fetch(directUrl, {
          method: 'GET',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000),
        });
      } catch {
        // Doğrudan bağlantıda hata olursa proxy üzerinden dene
        res = null;
      }
    }

    if (!res || !res.ok) {
      const urlToUse = isClient ? proxyUrl : directUrl;
      res = await fetch(urlToUse, {
        method: 'GET',
        headers: isClient ? {} : { 'x-api-key': SOUND_API_KEY },
        signal,
      });
    }

    if (!res.ok) {
      // Fallback: /api/music endpointini dene
      const fallbackUrl = `${SOUND_SERVICE_URL}/api/music?q=${encodeURIComponent(
        searchQ
      )}&apiKey=${encodeURIComponent(SOUND_API_KEY)}`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { 'x-api-key': SOUND_API_KEY },
        signal,
      });
      if (!fallbackRes.ok) return [];
      const fallbackData = await fallbackRes.json();
      if (Array.isArray(fallbackData)) {
        const mapped = fallbackData.map((item: any) => {
          const durSec = parseDurationToSeconds(item.duration);
          return {
            id: item.id,
            title: item.title,
            artist: item.artist,
            album: item.album || '',
            duration: durSec,
            durationFormatted: typeof item.duration === 'string' ? item.duration : formatSeconds(durSec),
            thumbnail: item.thumbnail,
            streamUrl: getAudioStreamUrl(item.id),
          };
        });
        clientSearchCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
        return mapped;
      }
      return [];
    }

    const json = await res.json();
    const rawList = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];

    const tracks: SoundTrack[] = rawList.map((item: any) => {
      const durSec = parseDurationToSeconds(item.duration);
      return {
        id: item.id,
        title: item.title,
        artist: item.artist,
        album: item.album || '',
        duration: durSec,
        durationFormatted: item.durationFormatted || formatSeconds(durSec),
        thumbnail: item.thumbnail,
        streamUrl: getAudioStreamUrl(item.id),
      };
    });

    if (tracks.length > 0) {
      clientSearchCache.set(cacheKey, { data: tracks, timestamp: Date.now() });
    }

    return tracks;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return [];
    }
    console.warn('[soundService] searchTracks error:', err);
    return [];
  }
}

/**
 * RAM ses önbelleğini ön ısıtma ve R2 kalıcı havuzuna alma (Prefetch / Warmup)
 */
export function warmTrackAudio(videoId: string): void {
  if (!videoId) return;
  const isClient = typeof window !== 'undefined';
  const url = isClient
    ? `/api/music/proxy?type=warm&id=${encodeURIComponent(videoId)}`
    : `${SOUND_SERVICE_URL}/api/audio/warm?id=${encodeURIComponent(
      videoId
    )}&apiKey=${encodeURIComponent(SOUND_API_KEY)}`;

  fetch(url, {
    method: 'GET',
    headers: isClient ? {} : { 'x-api-key': SOUND_API_KEY },
  }).catch(() => { });
}

/**
 * Dosyanın Cloudflare R2 üzerinde hazır olup olmadığını kontrol eder (/api/audio/status)
 */
export async function getTrackAudioStatus(
  videoId: string,
  signal?: AbortSignal
): Promise<AudioStatusResponse> {
  if (!videoId) return { success: false, ready: false };
  try {
    const isClient = typeof window !== 'undefined';
    const url = isClient
      ? `/api/audio/status?id=${encodeURIComponent(videoId)}`
      : `${SOUND_SERVICE_URL}/api/audio/status?id=${encodeURIComponent(
          videoId
        )}&apiKey=${encodeURIComponent(SOUND_API_KEY)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: isClient ? {} : { 'x-api-key': SOUND_API_KEY },
      cache: 'no-store',
      signal,
    });

    if (!res.ok) return { success: false, ready: false };
    const data = await res.json();
    return {
      success: Boolean(data?.success),
      videoId: data?.videoId || videoId,
      ready: Boolean(data?.ready),
      r2Ready: Boolean(data?.r2Ready),
      source: data?.source,
    };
  } catch {
    return { success: false, ready: false };
  }
}

/**
 * Doğrudan canlı ses akış adresi (HTML5 audio src)
 */
export function getAudioStreamUrl(videoId: string): string {
  const baseUrl = CLIENT_SOUND_SERVICE_URL.replace(/\/+$/, '');
  return `${baseUrl}/api/audio/stream?id=${encodeURIComponent(
    videoId
  )}&apiKey=${encodeURIComponent(CLIENT_SOUND_API_KEY)}`;
}

/**
 * Isı Haritası (Heatmap) ve En Popüler Kısımları Getir
 */
export async function getTrackHotChunks(videoId: string): Promise<HotChunk[]> {
  try {
    const isClient = typeof window !== 'undefined';
    const url = isClient
      ? `/api/music/proxy?type=hot-chunks&id=${encodeURIComponent(videoId)}`
      : `${SOUND_SERVICE_URL}/api/audio/hot-chunks?id=${encodeURIComponent(
        videoId
      )}&apiKey=${encodeURIComponent(SOUND_API_KEY)}`;

    const res = await fetch(url, {
      headers: isClient ? {} : { 'x-api-key': SOUND_API_KEY },
    });

    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch (err) {
    console.warn('[soundService] getTrackHotChunks error:', err);
    return [];
  }
}

/**
 * Şarkı Sözlerini Getir (Karaoke Engine)
 */
export async function getTrackLyrics(
  videoId: string,
  title: string,
  artist: string
): Promise<LyricLine[]> {
  try {
    const isClient = typeof window !== 'undefined';
    const url = isClient
      ? `/api/music/proxy?type=lyrics&id=${encodeURIComponent(videoId)}&title=${encodeURIComponent(
        title
      )}&artist=${encodeURIComponent(artist)}`
      : `${SOUND_SERVICE_URL}/api/audio/lyrics?id=${encodeURIComponent(
        videoId
      )}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(
        artist
      )}&apiKey=${encodeURIComponent(SOUND_API_KEY)}`;

    const res = await fetch(url, {
      headers: isClient ? {} : { 'x-api-key': SOUND_API_KEY },
    });

    if (!res.ok) return [];
    const json: LyricsResponse = await res.json();
    return json.success && Array.isArray(json.lyrics) ? json.lyrics : [];
  } catch (err) {
    console.warn('[soundService] getTrackLyrics error:', err);
    return [];
  }
}

/**
 * İstenen saniye aralığını FFmpeg ile havada kesip Cloudflare R2'ye yükle (Hot Chunking)
 */
export async function commitAudioClip(params: {
  videoId: string;
  startTime: number;
  duration: number;
  chunkKey?: string;
}): Promise<CommitResult> {
  try {
    const key = params.chunkKey || `chunk_${Math.floor(params.startTime / 15) + 1}`;
    const isClient = typeof window !== 'undefined';
    const url = isClient ? `/api/music/commit` : `${SOUND_SERVICE_URL}/api/audio/commit`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isClient ? {} : { 'x-api-key': SOUND_API_KEY }),
      },
      body: JSON.stringify({
        videoId: params.videoId,
        startTime: params.startTime,
        duration: params.duration,
        chunkKey: key,
      }),
    });

    const json = await res.json();
    return json;
  } catch (err) {
    console.error('[soundService] commitAudioClip error:', err);
    return { success: false, error: 'Ses servisine bağlanılamadı' };
  }
}

