"use client";

// [START] CREATED BY Umut
import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Send,
  User as UserIcon,
  Check,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { preloadServerPublicKey } from "@/lib/crypto";
import {
  extractPeerUidFromChatId,
  getPeerBasicProfile,
  listenChatMessages,
  listenPeerPresence,
  listenPeerTyping,
  markChatAsRead,
  sendEncryptedMessage,
  setTypingStatus,
  type ChatMessage,
} from "@/services/messageService";

const GROUP_TIME_THRESHOLD_MS = 3 * 60 * 1000; // 3 dakika

function getBubbleRadiusClass(
  isMine: boolean,
  prevSameCluster: boolean,
  nextSameCluster: boolean
): string {
  if (isMine) {
    if (!prevSameCluster && !nextSameCluster) {
      return "rounded-2xl";
    }
    if (!prevSameCluster && nextSameCluster) {
      return "rounded-2xl rounded-br-[4px]";
    }
    if (prevSameCluster && nextSameCluster) {
      return "rounded-l-2xl rounded-r-[4px]";
    }
    return "rounded-2xl rounded-tr-[4px] rounded-br-2xl";
  } else {
    if (!prevSameCluster && !nextSameCluster) {
      return "rounded-2xl";
    }
    if (!prevSameCluster && nextSameCluster) {
      return "rounded-2xl rounded-bl-[4px]";
    }
    if (prevSameCluster && nextSameCluster) {
      return "rounded-r-2xl rounded-l-[4px]";
    }
    return "rounded-2xl rounded-tl-[4px] rounded-bl-2xl";
  }
}

