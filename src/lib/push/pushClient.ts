import { auth } from "@/lib/firebase";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(VAPID)
  );
}

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function authedPost(path: string, body: unknown): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const token = await user.getIdToken();
  const res = await fetch(`/api/push/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Must be called from a user gesture the first time (asks permission). */
export async function enablePush(): Promise<"granted" | "denied" | "default" | "unsupported" | "error"> {
  if (!isPushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  try {
    const reg = await getRegistration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      }));
    const ok = await authedPost("subscribe", { subscription: sub.toJSON() });
    return ok ? "granted" : "error";
  } catch (e) {
    console.error("Push subscribe failed", e);
    return "error";
  }
}

/** Re-sends an existing subscription to the backend (idempotent). Never prompts. */
export async function syncPush(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await authedPost("subscribe", { subscription: sub.toJSON() });
  } catch {
    /* best effort */
  }
}

export async function disablePush(): Promise<void> {
  try {
    const sub = await getExistingSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await authedPost("unsubscribe", { endpoint }).catch(() => false);
    await sub.unsubscribe();
  } catch {
    /* best effort */
  }
}
