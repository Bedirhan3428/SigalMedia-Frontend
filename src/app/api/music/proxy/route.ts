import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.AUDIO_SERVICE_API_KEY || 'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'search';

  const candidateUrls = Array.from(
    new Set([
      'http://localhost:4000',
      process.env.AUDIO_SERVICE_URL || 'http://localhost:4000',
      'https://sound.sigalmedia.com.tr',
    ])
  );

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
  } else {
    return NextResponse.json({ error: 'Geçersiz istek tipi' }, { status: 400 });
  }

  for (const baseUrl of candidateUrls) {
    try {
      const sep = pathAndQuery.includes('?') ? '&' : '?';
      const fullUrl = `${baseUrl}${pathAndQuery}${sep}apiKey=${encodeURIComponent(API_KEY)}`;
      const res = await fetch(fullUrl, {
        headers: { 'x-api-key': API_KEY },
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    } catch {
      // Sonraki adaya geç
    }
  }

  return NextResponse.json({ error: 'Müzik servisine bağlanılamadı' }, { status: 502 });
}

