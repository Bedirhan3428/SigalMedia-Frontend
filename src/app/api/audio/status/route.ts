import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.AUDIO_SERVICE_API_KEY || 'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get('id') || '').trim();

  if (!id) {
    return NextResponse.json(
      { success: false, ready: false, error: 'Video ID zorunludur' },
      { status: 400 }
    );
  }

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

  for (const baseUrl of candidateUrls) {
    try {
      const fullUrl = `${baseUrl.replace(/\/+$/, '')}/api/audio/status?id=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(API_KEY)}`;
      const res = await fetch(fullUrl, {
        headers: { 'x-api-key': API_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        });
      }
    } catch {
      // Sonraki adaya geç
    }
  }

  return NextResponse.json(
    { success: false, videoId: id, ready: false, r2Ready: false, source: 'pending' },
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
