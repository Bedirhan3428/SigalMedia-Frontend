"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Search, User as UserIcon, Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import BottomNav from "@/components/BottomNav";
import { FollowUserData } from "@/types/follow";
import { UserProfile } from "@/types/user";
import {
  getUserFollowers,
  getUserFollowing,
  toggleFollow,
} from "@/services/followService";

function FollowPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "following" ? "following" : "followers";
  const targetUidParam = searchParams.get("uid");

  const [activeTab, setActiveTab] = useState<"followers" | "following">(
    initialTab
  );
  const [searchQuery, setSearchQuery] = useState("");
  const { user, profile, loading, refreshProfile } = useAuth();

  const targetUid = targetUidParam || user?.uid || "";
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<
    Record<"followers" | "following", FollowUserData[]>
  >({
    followers: [],
    following: [],
  });
  const [loadingList, setLoadingList] = useState(true);
  const [pendingFollowIds, setPendingFollowIds] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "following" || tabParam === "followers") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!targetUid || !user?.uid) return;

    const loadFollowData = async () => {
      setLoadingList(true);
      try {
        if (targetUid === user.uid && profile) {
          setTargetProfile(profile);
        } else {
          const userSnap = await getDoc(doc(db, "users", targetUid));
          if (userSnap.exists()) {
            setTargetProfile(userSnap.data() as UserProfile);
          }
        }

        const [followersData, followingData] = await Promise.all([
          getUserFollowers(targetUid, user.uid),
          getUserFollowing(targetUid, user.uid),
        ]);

        setUsersList({
          followers: followersData,
          following: followingData,
        });
      } catch (err) {
        console.error("Takip listesi yüklenirken hata:", err);
      } finally {
        setLoadingList(false);
      }
    };

    loadFollowData();
  }, [targetUid, user?.uid, profile]);

  const handleToggleFollow = async (
    e: React.MouseEvent,
    targetItemUid: string
  ) => {
    e.stopPropagation();
    if (!user?.uid || pendingFollowIds.has(targetItemUid)) return;

    const existingUser =
      usersList.followers.find((u) => u.uid === targetItemUid) ||
      usersList.following.find((u) => u.uid === targetItemUid);
    if (!existingUser) return;

    const previousState = existingUser.isFollowing;

    // Optimistic update
    setUsersList((prev) => {
      const updateArr = (list: FollowUserData[]) =>
        list.map((u) =>
          u.uid === targetItemUid ? { ...u, isFollowing: !previousState } : u
        );
      return {
        followers: updateArr(prev.followers),
        following: updateArr(prev.following),
      };
    });
    setPendingFollowIds((prev) => new Set(prev).add(targetItemUid));

    try {
      const result = await toggleFollow(targetItemUid);
      setUsersList((prev) => {
        const updateArr = (list: FollowUserData[]) =>
          list.map((u) =>
            u.uid === targetItemUid
              ? { ...u, isFollowing: result.isFollowing }
              : u
          );
        return {
          followers: updateArr(prev.followers),
          following: updateArr(prev.following),
        };
      });
      await refreshProfile();
    } catch (err) {
      console.error("Takip hatası:", err);
      // Rollback
      setUsersList((prev) => {
        const updateArr = (list: FollowUserData[]) =>
          list.map((u) =>
            u.uid === targetItemUid ? { ...u, isFollowing: previousState } : u
          );
        return {
          followers: updateArr(prev.followers),
          following: updateArr(prev.following),
        };
      });
    } finally {
      setPendingFollowIds((prev) => {
        const next = new Set(prev);
        next.delete(targetItemUid);
        return next;
      });
    }
  };

  const currentUsers = usersList[activeTab].filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            title="Geri"
            aria-label="Geri"
            className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <span className="text-base font-bold tracking-tight text-white truncate max-w-[200px]">
            @{targetProfile?.username || profile?.username || "kullanici"}
          </span>

          <div className="w-8" />
        </div>

        {/* 2'li Sekme Çubuğu */}
        <div className="max-w-md mx-auto flex border-t border-zinc-900 select-none">
          <button
            type="button"
            onClick={() => setActiveTab("followers")}
            className={`flex-1 py-3 text-center text-sm font-semibold transition-colors relative btn-press-subtle ${
              activeTab === "followers"
                ? "text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Takipçiler
            <span className="text-xs ml-1.5 opacity-60">
              ({usersList.followers.length})
            </span>
            {activeTab === "followers" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("following")}
            className={`flex-1 py-3 text-center text-sm font-semibold transition-colors relative btn-press-subtle ${
              activeTab === "following"
                ? "text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Takip Edilen
            <span className="text-xs ml-1.5 opacity-60">
              ({usersList.following.length})
            </span>
            {activeTab === "following" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
            )}
          </button>
        </div>
      </header>

      {/* Arama Alanı */}
      <div className="max-w-md w-full mx-auto px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Kullanıcı ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
      </div>

      {/* Kullanıcı Listesi */}
      <main className="max-w-md w-full mx-auto flex-1 px-4 pt-2">
        {loadingList ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : currentUsers.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-sm">
            {activeTab === "followers"
              ? "Henüz takipçi bulunmuyor."
              : "Henüz takip edilen kullanıcı bulunmuyor."}
          </div>
        ) : (
          <div className="space-y-2">
            {currentUsers.map((item) => (
              <div
                key={item.uid}
                onClick={() => router.push(`/profile/${item.uid}`)}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 transition-colors cursor-pointer"
              >
                {/* Avatar & Kullanıcı Bilgisi */}
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700/80 flex items-center justify-center shrink-0 overflow-hidden">
                    {item.photoURL ? (
                      <img
                        src={item.photoURL}
                        alt={item.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {item.displayName}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      @{item.username}
                    </p>
                  </div>
                </div>

                {/* Kendi hesabı değilse Takip Et / Takip Ediliyor Butonu */}
                {item.uid !== user?.uid && (
                  <button
                    type="button"
                    disabled={pendingFollowIds.has(item.uid)}
                    onClick={(e) => handleToggleFollow(e, item.uid)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all btn-press-subtle shrink-0 ${
                      item.isFollowing
                        ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                        : "bg-white hover:bg-zinc-200 text-zinc-950 font-bold"
                    }`}
                  >
                    {item.isFollowing ? "Takip Ediliyor" : "Takip Et"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}

export default function FollowPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <FollowPageContent />
    </Suspense>
  );
}
