"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { getBlockedUserIds } from "@/services/privacyService";
import { UserProfile } from "@/types/user";
import { Search, User as UserIcon, Lock, Loader2 } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function ExplorePage() {
  const [mounted, setMounted] = useState(false);
  const { user, loading } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;
    let active = true;

    const loadDiscoverableUsers = async () => {
      setFetching(true);
      try {
        const [{ blockedByMe, blockedMe }, usersSnap] = await Promise.all([
          user?.uid
            ? getBlockedUserIds(user.uid)
            : Promise.resolve({
                blockedByMe: new Set<string>(),
                blockedMe: new Set<string>(),
              }),
          getDocs(query(collection(db, "users"), limit(50))),
        ]);

        if (!active) return;

        const list: UserProfile[] = [];
        usersSnap.forEach((docSnap) => {
          const data = docSnap.data() as UserProfile;
          const uid = data.uid || docSnap.id;

          if (uid === user?.uid) return;
          if (blockedByMe.has(uid) || blockedMe.has(uid)) return;
          if (!data.username) return;

          list.push({ ...data, uid });
        });

        setUsers(list);
      } catch (err) {
        console.error("Keşfet kullanıcıları yüklenemedi:", err);
      } finally {
        if (active) setFetching(false);
      }
    };

    loadDiscoverableUsers();

    return () => {
      active = false;
    };
  }, [mounted, loading, user?.uid]);

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const trimmed = searchQuery.trim().toLowerCase();
  const filteredUsers = trimmed
    ? users.filter(
        (u) =>
          u.username?.toLowerCase().includes(trimmed) ||
          u.displayName?.toLowerCase().includes(trimmed)
      )
    : users;

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-white">
            Keşfet
          </span>
        </div>
      </header>

      {/* Arama Çubuğu */}
      <div className="max-w-md w-full mx-auto px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Kullanıcı ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
      </div>

      {/* Ana İçerik */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-2">
        {fetching ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            Kullanıcı bulunamadı.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((u) => (
              <Link
                key={u.uid}
                href={`/profile/${u.uid}`}
                className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-900 transition-colors btn-press-subtle"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700/80 flex items-center justify-center shrink-0 overflow-hidden">
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
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-white truncate">
                        {u.displayName}
                      </p>
                      {u.isPrivate && (
                        <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      @{u.username}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
