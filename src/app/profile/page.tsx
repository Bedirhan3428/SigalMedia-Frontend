"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Post } from "@/types/post";
import {
  User as UserIcon,
  Grid3X3,
  Plus,
  Menu,
  X,
  Loader2,
  Trash2,
  Check,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { FaPhotoFilm } from "react-icons/fa6";
import { TbRepeat } from "react-icons/tb";

type ProfileTab = "posts" | "reels" | "reposts";

export default function ProfilePage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const { profile, loading, refreshProfile } = useAuth();

  // Gönderiler Durumu
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // Büyük Profil Fotoğrafı Modalı
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  // Bildirim / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Gönderileri Firestore'dan Çek
  const fetchUserPosts = async () => {
    if (!profile?.uid) return;
    try {
      setLoadingPosts(true);
      const q = query(
        collection(db, "posts"),
        where("authorId", "==", profile.uid)
      );
      const snapshot = await getDocs(q);
      const list: Post[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...(docSnap.data() as Omit<Post, "id">) });
      });

      // Tarihe göre azalan sırala
      list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setPosts(list);
    } catch (err) {
      console.error("Gönderiler yüklenirken hata:", err);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (profile?.uid) {
      fetchUserPosts();
    }
  }, [profile?.uid]);

  // [START] AeroCode
  // Profili Paylaş (Önizlemenin çıkması için yalnızca saf profil linki paylaşılır)
  const handleShareProfile = async () => {
    if (!profile?.uid) return;
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "https://sigalmedia.com.tr";
    const shareUrl = `${origin}/profile/${profile.uid}?s=1`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return;
        }
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Profil bağlantısı kopyalandı");
        return;
      } catch {
        // Fallback copy below
      }
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      showToast("Profil bağlantısı kopyalandı");
    } catch {
      showToast("Bağlantı kopyalanamadı");
    }
  };
  // [END] AeroCode

  // Gönderiyi Sil
  const handleDeletePost = async (postId: string) => {
    if (!profile?.uid) return;
    try {
      setIsDeletingPost(true);
      await deleteDoc(doc(db, "posts", postId));
      await updateDoc(doc(db, "users", profile.uid), {
        "stats.postsCount": increment(-1),
      });

      await refreshProfile();
      await fetchUserPosts();
      setSelectedPost(null);
      showToast("Gönderi silindi");
    } catch (err) {
      console.error("Silme hatası:", err);
      showToast("Silinemedi");
    } finally {
      setIsDeletingPost(false);
    }
  };

  // Sekmeye göre filtrelenen gönderiler
  const tabPosts = posts.filter((p) => {
    if (activeTab === "posts") return p.type === "post";
    if (activeTab === "reels") return p.type === "reels";
    return false; // Repostlar
  });

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20">
      {/* Toast Bildirimi */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-zinc-700 flex items-center gap-2 select-none animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Üst Bar: Sol (+) -> /share | Orta (@kullanıcı adı) | Sağ (Ayarlar -> /settings) */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          {/* Sol: Gönderi Ekleme Butonu (+) -> /share sayfasına yönlendirir */}
          <Link
            href="/share"
            title="Yeni Paylaşım"
            aria-label="Yeni Paylaşım"
            className="p-2 -ml-2 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <Plus className="w-6 h-6" />
          </Link>

          {/* Orta: @kullanıcı adı */}
          <span className="text-base font-bold tracking-tight text-white truncate max-w-[200px] text-center">
            @{profile?.username || "kullanici"}
          </span>

          {/* Sağ: 3 Çizgi Buton (Direkt /settings) */}
          <Link
            href="/settings"
            title="Ayarlar"
            aria-label="Ayarlar"
            className="p-2 -mr-2 text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <Menu className="w-6 h-6" />
          </Link>
        </div>
      </header>

      {/* Profil İçerik Alanı */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-4">
        {/* Sol üstte profil fotoğrafı, yanında görünen adı ve altında istatistikler */}
        <div className="flex items-center gap-4">
          {/* Sol üst profil fotoğrafı (Fotoğraf varsa büyütür, yoksa düzenlemeye yönlendirir) */}
          <button
            type="button"
            onClick={() => {
              if (profile?.photoURL) {
                setIsAvatarModalOpen(true);
              }
            }}
            title={profile?.photoURL ? "Fotoğrafı Görüntüle" : "Profil"}
            className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer group relative hover:opacity-90 transition-opacity btn-press-subtle"
          >
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName || "Profil"}
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform select-none no-select"
              />
            ) : (
              <UserIcon className="w-9 h-9 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            )}
          </button>

          {/* Yanında görünen adı ve altında gönderi, takipçi, takip */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h1 className="text-lg font-bold text-white truncate mb-2">
              {profile?.displayName || "Kullanıcı"}
            </h1>

            <div className="flex items-center justify-between text-center">
              <div className="flex flex-col items-center flex-1">
                <span className="text-base font-bold text-white leading-none">
                  {profile?.stats?.postsCount ?? posts.length}
                </span>
                <span className="text-[12px] text-zinc-400 mt-1">Gönderi</span>
              </div>
              <Link
                href="/follow?tab=followers"
                className="flex flex-col items-center flex-1 hover:opacity-80 transition-opacity btn-press-subtle"
              >
                <span className="text-base font-bold text-white leading-none">
                  {profile?.stats?.followersCount ?? 0}
                </span>
                <span className="text-[12px] text-zinc-400 mt-1">Takipçi</span>
              </Link>
              <Link
                href="/follow?tab=following"
                className="flex flex-col items-center flex-1 hover:opacity-80 transition-opacity btn-press-subtle"
              >
                <span className="text-base font-bold text-white leading-none">
                  {profile?.stats?.followingCount ?? 0}
                </span>
                <span className="text-[12px] text-zinc-400 mt-1">Takip</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Bu divin hemen altı biyografi */}
        {profile?.bio && (
          <p className="mt-3 text-sm text-zinc-200 whitespace-pre-line leading-relaxed">
            {profile.bio}
          </p>
        )}

        {/* Altında 2 button: Profili Düzenle ve Profili Paylaş */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Link
            href="/profile/edit"
            className="w-full py-2 px-3 text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all btn-press-subtle text-center flex items-center justify-center"
          >
            Profili Düzenle
          </Link>
          <button
            type="button"
            onClick={handleShareProfile}
            className="w-full py-2 px-3 text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all btn-press-subtle text-center"
          >
            Profili Paylaş
          </button>
        </div>

        {/* Altında 3 tane ikondan oluşan butonlar: 1. Gönderiler, 2. Reelsler, 3. Repostlar */}
        <div className="flex border-b border-zinc-900 mt-6">
          <button
            type="button"
            onClick={() => setActiveTab("posts")}
            title="Gönderiler"
            aria-label="Gönderiler"
            className={`flex-1 py-3 flex items-center justify-center transition-all relative btn-press-subtle ${
              activeTab === "posts" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
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
              activeTab === "reels" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <FaPhotoFilm className="w-5 h-5" />
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
              activeTab === "reposts" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <TbRepeat className="w-5 h-5" />
            {activeTab === "reposts" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
            )}
          </button>
        </div>

        {/* Sekme İçeriği (Gönderiler Izgarası veya Boş Durum) */}
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
                    <FaPhotoFilm className="w-4 h-4 text-white absolute top-1.5 right-1.5 drop-shadow" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-500 text-sm">
              {activeTab === "posts" && (
                <>
                  <p className="mb-3">Henüz gönderi yok</p>
                  <Link
                    href="/share"
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 hover:text-white rounded-xl text-xs font-semibold transition-colors btn-press-subtle"
                  >
                    İlk gönderini paylaş
                  </Link>
                </>
              )}
              {activeTab === "reels" && (
                <>
                  <p className="mb-3">Henüz reels yok</p>
                  <Link
                    href="/share"
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-200 hover:text-white rounded-xl text-xs font-semibold transition-colors btn-press-subtle"
                  >
                    İlk videonu paylaş
                  </Link>
                </>
              )}
              {activeTab === "reposts" && <p>Henüz repost yok</p>}
            </div>
          )}
        </div>
      </main>

      {/* GÖNDERİ DETAY MODAL */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !isDeletingPost && setSelectedPost(null)}
        >
          <div
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Üst Bar */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center">
                  {profile?.photoURL ? (
                    <img
                      src={profile.photoURL}
                      alt="Profil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
                <span className="text-xs font-bold text-white">
                  @{profile?.username}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDeletePost(selectedPost.id)}
                  disabled={isDeletingPost}
                  title="Sil"
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  {isDeletingPost ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPost(null)}
                  disabled={isDeletingPost}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Medya */}
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

            {/* Açıklama */}
            {selectedPost.caption && (
              <div className="p-3 text-sm text-zinc-200 border-t border-zinc-800">
                <span className="font-bold mr-1.5">@{profile?.username}</span>
                {selectedPost.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BÜYÜK PROFİL FOTOĞRAFI GÖRÜNTÜLEME MODALI */}
      {isAvatarModalOpen && profile?.photoURL && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsAvatarModalOpen(false)}
        >
          {/* Kapat Butonu */}
          <div className="w-full max-w-xs sm:max-w-sm flex justify-end pb-3">
            <button
              type="button"
              onClick={() => setIsAvatarModalOpen(false)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Büyük Kare Fotoğraf */}
          <div
            className="w-full max-w-xs sm:max-w-sm aspect-square bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={profile.photoURL}
              alt={profile.displayName || "Profil"}
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full object-cover select-none no-select"
            />
          </div>

          {/* İsim & Kullanıcı Adı */}
          <div className="mt-4 text-center">
            <h2 className="text-base font-bold text-white">
              {profile.displayName}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              @{profile.username}
            </p>
          </div>
        </div>
      )}

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
