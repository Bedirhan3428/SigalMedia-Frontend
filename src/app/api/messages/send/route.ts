// [START] CREATED BY Umut
import { NextRequest, NextResponse, after } from "next/server";
import { notifyChatMessage } from "@/lib/push/server";
import { adminAuth, adminDb, adminRtdb } from "@/lib/firebase-admin";
import { ServerValue } from "firebase-admin/database";
import { decryptMessagePayload } from "@/lib/serverCrypto";
import type { EncryptedMessageEnvelope } from "@/lib/crypto";
import { buildChatId, sendMessageCore, type SendDb, type SendRtdb } from "@/lib/messages/sendCore";

export { buildChatId };

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const [decoded, body] = await Promise.all([
      adminAuth.verifyIdToken(token),
      req.json() as Promise<EncryptedMessageEnvelope>,
    ]);
    const senderUid = decoded.uid;

    let payload;
    try {
      payload = decryptMessagePayload(body);
    } catch {
      return NextResponse.json(
        { error: "Şifreli mesaj doğrulanamadı veya çözülemedi" },
        { status: 400 }
      );
    }

    const result = await sendMessageCore(
      {
        db: adminDb as unknown as SendDb,
        rtdb: adminRtdb as unknown as SendRtdb,
        increment: (n) => ServerValue.increment(n),
      },
      { senderUid, recipientUid: payload.recipientUid, text: payload.text, replyTo: payload.replyTo }
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { chatId, messageId, message, text } = result;
    const recipientUid = payload.recipientUid.trim();

    // Fire-and-forget web push to the recipient; never blocks the response.
    after(() => notifyChatMessage({ senderUid, recipientUid, chatId, text, kind: "text" }));

    return NextResponse.json({
      status: "ok",
      chatId,
      messageId,
      message,
    });
  } catch (error) {
    console.error("Send message API error:", error);
    return NextResponse.json(
      { error: "Mesaj gönderilemedi" },
      { status: 500 }
    );
  }
}
// [END] CREATED BY Umut
