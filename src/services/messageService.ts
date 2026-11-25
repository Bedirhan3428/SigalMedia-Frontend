// [START] CREATED BY Umut
import {
  ref,
  onValue,
  onChildAdded,
  onChildChanged,
  update,
  set,
  get,
  push,
  onDisconnect,
  increment,
  query as rtdbQuery,
  orderByKey,
  limitToLast,
  endBefore,
} from "firebase/database";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { auth, db, rtdb } from "@/lib/firebase";
import {
  encryptMessagePayload,
  clearCachedServerPublicKey,
} from "@/lib/crypto";
import { createViewingTracker } from "@/lib/chat/peerViewing";
import { mergeWindow } from "@/lib/chat/chatCacheLogic";
import { getBlockedUserIds } from "@/services/privacyService";
import type { UserProfile } from "@/types/user";

export interface ChatMessage {
  id: string;
  senderUid: string;
  recipientUid: string;
  text: string;
  timestamp: number;
  status: "sent" | "delivered" | "read";
  /** Okundu zamanı (ms). Eski verilerde / kurallar reddederse yoktur. */
  readAt?: number;
  replyTo?: string | null;
  optimistic?: boolean;
  /** uid -> emoji (kişi başına tek tepki) */
  reactions?: Record<string, string>;
}

export interface UserChatSummary {
  chatId: string;
  peerUid: string;
  lastMessage: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  lastSenderUid: string;
  peerProfile?: {
    uid: string;
    username: string;
    displayName: string;
    photoURL: string;
    showOnlineStatus: boolean;
    readReceipts: boolean;
  };
  isOnline?: boolean;
}

const profileCache = new Map<
  string,
  {
    uid: string;
    username: string;
    displayName: string;
    photoURL: string;
    showOnlineStatus: boolean;
    readReceipts: boolean;
  }
>();

export function buildChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

export function extractPeerUidFromChatId(
  chatId: string,
  currentUid: string
): string | null {
  const parts = chatId.split("_");
  if (parts.length !== 2) return null;
  return parts[0] === currentUid ? parts[1] : parts[0];
}

export async function getPeerBasicProfile(peerUid?: string | null) {
  if (!peerUid || typeof peerUid !== "string" || !peerUid.trim()) {
    return {
      uid: "",
      username: "kullanici",
      displayName: "Kullanıcı",
      photoURL: "",
      showOnlineStatus: false,
      readReceipts: true,
    };
  }

  const cleanUid = peerUid.trim();

  if (profileCache.has(cleanUid)) {
    return profileCache.get(cleanUid)!;
  }

  try {
    const snap = await getDoc(doc(db, "users", cleanUid));
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      const summary = {
        uid: cleanUid,
        username: data.username || "kullanici",
        displayName: data.displayName || data.username || "Kullanıcı",
        photoURL: data.photoURL || "",
        showOnlineStatus: data.messageSettings?.showOnlineStatus ?? true,
        readReceipts: data.messageSettings?.readReceipts ?? true,
      };
      profileCache.set(cleanUid, summary);
      return summary;
    }
  } catch (err) {
    console.error("Peer profile fetch error:", err);
  }

  return {
    uid: cleanUid,
    username: "kullanici",
    displayName: "Kullanıcı",
    photoURL: "",
    showOnlineStatus: true,
    readReceipts: true,
  };
}

