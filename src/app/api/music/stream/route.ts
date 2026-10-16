import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_ID', message: 'Video ID zorunludur' } },
      { status: 400 }
    );
  }

  const targetBase = (
    process.env.AUDIO_SERVICE_URL ||
    process.env.NEXT_PUBLIC_AUDIO_SERVICE_URL ||
    'https://sound.sigalmedia.com.tr'
  ).replace(/\/+$/, '');

  const apiKey =
    process.env.AUDIO_SERVICE_API_KEY ||
    process.env.NEXT_PUBLIC_AUDIO_SERVICE_API_KEY ||
    'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

  const redirectUrl = `${targetBase}/api/audio/stream?id=${encodeURIComponent(
    id
  )}&apiKey=${encodeURIComponent(apiKey)}`;

  return NextResponse.redirect(redirectUrl, {
    status: 307,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Location, Content-Range, Content-Length, Accept-Ranges',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, x-api-key, Content-Type',
      'Access-Control-Expose-Headers': 'Location, Content-Range, Content-Length, Accept-Ranges',
    },
  });
}
