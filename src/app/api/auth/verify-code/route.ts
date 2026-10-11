import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { email, code, token } = await request.json();

    if (!email || !code || !token) {
      return NextResponse.json(
        { error: "E-posta adresi, 4 haneli kod ve doğrulama anahtarı zorunludur." },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toString().trim();

    if (cleanCode.length !== 4) {
      return NextResponse.json(
        { error: "Lütfen 4 haneli kodu eksiksiz girin." },
        { status: 400 }
      );
    }

    const [expiresAtStr, signature] = token.split(".");

    if (!expiresAtStr || !signature) {
      return NextResponse.json(
        { error: "Geçersiz doğrulama anahtarı. Lütfen tekrar kod isteyin." },
        { status: 400 }
      );
    }

    const expiresAt = Number(expiresAtStr);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return NextResponse.json(
        { error: "Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin." },
        { status: 400 }
      );
    }

    const secret = process.env.RESEND_API_KEY || "sigalmedia-otp-secure-salt";
    const dataToSign = `${cleanEmail}:${cleanCode}:${expiresAtStr}`;
    const expectedSignature = crypto.createHmac("sha256", secret).update(dataToSign).digest("hex");

    if (expectedSignature !== signature) {
      return NextResponse.json(
        { error: "Girdiğiniz 4 haneli kod hatalı." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: true,
    });
  } catch (error: any) {
    console.error("Kod doğrulama hatası:", error);
    return NextResponse.json(
      { error: "Doğrulama sırasında bir hata oluştu." },
      { status: 500 }
    );
  }
}
