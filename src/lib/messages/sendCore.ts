// Shared server-side message write used by /api/messages/send and /api/push/reply.
// Pure (no firebase-admin import): db / rtdb / increment are injected so it is unit-testable.

export function buildChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

interface Snap {
  exists: boolean;
  data(): unknown;
}
export interface SendDb {
  collection(name: string): { doc(id: string): { get(): Promise<Snap> } };
}
export interface SendRtdb {
  ref(path?: string): {
    push(): { key: string | null };
    update(v: Record<string, unknown>): Promise<unknown>;
  };
}
export interface SendDeps {
  db: SendDb;
  rtdb: SendRtdb;
  increment: (n: number) => unknown;
  now?: () => number;
}
export interface SendInput {
  senderUid: string;
  recipientUid: string;
  text: string;
  replyTo?: unknown;
}
export type SendResult =
  | { ok: true; chatId: string; messageId: string; message: Record<string, unknown>; text: string }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): SendResult => ({ ok: false, status, error });

export async function sendMessageCore(deps: SendDeps, input: SendInput): Promise<SendResult> {
  const { db, rtdb } = deps;
  const senderUid = input.senderUid;
  const recipientUid = input.recipientUid?.trim();
  const cleanText = input.text?.trim();
  const replyTo = input.replyTo || null;

  if (!recipientUid || !cleanText || senderUid === recipientUid) {
    return fail(400, "Geçersiz alıcı veya boş mesaj");
  }
  if (cleanText.length > 2000) {
    return fail(400, "Mesaj çok uzun (maksimum 2000 karakter)");
  }

  const [blockABSnap, blockBASnap, recipientSnap, senderFollowsSnap, recipientFollowsSnap] = await Promise.all([
    db.collection("blocks").doc(`${senderUid}_${recipientUid}`).get(),
    db.collection("blocks").doc(`${recipientUid}_${senderUid}`).get(),
    db.collection("users").doc(recipientUid).get(),
    db.collection("follows").doc(`${senderUid}_${recipientUid}`).get(),
    db.collection("follows").doc(`${recipientUid}_${senderUid}`).get(),
  ]);

  if (blockABSnap.exists || blockBASnap.exists) {
    return fail(403, "Bu kullanıcıya mesaj gönderemezsiniz");
  }
  if (!recipientSnap.exists) {
    return fail(404, "Alıcı bulunamadı");
  }

  const recipientData = recipientSnap.data() as { messageSettings?: { whoCanMessage?: string } };
  const whoCanMessage = recipientData?.messageSettings?.whoCanMessage || "everyone";

  if (whoCanMessage === "none") {
    return fail(403, "Bu kullanıcı mesaj alımını kapatmış");
  }
  if (whoCanMessage !== "everyone") {
    const isFollower = senderFollowsSnap.exists;
    const isFollowing = recipientFollowsSnap.exists;
    if (whoCanMessage === "following" && !isFollowing) {
      return fail(403, "Bu kullanıcı yalnızca takip ettiği kişilerden mesaj kabul ediyor");
    }
    if (whoCanMessage === "followers" && !isFollower) {
      return fail(403, "Bu kullanıcı yalnızca takipçilerinden mesaj kabul ediyor");
    }
    if (whoCanMessage === "mutuals" && (!isFollower || !isFollowing)) {
      return fail(403, "Bu kullanıcı yalnızca karşılıklı takipleştiği kişilerden mesaj kabul ediyor");
    }
  }

  const chatId = buildChatId(senderUid, recipientUid);
  const now = (deps.now ?? Date.now)();
  const newMsgRef = rtdb.ref(`chats/${chatId}/messages`).push();
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
    [`user_chats/${recipientUid}/${chatId}/unreadCount`]: deps.increment(1),
    [`user_chats/${recipientUid}/${chatId}/lastSenderUid`]: senderUid,
    [`typing/${chatId}/${senderUid}`]: false,
  };

  await rtdb.ref().update(updates);
  return { ok: true, chatId, messageId, message: messageNode, text: cleanText };
}
