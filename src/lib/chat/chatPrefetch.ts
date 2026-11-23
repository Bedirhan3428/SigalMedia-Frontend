// Warms the local chat cache for chats the user is likely to open next (top of the list, hovered/touched row).
import { fetchChatTail, type UserChatSummary } from "@/services/messageService";
import { mergeWindow } from "./chatCacheLogic";
import { loadChat, peekChat, saveChat } from "./chatCache";

const WARM_TOP = 5;
const WARM_MIN_GAP_MS = 20_000;
const lastWarm = new Map<string, number>();
const inflight = new Set<string>();

/** Fetch the newest page of one chat into the cache, unless the cache is already as new as the list row. */
export async function warmChat(uid: string, row: UserChatSummary): Promise<boolean> {
  const chatId = row.chatId;
  if (!uid || !chatId) return false;
  const k = `${uid}|${chatId}`;
  if (inflight.has(k)) return false;
  const now = Date.now();
  if (now - (lastWarm.get(k) ?? 0) < WARM_MIN_GAP_MS) return false;
  const cached = peekChat(uid, chatId) ?? (await loadChat(uid, chatId));
  const newest = cached?.messages[cached.messages.length - 1];
  if (newest && (row.lastMessageTimestamp || 0) <= (newest.timestamp || 0)) {
    lastWarm.set(k, now);
    return false;
  }
  inflight.add(k);
  try {
    const live = await fetchChatTail(chatId);
    const merged = mergeWindow(cached?.messages ?? [], live, 50);
    saveChat(uid, chatId, merged, { complete: live.length < 50, peer: row.peerProfile ?? cached?.peer });
    lastWarm.set(k, Date.now());
    return true;
  } catch {
    return false;
  } finally {
    inflight.delete(k);
  }
}

/** Warm the first few chats of the list, one after another (low priority, no burst). */
export async function warmTopChats(uid: string, rows: UserChatSummary[]): Promise<void> {
  for (const row of rows.slice(0, WARM_TOP)) {
    await warmChat(uid, row);
  }
}
