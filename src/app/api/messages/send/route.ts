// [START] CREATED BY Umut
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminRtdb } from "@/lib/firebase-admin";
import { ServerValue } from "firebase-admin/database";
import { decryptMessagePayload } from "@/lib/serverCrypto";
import type { EncryptedMessageEnvelope } from "@/lib/crypto";
import type { MessageSettings } from "@/types/user";

export function buildChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

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

    const recipientUid = payload.recipientUid?.trim();
    const cleanText = payload.text?.trim();
    const replyTo = payload.replyTo || null;

    if (!recipientUid || !cleanText || senderUid === recipientUid) {
      return NextResponse.json(
        { error: "Geçersiz alıcı veya boş mesaj" },
        { status: 400 }
      );
    }

    if (cleanText.length > 2000) {
      return NextResponse.json(
        { error: "Mesaj çok uzun (maksimum 2000 karakter)" },
        { status: 400 }
      );
    }

    // 1. Engel, alıcı profili ve takip durumunu tek paralel sorguda getir
    const blockABRef = adminDb.collection("blocks").doc(`${senderUid}_${recipientUid}`);
    const blockBARef = adminDb.collection("blocks").doc(`${recipientUid}_${senderUid}`);
    const recipientRef = adminDb.collection("users").doc(recipientUid);
    const senderFollowsRecipientRef = adminDb
      .collection("follows")
      .doc(`${senderUid}_${recipientUid}`);
    const recipientFollowsSenderRef = adminDb
      .collection("follows")
      .doc(`${recipientUid}_${senderUid}`);

    const [
      blockABSnap,
      blockBASnap,
      recipientSnap,
      senderFollowsSnap,
      recipientFollowsSnap,
    ] = await Promise.all([
      blockABRef.get(),
      blockBARef.get(),
      recipientRef.get(),
      senderFollowsRecipientRef.get(),
      recipientFollowsSenderRef.get(),
    ]);

    if (blockABSnap.exists || blockBASnap.exists) {
      return NextResponse.json(
        { error: "Bu kullanıcıya mesaj gönderemezsiniz" },
        { status: 403 }
      );
    }

    if (!recipientSnap.exists) {
      return NextResponse.json(
        { error: "Alıcı bulunamadı" },
        { status: 404 }
      );
    }

    const recipientData = recipientSnap.data() as {
      messageSettings?: MessageSettings;
    };
    const whoCanMessage =
      recipientData?.messageSettings?.whoCanMessage || "everyone";

    // 2. Gizlilik (whoCanMessage) kontrolü
    if (whoCanMessage === "none") {
      return NextResponse.json(
        { error: "Bu kullanıcı mesaj alımını kapatmış" },
        { status: 403 }
      );
    }

    if (whoCanMessage !== "everyone") {
      const isFollower = senderFollowsSnap.exists;
      const isFollowing = recipientFollowsSnap.exists;

      if (whoCanMessage === "following" && !isFollowing) {
        return NextResponse.json(
          { error: "Bu kullanıcı yalnızca takip ettiği kişilerden mesaj kabul ediyor" },
          { status: 403 }
        );
      }

      if (whoCanMessage === "followers" && !isFollower) {
        return NextResponse.json(
          { error: "Bu kullanıcı yalnızca takipçilerinden mesaj kabul ediyor" },
          { status: 403 }
        );
      }

      if (whoCanMessage === "mutuals" && (!isFollower || !isFollowing)) {
        return NextResponse.json(
          { error: "Bu kullanıcı yalnızca karşılıklı takipleştiği kişilerden mesaj kabul ediyor" },
          { status: 403 }
        );
      }
    }

    // 3. Realtime Database'e ön okuma yapmadan tek atomik yazma (ServerValue.increment ile sıfır gecikme)
    const chatId = buildChatId(senderUid, recipientUid);
    const now = Date.now();
    const messagesRef = adminRtdb.ref(`chats/${chatId}/messages`);
    const newMsgRef = messagesRef.push();
    const messageId = newMsgRef.key as string;

    const messageNode = {
      id: messageId,
      senderUid,
      recipientUid,
      text: cleanText,
      timestamp: now,
      status: "sent",
      replyTo,
    };

    const updates: Record<string, unknown> = {
      [`chats/${chatId}/metadata/participants/${senderUid}`]: true,
      [`chats/${chatId}/metadata/participants/${recipientUid}`]: true,
      [`chats/${chatId}/metadata/updatedAt`]: now,
      [`chats/${chatId}/messages/${messageId}`]: messageNode,
      [`user_chats/${senderUid}/${chatId}`]: {
        chatId,
        peerUid: recipientUid,
        lastMessage: cleanText,
        lastMessageTimestamp: now,
        unreadCount: 0,
        lastSenderUid: senderUid,
      },
      [`user_chats/${recipientUid}/${chatId}/chatId`]: chatId,
      [`user_chats/${recipientUid}/${chatId}/peerUid`]: senderUid,
      [`user_chats/${recipientUid}/${chatId}/lastMessage`]: cleanText,
      [`user_chats/${recipientUid}/${chatId}/lastMessageTimestamp`]: now,
      [`user_chats/${recipientUid}/${chatId}/unreadCount`]: ServerValue.increment(1),
      [`user_chats/${recipientUid}/${chatId}/lastSenderUid`]: senderUid,
      [`typing/${chatId}/${senderUid}`]: false,
    };

    await adminRtdb.ref().update(updates);

    return NextResponse.json({
      status: "ok",
      chatId,
      messageId,
      message: messageNode,
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