export async function sendEncryptedMessage(
  recipientUid: string,
  text: string,
  replyTo: string | null = null
): Promise<{ chatId: string; messageId: string; message: ChatMessage }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Oturum açılmamış");
  }

  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error("Boş mesaj gönderilemez");
  }

  const [token, initialEnvelope] = await Promise.all([
    currentUser.getIdToken(),
    encryptMessagePayload({
      recipientUid,
      text: cleanText,
      replyTo,
    }),
  ]);

  let envelope = initialEnvelope;

  let res = await fetch("/api/messages/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(envelope),
  });

  if (res.status === 400) {
    clearCachedServerPublicKey();
    envelope = await encryptMessagePayload({
      recipientUid,
      text: cleanText,
      replyTo,
    });
    res = await fetch("/api/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(envelope),
    });
  }

  if (res.ok) {
    const data = (await res.json()) as {
      chatId: string;
      messageId: string;
      message: ChatMessage;
    };
    return {
      chatId: data.chatId,
      messageId: data.messageId,
      message: data.message,
    };
  }

  if (res.status === 403 || res.status === 404 || res.status === 401) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || "Bu kullanıcıya mesaj gönderilemiyor");
  }

  // Sunucu tarafında yerel geliştirme ortamında Admin SDK yetkisi yoksa istemci üzerinden gizlilik kontrolüyle yedekleme
  const senderUid = currentUser.uid;
  const [recipientSnap, senderFollowsSnap, recipientFollowsSnap] =
    await Promise.all([
      getDoc(doc(db, "users", recipientUid)),
      getDoc(doc(db, "follows", `${senderUid}_${recipientUid}`)),
      getDoc(doc(db, "follows", `${recipientUid}_${senderUid}`)),
    ]);

  if (!recipientSnap.exists()) {
    throw new Error("Alıcı bulunamadı");
  }

  const recipientData = recipientSnap.data() as UserProfile;
  const whoCanMessage =
    recipientData.messageSettings?.whoCanMessage || "everyone";

  if (whoCanMessage === "none") {
    throw new Error("Bu kullanıcı mesaj alımını kapatmış");
  }

  if (whoCanMessage !== "everyone") {
    const isFollower = senderFollowsSnap.exists();
    const isFollowing = recipientFollowsSnap.exists();

    if (whoCanMessage === "following" && !isFollowing) {
      throw new Error(
        "Bu kullanıcı yalnızca takip ettiği kişilerden mesaj kabul ediyor"
      );
    }
    if (whoCanMessage === "followers" && !isFollower) {
      throw new Error(
        "Bu kullanıcı yalnızca takipçilerinden mesaj kabul ediyor"
      );
    }
    if (whoCanMessage === "mutuals" && (!isFollower || !isFollowing)) {
      throw new Error(
        "Bu kullanıcı yalnızca karşılıklı takipleştiği kişilerden mesaj kabul ediyor"
      );
    }
  }

  const chatId = buildChatId(senderUid, recipientUid);
  const now = Date.now();
  const messagesListRef = ref(rtdb, `chats/${chatId}/messages`);
  const newMsgRef = push(messagesListRef);
  const messageId = newMsgRef.key as string;

  const messageNode: ChatMessage = {
    id: messageId,
    senderUid,
    recipientUid,
    text: cleanText,
    timestamp: now,
    status: "sent",
    replyTo,
  };

  await update(ref(rtdb), {
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
    [`user_chats/${recipientUid}/${chatId}/unreadCount`]: increment(1),
    [`user_chats/${recipientUid}/${chatId}/lastSenderUid`]: senderUid,
    [`typing/${chatId}/${senderUid}`]: false,
  });

  return { chatId, messageId, message: messageNode };
}

export function listenUserChats(
  uid: string,
  callback: (chats: UserChatSummary[]) => void
): () => void {
  const userChatsRef = ref(rtdb, `user_chats/${uid}`);

  const unsubscribe = onValue(
    userChatsRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const raw = snapshot.val() as Record<
        string,
        Omit<UserChatSummary, "chatId">
      >;
      const entries = Object.entries(raw).map(([chatId, item]) => ({
        ...item,
        chatId,
      }));

      entries.sort(
        (a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0)
      );

      const enriched = await Promise.all(
        entries.map(async (entry) => {
          const peerUid =
            entry.peerUid ||
            extractPeerUidFromChatId(entry.chatId, uid) ||
            "";
          const peerProfile = await getPeerBasicProfile(peerUid);
          let isOnline = false;
          if (peerProfile.showOnlineStatus && peerUid) {
            try {
              const presSnap = await get(ref(rtdb, `presence/${peerUid}`));
              if (presSnap.exists()) {
                isOnline = Boolean(presSnap.val()?.isOnline);
              }
            } catch {
              isOnline = false;
            }
          }
          return {
            ...entry,
            peerUid,
            peerProfile,
            isOnline,
          };
        })
      );

      callback(enriched);
    },
    () => {
      callback([]);
    }
  );

  return () => unsubscribe();
}

export const CHAT_PAGE_SIZE = 50;

export interface ChatFeed {
  unsubscribe: () => void;
  /** Loads one page older than the oldest known message. Resolves to the number of messages added. */
  loadOlder: () => Promise<number>;
}

export interface ChatFeedOptions {
  pageSize?: number;
  /** Cached messages shown before the live window arrives (reconciled with mergeWindow). */
  seed?: ChatMessage[] | (() => ChatMessage[]);
  /** Called when `hasMore` (older pages exist) changes. */
  onHasMore?: (hasMore: boolean) => void;
}

export interface ChatFeedMeta {
  /** this emission added an older page */
  older?: boolean;
  /** first live window (after the optional cache seed) */
  first?: boolean;
}

