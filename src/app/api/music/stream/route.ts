import { NextRequest } from 'next/server';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new Response('Missing video id', { status: 400 });

  const range = req.headers.get('range') || 'bytes=0-';
  const isDev = process.env.NODE_ENV === 'development';
  const defaultUrl = isDev ? 'http://localhost:4000' : 'https://sound.sigalmedia.com.tr';
  const primaryUrl = process.env.AUDIO_SERVICE_URL || defaultUrl;
  const apiKey = process.env.AUDIO_SERVICE_API_KEY || 'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

  const candidateUrls = Array.from(
    new Set(
      isDev
        ? ['http://localhost:4000', primaryUrl, 'https://sound.sigalmedia.com.tr']
        : [primaryUrl, 'https://sound.sigalmedia.com.tr']
    )
  );

  for (const baseUrl of candidateUrls) {
    try {
      let upstream = await fetch(
        `${baseUrl}/api/audio/stream?id=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(apiKey)}`,
        {
          headers: {
            'x-api-key': apiKey,
            Range: range,
          },
        }
      );

      if (upstream.status === 200 || upstream.status === 206 || upstream.status === 416) {
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

        if (upstream.status === 416) {
          headers.set('content-length', '0');
          return new Response(null, {
            status: 416,
            headers,
          });
        }

        return new Response(upstream.body, {
          status: upstream.status,
          headers,
        });
      }
    } catch {
      // Bir sonraki adaya geç
    }
  }

  return new Response(JSON.stringify({ error: 'Ses akışı başlatılamadı' }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}
