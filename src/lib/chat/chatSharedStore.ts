// Sohbetin ORTAK görünüm ayarları (tema, arka plan, balon biçimi): RTDB `chats/{chatId}/settings`.
// İki taraf da yazabilir ve canlı görür. Metin boyutu, sıkı görünüm, takma ad ve galeri fotoğrafı kişisel/yerel kalır.
import { onValue, ref, update } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { buildSharedUpdate, parseShared, sharedSettingsPath, type SharedChatSettings } from "./chatSharedLogic";
import type { ChatSettings } from "./chatThemes";

export { applyShared } from "./chatSharedLogic";
export type { SharedChatSettings } from "./chatSharedLogic";

export async function writeSharedChatSettings(chatId: string, uid: string, s: ChatSettings): Promise<void> {
  if (!chatId || !uid) return;
  await update(ref(rtdb), buildSharedUpdate(chatId, uid, s));
}

export function listenSharedChatSettings(
  chatId: string,
  cb: (shared: SharedChatSettings | null) => void
): () => void {
  if (!chatId) return () => {};
  return onValue(
    ref(rtdb, sharedSettingsPath(chatId)),
    (snap) => cb(snap.exists() ? parseShared(snap.val()) : null),
    () => cb(null)
  );
}
