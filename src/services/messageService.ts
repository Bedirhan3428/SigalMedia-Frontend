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
import { getBlockedUserIds } from "@/services/privacyService";
import type { UserProfile } from "@/types/user";

export interface ChatMessage {
  id: string;
  senderUid: string;
  recipientUid: string;
  text: string;
  timestamp: number;
  status: "sent" | "delivered" | "read";
  replyTo?: string | null;
  optimistic?: boolean;
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

export function listenChatMessages(
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const messagesRef = ref(rtdb, `chats/${chatId}/messages`);
  const messageMap = new Map<string, ChatMessage>();
  let initialResolved = false;

  const emitSorted = () => {
    const list = Array.from(messageMap.values());
    list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    callback(list);
  };

  const unsubAdded = onChildAdded(
    messagesRef,
    (snapshot) => {
      const val = snapshot.val() as ChatMessage | null;
      if (!val) return;
      const id = snapshot.key || val.id;
      messageMap.set(id, { ...val, id });
      if (initialResolved) {
        emitSorted();
      }
    },
    () => {
      callback([]);
    }
  );

  const unsubChanged = onChildChanged(
    messagesRef,
    (snapshot) => {
      const val = snapshot.val() as ChatMessage | null;
      if (!val) return;
      const id = snapshot.key || val.id;
      messageMap.set(id, { ...val, id });
      emitSorted();
    },
    () => {}
  );

  const unsubValue = onValue(
    messagesRef,
    (snapshot) => {
      initialResolved = true;
      if (!snapshot.exists()) {
        messageMap.clear();
        callback([]);
        return;
      }
      emitSorted();
    },
    () => {
      initialResolved = true;
      callback([]);
    }
  );

  return () => {
    unsubAdded();
    unsubChanged();
    unsubValue();
  };
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

    if (readReceiptsEnabled) {
      if (existingMessages) {
        for (const msg of existingMessages) {
          if (msg.recipientUid === currentUid && msg.status !== "read") {
            updates[`chats/${chatId}/messages/${msg.id}/status`] = "read";
          }
        }
      } else {
        const msgsSnap = await get(ref(rtdb, `chats/${chatId}/messages`));
        if (msgsSnap.exists()) {
          const msgs = msgsSnap.val() as Record<string, ChatMessage>;
          Object.entries(msgs).forEach(([msgId, msg]) => {
            if (msg.recipientUid === currentUid && msg.status !== "read") {
              updates[`chats/${chatId}/messages/${msgId}/status`] = "read";
            }
          });
        }
      }
    }

    await update(ref(rtdb), updates);
  } catch {
    // Sessizce geç
  }
}

export async function setTypingStatus(
  chatId: string,
  uid: string,
  isTyping: boolean
): Promise<void> {
  if (!chatId || !uid) return;
  try {
    const typingRef = ref(rtdb, `typing/${chatId}/${uid}`);
    await set(typingRef, isTyping);
    if (isTyping) {
      onDisconnect(typingRef).set(false);
    }
  } catch {
    // Sessizce geç
  }
}

export function listenPeerTyping(
  chatId: string,
  peerUid: string,
  callback: (isTyping: boolean) => void
): () => void {
  if (!chatId || !peerUid) return () => {};
  const peerTypingRef = ref(rtdb, `typing/${chatId}/${peerUid}`);
  const unsubscribe = onValue(
    peerTypingRef,
    (snap) => {
      callback(Boolean(snap.val()));
    },
    () => {
      callback(false);
    }
  );
  return () => unsubscribe();
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
