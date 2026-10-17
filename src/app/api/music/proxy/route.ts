import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.AUDIO_SERVICE_API_KEY || 'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'search';

  const isDev = process.env.NODE_ENV === 'development';
  const defaultUrl = isDev ? 'http://localhost:4000' : 'https://sound.sigalmedia.com.tr';
  const primaryUrl = process.env.AUDIO_SERVICE_URL || defaultUrl;

  const candidateUrls = Array.from(
    new Set(
      isDev
        ? ['http://localhost:4000', primaryUrl, 'https://sound.sigalmedia.com.tr']
        : [primaryUrl, 'https://sound.sigalmedia.com.tr']
    )
  ).filter((url) => isDev || (!url.includes('localhost') && !url.includes('127.0.0.1')));

  let pathAndQuery = '';
  if (type === 'search') {
    const q = searchParams.get('q') || '';
    const limit = searchParams.get('limit') || '20';
    pathAndQuery = `/api/audio/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`;
  } else if (type === 'lyrics') {
    const id = searchParams.get('id') || '';
    const title = searchParams.get('title') || '';
    const artist = searchParams.get('artist') || '';
    pathAndQuery = `/api/audio/lyrics?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
  } else if (type === 'hot-chunks') {
    const id = searchParams.get('id') || '';
    pathAndQuery = `/api/audio/hot-chunks?id=${encodeURIComponent(id)}`;
  } else if (type === 'warm') {
    const id = searchParams.get('id') || '';
    pathAndQuery = `/api/audio/warm?id=${encodeURIComponent(id)}`;
  } else if (type === 'status') {
    const id = searchParams.get('id') || '';
    pathAndQuery = `/api/audio/status?id=${encodeURIComponent(id)}`;
  } else {
    return NextResponse.json({ error: 'Geçersiz istek tipi' }, { status: 400 });
  }

  for (const baseUrl of candidateUrls) {
    try {
      const sep = pathAndQuery.includes('?') ? '&' : '?';
      const fullUrl = `${baseUrl}${pathAndQuery}${sep}apiKey=${encodeURIComponent(API_KEY)}`;
      const res = await fetch(fullUrl, {
        headers: { 'x-api-key': API_KEY },
        cache: type === 'status' ? 'no-store' : undefined,
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            ...(type === 'status' ? { 'Cache-Control': 'no-store, no-cache, must-revalidate' } : {}),
          },
        });
      }
    } catch {
      // Sonraki adaya geç
    }
  }

  // Arayüzün kırılmasını önleyen zarif kurtarma yanıtları
  if (type === 'hot-chunks') {
    return NextResponse.json({ success: true, data: [] }, { status: 200 });
  }
  if (type === 'lyrics') {
    return NextResponse.json({ success: false, source: 'none', videoId: searchParams.get('id') || '', lyrics: [] }, { status: 200 });
  }
  if (type === 'warm') {
    return NextResponse.json({ success: true }, { status: 200 });
  }
  if (type === 'status') {
    return NextResponse.json({ success: false, ready: false, r2Ready: false, source: 'pending' }, { status: 200 });
  }

  return NextResponse.json({ error: 'Müzik servisine bağlanılamadı' }, { status: 502 });
}

