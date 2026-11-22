import { NextRequest, NextResponse, after } from "next/server";
import { ServerValue } from "firebase-admin/database";
import { adminDb, adminRtdb } from "@/lib/firebase-admin";
import { notifyChatMessage, verifyReply } from "@/lib/push/server";
import { sendMessageCore, type SendDb, type SendRtdb } from "@/lib/messages/sendCore";

// Inline reply from a notification action. Authorised by the signed reply token (no Firebase session in the SW).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const claims = verifyReply(body?.token);
    if (!claims) return NextResponse.json({ error: "Geçersiz veya süresi dolmuş token" }, { status: 401 });
    if (typeof body?.text !== "string") return NextResponse.json({ error: "Geçersiz mesaj" }, { status: 400 });

    const result = await sendMessageCore(
      {
        db: adminDb as unknown as SendDb,
        rtdb: adminRtdb as unknown as SendRtdb,
        increment: (n) => ServerValue.increment(n),
      },
      { senderUid: claims.from, recipientUid: claims.to, text: body.text }
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    after(() =>
      notifyChatMessage({ senderUid: claims.from, recipientUid: claims.to, chatId: result.chatId, text: result.text, kind: "text" })
    );
    return NextResponse.json({ status: "ok", chatId: result.chatId, messageId: result.messageId });
  } catch (e) {
    console.error("push reply error:", e);
    return NextResponse.json({ error: "Yanıt gönderilemedi" }, { status: 500 });
  }
}