/**
 * Live feed of a chat: the last `pageSize` messages (orderByKey + limitToLast; push ids are chronological,
 * so no index is needed) plus on-demand older pages (endBefore + limitToLast). Every loaded page stays
 * live, so reactions/status changes sync. The callback always receives the full merged, sorted list.
 */
export function openChatFeed(
  chatId: string,
  callback: (messages: ChatMessage[], meta: ChatFeedMeta) => void,
  opts: ChatFeedOptions = {}
): ChatFeed {
  const pageSize = opts.pageSize ?? CHAT_PAGE_SIZE;
  const messagesRef = ref(rtdb, `chats/${chatId}/messages`);
  const messageMap = new Map<string, ChatMessage>();
  const unsubs: Array<() => void> = [];
  const firstBatch = new Map<string, ChatMessage>();
  let liveResolved = false;
  let disposed = false;
  let hasMore = true;
  let loadingOlder: Promise<number> | null = null;

  const setHasMore = (v: boolean) => {
    if (hasMore === v) return;
    hasMore = v;
    opts.onHasMore?.(v);
  };
  const sortedList = () => {
    const list = Array.from(messageMap.values());
    list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return list;
  };
  const emit = (meta: ChatFeedMeta = {}) => {
    if (!disposed) callback(sortedList(), meta);
  };
  const getSeed = () => (typeof opts.seed === "function" ? opts.seed() : opts.seed ?? []);
  const onFail = () => {
    liveResolved = true;
    // With a cache seed the cached list stays on screen; otherwise show an empty chat.
    if (getSeed().length === 0) callback([], { first: true });
  };

  const liveQuery = rtdbQuery(messagesRef, orderByKey(), limitToLast(pageSize));
  const take = (snapshot: { key: string | null; val: () => unknown }): ChatMessage | null => {
    const val = snapshot.val() as ChatMessage | null;
    if (!val) return null;
    return { ...val, id: snapshot.key || val.id };
  };

  unsubs.push(
    onChildAdded(
      liveQuery,
      (snapshot) => {
        const msg = take(snapshot);
        if (!msg) return;
        if (!liveResolved) {
          firstBatch.set(msg.id, msg);
          return;
        }
        messageMap.set(msg.id, msg);
        emit();
      },
      onFail
    ),
    onChildChanged(
      liveQuery,
      (snapshot) => {
        const msg = take(snapshot);
        if (!msg) return;
        if (!liveResolved) {
          firstBatch.set(msg.id, msg);
          return;
        }
        messageMap.set(msg.id, msg);
        emit();
      },
      () => {}
    ),
    onValue(
      liveQuery,
      (snapshot) => {
        if (!liveResolved) {
          liveResolved = true;
          const merged = snapshot.exists()
            ? mergeWindow(getSeed(), Array.from(firstBatch.values()), pageSize)
            : [];
          firstBatch.clear();
          messageMap.clear();
          for (const m of merged) messageMap.set(m.id, m);
          setHasMore(snapshot.exists() && snapshot.size >= pageSize);
          emit({ first: true });
          return;
        }
        if (!snapshot.exists()) {
          messageMap.clear();
          emit();
        }
      },
      onFail
    )
  );

  const loadOlder = (): Promise<number> => {
    if (loadingOlder) return loadingOlder;
    if (!liveResolved || !hasMore || disposed) return Promise.resolve(0);
    const oldest = sortedList()[0];
    if (!oldest) return Promise.resolve(0);
    const q = rtdbQuery(messagesRef, orderByKey(), endBefore(oldest.id), limitToLast(pageSize));
    const batch = new Map<string, ChatMessage>();
    let resolved = false;
    loadingOlder = new Promise<number>((resolve) => {
      const finish = (n: number) => {
        loadingOlder = null;
        resolve(n);
      };
      const apply = (snapshot: { key: string | null; val: () => unknown }) => {
        const msg = take(snapshot);
        if (!msg) return;
        if (!resolved) batch.set(msg.id, msg);
        else {
          messageMap.set(msg.id, msg);
          emit();
        }
      };
      unsubs.push(
        onChildAdded(q, apply, () => {
          if (resolved) return;
          resolved = true;
          finish(0);
        }),
        onChildChanged(q, apply, () => {}),
        onValue(
          q,
          () => {
            if (resolved) return;
            resolved = true;
            let added = 0;
            for (const [id, m] of batch) {
              if (!messageMap.has(id)) added += 1;
              messageMap.set(id, m);
            }
            if (batch.size < pageSize) setHasMore(false);
            batch.clear();
            if (added > 0) emit({ older: true });
            finish(added);
          },
          () => {
            if (resolved) return;
            resolved = true;
            finish(0);
          }
        )
      );
    });
    return loadingOlder;
  };

  return {
    unsubscribe: () => {
      disposed = true;
      for (const u of unsubs) u();
    },
    loadOlder,
  };
}

