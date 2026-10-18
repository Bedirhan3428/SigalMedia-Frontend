"use client";

// [MODIFIED BY Umut]
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  SquarePen,
  User as UserIcon,
  Plus,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import BottomNav from "@/components/BottomNav";
// [START] CREATED BY Umut
import {
  listenUserChats,
  syncPresenceVisibility,
  searchUsersForNewChat,
  buildChatId,
  formatRelativeMessageTime,
  type UserChatSummary,
} from "@/services/messageService";
import type { UserProfile } from "@/types/user";
// [END] CREATED BY Umut

interface NoteItem {
  id: string;
  name: string;
  noteText: string;
  isSelf?: boolean;
}

// [MODIFIED BY Umut]
export default function MessagesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { profile, loading } = useAuth();

  // [START] CREATED BY Umut
  const [chats, setChats] = useState<UserChatSummary[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [userResults, setUserResults] = useState<UserProfile[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;

    const showOnline = profile.messageSettings?.showOnlineStatus ?? true;
    syncPresenceVisibility(profile.uid, showOnline);

    const unsubscribe = listenUserChats(profile.uid, (list) => {
      setChats(list);
      setLoadingChats(false);
    });

    return () => {
      unsubscribe();
    };
  }, [profile?.uid, profile?.messageSettings?.showOnlineStatus]);

  useEffect(() => {
    if (!newChatOpen || !profile?.uid) {
      setUserResults([]);
      return;
    }

    const clean = userSearchTerm.trim();
    if (!clean) {
      setUserResults([]);
      return;
    }

    let active = true;
    setSearchingUsers(true);
    const timer = setTimeout(() => {
      searchUsersForNewChat(clean, profile.uid)
        .then((res) => {
          if (active) setUserResults(res);
        })
        .finally(() => {
          if (active) setSearchingUsers(false);
        });
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userSearchTerm, newChatOpen, profile?.uid]);
  // [END] CREATED BY Umut

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const notes: NoteItem[] = [
    {
      id: "self",
      name: "Notun",
      noteText: "Not bırak...",
      isSelf: true,
    },
  ];

  // [MODIFIED BY Umut]
  const filteredChats = chats.filter((chat) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const name = chat.peerProfile?.displayName?.toLowerCase() || "";
    const username = chat.peerProfile?.username?.toLowerCase() || "";
    const lastMsg = chat.lastMessage?.toLowerCase() || "";
    return name.includes(q) || username.includes(q) || lastMsg.includes(q);
  });

  const handleStartChatWithUser = (targetUid: string) => {
    if (!profile?.uid) return;
    const chatId = buildChatId(profile.uid, targetUid);
    setNewChatOpen(false);
    router.push(`/messages/${chatId}`);
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-white">
            @{profile?.username || "mesajlar"}
          </span>

          {/* [MODIFIED BY Umut] */}
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            title="Yeni Mesaj"
            aria-label="Yeni Mesaj"
            className="p-2 -mr-2 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <SquarePen className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Arama Çubuğu */}
      <div className="max-w-md w-full mx-auto px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Ara"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
      </div>

      {/* Notlar Bölümü */}
      <section className="max-w-md w-full mx-auto border-b border-zinc-900/80 py-3">
        <div className="px-4 flex items-start gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden select-none">
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className="flex flex-col items-center shrink-0 group focus:outline-none"
            >
              <div className="relative mb-2">
                <div
                  className={`px-2.5 py-1 rounded-2xl text-[11px] font-medium max-w-[80px] truncate shadow-md border ${
                    note.isSelf
                      ? "bg-zinc-900 text-zinc-300 border-zinc-800"
                      : "bg-zinc-800 text-zinc-100 border-zinc-700"
                  }`}
                >
                  {note.noteText}
                </div>
                <div
                  className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
                    note.isSelf
                      ? "bg-zinc-900 border-zinc-800"
                      : "bg-zinc-800 border-zinc-700"
                  }`}
                />
              </div>

              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                  {note.isSelf && profile?.photoURL ? (
                    <img
                      src={profile.photoURL}
                      alt={note.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-6 h-6 text-zinc-500" />
                  )}
                </div>

                {note.isSelf && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white text-zinc-950 flex items-center justify-center ring-2 ring-zinc-950">
                    <Plus className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </div>

              <span className="text-[11px] text-zinc-400 mt-1 truncate max-w-[64px]">
                {note.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Mesajların Listesi */}
      {/* [MODIFIED BY Umut] */}
      <main className="max-w-md w-full mx-auto flex-1 px-2 pt-2">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Mesajlar
          </span>
        </div>

        {loadingChats ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">
            Sohbet bulunamadı.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredChats.map((chat) => {
              const displayName =
                chat.peerProfile?.displayName || "Kullanıcı";
              const photoURL = chat.peerProfile?.photoURL || "";
              const unread = chat.unreadCount || 0;

              return (
                <button
                  key={chat.chatId}
                  type="button"
                  onClick={() => router.push(`/messages/${chat.chatId}`)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-900/60 transition-colors btn-press-subtle text-left group"
                >
                  <div className="relative shrink-0">
                    <div className="w-13 h-13 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                      {photoURL ? (
                        <img
                          src={photoURL}
                          alt={displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserIcon className="w-6 h-6 text-zinc-500" />
                      )}
                    </div>
                    {chat.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h2
                        className={`text-sm truncate ${
                          unread > 0
                            ? "font-bold text-white"
                            : "font-semibold text-zinc-200"
                        }`}
                      >
                        {displayName}
                      </h2>
                      <span className="text-[11px] text-zinc-500 shrink-0 ml-2">
                        {formatRelativeMessageTime(chat.lastMessageTimestamp)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p
                        className={`text-xs truncate pr-2 ${
                          unread > 0
                            ? "font-semibold text-zinc-100"
                            : "text-zinc-400"
                        }`}
                      >
                        {chat.lastSenderUid === profile?.uid ? "Sen: " : ""}
                        {chat.lastMessage}
                      </p>

                      {unread > 0 && (
                        <span className="min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* [START] CREATED BY Umut */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-zinc-950 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-4 flex flex-col max-h-[80dvh]">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-900">
              <h2 className="text-base font-bold text-white">Yeni Mesaj</h2>
              <button
                type="button"
                onClick={() => {
                  setNewChatOpen(false);
                  setUserSearchTerm("");
                }}
                aria-label="Kapat"
                className="p-1.5 text-zinc-400 hover:text-white rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Kullanıcı adı ara..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/60">
              {searchingUsers ? (
                <div className="py-8 flex justify-center">
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : userResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  {userSearchTerm.trim()
                    ? "Kullanıcı bulunamadı"
                    : "Sohbet başlatmak için kullanıcı arayın"}
                </div>
              ) : (
                userResults.map((u) => (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => handleStartChatWithUser(u.uid)}
                    className="w-full flex items-center gap-3 py-2.5 px-2 hover:bg-zinc-900 rounded-xl transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                      {u.photoURL ? (
                        <img
                          src={u.photoURL}
                          alt={u.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserIcon className="w-5 h-5 text-zinc-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-100 truncate">
                        {u.displayName || u.username}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        @{u.username}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* [END] CREATED BY Umut */}

      <BottomNav />
    </div>
  );
}
