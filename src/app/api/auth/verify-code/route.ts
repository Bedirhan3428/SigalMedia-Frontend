import { NextResponse } from "next/server";

const CLOUD_FUNCTION_VERIFY_URL =
  process.env.CLOUD_FUNCTION_VERIFY_CODE_URL ||
  "https://verifycode-hwdloexqua-ew.a.run.app";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, code, uid } = body || {};

    if (!email || !code) {
      return NextResponse.json(
        { error: "E-posta adresi ve 4 haneli kod zorunludur." },
        { status: 400 }
      );
    }

    // Kod doğrulama ve kullanıcı onaylama Firebase Cloud Functions üzerinden yürütülür
    const response = await fetch(CLOUD_FUNCTION_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, uid }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Kod doğrulanamadı." },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Cloud Functions verify köprü hatası:", error);
    return NextResponse.json(
      { error: "Doğrulama servisine bağlanılamadı." },
      { status: 500 }
    );
  }
}
