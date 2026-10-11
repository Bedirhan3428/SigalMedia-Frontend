"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { updateProfile } from "firebase/auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import { ChevronLeft, Camera, Loader2, User as UserIcon, Check, X } from "lucide-react";
import ImageCropper from "@/components/ImageCropper";

export default function EditProfilePage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isViewingAvatar, setIsViewingAvatar] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsSaving(false);
  }, []);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setBio(profile.bio || "");
      setAvatarPreview(profile.photoURL || null);
      setPhotoRemoved(false);
      setIsSaving(false);
    }
  }, [profile]);

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

  // Kırpma Tamamlandığında
  const handleCropComplete = (croppedFile: File, previewUrl: string) => {
    setAvatarFile(croppedFile);
    setAvatarPreview(previewUrl);
    setPhotoRemoved(false);
    setCropperImage(null);
  };

  // Kırpma İptal Edildiğinde
  const handleCropCancel = () => {
    setCropperImage(null);
  };

  // Fotoğrafı Kaldır
  const handleRemovePhoto = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setPhotoRemoved(true);
  };

  // Profili Kaydet
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile?.uid || isSaving || !displayName.trim()) return;

    try {
      setIsSaving(true);
      let photoURL = profile.photoURL || "";

      if (photoRemoved) {
        photoURL = "";
      } else if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop() || "jpg";
        const avatarRef = ref(
          storage,
          `avatars/${profile.uid}/avatar_${Date.now()}.${fileExt}`
        );
        await uploadBytes(avatarRef, avatarFile, {
          contentType: avatarFile.type || "image/jpeg",
        });
        photoURL = await getDownloadURL(avatarRef);
      }

      // Firestore Kullanıcı Belgesini Güncelle
      await updateDoc(doc(db, "users", profile.uid), {
        displayName: displayName.trim(),
        bio: bio.trim(),
        photoURL,
        updatedAt: serverTimestamp(),
      });

      // Firebase Auth Profilini Güncelle
      if (auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, {
            displayName: displayName.trim(),
            photoURL: photoURL || undefined,
          });
        } catch {
          // Opsiyonel hata durumunu sessizce karşıla
        }
      }

      await refreshProfile();
      setToastMessage("Profil başarıyla güncellendi");
      setIsSaving(false);

      setTimeout(() => {
        router.back();
      }, 600);
    } catch (err) {
      console.error("Profil güncelleme hatası:", err);
      setToastMessage("Fotoğraf veya profil güncellenemedi");
    } finally {
      setIsSaving(false);
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
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col pb-safe">
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
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-zinc-700 flex items-center gap-2 select-none animate-in fade-in duration-150">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Üst Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 pt-safe">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isSaving}
            title="Geri"
            aria-label="Geri"
            className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <h1 className="text-base font-bold tracking-tight text-white">
            Profili Düzenle
          </h1>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving || !displayName.trim()}
            className="text-sm font-bold text-white hover:text-zinc-200 disabled:opacity-40 transition-colors btn-press-subtle p-2 -mr-2 flex items-center gap-1.5"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kaydet"}
          </button>
        </div>
      </header>

      {/* Ferah ve Tam Ekran Form Alanı */}
      <main className="flex-1 max-w-md w-full mx-auto px-6 py-8 flex flex-col justify-between">
        <form onSubmit={handleSave} className="space-y-8">
          {/* Profil Fotoğrafı Alanı */}
          <div className="flex flex-col items-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarChange}
              accept="image/*"
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-28 h-28 rounded-full bg-zinc-900 border-2 border-zinc-800 hover:border-zinc-700 flex items-center justify-center overflow-hidden cursor-pointer relative group transition-all shadow-lg"
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Profil Fotoğrafı"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full h-full object-cover group-hover:opacity-75 transition-opacity select-none no-select"
                />
              ) : (
                <UserIcon className="w-12 h-12 text-zinc-600" />
              )}

              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-8 h-8 text-white" />
              </div>
            </div>

            {/* Fotoğraf Butonları */}
            <div className="flex items-center gap-3 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-semibold text-white hover:text-zinc-300 transition-colors"
              >
                Fotoğrafı Değiştir
              </button>

              {avatarPreview && (
                <>
                  <span className="text-zinc-600 text-xs">•</span>
                  <button
                    type="button"
                    onClick={() => setIsViewingAvatar(true)}
                    className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
                  >
                    Büyüt
                  </button>
                  <span className="text-zinc-600 text-xs">•</span>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="text-sm font-semibold text-red-400 hover:text-red-300 transition-colors"
                  >
                    Kaldır
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Form Alanları */}
          <div className="space-y-5">
            {/* Görünen Ad */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">
                Görünen Ad
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Adın Soyadın"
                maxLength={50}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            {/* Kullanıcı Adı (Salt Okunur Bilgi) */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                disabled
                value={`@${profile?.username || ""}`}
                className="w-full bg-zinc-900/40 border border-zinc-900 rounded-2xl px-4 py-3.5 text-sm text-zinc-500 cursor-not-allowed select-none"
              />
            </div>

            {/* Biyografi */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-zinc-400">
                  Biyografi
                </label>
                <span className="text-[11px] text-zinc-500">
                  {bio.length}/150
                </span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Kendinden bahset..."
                maxLength={150}
                rows={4}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
              />
            </div>
          </div>

          {/* Kaydet Butonu */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSaving || !displayName.trim()}
              className="w-full py-3.5 bg-white hover:bg-zinc-200 text-zinc-950 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 btn-press-subtle shadow-xl"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <span>Değişiklikleri Kaydet</span>
              )}
            </button>
          </div>
        </form>
      </main>
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
