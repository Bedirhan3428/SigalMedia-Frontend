import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { Resend } from "resend";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Geçerli bir e-posta adresi gereklidir." },
        { status: 400 }
      );
    }

    const host = request.headers.get("host") || "sigalmedia.com.tr";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

    // 1. Firebase Admin SDK ile doğrudan doğrulama bağlantısı üret
    const actionCodeSettings = {
      url: `${baseUrl}/auth/action`,
      handleCodeInApp: true,
    };

    const rawLink = await adminAuth.generateEmailVerificationLink(
      email.trim(),
      actionCodeSettings
    );

    // 2. oobCode parametresini ayıkla ve doğrudan kendi Next.js rotamıza bağla
    const urlObj = new URL(rawLink);
    const oobCode = urlObj.searchParams.get("oobCode");

    const directVerifyLink = `${baseUrl}/auth/action?mode=verifyEmail&oobCode=${oobCode}`;

    // 3. Resend üzerinden özel tasarımlı e-posta gönder
    const resendApiKey = process.env.RESEND_API_KEY;

    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL || "SigalMedia <onboarding@resend.dev>";

      const sendResult = await resend.emails.send({
        from: fromEmail,
        to: [email.trim()],
        subject: "SigalMedia - E-posta Adresinizi Doğrulayın",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 20px; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff;">
            <div style="max-width: 500px; margin: 40px auto; background-color: #09090b; border: 1px solid #27272a; border-radius: 24px; padding: 40px 32px; text-align: center;">
              
              <div style="margin-bottom: 24px;">
                <h1 style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.5px;">SigalMedia</h1>
                <p style="color: #a1a1aa; font-size: 15px; margin: 0; line-height: 1.5;">Topluluğa katılmak için hesabınızı onaylayın.</p>
              </div>

              <div style="margin: 32px 0;">
                <a href="${directVerifyLink}" target="_blank" style="background-color: #ffffff; color: #000000; font-weight: 700; font-size: 16px; padding: 16px 36px; border-radius: 16px; text-decoration: none; display: inline-block;">
                  Hesabımı Doğrula
                </a>
              </div>

              <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0;">
                Bu işlemi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.<br>
                Doğrulama bağlantısı 10 dakika boyunca geçerlidir.
              </p>
            </div>
          </body>
          </html>
        `,
      });

      if (sendResult.error) {
        console.error("Resend e-posta gönderim hatası:", sendResult.error);
        return NextResponse.json(
          { error: "E-posta gönderilemedi: " + sendResult.error.message },
          { status: 500 }
        );
      }
    } else {
      console.warn("RESEND_API_KEY tanımlanmamış. Konsola link basılıyor:", directVerifyLink);
    }

    return NextResponse.json({
      success: true,
      directVerifyLink,
    });
  } catch (error: any) {
    console.error("Doğrulama e-postası üretim hatası:", error);
    return NextResponse.json(
      { error: error?.message || "E-posta bağlantısı üretilemedi." },
      { status: 500 }
    );
  }
}
