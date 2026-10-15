import { NextRequest } from 'next/server';


export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return new Response('Missing video id', { status: 400 });

  const range = req.headers.get('range') || 'bytes=0-';
  const primaryUrl = process.env.AUDIO_SERVICE_URL || 'http://localhost:4000';
  const apiKey = process.env.AUDIO_SERVICE_API_KEY || 'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

  // Yerel servis ayaktaysa ilk olarak doğrudan onu kullan, ardından Cloud Run'a geç
  const candidateUrls = Array.from(
    new Set([
      'http://localhost:4000',
      primaryUrl,
      'https://sound.sigalmedia.com.tr',
    ])
  );

  for (const baseUrl of candidateUrls) {
    try {
      const upstream = await fetch(
        `${baseUrl}/api/audio/stream?id=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(apiKey)}`,
        {
          headers: {
            'x-api-key': apiKey,
            Range: range,
          },
        }
      );

      if (upstream.status === 200 || upstream.status === 206) {
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
