// Pure push logic with injected dependencies (testable without Firebase / network).
import { createHash } from "crypto";

export const PUSH_COLLECTION = "push_subscriptions";
const MAX_BODY = 120;

export const subId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

const MEDIA_PLACEHOLDERS: Record<string, string> = {
  image: "📷 Fotoğraf",
  photo: "📷 Fotoğraf",
  media: "📷 Fotoğraf",
  video: "🎥 Video",
  audio: "🎤 Ses mesajı",
  voice: "🎤 Ses mesajı",
  file: "📎 Dosya",
};

export function trimBody(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length <= MAX_BODY ? t : t.slice(0, MAX_BODY - 1).trimEnd() + "…";
}

export function buildBody(text: string, kind: string = "text"): string {
  const k = kind.toLowerCase();
  if (k !== "text" && MEDIA_PLACEHOLDERS[k]) return MEDIA_PLACEHOLDERS[k];
  return trimBody(text) || "💬 Yeni mesaj";
}

export interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
interface DocRef {
  get(): Promise<{ exists: boolean; data(): unknown }>;
  set(v: unknown): Promise<unknown>;
  delete(): Promise<unknown>;
}
export interface DbLike {
  collection(name: string): {
    doc(id: string): DocRef;
    where(f: string, op: "==", v: unknown): {
      get(): Promise<{ size: number; docs: { data(): unknown; ref: { delete(): Promise<unknown> } }[] }>;
    };
  };
}
export interface PushLike {
  sendNotification(sub: StoredSub, payload: string, opts?: Record<string, unknown>): Promise<unknown>;
}

export interface PushParams {
  senderUid: string;
  recipientUid: string;
  chatId: string;
  text: string;
  kind?: string;
}

export async function saveSubscription(db: DbLike, uid: string, sub: StoredSub, userAgent?: string | null) {
  await db.collection(PUSH_COLLECTION).doc(subId(sub.endpoint)).set({
    uid,
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    userAgent: userAgent || null,
    updatedAt: Date.now(),
  });
}

export async function removeSubscription(db: DbLike, uid: string, endpoint: string) {
  const ref = db.collection(PUSH_COLLECTION).doc(subId(endpoint));
  const snap = await ref.get();
  if ((snap.data() as { uid?: string } | undefined)?.uid === uid && snap.exists) await ref.delete();
}

/** Sends a chat push to every device of the recipient. Never throws. */
export async function sendChatPush(
  deps: { db: DbLike; push: PushLike },
  p: PushParams
): Promise<{ sent: number; removed: number; total: number }> {
  const result = { sent: 0, removed: 0, total: 0 };
  try {
    if (!p.recipientUid || p.recipientUid === p.senderUid) return result;
    const [userSnap, subsSnap] = await Promise.all([
      deps.db.collection("users").doc(p.senderUid).get(),
      deps.db.collection(PUSH_COLLECTION).where("uid", "==", p.recipientUid).get(),
    ]);
    const u = (userSnap.exists ? userSnap.data() : {}) as { displayName?: string; username?: string };
    const payload = JSON.stringify({
      title: u.displayName || u.username || "Yeni mesaj",
      body: buildBody(p.text, p.kind),
      chatId: p.chatId,
      senderUid: p.senderUid,
      url: `/messages/${p.chatId}`,
      tag: `chat-${p.chatId}`,
      ts: Date.now(),
    });
    result.total = subsSnap.size;
    await Promise.all(
      subsSnap.docs.map(async (d) => {
        const s = d.data() as StoredSub;
        try {
          await deps.push.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, {
            TTL: 86400,
            urgency: "high",
          });
          result.sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            result.removed++;
            await d.ref.delete().catch(() => {});
          } else {
            console.error("[push] send failed", code ?? (err as Error).message);
          }
        }
      })
    );
  } catch (e) {
    console.error("[push] notify failed", (e as Error).message);
  }
  return result;
}