function formatClockTime(timestamp?: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PopInMessageRow({
  msg,
  isMine,
  radiusClass,
  marginTopClass,
  animatePopIn,
}: {
  msg: ChatMessage;
  isMine: boolean;
  radiusClass: string;
  marginTopClass: string;
  animatePopIn: boolean;
}) {
  const [entered, setEntered] = useState(!animatePopIn);

  useEffect(() => {
    if (!animatePopIn) {
      setEntered(true);
      return;
    }
    const rafId = requestAnimationFrame(() => {
      setEntered(true);
    });
    return () => cancelAnimationFrame(rafId);
  }, [animatePopIn]);

  return (
    <div
      className={`flex ${
        isMine ? "justify-end" : "justify-start"
      } ${marginTopClass}`}
    >
      <div
        className={`max-w-[78%] px-4 py-2.5 text-sm break-words transform-gpu transition-all duration-[90ms] ease-out ${
          isMine ? "origin-bottom-right" : "origin-bottom-left"
        } ${
          entered ? "scale-100 opacity-100" : "scale-90 opacity-0"
        } ${radiusClass} ${
          isMine
            ? "bg-emerald-600 text-white"
            : "bg-zinc-900 text-zinc-100 border border-zinc-800/80"
        }`}
      >
        <span className="whitespace-pre-wrap leading-relaxed">{msg.text}</span>
        <span
          className={`inline-flex items-center gap-1 float-right ml-2.5 mt-1.5 text-[10px] select-none ${
            isMine ? "text-emerald-100/80" : "text-zinc-400/80"
          }`}
        >
          <span>{formatClockTime(msg.timestamp)}</span>
          {isMine && (
            <>
              {msg.status === "read" ? (
                <CheckCheck className="w-3.5 h-3.5 text-white stroke-[2.4]" />
              ) : (
                <Check
                  className={`w-3 h-3 stroke-[2.2] ${
                    msg.optimistic
                      ? "text-emerald-200/50"
                      : "text-emerald-100/80"
                  }`}
                />
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

export default function ChatRoomPage() {
  const params = useParams<{ chatId: string }>();
  const router = useRouter();
  const { profile, loading } = useAuth();

  const chatId = Array.isArray(params?.chatId)
    ? params.chatId[0]
    : params?.chatId || "";

  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const [peerProfile, setPeerProfile] = useState<{
    uid: string;
    username: string;
    displayName: string;
    photoURL: string;
    showOnlineStatus: boolean;
    readReceipts: boolean;
  } | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLocalTypingRef = useRef<boolean>(false);
  const initialHistoryLoadedRef = useRef<boolean>(false);
  const initialMessageIdsRef = useRef<Set<string>>(new Set());

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => {
      setErrorToast(null);
    }, 2600);
  };

  useEffect(() => {
    setMounted(true);
    preloadServerPublicKey();
  }, []);

  const peerUid =
    profile?.uid && chatId
      ? extractPeerUidFromChatId(chatId, profile.uid)
      : null;

  useEffect(() => {
    if (!peerUid) return;
    let active = true;

    getPeerBasicProfile(peerUid).then((res) => {
      if (active) setPeerProfile(res);
    });

    return () => {
      active = false;
    };
  }, [peerUid]);

  useEffect(() => {
    if (!chatId || !profile?.uid) return;

    const myReadReceipts = profile.messageSettings?.readReceipts ?? true;

    const unsubMessages = listenChatMessages(chatId, (list) => {
      if (!initialHistoryLoadedRef.current) {
        initialHistoryLoadedRef.current = true;
        initialMessageIdsRef.current = new Set(list.map((m) => m.id));
      }
      setMessages(list);
      markChatAsRead(chatId, profile.uid, myReadReceipts, list);
    });

    return () => {
      unsubMessages();
      if (isLocalTypingRef.current) {
        isLocalTypingRef.current = false;
        setTypingStatus(chatId, profile.uid, false);
      }
    };
  }, [chatId, profile?.uid, profile?.messageSettings?.readReceipts]);

  useEffect(() => {
    if (!chatId || !peerUid) return;

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
  }, [chatId, peerUid, peerProfile?.showOnlineStatus]);

  const displayedMessages = useMemo(() => {
    if (pendingMessages.length === 0) return messages;
    const confirmedIds = new Set(messages.map((m) => m.id));
    const stillPending = pendingMessages.filter((pm) => {
      if (confirmedIds.has(pm.id)) return false;
      const matchedInRtdb = messages.some(
        (m) =>
          m.senderUid === pm.senderUid &&
          m.text === pm.text &&
          Math.abs(m.timestamp - pm.timestamp) < 10000
      );
      return !matchedInRtdb;
    });
    return [...messages, ...stillPending];
  }, [messages, pendingMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages.length, peerTyping]);

  const handleInputChange = (val: string) => {
    setInputText(val);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(
        inputRef.current.scrollHeight,
        120
      )}px`;
    }

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

  const handleSend = async () => {
    // Klavyenin kapanmaması için odağı anında koru
    inputRef.current?.focus();

    if (!peerUid || !profile?.uid) return;
    const rawValue = inputRef.current ? inputRef.current.value : inputText;
    const clean = rawValue.trim();
    if (!clean) return;

    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }
    setInputText("");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isLocalTypingRef.current && chatId) {
      isLocalTypingRef.current = false;
      setTypingStatus(chatId, profile.uid, false);
    }

    const tempId = `optimistic_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderUid: profile.uid,
      recipientUid: peerUid,
      text: clean,
      timestamp: Date.now(),
      status: "sent",
      optimistic: true,
    };

    setPendingMessages((prev) => [...prev, optimisticMsg]);

    try {
      const result = await sendEncryptedMessage(peerUid, clean);
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...result.message, id: result.messageId, optimistic: false }
            : m
        )
      );
    } catch (err) {
      setPendingMessages((prev) => prev.filter((m) => m.id !== tempId));
      showError(
        err instanceof Error ? err.message : "Mesaj gönderilemedi"
      );
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {errorToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-red-950/90 text-red-200 text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-red-800/60 select-none">
          {errorToast}
        </div>
      )}

      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md shrink-0 z-30 pt-safe">
        <div className="max-w-md mx-auto px-3 h-14 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/messages")}
            title="Geri"
            aria-label="Geri"
            className="p-2 -ml-1 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
              {peerProfile?.photoURL ? (
                <img
                  src={peerProfile.photoURL}
                  alt={peerProfile.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-4 h-4 text-zinc-500" />
              )}
            </div>
            {peerOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-white truncate">
              {peerProfile?.displayName || "Sohbet"}
            </h1>
            <p className="text-[11px] text-zinc-400 truncate">
              {peerTyping
                ? "Yazıyor..."
                : peerOnline
                ? "Çevrimiçi"
                : peerProfile?.username
                ? `@${peerProfile.username}`
                : ""}
            </p>
          </div>
        </div>
      </header>

      {/* Mesaj Akışı */}
      <main className="flex-1 max-w-md w-full mx-auto px-3 py-3 overflow-y-auto flex flex-col">
        {displayedMessages.length === 0 && !peerTyping ? (
          <div className="m-auto text-center text-xs text-zinc-500 select-none">
            Henüz mesaj yok.
          </div>
        ) : (
          <div className="flex flex-col">
            {displayedMessages.map((msg, idx) => {
              const isMine = msg.senderUid === profile?.uid;
              const prevMsg = idx > 0 ? displayedMessages[idx - 1] : null;
              const nextMsg =
                idx < displayedMessages.length - 1
                  ? displayedMessages[idx + 1]
                  : null;

              const prevSameCluster = Boolean(
                prevMsg &&
                  prevMsg.senderUid === msg.senderUid &&
                  Math.abs((msg.timestamp || 0) - (prevMsg.timestamp || 0)) <=
                    GROUP_TIME_THRESHOLD_MS
              );

              const nextSameCluster = Boolean(
                nextMsg &&
                  nextMsg.senderUid === msg.senderUid &&
                  Math.abs((nextMsg.timestamp || 0) - (msg.timestamp || 0)) <=
                    GROUP_TIME_THRESHOLD_MS
              );

              const radiusClass = getBubbleRadiusClass(
                isMine,
                prevSameCluster,
                nextSameCluster
              );

              const marginTopClass =
                idx === 0
                  ? "mt-0"
                  : prevSameCluster
                  ? "mt-1"
                  : "mt-3.5";

              const isNewMessage = !initialMessageIdsRef.current.has(msg.id);

              return (
                <PopInMessageRow
                  key={msg.id}
                  msg={msg}
                  isMine={isMine}
                  radiusClass={radiusClass}
                  marginTopClass={marginTopClass}
                  animatePopIn={isNewMessage}
                />
              );
            })}
          </div>
        )}

        {/* Mesaj Kutusu Kalınlığında ve Belirgin Yazıyor... Balonu */}
        {peerTyping && (
          <div className="mt-3.5 flex justify-start">
            <div className="bg-zinc-900 border border-zinc-800/80 px-4 py-3 rounded-2xl rounded-bl-[4px] inline-flex items-center gap-2 transform-gpu transition-all duration-[90ms] ease-out origin-bottom-left">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:150ms] shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:300ms] shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Giriş Çubuğu (Enter = Yeni Satır, Gönder Butonu = Klavyeyi Kapatmadan Gönder) */}
      <footer className="border-t border-zinc-900 bg-zinc-950 shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="max-w-md mx-auto px-3 py-2.5 flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            enterKeyHint="enter"
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Mesaj yaz..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 resize-none max-h-[120px] leading-snug"
          />

          <button
            type="button"
            aria-disabled={!inputText.trim()}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            onTouchStart={(e) => {
              e.preventDefault();
              if (inputText.trim()) {
                handleSend();
              } else {
                inputRef.current?.focus();
              }
            }}
            onClick={() => {
              if (inputText.trim()) {
                handleSend();
              } else {
                inputRef.current?.focus();
              }
            }}
            aria-label="Gönder"
            title="Gönder"
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all select-none ${
              inputText.trim()
                ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:scale-95 cursor-pointer"
                : "bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed"
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
// [END] CREATED BY Umut
