import { NextRequest } from 'next/server';

const SERVICE_URL = process.env.AUDIO_SERVICE_URL!;
const API_KEY = process.env.AUDIO_SERVICE_API_KEY!;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new Response('Missing video id', { status: 400 });

  const range = req.headers.get('range') || 'bytes=0-';

  try {
    const upstream = await fetch(`${SERVICE_URL}/api/audio/stream?id=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(API_KEY)}`, {
      headers: {
        'x-api-key': API_KEY,
        Range: range,
      },
    });

    const headers = new Headers();
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
      const val = upstream.headers.get(h);
      if (val) headers.set(h, val);
    });

    if (!headers.get('content-type')) {
      headers.set('content-type', 'audio/mp4');
    }
    headers.set('accept-ranges', 'bytes');
    headers.set('access-control-allow-origin', '*');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err: unknown) {
    console.error('[Music Stream Error]:', err);
    return new Response('Stream error', { status: 502 });
  }
}