/** Backwards compatible helper: live window only, returns the unsubscribe function. */
export function listenChatMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  return openChatFeed(chatId, (list) => callback(list)).unsubscribe;
}

/** One-shot read of the newest page of a chat (used to warm the local cache). */
export async function fetchChatTail(
  chatId: string,
  pageSize: number = CHAT_PAGE_SIZE
): Promise<ChatMessage[]> {
  const snap = await get(
    rtdbQuery(ref(rtdb, `chats/${chatId}/messages`), orderByKey(), limitToLast(pageSize))
  );
  const out: ChatMessage[] = [];
  snap.forEach((child) => {
    const val = child.val() as ChatMessage | null;
    if (val) out.push({ ...val, id: child.key || val.id });
  });
  out.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return out;
}

export async function markChatAsRead(
  chatId: string,
  currentUid: string,
  readReceiptsEnabled: boolean,
  existingMessages?: ChatMessage[]
): Promise<void> {
  if (!chatId || !currentUid) return;

  try {
    const updates: Record<string, unknown> = {
      [`user_chats/${currentUid}/${chatId}/unreadCount`]: 0,
    };
    const readAtUpdates: Record<string, unknown> = {};
    const readAtNow = Date.now();

    if (readReceiptsEnabled) {
      if (existingMessages) {
        for (const msg of existingMessages) {
          if (msg.recipientUid === currentUid && msg.status !== "read") {
            updates[`chats/${chatId}/messages/${msg.id}/status`] = "read";
            readAtUpdates[`chats/${chatId}/messages/${msg.id}/readAt`] = readAtNow;
          }
        }
      } else {
        const msgsSnap = await get(ref(rtdb, `chats/${chatId}/messages`));
        if (msgsSnap.exists()) {
          const msgs = msgsSnap.val() as Record<string, ChatMessage>;
          Object.entries(msgs).forEach(([msgId, msg]) => {
            if (msg.recipientUid === currentUid && msg.status !== "read") {
              updates[`chats/${chatId}/messages/${msgId}/status`] = "read";
              readAtUpdates[`chats/${chatId}/messages/${msgId}/readAt`] = readAtNow;
            }
          });
        }
      }
    }

    await update(ref(rtdb), updates);

    // Okundu zamanı ayrı ve "best effort": canlı kurallar yeni alanı reddederse okundu durumu yine de yazılmış olur.
    if (Object.keys(readAtUpdates).length > 0) {
      try {
        await update(ref(rtdb), readAtUpdates);
      } catch {
        // readAt yoksa arayüz yalnızca "Görüldü" gösterir
      }
    }
  } catch {
    // Sessizce geç
  }
}

/** Mesaja tepki yazar (emoji) ya da kaldırır (null). Yol: chats/{chatId}/messages/{messageId}/reactions/{uid} */
export async function setMessageReaction(
  chatId: string,
  messageId: string,
  uid: string,
  emoji: string | null
): Promise<void> {
  if (!chatId || !messageId || !uid) return;
  await update(ref(rtdb), {
    [`chats/${chatId}/messages/${messageId}/reactions/${uid}`]: emoji,
  });
}

// Yazıyor durumu: true için zaman damgası (ms) yazılır (kalp atışı); eski istemciler true/false yazar.
// Canlı kurallar sayıyı reddederse bir kez true'ya düşülür (alıcı boolean'ı da anlar).
let typingNumericRejected = false;

export async function setTypingStatus(
  chatId: string,
  uid: string,
  isTyping: boolean
): Promise<void> {
  if (!chatId || !uid) return;
  const typingRef = ref(rtdb, `typing/${chatId}/${uid}`);
  try {
    if (!isTyping) {
      await set(typingRef, false);
      return;
    }
    if (!typingNumericRejected) {
      try {
        await set(typingRef, Date.now());
      } catch {
        typingNumericRejected = true;
        await set(typingRef, true);
      }
    } else {
      await set(typingRef, true);
    }
    onDisconnect(typingRef).set(false);
  } catch {
    // Sessizce geç
  }
}

/** Sayısal değer (kalp atışı) bu süre değişmezse bayat sayılır; alıcının kendi saatiyle ölçülür (saat farkından etkilenmez). */
export const TYPING_STALE_MS = 45000;

