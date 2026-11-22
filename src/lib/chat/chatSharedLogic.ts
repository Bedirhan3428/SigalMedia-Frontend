// Ortak sohbet ayarlarının saf (Firebase'siz) mantığı: temizleme, birleştirme, yazma yolları. Birim testi buradan yapılır.
import { normalizeSettings } from "./chatSettingsStore";
import type { ChatSettings } from "./chatThemes";

export type SharedChatSettings = {
  theme: ChatSettings["theme"];
  bubble: ChatSettings["bubble"];
  bg: Pick<ChatSettings["bg"], "type" | "pattern" | "photo" | "blur" | "dim">;
  /** Arka plan türü/deseni/fotoğrafı en son ne zaman değişti (ms). */
  bgAt: number;
  updatedAt: number;
  updatedBy: string;
};

export const sharedSettingsPath = (chatId: string) => `chats/${chatId}/settings`;

/** Ham RTDB değerini temizler; geçersizse null. */
export function parseShared(raw: unknown): SharedChatSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = normalizeSettings({ theme: r.theme, bubble: r.bubble, bg: r.bg });
  // Özel fotoğraf asla ortak olmaz: "custom" gelirse hazır fotoğrafa düşer.
  const photo = n.bg.photo === "custom" ? "p1" : n.bg.photo;
  return {
    theme: n.theme,
    bubble: n.bubble,
    bg: { type: n.bg.type, pattern: n.bg.pattern, photo, blur: n.bg.blur, dim: n.bg.dim },
    bgAt: typeof r.bgAt === "number" ? r.bgAt : 0,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : "",
  };
}

const usesCustomPhoto = (s: ChatSettings) => s.bg.type === "photo" && s.bg.photo === "custom";

/** Yerel ayarlara ortak ayarları uygular. Yerel özel fotoğraf, daha yeni bir ortak arka plan değişikliği gelene dek korunur. */
export function applyShared(local: ChatSettings, shared: SharedChatSettings | null): ChatSettings {
  if (!shared) return local;
  const keepCustom = usesCustomPhoto(local) && !(shared.bgAt > (local.bg.customAt ?? 0));
  const bg = keepCustom
    ? { ...local.bg, blur: shared.bg.blur, dim: shared.bg.dim }
    : { type: shared.bg.type, pattern: shared.bg.pattern, photo: shared.bg.photo, blur: shared.bg.blur, dim: shared.bg.dim };
  return { ...local, theme: shared.theme, bubble: shared.bubble, bg };
}

/** Kaydetme için RTDB çoklu-yol güncellemesi. Özel fotoğrafta arka plan türü/fotoğraf yazılmaz. */
export function buildSharedUpdate(
  chatId: string,
  uid: string,
  s: ChatSettings,
  now: number = Date.now()
): Record<string, unknown> {
  const base = sharedSettingsPath(chatId);
  const u: Record<string, unknown> = {
    [`${base}/theme`]: s.theme,
    [`${base}/bubble`]: s.bubble,
    [`${base}/bg/blur`]: s.bg.blur,
    [`${base}/bg/dim`]: s.bg.dim,
    [`${base}/updatedAt`]: now,
    [`${base}/updatedBy`]: uid,
  };
  if (!usesCustomPhoto(s)) {
    u[`${base}/bg/type`] = s.bg.type;
    u[`${base}/bg/pattern`] = s.bg.pattern;
    u[`${base}/bg/photo`] = s.bg.photo;
    u[`${base}/bgAt`] = now;
  }
  return u;
}

