"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Search, SquarePen, User as UserIcon, Plus } from "lucide-react";
import BottomNav from "@/components/BottomNav";

interface NoteItem {
  id: string;
  name: string;
  noteText: string;
  isSelf?: boolean;
}

interface MessageItem {
  id: string;
  name: string;
  username: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

export default function MessagesPage() {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { profile, loading } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Örnek Notlar Verisi
  const notes: NoteItem[] = [
    {
      id: "self",
      name: "Notun",
      noteText: "Not bırak...",
      isSelf: true,
    },
    {
      id: "1",
      name: "Alperen",
      noteText: "Yeni parça yayında 🎧",
    },
    {
      id: "2",
      name: "Selin",
      noteText: "Kahve molası ☕",
    },
    {
      id: "3",
      name: "Emir",
      noteText: "Bugün yoğun 💻",
    },
    {
      id: "4",
      name: "Defne",
      noteText: "Hafta sonu planı? ✨",
    },
    {
      id: "5",
      name: "Kaan",
      noteText: "Spordayım 🏋️",
    },
  ];

  // Örnek Mesajlar Verisi
  const messages: MessageItem[] = [
    {
      id: "1",
      name: "Alperen Demir",
      username: "alperend",
      lastMessage: "Akşam maç için toplanıyor muyuz?",
      time: "12d",
      unread: 2,
      online: true,
    },
    {
      id: "2",
      name: "Selin Kaya",
      username: "selink",
      lastMessage: "Harika olmuş, linki kaydettim 👍",
      time: "45d",
      unread: 0,
      online: false,
    },
    {
      id: "3",
      name: "Emir Yılmaz",
      username: "emiry",
      lastMessage: "Reels'i paylaştım, bir baksana",
      time: "2s",
      unread: 1,
      online: true,
    },
    {
      id: "4",
      name: "Defne Aksoy",
      username: "defnea",
      lastMessage: "Tamamdır yarın görüşürüz",
      time: "Dün",
      unread: 0,
      online: false,
    },
    {
      id: "5",
      name: "Kaan Arslan",
      username: "kaana",
      lastMessage: "Dosyayı mail attım kontrol edersin",
      time: "2g",
      unread: 0,
      online: false,
    },
  ];

  // Arama filtresi
  const filteredMessages = messages.filter(
    (msg) =>
      msg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-white">
            @{profile?.username || "mesajlar"}
          </span>

          <button
            type="button"
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
              {/* Not Baloncuğu */}
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
                {/* Balon Ucu */}
                <div
                  className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
                    note.isSelf
                      ? "bg-zinc-900 border-zinc-800"
                      : "bg-zinc-800 border-zinc-700"
                  }`}
                />
              </div>

              {/* Avatar */}
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

                {/* Kendi notun için küçük artı simgesi */}
                {note.isSelf && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white text-zinc-950 flex items-center justify-center ring-2 ring-zinc-950">
                    <Plus className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </div>

              {/* İsim */}
              <span className="text-[11px] text-zinc-400 mt-1 truncate max-w-[64px]">
                {note.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Mesajların Listesi */}
      <main className="max-w-md w-full mx-auto flex-1 px-2 pt-2">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Mesajlar
          </span>
        </div>

        {filteredMessages.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">
            Sohbet bulunamadı.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredMessages.map((msg) => (
              <button
                key={msg.id}
                type="button"
                className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-zinc-900/60 transition-colors btn-press-subtle text-left group"
              >
                {/* Profil Resmi & Çevrimiçi Rozeti */}
                <div className="relative shrink-0">
                  <div className="w-13 h-13 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                    <UserIcon className="w-6 h-6 text-zinc-500" />
                  </div>
                  {msg.online && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                  )}
                </div>

                {/* Sohbet Bilgileri */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h2
                      className={`text-sm truncate ${
                        msg.unread > 0
                          ? "font-bold text-white"
                          : "font-semibold text-zinc-200"
                      }`}
                    >
                      {msg.name}
                    </h2>
                    <span className="text-[11px] text-zinc-500 shrink-0 ml-2">
                      {msg.time}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <p
                      className={`text-xs truncate pr-2 ${
                        msg.unread > 0
                          ? "font-semibold text-zinc-100"
                          : "text-zinc-400"
                      }`}
                    >
                      {msg.lastMessage}
                    </p>

                    {msg.unread > 0 && (
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {msg.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
