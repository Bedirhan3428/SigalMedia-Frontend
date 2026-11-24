"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { PostDetailView } from "@/components/feed";
import { feedService } from "@/lib/feed/feedService";
import type { Post as FeedPostT } from "@/lib/feed/types";
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
import ProfileHeader, { profileRootClass } from "@/components/profile/ProfileHeader";
import ProfileSongPlayer from "@/components/profile/ProfileSongPlayer";
import ProfileCustomizeSheet from "@/components/profile/ProfileCustomizeSheet";
import { parseProfileStyle, effectiveBanner, saveProfileStyle, type ProfileStyle } from "@/lib/profile/profileStyleStore";
import { stopProfileAudio } from "@/lib/profile/profileAudio";
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
  /** Açık gönderi görünümü: ızgara sırasındaki akış gönderileri ve açık olanın kimliği. */
  const [detail, setDetail] = useState<{ list: FeedPostT[]; id: string } | null>(null);
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

  // Profil stili (tema/banner/şarkı): iyimser güncelleme için yerel geçersiz kılma
  const [styleOverride, setStyleOverride] = useState<ProfileStyle | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const style = useMemo(
    () => styleOverride ?? parseProfileStyle(profile?.profileStyle),
    [styleOverride, profile?.profileStyle]
  );
  const themed = style.theme !== "sade";
  const banner = effectiveBanner(style);

  useEffect(() => {
    if (sheetOpen) stopProfileAudio();
  }, [sheetOpen]);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const handleSaveStyle = async (next: ProfileStyle) => {
    if (!profile?.uid) return;
    const prev = style;
    // İyimser: sayfa hemen güncellenir, kayıt arka planda yazılır
    setStyleOverride(next);
    setSheetOpen(false);
    showToast("Profilin güncellendi");
    try {
      await saveProfileStyle(profile.uid, next);
      void refreshProfile();
    } catch (err) {
      console.error("Profil stili kaydedilemedi:", err);
      setStyleOverride(prev);
      showToast("Profil kaydedilemedi, tekrar dene");
    }
  };

  // Gönderileri Firestore'dan Çek
  const fetchUserPosts = async () => {
    if (!profile?.uid) return;
    try {
      setLoadingPosts(true);
      // Yalnızca testler için (Firestore'a dokunmadan karo işaretini doğrulamak): normal kullanımda tanımsızdır.
      const injected = (window as unknown as { __SIGAL_TEST_PROFILE_POSTS__?: Post[] }).__SIGAL_TEST_PROFILE_POSTS__;
      if (injected) {
        setPosts(injected);
        return;
      }
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
      setDetail(null);
      showToast("Gönderi silindi");
    } catch (err) {
      console.error("Silme hatası:", err);
      showToast("Silinemedi");
    } finally {
      setIsDeletingPost(false);
    }
  };

  // Izgara karosu: eski biçimli Firestore belgesini akış gönderisine çevirerek (firestoreSource eşleyicisi) detay görünümünü açar.
  const openDetail = (post: Post) => {
    const list = tabPosts.flatMap((p) => {
      const fp = feedService.adoptLegacy(p.id, p as unknown as Record<string, unknown>);
      return fp ? [fp] : [];
    });
    if (list.some((x) => x.id === post.id)) setDetail({ list, id: post.id });
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
    <div className={`min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-20 ${profileRootClass(style.theme)}`}>
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
      <main className={`flex-1 max-w-md w-full mx-auto ${themed ? "" : "px-4 pt-4"}`}>
        <ProfileHeader
          theme={style.theme}
          banner={banner}
          photoURL={profile?.photoURL}
          displayName={profile?.displayName || "Kullanıcı"}
          username={profile?.username || "kullanici"}
          bio={profile?.bio}
          counts={{
            posts: profile?.stats?.postsCount ?? posts.length,
            followers: profile?.stats?.followersCount ?? 0,
            following: profile?.stats?.followingCount ?? 0,
          }}
          onAvatarClick={() => {
            if (profile?.photoURL) setIsAvatarModalOpen(true);
          }}
          avatarTitle={profile?.photoURL ? "Fotoğrafı Görüntüle" : "Profil"}
          renderStat={(kind, cls, children) => (
            <Link href={`/follow?tab=${kind}`} className={cls}>
              {children}
            </Link>
          )}
          songSlot={<ProfileSongPlayer song={style.song} isOwner onAdd={() => setSheetOpen(true)} />}
          actions={
            themed ? (
              <>
                <Link href="/profile/edit" className="pf-pr">Profili Düzenle</Link>
                <button type="button" onClick={handleShareProfile} className="pf-ghost">Profili Paylaş</button>
                <button type="button" onClick={() => setSheetOpen(true)} className="pf-ghost pf-wide">Profili Özelleştir</button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
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
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="col-span-2 w-full py-2 px-3 text-sm font-semibold text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all btn-press-subtle text-center"
                >
                  Profili Özelleştir
                </button>
              </div>
            )
          }
        />

        <div className={themed ? "px-4" : ""}>
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
        <div className="pb-4">
          {loadingPosts ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : tabPosts.length > 0 ? (
            <div className="-mx-4 grid grid-cols-3 gap-px" data-testid="profile-grid">
              {tabPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => openDetail(post)}
                  className="relative aspect-[3/4] overflow-hidden bg-zinc-900 cursor-pointer group"
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
                  {post.replyTo && (
                    <span
                      data-testid="pf-reply-mark"
                      title="Yanıt"
                      aria-label="Yanıt gönderisi"
                      className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/55 text-white text-[13px] leading-5 text-center drop-shadow z-10"
                    >
                      ↪
                    </span>
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
        </div>
      </main>

      {/* GÖNDERİ DETAYI: akış ile aynı FeedPost bileşeni (PostCard + yanıt rayı + zincir) */}
      {detail && (
        <PostDetailView
          posts={detail.list}
          index={Math.max(0, detail.list.findIndex((x) => x.id === detail.id))}
          onIndexChange={(i) => !isDeletingPost && setDetail((d) => (d ? { ...d, id: d.list[i].id } : d))}
          onClose={() => !isDeletingPost && setDetail(null)}
          headerActions={(fp) => (
            <button
              type="button"
              onClick={() => handleDeletePost(fp.id)}
              disabled={isDeletingPost}
              title="Sil"
              aria-label="Sil"
              className="fd-pd-b"
              style={{ color: "#f87171" }}
            >
              {isDeletingPost ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        />
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

      <ProfileCustomizeSheet
        open={sheetOpen}
        initial={style}
        onClose={closeSheet}
        onSave={handleSaveStyle}
      />

      {/* Alt Navigasyon Barı */}
      <BottomNav />
    </div>
  );
}
