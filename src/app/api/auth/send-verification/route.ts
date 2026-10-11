import { NextResponse } from "next/server";
import { Resend } from "resend";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi gereklidir." },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. 4 Haneli Sayısal Doğrulama Kodu Üret (1000 - 9999)
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    // 2. 10 Dakikalık Geçerlilik Süresi (600 saniye)
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // 3. Kriptografik İmza Üret (Veritabanı bağımlılığı olmadan güvenli doğrulama)
    const secret = process.env.RESEND_API_KEY || "sigalmedia-otp-secure-salt";
    const dataToSign = `${cleanEmail}:${code}:${expiresAt}`;
    const signature = crypto.createHmac("sha256", secret).update(dataToSign).digest("hex");
    const verificationToken = `${expiresAt}.${signature}`;

    // 4. Resend ile E-posta Gönder
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.warn("UYARI: RESEND_API_KEY tanımlanmamış. Geliştirme modu kodu:", code);
      // Geliştirme veya API anahtarı henüz eklenmemişse kullanıcının kilitlenmemesi için
      return NextResponse.json({
        success: true,
        verificationToken,
        expiresAt,
        devCode: process.env.NODE_ENV !== "production" ? code : undefined,
      });
    }

    const resend = new Resend(resendApiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "SigalMedia <onboarding@resend.dev>";

    const sendResult = await resend.emails.send({
      from: fromEmail,
      to: [cleanEmail],
      subject: `SigalMedia Doğrulama Kodunuz: ${code}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 20px; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff;">
          <div style="max-width: 480px; margin: 40px auto; background-color: #09090b; border: 1px solid #27272a; border-radius: 24px; padding: 40px 32px; text-align: center;">
            <div style="margin-bottom: 24px;">
              <h1 style="color: #ffffff; font-size: 26px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.5px;">SigalMedia</h1>
              <p style="color: #a1a1aa; font-size: 14px; margin: 0; line-height: 1.5;">Hesabınızı doğrulamak için aşağıdaki 4 haneli kodu kullanın.</p>
            </div>

            <div style="margin: 32px 0;">
              <div style="display: inline-block; background-color: #18181b; border: 1px solid #3f3f46; border-radius: 16px; padding: 18px 36px; letter-spacing: 12px; font-size: 36px; font-weight: 800; font-family: monospace; color: #ffffff;">
                ${code}
              </div>
            </div>

            <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0;">
              Bu kod 10 dakika boyunca geçerlidir.<br>
              Eğer bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    if (sendResult.error) {
      console.error("Resend e-posta gönderim hatası:", sendResult.error);
      return NextResponse.json(
        { error: sendResult.error.message || "E-posta gönderilemedi." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      verificationToken,
      expiresAt,
    });
  } catch (error: any) {
    console.error("Doğrulama kodu gönderme hatası:", error);
    return NextResponse.json(
      { error: error?.message || "Doğrulama kodu oluşturulamadı." },
      { status: 500 }
    );
  }
}
