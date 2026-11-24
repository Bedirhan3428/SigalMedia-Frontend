"use client";

// [START] CREATED BY Umut
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Info, Send, User as UserIcon } from "lucide-react";
import { ChatBackground, CHAT_CSS, CHAT_MENU_CSS } from "@/components/messages/ChatBackground";
import { ChatCustomizeSheet, type CustomizePage } from "@/components/messages/ChatCustomizeSheet";
import { ChatProfileSheet } from "@/components/messages/ChatProfileSheet";
import { ChatMessageMenu } from "@/components/messages/ChatMessageMenu";
import { chatSettingsStore } from "@/lib/chat/chatSettingsStore";
import {
  applyShared,
  listenSharedChatSettings,
  writeSharedChatSettings,
} from "@/lib/chat/chatSharedStore";
import { useBackLayer } from "@/lib/chat/useBackLayer";
import { PostPreviewCard } from "@/components/messages/PostPreviewCard";
import { parsePostLink } from "@/lib/chat/postLink";
import { bumpSendCount } from "@/lib/chat/chatActivity";
import { useKeyboardViewport } from "@/lib/chat/useKeyboardViewport";
import {
  DEFAULT_CHAT_SETTINGS,
  settingsToVars,
  type ChatSettings,
} from "@/lib/chat/chatThemes";
import { useAuth } from "@/context/AuthContext";
import {
  getLastUid,
  loadChat,
  peekChat,
  peekLastUid,
  saveChat,
  type CachedPeer,
} from "@/lib/chat/chatCache";
import { preloadServerPublicKey } from "@/lib/crypto";
import {
  extractPeerUidFromChatId,
  getPeerBasicProfile,
  openChatFeed,
  type ChatFeed,
  listenPeerPresence,
  listenPeerTyping,
  markChatAsRead,
  sendEncryptedMessage,
  setMessageReaction,
  setTypingStatus,
  type ChatMessage,
} from "@/services/messageService";

const GROUP_TIME_THRESHOLD_MS = 3 * 60 * 1000; // 3 dakika
const TIME_HEADER_INTERVAL_MS = 20 * 60 * 1000; // 20 dakika

// Köşe yarıçapları sohbet köküne ait --r / --rt değişkenlerinden gelir (balon biçimi ayarı).
// Gönderen tarafındaki alt köşe her zaman "kuyruk" (--rt); küme içinde üst köşe de küçülür.
function getBubbleRadiusClass(isMine: boolean, prevSameCluster: boolean): string {
  if (isMine) {
    return `rounded-[var(--r)] rounded-br-[var(--rt)] ${
      prevSameCluster ? "rounded-tr-[var(--rt)]" : ""
    }`;
  }
  return `rounded-[var(--r)] rounded-bl-[var(--rt)] ${
    prevSameCluster ? "rounded-tl-[var(--rt)]" : ""
  }`;
}

function formatChatTimeHeader(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isSameDay) {
    return timeStr;
  }

  const dayStr = date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
  return `${dayStr} ${timeStr}`;
}

// Reaction chip (Instagram style): a badge sitting on the bubble's bottom corner, 15% of its height over the
// bubble. The row below the bubble reserves the remaining 85% plus the 2px background ring.
const CHIP_H = 24;
const CHIP_OVERHANG = CHIP_H * 0.85;
const CHIP_RESERVE = CHIP_OVERHANG + 2;

// A message made only of 1-3 emoji is shown at 30px without a bubble background, with a little space between emoji.
const EMOJI_ONLY_CLASS = "text-[30px] leading-[1.2] tracking-[4px] bg-transparent";
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|⃣|[#*0-9]|\s)+$/u;
const PICTO_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function isEmojiOnly(text: string | undefined): boolean {
  const t = (text || "").trim();
  if (!t || t.length > 40 || !EMOJI_RE.test(t) || !PICTO_RE.test(t)) return false;
  const compact = t.replace(/\s+/g, "");
  const count = graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(compact)).length
    : Array.from(compact).length;
  return count <= 3;
}

const LONG_PRESS_MS = 400;
const LONG_PRESS_SLOP = 10;

type MenuState = {
  mid: string; // data-mid (kararlı anahtar)
  msgId: string;
  mine: boolean;
  radiusClass: string;
  rect: { left: number; top: number; width: number; height: number };
};

function groupReactions(
  reactions: Record<string, string> | undefined,
  myUid: string | undefined
): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const [uid, emoji] of Object.entries(reactions || {})) {
    if (!emoji) continue;
    const g = map.get(emoji) || { emoji, count: 0, mine: false };
    g.count += 1;
    if (uid === myUid) g.mine = true;
    map.set(emoji, g);
  }
  return Array.from(map.values());
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const INPUT_MAX_HEIGHT = 120;

// scrollHeight border'ı içermez; box-sizing: border-box olduğu için border eklenmezse
// textarea 2px kısa kalır ve tek satırda bile kaydırma çubuğu çıkar.
function fitTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const cs = getComputedStyle(el);
  const border =
    (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  const needed = Math.ceil(el.scrollHeight + border);
  el.style.height = `${Math.min(needed, INPUT_MAX_HEIGHT)}px`;
  el.style.overflowY = needed > INPUT_MAX_HEIGHT ? "auto" : "hidden";
}

