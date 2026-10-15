import { NextRequest, NextResponse } from 'next/server';

const SERVICE_URL = process.env.AUDIO_SERVICE_URL!;
const API_KEY = process.env.AUDIO_SERVICE_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${SERVICE_URL}/api/audio/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    console.error('[Music Commit Error]:', err);
    return NextResponse.json({ error: 'Commit servisine bağlanılamadı' }, { status: 502 });
  }
}