export function listenPeerTyping(
  chatId: string,
  peerUid: string,
  callback: (isTyping: boolean) => void
): () => void {
  if (!chatId || !peerUid) return () => {};
  const peerTypingRef = ref(rtdb, `typing/${chatId}/${peerUid}`);
  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (staleTimer) {
      clearTimeout(staleTimer);
      staleTimer = null;
    }
  };
  const unsubscribe = onValue(
    peerTypingRef,
    (snap) => {
      clear();
      const val = snap.val();
      const typing = Boolean(val);
      callback(typing);
      if (typing && typeof val === "number") {
        staleTimer = setTimeout(() => callback(false), TYPING_STALE_MS);
      }
    },
    () => {
      clear();
      callback(false);
    }
  );
  return () => {
    clear();
    unsubscribe();
  };
}

// "Bu sohbetin içinde" sinyali: chatPresence/{chatId}/{uid} = kalp atışı zaman damgası (ms). Sohbet açık VE görünürken yazılır;
// kapanınca/gizlenince/bağlantı kopunca silinir. Canlı kurallar yazmayı reddederse sessizce vazgeçilir: karşı taraf
// "sohbette değil" sayılır ve "Görüldü" eskisi gibi görünür.
// TODO(Supabase): Realtime presence/broadcast kanalına taşınacak, bkz. docs/SUPABASE_PLAN.md §5.
let chatViewingRejected = false;

export async function setChatViewing(chatId: string, uid: string, viewing: boolean): Promise<void> {
  if (!chatId || !uid || chatViewingRejected) return;
  const r = ref(rtdb, `chatPresence/${chatId}/${uid}`);
  try {
    if (!viewing) {
      await set(r, null);
      return;
    }
    await set(r, Date.now());
    onDisconnect(r).remove().catch(() => {});
  } catch {
    chatViewingRejected = true;
  }
}

export function listenPeerChatViewing(
  chatId: string,
  peerUid: string,
  callback: (viewing: boolean) => void
): () => void {
  if (!chatId || !peerUid) return () => {};
  const tracker = createViewingTracker(callback);
  const unsubscribe = onValue(
    ref(rtdb, `chatPresence/${chatId}/${peerUid}`),
    (snap) => tracker.feed(snap.val()),
    () => tracker.feed(null)
  );
  return () => {
    tracker.dispose();
    unsubscribe();
  };
}

export function listenPeerPresence(
  peerUid: string,
  callback: (presence: { isOnline: boolean; lastSeen: number | null }) => void
): () => void {
  if (!peerUid) return () => {};
  const presRef = ref(rtdb, `presence/${peerUid}`);
  const unsubscribe = onValue(
    presRef,
    (snap) => {
      if (!snap.exists()) {
        callback({ isOnline: false, lastSeen: null });
        return;
      }
      const data = snap.val() as { isOnline?: boolean; lastSeen?: number };
      callback({
        isOnline: Boolean(data?.isOnline),
        lastSeen: data?.lastSeen || null,
      });
    },
    () => {
      callback({ isOnline: false, lastSeen: null });
    }
  );
  return () => unsubscribe();
}

export async function syncPresenceVisibility(
  uid: string,
  showOnlineStatus: boolean
): Promise<void> {
  if (!uid) return;
  try {
    const presRef = ref(rtdb, `presence/${uid}`);
    const now = Date.now();
    await set(presRef, {
      isOnline: showOnlineStatus,
      lastSeen: now,
    });
    onDisconnect(presRef).set({
      isOnline: false,
      lastSeen: Date.now(),
    });
  } catch {
    // Sessizce geç
  }
}

export async function searchUsersForNewChat(
  searchTerm: string,
  currentUid: string
): Promise<UserProfile[]> {
  const clean = searchTerm.trim().toLowerCase();
  if (!clean || !currentUid) return [];

  try {
    const [{ blockedByMe, blockedMe }, snap] = await Promise.all([
      getBlockedUserIds(currentUid),
      getDocs(
        query(
          collection(db, "users"),
          where("username_lowercase", ">=", clean),
          where("username_lowercase", "<=", clean + "\uf8ff"),
          limit(15)
        )
      ),
    ]);

    const results: UserProfile[] = [];
    snap.forEach((docSnap) => {
      const u = docSnap.data() as UserProfile;
      if (
        u.uid &&
        u.uid !== currentUid &&
        !blockedByMe.has(u.uid) &&
        !blockedMe.has(u.uid)
      ) {
        results.push(u);
      }
    });
    return results;
  } catch (err) {
    console.error("User search error:", err);
    return [];
  }
}

export function formatRelativeMessageTime(timestamp?: number): string {
  if (!timestamp) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "Şimdi";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}d`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}s`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "Dün";
  if (diffDay < 7) return `${diffDay}g`;
  return new Date(timestamp).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}
// [END] CREATED BY Umut
