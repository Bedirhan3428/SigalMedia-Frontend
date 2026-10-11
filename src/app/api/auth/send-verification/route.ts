import { NextResponse } from "next/server";

const CLOUD_FUNCTION_URL =
  process.env.CLOUD_FUNCTION_SEND_VERIFICATION_URL ||
  "https://sendverificationcode-hwdloexqua-ew.a.run.app";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body || {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi gereklidir." },
        { status: 400 }
      );
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";

    // E-posta gönderimi ve 4 haneli kod üretimi Firebase Cloud Functions üzerinden yürütülür
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ip }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Doğrulama kodu gönderilemedi." },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Cloud Functions köprü hatası:", error);
    return NextResponse.json(
      { error: "Servis bağlantısı kurulamadı." },
      { status: 500 }
    );
  }
}
