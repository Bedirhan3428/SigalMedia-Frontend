/**
 * Yerel "en sık konuşulan" sayacı: bu cihazdan sohbete gönderilen her mesajda artar.
 * Yalnızca paylaşım sayfasındaki sıralamayı besler; sunucuya hiçbir şey yazılmaz.
 */
const KEY = "sigal_chat_send_counts_v1:";

export function getSendCounts(uid: string | null | undefined): Record<string, number> {
  if (!uid || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY + uid);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function bumpSendCount(uid: string | null | undefined, chatId: string): void {
  if (!uid || !chatId || typeof window === "undefined") return;
  try {
    const m = getSendCounts(uid);
    m[chatId] = (m[chatId] || 0) + 1;
    window.localStorage.setItem(KEY + uid, JSON.stringify(m));
  } catch {
    /* depolama kapalı: sıralama sadece son mesaja göre kalır */
  }
}

/** Sayaç azalan, eşitse son mesaj zamanı azalan. */
export function sortByActivity<T extends { chatId: string; lastMessageTimestamp?: number }>(rows: T[], counts: Record<string, number>): T[] {
  return [...rows].sort((a, b) => (counts[b.chatId] || 0) - (counts[a.chatId] || 0) || (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));
}
