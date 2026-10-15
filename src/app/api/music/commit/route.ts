import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.AUDIO_SERVICE_API_KEY || 'sm_ss_InitpJfNvKbUsec2E9QoqlZhkYXA4071';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const candidateUrls = Array.from(
      new Set([
        'http://localhost:4000',
        process.env.AUDIO_SERVICE_URL || 'http://localhost:4000',
        'https://sound.sigalmedia.com.tr',
      ])
    );

    for (const baseUrl of candidateUrls) {
      try {
        const res = await fetch(`${baseUrl}/api/audio/commit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json(data, { status: 200 });
        }
      } catch {
        // Sonraki adaya geç
      }
    }

    return NextResponse.json({ error: 'Commit servisine bağlanılamadı' }, { status: 502 });
  } catch (err: unknown) {
    console.error('[Music Commit Error]:', err);
    return NextResponse.json({ error: 'Commit servisine bağlanılamadı' }, { status: 502 });
  }
}

