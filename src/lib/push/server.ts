import * as webpush from "web-push";
import { adminDb } from "@/lib/firebase-admin";
import {
  removeSubscription as removeSub,
  saveSubscription as saveSub,
  sendChatPush,
  type DbLike,
  type PushParams,
  type StoredSub,
} from "./core";

const db = adminDb as unknown as DbLike;

let configured: boolean | null = null;
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    configured = true;
  } else {
    console.warn("[push] VAPID keys missing: push sending disabled");
    configured = false;
  }
  return configured;
}

export const saveSubscription = (uid: string, sub: StoredSub, ua?: string | null) => saveSub(db, uid, sub, ua);
export const removeSubscription = (uid: string, endpoint: string) => removeSub(db, uid, endpoint);

export async function notifyChatMessage(p: PushParams) {
  if (!ensureConfigured()) {
    console.warn("[push] skipped: VAPID not configured");
    return { sent: 0, removed: 0, total: 0 };
  }
  const r = await sendChatPush({ db, push: webpush }, p);
  console.log(`[push] chat=${p.chatId.slice(0, 8)} recipient=${p.recipientUid.slice(0, 6)} subs=${r.total} sent=${r.sent} removed=${r.removed}`);
  return r;
}
