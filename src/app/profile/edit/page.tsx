"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getProfileService } from "@/services/profile";
import { isSupabaseAuth } from "@/lib/backend";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  User as UserIcon,
  Check,
  X,
  Camera,
  AtSign,
  FileText,
  Lock,
  Maximize2,
  Trash2,
} from "lucide-react";
import ImageCropper from "@/components/ImageCropper";

type SubView = "menu" | "name" | "bio";

type SaveOverrides = {
  displayName?: string;
  bio?: string;
  avatarFile?: File | null;
  photoRemoved?: boolean;
};

export default function EditProfilePage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isViewingAvatar, setIsViewingAvatar] = useState(false);
  const [view, setView] = useState<SubView>("menu");
  const [draft, setDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setIsSaving(false);
  }, []);

  useEffect(() => {
    if (profile) {
      setAvatarPreview(profile.photoURL || null);
      setIsSaving(false);
    }
  }, [profile]);

  // Toast otomatik kapanır
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Tarayıcı / Android geri tuşu: alt ekrandan menüye döner
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = false;
      setView("menu");
      setSheetOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openSub = (v: "name" | "bio") => {
    setDraft(v === "name" ? profile?.displayName || "" : profile?.bio || "");
    window.history.pushState(window.history.state, "", window.location.href);
    pushedRef.current = true;
    setView(v);
  };

  const closeSub = () => {
    if (pushedRef.current) window.history.back();
    else setView("menu");
  };

  // Fotoğraf Seçildiğinde Kırpma Ekranını Aç
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setToastMessage("Fotoğraf en fazla 10 MB olabilir");
        return;
      }
      const tempUrl = URL.createObjectURL(file);
      setCropperImage(tempUrl);
      // Tekrar aynı dosya seçilebilsin diye input değerini sıfırla
      e.target.value = "";
    }
  };

  // Kırpma Tamamlandığında fotoğrafı hemen kaydet
  const handleCropComplete = (croppedFile: File, previewUrl: string) => {
    setAvatarPreview(previewUrl);
    setCropperImage(null);
    void handleSave({ avatarFile: croppedFile, photoRemoved: false });
  };

  const handleCropCancel = () => {
    setCropperImage(null);
  };

  // Fotoğrafı Kaldır (hemen kaydedilir)
  const handleRemovePhoto = () => {
    setAvatarPreview(null);
    setSheetOpen(false);
    void handleSave({ avatarFile: null, photoRemoved: true });
  };

  // Profili Kaydet: mevcut kaydetme mantığı; yalnızca değişen alan(lar) geçilir, kalanlar profilden gelir
  const handleSave = async (o: SaveOverrides = {}) => {
    const name = (o.displayName ?? profile?.displayName ?? "").trim();
    const bioValue = (o.bio ?? profile?.bio ?? "").trim();
    const file = o.avatarFile ?? null;
    const removed = o.photoRemoved ?? false;
    if (!profile?.uid || isSaving || !name) return;

    try {
      setIsSaving(true);
      // profileService: Firestore (+ Firebase Auth profili) veya Supabase profiles satırı
      await getProfileService().update(profile.uid, {
        displayName: name,
        bio: bioValue,
        avatarFile: isSupabaseAuth ? null : file,
        photoRemoved: isSupabaseAuth ? false : removed,
      });

      await refreshProfile();
      setToastMessage("Profil güncellendi");
      if (pushedRef.current) closeSub();
    } catch (err) {
      console.error("Profil güncelleme hatası:", err);
      setToastMessage("Profil güncellenemedi");
      setAvatarPreview(profile.photoURL || null);
    } finally {
      setIsSaving(false);
    }
  };

  const saveSub = () => {
    if (view === "name") void handleSave({ displayName: draft });
    else if (view === "bio") void handleSave({ bio: draft });
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950 text-white pt-safe pb-safe">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const rowCls =
    "w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-zinc-900 transition-colors text-sm font-medium text-zinc-100 btn-press-subtle text-left";
  const draftInvalid = view === "name" && !draft.trim();

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-safe overflow-x-hidden">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarChange}
        accept="image/*"
        className="hidden"
        aria-label="Fotoğraf seç"
      />

      {/* Kırpma Bileşeni (Fotoğraf seçilince açılır) */}
      {cropperImage && (
        <ImageCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {/* Toast Bildirimi */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-zinc-700 flex items-center gap-2 select-none animate-in fade-in duration-150"
        >
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => (view === "menu" ? router.back() : closeSub())}
            disabled={isSaving}
            title="Geri"
            aria-label="Geri"
            className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <h1 className="text-base font-bold tracking-tight text-white">
            {view === "menu" ? "Profili Düzenle" : view === "name" ? "Ad" : "Biyografi"}
          </h1>

          {view === "menu" ? (
            <span className="w-10 flex justify-center" aria-hidden="true">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
            </span>
          ) : (
            <button
              type="button"
              onClick={saveSub}
              disabled={isSaving || draftInvalid}
              className="text-sm font-bold text-white hover:text-zinc-200 disabled:opacity-40 transition-colors btn-press-subtle p-2 -mr-2 flex items-center gap-1.5"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kaydet"}
            </button>
          )}
        </div>
      </header>

      {view === "menu" ? (
        <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex flex-col items-center pt-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="Profil fotoğrafı seçenekleri"
              className="w-28 h-28 rounded-full bg-zinc-900 border-2 border-zinc-800 hover:border-zinc-700 flex items-center justify-center overflow-hidden transition-all shadow-lg"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Profil Fotoğrafı"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full h-full object-cover select-none no-select"
                />
              ) : (
                <UserIcon className="w-12 h-12 text-zinc-600" />
              )}
            </button>
            {!isSupabaseAuth && (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="mt-3 text-sm font-semibold text-white hover:text-zinc-300 transition-colors"
              >
                Fotoğrafı değiştir
              </button>
            )}
          </div>

          <section className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Profil bilgileri
            </h2>
            <div className="bg-zinc-900/60 border border-zinc-900 rounded-2xl overflow-hidden divide-y divide-zinc-900">
              <button type="button" onClick={() => openSub("name")} className={rowCls}>
                <span className="flex items-center gap-3 shrink-0">
                  <UserIcon className="w-5 h-5 text-zinc-400" />
                  <span>Ad</span>
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-zinc-400 font-normal">
                    {profile?.displayName || "Ekle"}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                </span>
              </button>

              <div className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-zinc-100">
                <span className="flex items-center gap-3 shrink-0">
                  <AtSign className="w-5 h-5 text-zinc-400" />
                  <span>Kullanıcı adı</span>
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-zinc-500 font-normal">
                    @{profile?.username || ""}
                  </span>
                  <Lock className="w-4 h-4 text-zinc-600 shrink-0" aria-label="Değiştirilemez" />
                </span>
              </div>

              <button type="button" onClick={() => openSub("bio")} className={rowCls}>
                <span className="flex items-center gap-3 shrink-0">
                  <FileText className="w-5 h-5 text-zinc-400" />
                  <span>Biyografi</span>
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-zinc-400 font-normal">
                    {profile?.bio || "Ekle"}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                </span>
              </button>
            </div>
          </section>
        </main>
      ) : (
        <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-2">
          {view === "name" ? (
            <>
              <label htmlFor="edit-name" className="block px-1 text-xs font-semibold text-zinc-400">
                Görünen ad
              </label>
              <input
                id="edit-name"
                type="text"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !draftInvalid && saveSub()}
                placeholder="Adın Soyadın"
                maxLength={50}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <p className="px-1 text-[11px] text-zinc-500 text-right">{draft.length}/50</p>
            </>
          ) : (
            <>
              <label htmlFor="edit-bio" className="block px-1 text-xs font-semibold text-zinc-400">
                Biyografi
              </label>
              <textarea
                id="edit-bio"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Kendinden bahset..."
                maxLength={150}
                rows={5}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
              />
              <p className="px-1 text-[11px] text-zinc-500 text-right">{draft.length}/150</p>
            </>
          )}
        </main>
      )}

      {/* Fotoğraf eylem sayfası */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center animate-in fade-in duration-150"
          onClick={() => setSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Profil fotoğrafı"
            className="w-full max-w-md bg-zinc-900 rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                fileInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-zinc-800 text-sm font-medium text-zinc-100"
            >
              <Camera className="w-5 h-5 text-zinc-400" />
              Fotoğrafı değiştir
            </button>
            {avatarPreview && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSheetOpen(false);
                    setIsViewingAvatar(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-zinc-800 text-sm font-medium text-zinc-100"
                >
                  <Maximize2 className="w-5 h-5 text-zinc-400" />
                  Fotoğrafı büyüt
                </button>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-zinc-800 text-sm font-medium text-red-400"
                >
                  <Trash2 className="w-5 h-5" />
                  Fotoğrafı kaldır
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="w-full px-3 py-3.5 rounded-xl hover:bg-zinc-800 text-sm font-semibold text-zinc-400"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* BÜYÜK FOTOĞRAF ÖNİZLEME MODALI */}
      {isViewingAvatar && avatarPreview && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsViewingAvatar(false)}
        >
          <div className="w-full max-w-xs sm:max-w-sm flex justify-end pb-3">
            <button
              type="button"
              onClick={() => setIsViewingAvatar(false)}
              aria-label="Kapat"
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div
            className="w-full max-w-xs sm:max-w-sm aspect-square bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={avatarPreview}
              alt="Profil Fotoğrafı"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full object-cover select-none no-select"
            />
          </div>
        </div>
      )}
    </div>
  );
}
