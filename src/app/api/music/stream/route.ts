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
  ).filter((url) => isDev || (!url.includes('localhost') && !url.includes('127.0.0.1')));

  for (const baseUrl of candidateUrls) {
    try {
      let upstream = await fetch(
        `${baseUrl}/api/audio/stream?id=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(apiKey)}`,
        {
          headers: {
            'x-api-key': apiKey,
            Range: range,
          },
          signal: AbortSignal.timeout(30000),
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
          const contentRange = upstream.headers.get('content-range') || '';
          const match = contentRange.match(/\/(\d+)$/);
          const total = match ? parseInt(match[1], 10) : 0;
          if (total > 0) {
            // Senaryo 4: İstemciye 416 yerine son 512 baytı 206 olarak dönerek tarayıcı oynatıcısının çökmesini engelle
            const safeStart = Math.max(0, total - 512);
            const safeEnd = total - 1;
            try {
              const tailRes = await fetch(
                `${baseUrl}/api/audio/stream?id=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(apiKey)}`,
                {
                  headers: {
                    'x-api-key': apiKey,
                    Range: `bytes=${safeStart}-${safeEnd}`,
                  },
                  signal: AbortSignal.timeout(10000),
                }
              );
              if (tailRes.status === 206 || tailRes.ok) {
                const tailHeaders = new Headers();
                ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
                  const val = tailRes.headers.get(h);
                  if (val) tailHeaders.set(h, val);
                });
                tailHeaders.set('content-type', 'audio/mp4');
                tailHeaders.set('accept-ranges', 'bytes');
                tailHeaders.set('access-control-allow-origin', '*');
                return new Response(tailRes.body, {
                  status: 206,
                  headers: tailHeaders,
                });
              }
            } catch {}
          }
          // Son çare: 416 yerine boş 206 dönerek tarayıcının MEDIA_ERR almasını engelle
          headers.set('content-range', `bytes 0-0/${total || 1}`);
          headers.set('content-length', '0');
          return new Response(null, {
            status: 206,
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

  return new Response(
    JSON.stringify({
      success: false,
      error: { code: 'STREAM_UNAVAILABLE', message: 'Ses akışı başlatılamadı' },
    }),
    {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}