// Placeholder bubbles shown until the first messages (cache or live) arrive.
function ChatSkeletonBubbles({ plain = false }: { plain?: boolean }) {
  const rows: Array<[boolean, string]> = [
    [false, "w-40"],
    [false, "w-56"],
    [true, "w-44"],
    [true, "w-28"],
    [false, "w-48"],
    [true, "w-52"],
  ];
  return (
    <div
      data-testid="chat-skeleton-bubbles"
      aria-busy="true"
      aria-label="Mesajlar yükleniyor"
      className="mt-auto flex flex-col gap-[7px] animate-pulse select-none"
    >
      {rows.map(([mine, w], i) => (
        <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div
            className={`${w} h-9 ${
              plain
                ? "rounded-2xl bg-zinc-800/70"
                : `rounded-[var(--r)] opacity-40 ${mine ? "chat-sent" : "chat-recv"}`
            }`}
          />
        </div>
      ))}
    </div>
  );
}

const LIST_SLIDE_MS = 420;
const LIST_SLIDE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

type ListSnapshot = { mid: string; bottom: number };

// Yeni mesaj state'e girmeden ÖNCE son kutucuğun (devam eden animasyon dahil) görsel konumunu kaydeder.
// Liste en altta değilse kaydetmez (kullanıcı geçmişi okuyor, animasyon yok).
function takeListSnapshot(
  main: HTMLElement | null,
  inner: HTMLElement | null
): ListSnapshot | null {
  if (!main || !inner) return null;
  if (main.scrollHeight - main.scrollTop - main.clientHeight > 4) return null;
  const nodes = inner.querySelectorAll<HTMLElement>("[data-mid]");
  const last = nodes[nodes.length - 1];
  if (!last) return null;
  return {
    mid: last.dataset.mid || "",
    bottom: last.getBoundingClientRect().bottom,
  };
}

