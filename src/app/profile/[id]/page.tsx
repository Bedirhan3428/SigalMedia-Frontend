"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { UserProfile } from "@/types/user";
import { Post } from "@/types/post";
import {
  blockUser,
  sendFollowRequest,
  cancelFollowRequest,
  toggleDirectFollow,
} from "@/services/privacyService";
import {
  ChevronLeft,
  MoreVertical,
  User as UserIcon,
  Lock,
  Grid3X3,
  SquarePlay,
  Repeat2,
  Loader2,
  X,
  Ban,
  Check,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";

type ProfileTab = "posts" | "reels" | "reposts";

export default function VisitedProfilePage() {
  const params = useParams();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const { user, profile: myProfile, loading: authLoading, refreshProfile } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const [isFollowing, setIsFollowing] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const [followActionLoading, setFollowActionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || authLoading || !rawId) return;

    let active = true;

    const loadProfileData = async () => {
      setLoadingProfile(true);
      setIsUnavailable(false);

      try {
        let resolvedUid = decodeURIComponent(rawId);

        // Eğer @username ile gelindiyse veya doğrudan users/{id} bulunamazsa usernames koleksiyonuna bak
        let userSnap = await getDoc(doc(db, "users", resolvedUid));
        if (!userSnap.exists()) {
          const cleanUsername = resolvedUid.replace(/^@/, "").toLowerCase();
          const usernameSnap = await getDoc(doc(db, "usernames", cleanUsername));
          if (usernameSnap.exists()) {
            resolvedUid = usernameSnap.data().uid;
            userSnap = await getDoc(doc(db, "users", resolvedUid));
          }
        }

        if (!userSnap.exists()) {
          if (active) setIsUnavailable(true);
          return;
        }

        // Kendi profiliyse /profile sayfasına yönlendir
        if (user?.uid && resolvedUid === user.uid) {
          router.replace("/profile");
          return;
        }

        // Engel kontrolü (iki yönlü)
        if (user?.uid) {
          const [blockAB, blockBA] = await Promise.all([
            getDoc(doc(db, "blocks", `${user.uid}_${resolvedUid}`)),
            getDoc(doc(db, "blocks", `${resolvedUid}_${user.uid}`)),
          ]);

          if (blockAB.exists() || blockBA.exists()) {
            if (active) setIsUnavailable(true);
            return;
          }

          // Takip ve Takip İsteği durumu kontrolü
          const [followSnap, reqSnap] = await Promise.all([
            getDoc(doc(db, "follows", `${user.uid}_${resolvedUid}`)),
            getDoc(doc(db, "follow_requests", `${user.uid}_${resolvedUid}`)),
          ]);

          if (active) {
            setIsFollowing(followSnap.exists());
            setHasRequested(reqSnap.exists());
          }
        }

        const profileData = userSnap.data() as UserProfile;
        if (active) {
          setTargetProfile(profileData);
        }
      } catch (err) {
        console.error("Profil yükleme hatası:", err);
        if (active) setIsUnavailable(true);
      } finally {
        if (active) setLoadingProfile(false);
      }
    };

    loadProfileData();

    return () => {
      active = false;
    };
  }, [mounted, authLoading, rawId, user?.uid, router]);

  // Gönderileri çek (yalnızca hesap herkese açıksa veya takip ediliyorsa)
  useEffect(() => {
    if (!targetProfile?.uid) return;
    const canViewPosts = !targetProfile.isPrivate || isFollowing;
    if (!canViewPosts) {
      setPosts([]);
      return;
    }

    let active = true;
    setLoadingPosts(true);

    const q = query(
      collection(db, "posts"),
      where("authorId", "==", targetProfile.uid)
    );

    getDocs(q)
      .then((snap) => {
        if (!active) return;
        const list: Post[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<Post, "id">) });
        });
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : new Date(a.createdAt || 0).getTime();
          const tB = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });
        setPosts(list);
      })
      .finally(() => {
        if (active) setLoadingPosts(false);
      });

    return () => {
      active = false;
    };
  }, [targetProfile?.uid, targetProfile?.isPrivate, isFollowing]);

  const handleFollowAction = async () => {
    if (!user?.uid || !targetProfile || followActionLoading) return;
    setFollowActionLoading(true);

    try {
      if (isFollowing) {
        // Takipten çık
        await toggleDirectFollow(targetProfile.uid, true);
        setIsFollowing(false);
        setTargetProfile((prev) =>
          prev
            ? {
                ...prev,
                stats: {
                  ...prev.stats,
                  followersCount: Math.max(0, (prev.stats?.followersCount || 1) - 1),
                },
              }
            : null
        );
        await refreshProfile();
      } else if (targetProfile.isPrivate) {
        if (hasRequested) {
          await cancelFollowRequest(targetProfile.uid);
          setHasRequested(false);
          showToast("Takip isteği geri çekildi");
        } else {
          await sendFollowRequest(targetProfile.uid);
          setHasRequested(true);
          showToast("Takip isteği gönderildi");
        }
      } else {
        // Herkese açık hesabı doğrudan takip et
        await toggleDirectFollow(targetProfile.uid, false);
        setIsFollowing(true);
        setTargetProfile((prev) =>
          prev
            ? {
                ...prev,
                stats: {
                  ...prev.stats,
                  followersCount: (prev.stats?.followersCount || 0) + 1,
                },
              }
            : null
        );
        await refreshProfile();
      }
    } catch {
      showToast("İşlem gerçekleştirilemedi");
    } finally {
      setFollowActionLoading(false);
    }
  };

  const handleConfirmBlock = async () => {
    if (!targetProfile || blocking) return;
    setBlocking(true);

    try {
      const ok = await blockUser(targetProfile.uid);
      if (ok) {
        await refreshProfile();
        setConfirmBlockOpen(false);
        router.replace("/explore");
      } else {
        showToast("Kullanıcı engellenemedi");
      }
    } catch {
      showToast("Kullanıcı engellenemedi");
    } finally {
      setBlocking(false);
    }
  };

  if (!mounted || authLoading || loadingProfile) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isUnavailable || !targetProfile) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
        <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
          <div className="max-w-md mx-auto px-4 h-14 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              title="Geri"
              aria-label="Geri"
              className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="text-base font-bold text-white">Profil</span>
          </div>
        </header>

        <main className="flex-1 max-w-md w-full mx-auto px-4 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
            <UserIcon className="w-8 h-8 text-zinc-600" />
          </div>
          <h1 className="text-base font-bold text-white">
            Bu profile ulaşılamıyor
          </h1>
        </main>

        <BottomNav />
      </div>
    );
  }

  const isLocked = Boolean(targetProfile.isPrivate && !isFollowing);
  const tabPosts = posts.filter((p) => {
    if (activeTab === "posts") return p.type === "post";
    if (activeTab === "reels") return p.type === "reels";
    return false;
  });

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Toast Bildirimi */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-zinc-700 flex items-center gap-2 select-none animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between relative">
          <button
            type="button"
            onClick={() => router.back()}
            title="Geri"
            aria-label="Geri"
            className="p-2 -ml-2 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <span className="text-base font-bold tracking-tight text-white truncate max-w-[200px] text-center">
            @{targetProfile.username}
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              title="Seçenekler"
              aria-label="Seçenekler"
              className="p-2 -mr-2 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmBlockOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-red-400 hover:bg-zinc-800 transition-colors text-left"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Kullanıcıyı Engelle</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Profil İçerik Alanı */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
            {targetProfile.photoURL ? (
              <img
                src={targetProfile.photoURL}
                alt={targetProfile.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-9 h-9 text-zinc-600" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h1 className="text-lg font-bold text-white truncate mb-2">
              {targetProfile.displayName}
            </h1>

            <div className="flex items-center justify-between text-center">
              <div className="flex flex-col items-center flex-1">
                <span className="text-base font-bold text-white leading-none">
                  {targetProfile.stats?.postsCount ?? posts.length}
                </span>
                <span className="text-[12px] text-zinc-400 mt-1">Gönderi</span>
              </div>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => !isLocked && router.push(`/follow?tab=followers&uid=${targetProfile.uid}`)}
                className={`flex flex-col items-center flex-1 ${!isLocked ? "hover:opacity-80 transition-opacity cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-base font-bold text-white leading-none">
                  {targetProfile.stats?.followersCount ?? 0}
                </span>
                <span className="text-[12px] text-zinc-400 mt-1">Takipçi</span>
              </button>
              <button
                type="button"
                disabled={isLocked}
                onClick={() => !isLocked && router.push(`/follow?tab=following&uid=${targetProfile.uid}`)}
                className={`flex flex-col items-center flex-1 ${!isLocked ? "hover:opacity-80 transition-opacity cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-base font-bold text-white leading-none">
                  {targetProfile.stats?.followingCount ?? 0}
                </span>
                <span className="text-[12px] text-zinc-400 mt-1">Takip</span>
              </button>
            </div>
          </div>
        </div>

        {targetProfile.bio && (
          <p className="mt-3 text-sm text-zinc-200 whitespace-pre-line leading-relaxed">
            {targetProfile.bio}
          </p>
        )}

        {/* Takip Et / İstek Gönderildi / Takip Ediliyor Butonu */}
        <div className="mt-4">
          <button
            type="button"
            disabled={followActionLoading}
            onClick={handleFollowAction}
            className={`w-full py-2.5 px-4 text-sm font-semibold rounded-xl transition-all btn-press-subtle disabled:opacity-50 ${
              isFollowing || hasRequested
                ? "bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800"
                : "bg-white hover:bg-zinc-200 text-zinc-950 font-bold"
            }`}
          >
            {isFollowing
              ? "Takip Ediliyor"
              : hasRequested
              ? "İstek Gönderildi"
              : "Takip Et"}
          </button>
        </div>

        {/* Gizli Hesap Kilit Görünümü veya Gönderiler */}
        {isLocked ? (
          <div className="mt-12 py-12 flex flex-col items-center justify-center text-center border-t border-zinc-900">
            <div className="w-14 h-14 rounded-full border border-zinc-800 bg-zinc-900/60 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-zinc-400" />
            </div>
            <h2 className="text-sm font-bold text-white">Bu Hesap Gizli</h2>
          </div>
        ) : (
          <>
            <div className="flex border-b border-zinc-900 mt-6">
              <button
                type="button"
                onClick={() => setActiveTab("posts")}
                title="Gönderiler"
                aria-label="Gönderiler"
                className={`flex-1 py-3 flex items-center justify-center transition-all relative btn-press-subtle ${
                  activeTab === "posts"
                    ? "text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Grid3X3 className="w-5 h-5" />
                {activeTab === "posts" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("reels")}
                title="Reelsler"
                aria-label="Reelsler"
                className={`flex-1 py-3 flex items-center justify-center transition-all relative btn-press-subtle ${
                  activeTab === "reels"
                    ? "text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <SquarePlay className="w-5 h-5" />
                {activeTab === "reels" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("reposts")}
                title="Repostlar"
                aria-label="Repostlar"
                className={`flex-1 py-3 flex items-center justify-center transition-all relative btn-press-subtle ${
                  activeTab === "reposts"
                    ? "text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Repeat2 className="w-5 h-5" />
                {activeTab === "reposts" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                )}
              </button>
            </div>

            <div className="py-4">
              {loadingPosts ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                </div>
              ) : tabPosts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {tabPosts.map((post) => (
                    <div
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className="aspect-square bg-zinc-900 border border-zinc-850 rounded-lg overflow-hidden cursor-pointer relative group"
                    >
                      {post.mediaType === "video" ? (
                        <video
                          src={post.mediaUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={post.mediaUrl}
                          alt={post.caption || "Gönderi"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      )}
                      {post.type === "reels" && (
                        <SquarePlay className="w-4 h-4 text-white absolute top-1.5 right-1.5 drop-shadow" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-zinc-500 text-sm">
                  Henüz gönderi yok
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Gönderi Detay Modalı */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center">
                  {targetProfile.photoURL ? (
                    <img
                      src={targetProfile.photoURL}
                      alt={targetProfile.displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
                <span className="text-xs font-bold text-white">
                  @{targetProfile.username}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full aspect-square bg-zinc-950 flex items-center justify-center overflow-hidden">
              {selectedPost.mediaType === "video" ? (
                <video
                  src={selectedPost.mediaUrl}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                />
              ) : (
                <img
                  src={selectedPost.mediaUrl}
                  alt={selectedPost.caption || "Gönderi"}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {selectedPost.caption && (
              <div className="p-3 text-sm text-zinc-200 border-t border-zinc-800">
                <span className="font-bold mr-1.5">
                  @{targetProfile.username}
                </span>
                {selectedPost.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Engelleme Onay Modalı */}
      {confirmBlockOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !blocking && setConfirmBlockOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-white mb-4">
              @{targetProfile.username} engellensin mi?
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={blocking}
                onClick={handleConfirmBlock}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {blocking ? "Engelleniyor..." : "Engelle"}
              </button>
              <button
                type="button"
                disabled={blocking}
                onClick={() => setConfirmBlockOpen(false)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
