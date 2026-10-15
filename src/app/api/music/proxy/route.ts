import { NextRequest, NextResponse } from 'next/server';

const SERVICE_URL = process.env.AUDIO_SERVICE_URL!;
const API_KEY = process.env.AUDIO_SERVICE_API_KEY!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // 'search' | 'lyrics'

  let targetUrl = '';
  if (type === 'search') {
    const q = searchParams.get('q') || '';
    const limit = searchParams.get('limit') || '20';
    targetUrl = `${SERVICE_URL}/api/audio/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`;
  } else if (type === 'lyrics') {
    const id = searchParams.get('id') || '';
    const title = searchParams.get('title') || '';
    const artist = searchParams.get('artist') || '';
    targetUrl = `${SERVICE_URL}/api/audio/lyrics?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
  } else if (type === 'hot-chunks') {
    const id = searchParams.get('id') || '';
    targetUrl = `${SERVICE_URL}/api/audio/hot-chunks?id=${encodeURIComponent(id)}`;
  } else {
    return NextResponse.json({ error: 'Geçersiz istek tipi' }, { status: 400 });
  }

  try {
    const res = await fetch(targetUrl, {
      headers: { 'x-api-key': API_KEY },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error('[Music Proxy Error]:', err);
    return NextResponse.json({ error: 'Müzik servisine bağlanılamadı' }, { status: 502 });
  }
}