export default function ChatRoomPage() {
  const params = useParams<{ chatId: string }>();
  const router = useRouter();
  const { profile, loading, user } = useAuth();
  const authUid = user?.uid;

  const chatId = Array.isArray(params?.chatId)
    ? params.chatId[0]
    : params?.chatId || "";

  // In-app navigation with a warm cache skips the hydration gate (no SSR markup to match), so bubbles paint in the first frame.
  const [mounted, setMounted] = useState(
    () => typeof window !== "undefined" && peekChat(profile?.uid ?? peekLastUid(), chatId) !== null
  );
  // Cache-first: an in-app navigation finds the chat in memory (sync); a reload reads IndexedDB on mount.
  const memRec = peekChat(profile?.uid ?? peekLastUid(), chatId);
  const [messages, setMessages] = useState<ChatMessage[]>(() => memRec?.messages ?? []);
  const [feedReady, setFeedReady] = useState<boolean>(() => Boolean(memRec));
  // uid remembered from the last session: lets a reload paint cached bubbles before auth resolves.
  const [bootUid, setBootUid] = useState<string | null>(() => (memRec ? memRec.uid : null));
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sheetPage, setSheetPage] = useState<CustomizePage>("root");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const pressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const atBottomRef = useRef(true);
  // Sohbet kökü: klavye açıkken görünür alana sabitlenir (başlık gizlenmez, yazı kutusu klavye altına kaymaz).
  const [chatRootEl, setChatRootEl] = useState<HTMLDivElement | null>(null);
  useKeyboardViewport(chatRootEl);
  const feedRef = useRef<ChatFeed | null>(null);
  const hasMoreRef = useRef(true);
  const olderBusyRef = useRef(false);
  const olderAnchorRef = useRef<{ mid: string; top: number } | null>(null);
  const loadOlderRef = useRef<() => void>(() => {});
  const liveOnceRef = useRef(false);
  const peerRef = useRef<CachedPeer | null>(null);
  const seedRef = useRef<ChatMessage[]>(memRec?.messages ?? []);

  const [peerProfile, setPeerProfile] = useState<{
    uid: string;
    username: string;
    displayName: string;
    photoURL: string;
    showOnlineStatus: boolean;
    readReceipts: boolean;
  } | null>(() => memRec?.peer ?? null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);

  const myUid = profile?.uid ?? bootUid ?? undefined;
  // Auth (profile fetch) is slow: with cached bubbles on hand the chat paints without waiting for it.
  const uiReady = mounted && (!loading || messages.length > 0);

  // Sohbete özel görünüm ayarları (yalnızca frontend, localStorage adaptörü). draft != null: özelleştirme sayfası açık.
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const [draft, setDraft] = useState<ChatSettings | null>(null);
  const [customPhoto, setCustomPhoto] = useState<string | null>(null);

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const listInnerRef = useRef<HTMLDivElement | null>(null);
  const listSnapshotRef = useRef<ListSnapshot | null>(null);
  const prevListLenRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLocalTypingRef = useRef<boolean>(false);
  const initialMessageIdsRef = useRef<Set<string>>(new Set(memRec?.messages.map((m) => m.id) ?? []));
  const stableKeyMapRef = useRef<Map<string, string>>(new Map());
  const lastSendTimestampRef = useRef<number>(0);
  // Mobil klavye IME/otomatik düzeltme tamponunun gönderimden hemen sonra eski metni input'a geri yazmasını engeller
  const ignoreInputUntilRef = useRef<number>(0);

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => {
      setErrorToast(null);
    }, 2600);
  };

  const showInfo = (msg: string) => {
    setInfoToast(msg);
    setTimeout(() => setInfoToast(null), 1800);
  };

  useEffect(() => {
    setMounted(true);
    preloadServerPublicKey();
  }, []);

  // Cache-first boot: read the last uid + this chat's cached tail from IndexedDB (no network, no auth wait).
  useEffect(() => {
    if (!chatId) return;
    let active = true;
    (async () => {
      const uid = profile?.uid ?? (await getLastUid());
      if (!active || !uid) return;
      setBootUid((prev) => prev ?? uid);
      const rec = await loadChat(uid, chatId);
      if (!active || !rec || liveOnceRef.current) return;
      seedRef.current = rec.messages;
      for (const m of rec.messages) initialMessageIdsRef.current.add(m.id);
      setMessages((cur) => (cur.length > 0 ? cur : rec.messages));
      if (rec.peer) setPeerProfile((cur) => cur ?? rec.peer ?? null);
      setFeedReady(true);
    })();
    return () => {
      active = false;
    };
  }, [chatId, profile?.uid]);

  // Sohbet değişince (ve ilk istemci render'ında) ayarları yükle: render sırasında "prop değişti" deseni (effect içinde setState yok).
  const [prefsFor, setPrefsFor] = useState("");
  if (mounted && chatId && prefsFor !== chatId) {
    setPrefsFor(chatId);
    setSettings(chatSettingsStore.get(chatId));
    setCustomPhoto(chatSettingsStore.getPhoto(chatId));
    setDraft(null);
  }
  useEffect(() => {
    if (!chatId) return;
    return chatSettingsStore.subscribe(chatId, setSettings);
  }, [chatId]);

  // Push: drop this chat's stacked notification; ?reply=1 (notification reply without inline support) focuses the composer.
  useEffect(() => {
    if (!chatId) return;
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "clear-chat", tag: "chat-" + chatId });
    } catch {}
    if (new URLSearchParams(window.location.search).get("reply") !== "1") return;
    // The composer mounts after the chat loads: retry briefly.
    let tries = 0;
    const t = setInterval(() => {
      inputRef.current?.focus();
      if (document.activeElement === inputRef.current || ++tries > 25) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, [chatId]);

  // Ortak ayarlar (tema, arka plan, balon): karşı taraf değiştirince canlı gelir; yerel önbelleğe yazılır.
  useEffect(() => {
    if (!chatId || !profile?.uid) return;
    return listenSharedChatSettings(chatId, (shared) => {
      if (!shared) return;
      const cur = chatSettingsStore.get(chatId);
      const next = applyShared(cur, shared);
      if (JSON.stringify(next) !== JSON.stringify(cur)) chatSettingsStore.set(chatId, next);
    });
  }, [chatId, profile?.uid]);

  const openSheet = () => {
    setSheetPage("root");
    setProfileOpen(false);
    setDraft(settings);
  };
  const closeSheet = () => {
    setDraft(null);
    setSheetPage("root");
    setCustomPhoto(chatSettingsStore.getPhoto(chatId));
  };
  // Geri tuşu: menü, profil ve özelleştirme tek bir katman yığını gibi davranır.
  useBackLayer(menu !== null, () => {
    setMenu(null);
    return false;
  });
  useBackLayer(profileOpen || draft !== null, () => {
    if (draft && sheetPage !== "root") {
      setSheetPage("root");
      return true;
    }
    setProfileOpen(false);
    closeSheet();
    return false;
  });
  const syncShared = (s: ChatSettings) => {
    if (!profile?.uid) return;
    writeSharedChatSettings(chatId, profile.uid, s).catch(() =>
      showError("Ortak ayarlar karşıya gönderilemedi")
    );
  };
  const saveSheet = () => {
    if (!draft) return;
    let next = draft;
    if (draft.bg.photo === "custom" && customPhoto) {
      if (!chatSettingsStore.setPhoto(chatId, customPhoto)) {
        showError("Fotoğraf çok büyük, kaydedilemedi");
        next = { ...draft, bg: { ...draft.bg, photo: "p1" } };
        setCustomPhoto(null);
      }
    } else {
      chatSettingsStore.setPhoto(chatId, null);
      if (draft.bg.photo === "custom") next = { ...draft, bg: { ...draft.bg, photo: "p1" } };
    }
    chatSettingsStore.set(chatId, next);
    setDraft(next);
    syncShared(next);
  };
  const resetSheet = () => {
    chatSettingsStore.reset(chatId);
    setCustomPhoto(null);
    setDraft(DEFAULT_CHAT_SETTINGS);
    syncShared(DEFAULT_CHAT_SETTINGS);
  };

  const view = draft ?? settings;
  const cssVars = useMemo(() => settingsToVars(view), [view]);

  const peerUid =
    myUid && chatId ? extractPeerUidFromChatId(chatId, myUid) : null;
  const authedPeerUid = profile?.uid ? peerUid : null;

  useEffect(() => {
    if (!authedPeerUid) return;
    let active = true;

    getPeerBasicProfile(authedPeerUid).then((res) => {
      if (active) setPeerProfile(res);
    });

    return () => {
      active = false;
    };
  }, [authedPeerUid]);

  // Read receipts follow the profile; until it has loaded nothing is marked read (conservative).
  const receiptsRef = useRef(false);
  const latestListRef = useRef<ChatMessage[]>([]);
  const myReadReceipts = profile ? profile.messageSettings?.readReceipts ?? true : false;
  useEffect(() => {
    receiptsRef.current = myReadReceipts;
    if (profile?.uid && latestListRef.current.length > 0) {
      markChatAsRead(chatId, profile.uid, myReadReceipts, latestListRef.current);
    }
  }, [chatId, profile?.uid, myReadReceipts]);

  // The live feed only needs the auth user (not the slower Firestore profile): it starts as early as possible.
  useEffect(() => {
    if (!chatId || !authUid) return;

    const uid = authUid;
    liveOnceRef.current = false;
    hasMoreRef.current = true;
    olderBusyRef.current = false;
    const feed = openChatFeed(
      chatId,
      (list, meta) => {
        if (meta.first) {
          // First live window reconciled with the cache: not animated (nothing is "new" yet).
          liveOnceRef.current = true;
          for (const m of list) initialMessageIdsRef.current.add(m.id);
          listSnapshotRef.current = null;
          setFeedReady(true);
        } else if (meta.older) {
          // Older page prepended: remember the first visible bubble so the scroll position can be restored.
          for (const m of list) initialMessageIdsRef.current.add(m.id);
          const main = mainScrollRef.current;
          const inner = listInnerRef.current;
          olderAnchorRef.current = null;
          if (main && inner) {
            const mt = main.getBoundingClientRect().top;
            for (const n of Array.from(inner.querySelectorAll<HTMLElement>("[data-mid]"))) {
              const r = n.getBoundingClientRect();
              if (r.bottom > mt + 1) {
                olderAnchorRef.current = { mid: n.dataset.mid || "", top: r.top - mt };
                break;
              }
            }
          }
          listSnapshotRef.current = null;
        } else {
          listSnapshotRef.current = takeListSnapshot(
            mainScrollRef.current,
            listInnerRef.current
          );
        }
        setMessages(list);
        latestListRef.current = list;
        markChatAsRead(chatId, uid, receiptsRef.current, list);
        saveChat(uid, chatId, list, { complete: !hasMoreRef.current, peer: peerRef.current });
      },
      {
        seed: () => seedRef.current,
        onHasMore: (v) => {
          hasMoreRef.current = v;
        },
      }
    );
    feedRef.current = feed;

    return () => {
      feed.unsubscribe();
      if (feedRef.current === feed) feedRef.current = null;
      if (isLocalTypingRef.current) {
        isLocalTypingRef.current = false;
        setTypingStatus(chatId, uid, false);
      }
    };
  }, [chatId, authUid]);

  useEffect(() => {
    if (!chatId || !authedPeerUid) return;
    const peerUid = authedPeerUid;

    const unsubTyping = listenPeerTyping(chatId, peerUid, (typing) => {
      setPeerTyping(typing);
    });

    const unsubPresence = listenPeerPresence(peerUid, (pres) => {
      setPeerOnline(
        Boolean(peerProfile?.showOnlineStatus ?? true) && pres.isOnline
      );
    });

    return () => {
      unsubTyping();
      unsubPresence();
    };
  }, [chatId, authedPeerUid, peerProfile?.showOnlineStatus]);

  const displayedMessages = useMemo(() => {
    // Test kancası (yalnızca tarayıcı testlerinde tanımlanır): gerçek mesaj göndermeden önizleme kartını gösterir.
    const injected = typeof window !== "undefined" ? (window as unknown as { __SIGAL_TEST_CHAT_MESSAGES__?: ChatMessage[] }).__SIGAL_TEST_CHAT_MESSAGES__ : undefined;
    const base = injected?.length ? [...messages, ...injected] : messages;
    if (pendingMessages.length === 0) return base;
    const confirmedIds = new Set(base.map((m) => m.id));
    const stillPending = pendingMessages.filter((pm) => {
      if (confirmedIds.has(pm.id)) return false;
      const matchedRtdbMsg = base.find(
        (m) =>
          m.senderUid === pm.senderUid &&
          m.text === pm.text &&
          Math.abs(m.timestamp - pm.timestamp) < 15000
      );
      if (matchedRtdbMsg) {
        stableKeyMapRef.current.set(matchedRtdbMsg.id, pm.id);
        return false;
      }
      return true;
    });
    return [...base, ...stillPending];
  }, [messages, pendingMessages]);

  // Yeni mesaj eklendiğinde liste boyamadan ÖNCE (layout effect) en alta sabitlenir (ilk karede bile kayma
  // yok). Eski mesajlar FLIP ile yumuşakça yukarı kayar: iç sarmalayıcıya +delta translateY verilip 0'a
  // geçirilir. Dış kap overflow-y:clip olduğu için dönüşüm scrollHeight'ı şişirmez / scrollTop'u kıstırmaz.
  useLayoutEffect(() => {
    const el = mainScrollRef.current;
    const oa = olderAnchorRef.current;
    if (oa && el) {
      // Older page prepended: keep the first visible bubble where it was (no pin, no FLIP).
      olderAnchorRef.current = null;
      prevListLenRef.current = displayedMessages.length;
      const n = Array.from(
        listInnerRef.current?.querySelectorAll<HTMLElement>("[data-mid]") ?? []
      ).find((x) => x.dataset.mid === oa.mid);
      if (n) {
        const delta = n.getBoundingClientRect().top - el.getBoundingClientRect().top - oa.top;
        el.scrollTop += delta;
      }
      return;
    }
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    const grew = displayedMessages.length > prevListLenRef.current;
    const snap = listSnapshotRef.current;
    listSnapshotRef.current = null;
    prevListLenRef.current = displayedMessages.length;

    const inner = listInnerRef.current;
    if (!grew || !snap || !inner || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      inner.style.transition = "none";
      inner.style.transform = "";
      return;
    }
    const anchor = Array.from(
      inner.querySelectorAll<HTMLElement>("[data-mid]")
    ).find((n) => n.dataset.mid === snap.mid);
    if (!anchor) return;
    // Devam eden geçişi iptal et, düzen konumunu ölç; delta = eski görsel konum - yeni düzen konumu
    inner.style.transition = "none";
    inner.style.transform = "none";
    const delta = snap.bottom - anchor.getBoundingClientRect().bottom;
    if (Math.abs(delta) < 0.5) {
      inner.style.transform = "";
      return;
    }
    inner.style.transform = `translateY(${delta}px)`;
    void inner.offsetHeight;
    inner.style.transition = `transform ${LIST_SLIDE_MS}ms ${LIST_SLIDE_EASING}`;
    inner.style.transform = "translateY(0px)";
  }, [displayedMessages.length, peerTyping]);

  // Tepki çipleri görününce/değişince liste en alttaysa yeniden sabitle (animasyon yok, FLIP'e dokunmaz).
  const reactionSig = displayedMessages
    .map((m) => (m.reactions ? `${m.id}:${Object.values(m.reactions).join("")}` : ""))
    .join("|");
  useLayoutEffect(() => {
    const el = mainScrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [reactionSig]);

  useLayoutEffect(() => {
    fitTextarea(inputRef.current);
  }, [inputText]);

  const hasList = displayedMessages.length > 0;
  // Liste en alttayken yazı kutusu büyür/küçülürse (main yüksekliği değişir) son mesajlar görünür kalsın.
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let atBottom = true;
    let lastH = el.clientHeight;
    const onScroll = () => {
      atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 4;
      atBottomRef.current = atBottom;
      if (el.scrollTop < 160) loadOlderRef.current();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      if (el.clientHeight === lastH) return;
      lastH = el.clientHeight;
      if (atBottom) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    // Content height changes after the first paint (web font swap re-wrapping text, images): stay pinned.
    const inner = listInnerRef.current;
    const roInner = inner ? new ResizeObserver(() => { if (atBottom) el.scrollTop = el.scrollHeight; }) : null;
    if (inner && roInner) roInner.observe(inner);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      roInner?.disconnect();
    };
  }, [uiReady, hasList]);

  useEffect(() => {
    peerRef.current = peerProfile;
    loadOlderRef.current = () => {
      const feed = feedRef.current;
      if (!feed || olderBusyRef.current || !hasMoreRef.current) return;
      olderBusyRef.current = true;
      feed.loadOlder().finally(() => {
        olderBusyRef.current = false;
      });
    };
  });

  const handleInputChange = (val: string) => {
    // Gönder butonuna basıldıktan hemen sonraki 80ms içinde mobil klavyenin eski kelimeyi geri basmasını engelle
    if (Date.now() < ignoreInputUntilRef.current) {
      if (inputRef.current) {
        inputRef.current.value = "";
        fitTextarea(inputRef.current);
      }
      setInputText("");
      return;
    }

    setInputText(val);

    fitTextarea(inputRef.current);

    if (!chatId || !profile?.uid) return;

    if (val.trim().length > 0) {
      if (!isLocalTypingRef.current) {
        isLocalTypingRef.current = true;
        setTypingStatus(chatId, profile.uid, true);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        isLocalTypingRef.current = false;
        setTypingStatus(chatId, profile.uid, false);
      }, 2000);
    } else if (isLocalTypingRef.current) {
      isLocalTypingRef.current = false;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      setTypingStatus(chatId, profile.uid, false);
    }
  };

  const handleSend = () => {
    inputRef.current?.focus();

    if (!peerUid || !profile?.uid) return;
    const rawValue = inputRef.current ? inputRef.current.value : inputText;
    const clean = rawValue.trim();
    if (!clean) return;

    // 200ms mesaj gönderme (yazma) sınırı
    const now = Date.now();
    if (now - lastSendTimestampRef.current < 200) {
      return;
    }
    lastSendTimestampRef.current = now;
    ignoreInputUntilRef.current = now + 80;

    listSnapshotRef.current = takeListSnapshot(
      mainScrollRef.current,
      listInnerRef.current
    );

    // Input alanını hem React state hem de DOM üzerinden kesin olarak temizle
    setInputText("");
    if (inputRef.current) {
      inputRef.current.value = "";
      fitTextarea(inputRef.current);
      inputRef.current.focus();
    }

    const tempId = `optimistic_${now}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderUid: profile.uid,
      recipientUid: peerUid,
      text: clean,
      timestamp: now,
      status: "sent",
      optimistic: true,
    };

    setPendingMessages((prev) => [...prev, optimisticMsg]);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isLocalTypingRef.current && chatId) {
      isLocalTypingRef.current = false;
      setTypingStatus(chatId, profile.uid, false);
    }

    void sendEncryptedMessage(peerUid, clean)
      .then((result) => {
        bumpSendCount(profile.uid, chatId);
        stableKeyMapRef.current.set(result.messageId, tempId);
        setPendingMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...result.message, id: result.messageId, optimistic: false }
              : m
          )
        );
      })
      .catch((err) => {
        setPendingMessages((prev) => prev.filter((m) => m.id !== tempId));
        showError(
          err instanceof Error ? err.message : "Mesaj gönderilemedi"
        );
      });
  };

  const cancelPress = () => {
    if (pressRef.current) {
      clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
  };
  const menuOpenedAtRef = useRef(0);
  const openMenuFor = (el: HTMLElement, msg: ChatMessage, mid: string, mine: boolean, radiusClass: string) => {
    if (menu) return;
    cancelPress();
    menuOpenedAtRef.current = new Date().getTime();
    const r = el.getBoundingClientRect();
    setMenu({
      mid,
      msgId: msg.id,
      mine,
      radiusClass,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
  };
  const pressHandlers = (msg: ChatMessage, mid: string, mine: boolean, radiusClass: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cancelPress();
      const el = e.currentTarget;
      pressRef.current = {
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(() => {
          pressRef.current = null;
          openMenuFor(el, msg, mid, mine, radiusClass);
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const pr = pressRef.current;
      if (pr && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > LONG_PRESS_SLOP) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      openMenuFor(e.currentTarget, msg, mid, mine, radiusClass);
    },
  });
  const handleReact = (emoji: string) => {
    const m = menu && displayedMessages.find((x) => x.id === menu.msgId);
    if (!m || !profile?.uid || m.optimistic) return;
    const next = m.reactions?.[profile.uid] === emoji ? null : emoji;
    setMenu(null);
    setMessageReaction(chatId, m.id, profile.uid, next).catch(() => showError("Tepki gönderilemedi"));
  };
  const handleCopy = async () => {
    const m = menu && displayedMessages.find((x) => x.id === menu.msgId);
    setMenu(null);
    if (!m) return;
    showInfo((await copyText(m.text)) ? "Kopyalandı" : "Kopyalanamadı");
  };
  const goProfile = () => {
    if (!peerUid) return;
    const target = `/profile/${peerUid}`;
    // Katman girdisini önce geri al, sonra git (aksi halde yarış: push sonra geri alınır).
    const go = () => {
      window.removeEventListener("popstate", go);
      router.push(target);
    };
    if (window.history.state && window.history.state.__chatLayer) {
      window.addEventListener("popstate", go);
      window.history.back();
    } else router.push(target);
  };

  if (!uiReady) {
    // Server-rendered / pre-auth shell: header + skeleton bubbles (no spinner), same frame as the first paint.
    return (
      <div
        data-testid="chat-skeleton"
        aria-busy="true"
        className="h-[100dvh] flex flex-col overflow-hidden bg-zinc-950 text-white pt-safe"
      >
        <div className="shrink-0 h-[60px] px-3 flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-full bg-zinc-800 animate-pulse" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-28 rounded bg-zinc-800 animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-zinc-900 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 max-w-md lg:max-w-2xl w-full mx-auto px-3 py-3 flex flex-col overflow-hidden">
          <ChatSkeletonBubbles plain />
        </div>
      </div>
    );
  }

  const nickname = view.nickname.trim();
  const realName = peerProfile?.displayName || "Sohbet";
  const headerName = nickname || realName;
  const statusText = peerTyping
    ? "Yazıyor..."
    : peerOnline
    ? "Çevrimiçi"
    : peerProfile?.username
    ? `@${peerProfile.username}`
    : "";
  const subLine = nickname
    ? [realName, statusText].filter(Boolean).join(" · ")
    : statusText;
  const canSend = Boolean(inputText.trim());

  const peerAvatar = (
    <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[var(--recv-bg)] text-[var(--recv-t)]">
      {peerProfile?.photoURL ? (
        <img src={peerProfile.photoURL} alt="" className="w-full h-full object-cover" />
      ) : (
        <UserIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
      )}
    </div>
  );

  return (
    <div
      ref={setChatRootEl}
      data-chat-root=""
      data-chat-theme={view.theme}
      style={{ ...cssVars, background: "var(--bg1)", color: "var(--recv-t)" }}
      className="chat-root fixed inset-x-0 top-0 isolate h-[100dvh] flex flex-col overflow-hidden"
    >
      {/* Yalnızca Mesaj Kutucuğunun Aşağıdan Yukarı Çıkma (Slide-Up) Animasyonu */}
      <style>{`
        ${CHAT_CSS}
        ${CHAT_MENU_CSS}
        @keyframes sigalBubbleSlideUp {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        .msg-bubble-slide-up {
          animation: sigalBubbleSlideUp 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }
      `}</style>

      <ChatBackground settings={view} customPhoto={customPhoto} />

      {infoToast && (
        <div
          role="status"
          data-testid="chat-toast"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] text-xs font-semibold px-4 py-2 rounded-full shadow-xl select-none"
          style={{ background: "var(--panel)", color: "var(--panel-t)", border: "1px solid var(--panel-line)" }}
        >
          {infoToast}
        </div>
      )}
      {errorToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] bg-red-950/90 text-red-200 text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-red-800/60 select-none">
          {errorToast}
        </div>
      )}

      {/* Üst Bar */}
      <header
        className="relative shrink-0 z-30 pt-safe"
        style={{
          color: "var(--panel-t)",
          background:
            "linear-gradient(180deg, var(--panel), color-mix(in srgb, var(--panel) 70%, transparent))",
        }}
      >
        <div className="max-w-md lg:max-w-2xl mx-auto px-1.5 h-[60px] flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/messages")}
            title="Geri"
            aria-label="Geri"
            className="w-11 h-11 grid place-items-center rounded-xl shrink-0 hover:bg-[var(--panel-line)] transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-[22px] h-[22px]" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-haspopup="dialog"
            aria-label="Profil bilgisi"
            data-testid="chat-header-profile"
            className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-xl h-11"
          >
          <div className="relative shrink-0">
            <span
              aria-hidden="true"
              className="absolute -inset-[3px] rounded-full border-2 border-[var(--acc)] opacity-90"
            />
            <div className="relative w-[38px] h-[38px] rounded-full bg-[var(--recv-bg)] text-[var(--recv-t)] flex items-center justify-center overflow-hidden">
              {peerProfile?.photoURL ? (
                <img
                  src={peerProfile.photoURL}
                  alt={peerProfile.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-4 h-4" strokeWidth={1.5} />
              )}
            </div>
            {peerOnline && (
              <span className="absolute -bottom-px -right-px w-[11px] h-[11px] rounded-full bg-[#3DDC97] border-2 border-[var(--panel)]" />
            )}
          </div>

          <div className="min-w-0 flex-1 ml-0.5">
            <h1 data-testid="chat-title" className="text-[15px] font-semibold truncate">
              {headerName}
            </h1>
            <p className="text-xs truncate text-[var(--sub)]">{subLine}</p>
          </div>
          </button>

          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            title="Kişi bilgisi"
            aria-label="Kişi bilgisi"
            aria-haspopup="dialog"
            data-testid="chat-info-btn"
            className="w-11 h-11 grid place-items-center rounded-xl shrink-0 hover:bg-[var(--panel-line)] transition-colors"
          >
            <Info className="w-[22px] h-[22px]" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* Mesaj Akışı */}
      <main
        ref={mainScrollRef}
        className="relative z-10 flex-1 max-w-md lg:max-w-2xl w-full mx-auto px-3 py-3 overflow-y-auto overscroll-y-contain flex flex-col [overflow-anchor:none]"
      >
        {displayedMessages.length === 0 && !peerTyping && !feedReady ? (
          <ChatSkeletonBubbles />
        ) : displayedMessages.length === 0 && !peerTyping ? (
          <div className="m-auto text-center text-xs select-none rounded-full px-3 py-1 bg-[var(--chip)] text-[var(--chip-t)]">
            Henüz mesaj yok.
          </div>
        ) : (
          <div className="mt-auto flex flex-col [overflow-y:clip]">
            <div ref={listInnerRef} className="flex flex-col">
            {displayedMessages.map((msg, idx) => {
              const isMine = msg.senderUid === myUid;
              const prevMsg = idx > 0 ? displayedMessages[idx - 1] : null;
              const nextMsg =
                idx < displayedMessages.length - 1
                  ? displayedMessages[idx + 1]
                  : null;

              // İlk mesajda veya son mesajın üzerinden 20 dakika geçtiğinde ortada saat başlığı göster
              const showTimeHeader =
                idx === 0 ||
                (msg.timestamp || 0) - (prevMsg?.timestamp || 0) >=
                  TIME_HEADER_INTERVAL_MS;

              const nextShowsTimeHeader = Boolean(
                nextMsg &&
                  (nextMsg.timestamp || 0) - (msg.timestamp || 0) >=
                    TIME_HEADER_INTERVAL_MS
              );

              const prevSameCluster = Boolean(
                !showTimeHeader &&
                  prevMsg &&
                  prevMsg.senderUid === msg.senderUid &&
                  Math.abs((msg.timestamp || 0) - (prevMsg.timestamp || 0)) <=
                    GROUP_TIME_THRESHOLD_MS
              );

              const nextSameCluster = Boolean(
                !nextShowsTimeHeader &&
                  nextMsg &&
                  nextMsg.senderUid === msg.senderUid &&
                  Math.abs((nextMsg.timestamp || 0) - (msg.timestamp || 0)) <=
                    GROUP_TIME_THRESHOLD_MS
              );

              const radiusClass = getBubbleRadiusClass(isMine, prevSameCluster);

              const marginTopClass =
                idx === 0 || showTimeHeader
                  ? "mt-0"
                  : prevSameCluster
                  ? "mt-[var(--gapc)]"
                  : "mt-[var(--gap)]";

              const stableDomKey =
                stableKeyMapRef.current.get(msg.id) || msg.id;
              const chips = groupReactions(msg.reactions, myUid);
              const emojiOnly = isEmojiOnly(msg.text);
              const isNewMessage =
                Boolean(msg.optimistic) ||
                !initialMessageIdsRef.current.has(msg.id);

              return (
                <div key={stableDomKey} data-mid={stableDomKey} className="flex flex-col">
                  {showTimeHeader && (
                    <div className="my-2 flex justify-center select-none">
                      <span className="text-[11.5px] font-medium px-2.5 py-[3px] rounded-full bg-[var(--chip)] text-[var(--chip-t)]">
                        {formatChatTimeHeader(msg.timestamp)}
                      </span>
                    </div>
                  )}

                  <div
                    className={`flex items-end gap-[7px] ${
                      isMine ? "justify-end" : "justify-start"
                    } ${marginTopClass}`}
                    style={chips.length > 0 ? { marginBottom: CHIP_RESERVE } : undefined}
                  >
                    {!isMine && !view.compact && (
                      nextSameCluster ? (
                        <div className="w-7 shrink-0" aria-hidden="true" />
                      ) : (
                        peerAvatar
                      )
                    )}
                    {/* Animasyon metinde değil doğrudan kutucuğun kendisinde (msg-bubble-slide-up) */}
                    <div
                      data-bubble-id={msg.id}
                      {...pressHandlers(msg, stableDomKey, isMine, radiusClass)}
                      className={`relative max-w-[78%] lg:max-w-[62%] px-0 break-words transform-gpu select-none [-webkit-touch-callout:none] [-webkit-user-select:none] ${
                        isNewMessage ? "msg-bubble-slide-up" : ""
                      } ${radiusClass} ${
                        emojiOnly
                          ? EMOJI_ONLY_CLASS
                          : `text-[length:var(--fs)] leading-[1.35] ${isMine ? "chat-sent" : "chat-recv"}`
                      }`}
                      style={emojiOnly ? undefined : { padding: "var(--pad)" }}
                    >
                      {(() => {
                        const pl = parsePostLink(msg.text);
                        return pl ? (
                          <PostPreviewCard
                            link={pl}
                            onOpen={() => {
                              if (menu || Date.now() - menuOpenedAtRef.current < 700) return;
                              router.push(`/p/${pl.postId}`);
                            }}
                          />
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.text}</span>
                        );
                      })()}
                      {chips.length > 0 && (
                        <div
                          data-testid="msg-reactions"
                          className="absolute z-[1] flex gap-[3px]"
                          style={{
                            bottom: -CHIP_OVERHANG,
                            [isMine ? "right" : "left"]: 8,
                          }}
                        >
                          {chips.map((c) => (
                            <span
                              key={c.emoji}
                              data-emoji={c.emoji}
                              aria-label={`${c.emoji} ${c.count}`}
                              className="msg-chip inline-flex items-center justify-center gap-1 px-2 rounded-full text-[13px] leading-none border select-none whitespace-nowrap"
                              style={{
                                height: CHIP_H,
                                background: isMine ? "var(--sent-b)" : "var(--recv-bg)",
                                color: isMine ? "var(--sent-t)" : "var(--recv-t)",
                                borderColor: "transparent",
                                boxShadow: "0 0 0 2px var(--bg1)",
                              }}
                            >
                              <span>{c.emoji}</span>
                              {c.count > 1 && <span className="text-[11px]">{c.count}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Yazıyor göstergesi */}
        {peerTyping && (
          <div className="mt-[var(--gap)] flex items-end gap-[7px] justify-start">
            {!view.compact && peerAvatar}
            <div
              aria-label="Yazıyor"
              className="chat-recv px-3.5 py-3 rounded-[var(--r)] rounded-bl-[var(--rt)] inline-flex items-center gap-[5px] transform-gpu msg-bubble-slide-up"
            >
              <span className="chat-typing-dot w-[7px] h-[7px] rounded-full bg-[var(--acc)]" />
              <span className="chat-typing-dot w-[7px] h-[7px] rounded-full bg-[var(--acc)] [animation-delay:150ms]" />
              <span className="chat-typing-dot w-[7px] h-[7px] rounded-full bg-[var(--acc)] [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Yüzen yazma çubuğu (Enter = Yeni Satır, Gönder Butonu = Klavyeyi Kapatmadan Tek Sefer Gönder) */}
      <footer className="relative z-20 shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="max-w-md lg:max-w-2xl mx-auto px-2.5 pt-1.5 pb-3">
          <div
            className="flex items-end gap-0.5 rounded-[26px] border px-1 py-1 min-h-[52px] shadow-[0_6px_18px_rgba(0,0,0,.28)] focus-within:border-[var(--acc)] transition-colors"
            style={{
              background: "var(--panel)",
              color: "var(--panel-t)",
              borderColor: "var(--panel-line)",
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              enterKeyHint="enter"
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Mesaj yaz..."
              className="flex-1 min-w-0 bg-transparent border border-transparent rounded-2xl px-3 py-2.5 text-[15.5px] placeholder:text-[var(--sub)] focus:outline-none resize-none overflow-y-hidden max-h-[120px] leading-snug"
              style={{ color: "var(--panel-t)" }}
            />

            <button
              type="button"
              aria-disabled={!canSend}
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                if (inputText.trim() || inputRef.current?.value.trim()) {
                  handleSend();
                } else {
                  inputRef.current?.focus();
                }
              }}
              aria-label="Gönder"
              title="Gönder"
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all select-none ${
                canSend
                  ? "chat-sent active:scale-95 cursor-pointer"
                  : "text-[var(--sub)] cursor-not-allowed"
              }`}
            >
              <Send className="w-[22px] h-[22px]" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </footer>

      {profileOpen && !draft && (
        <ChatProfileSheet
          displayName={realName}
          photoURL={peerProfile?.photoURL || ""}
          onCustomize={openSheet}
          onProfile={goProfile}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {menu && (() => {
        const m = displayedMessages.find((x) => x.id === menu.msgId);
        if (!m) return null;
        return (
          <ChatMessageMenu
            rect={menu.rect}
            mine={menu.mine}
            timestamp={m.timestamp}
            myReaction={myUid ? m.reactions?.[myUid] : undefined}
            canReact={!m.optimistic}
            bubble={
              <div
                className={`w-full h-full break-words ${menu.radiusClass} ${
                  isEmojiOnly(m.text)
                    ? EMOJI_ONLY_CLASS
                    : `text-[length:var(--fs)] leading-[1.35] ${menu.mine ? "chat-sent" : "chat-recv"}`
                }`}
                style={isEmojiOnly(m.text) ? undefined : { padding: "var(--pad)" }}
              >
                {(() => {
                  const pl = parsePostLink(m.text);
                  return pl ? <PostPreviewCard link={pl} interactive={false} /> : <span className="whitespace-pre-wrap">{m.text}</span>;
                })()}
              </div>
            }
            onReact={handleReact}
            onCopy={handleCopy}
            onClose={() => setMenu(null)}
          />
        );
      })()}

      {draft && (
        <ChatCustomizeSheet
          draft={draft}
          onChange={setDraft}
          customPhoto={customPhoto}
          onCustomPhoto={setCustomPhoto}
          page={sheetPage}
          onPage={setSheetPage}
          realName={realName === "Sohbet" ? "" : realName}
          onSave={saveSheet}
          onReset={resetSheet}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
// [END] CREATED BY Umut
