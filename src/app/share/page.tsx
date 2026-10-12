"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import {
  CanvasEngine,
  BaseLayer,
  TextLayer,
  FontPreset,
  TextBgPreset,
  FONT_PRESET_CONFIGS,
} from "@/lib/canvas-editor";
import {
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Download,
  AtSign,
  AlignLeft,
  AlignCenter,
  AlignRight,
  CaseSensitive,
  Sticker,
  Music,
  CircleChevronRight,
  X,
  Search,
  Sparkles,
  BarChart2,
  HelpCircle,
  MapPin,
} from "lucide-react";

// Instagram Hikaye Renk Paleti
const STORY_COLORS = [
  "#FFFFFF",
  "#000000",
  "#10B981",
  "#3B82F6",
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#AF52DE",
  "#FF2D55",
  "#00E5FF",
];

type ActiveDrawer = 'none' | 'sticker_sheet' | 'music' | 'tag';

export default function ShareStoryPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  // Canvas ve Motor Referansları
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const baseFileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayFileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardTriggeredRef = useRef(false);

  // Editör Durumları
  const [hasMedia, setHasMedia] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<BaseLayer | null>(null);
  const [filterToast, setFilterToast] = useState<string | null>(null);
  const [activeFilterGradient, setActiveFilterGradient] = useState<string>('#000000');
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>('none');

  // Canlı Metin Düzenleme Modu (Instagram Story Style Focus Overlay)
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [activeFontPreset, setActiveFontPreset] = useState<FontPreset>("modern");
  const [activeBgPreset, setActiveBgPreset] = useState<TextBgPreset>("dark");
  const [activeTextColor, setActiveTextColor] = useState("#FFFFFF");
  const [activeTextAlign, setActiveTextAlign] = useState<"left" | "center" | "right">("center");

  // İşlem Durumları
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tuval Motorunu Başlatma / Getirme (Instagram 9:16 Dikey Çözünürlük, Orantılı Sığdırma)
  const getOrCreateEngine = useCallback(() => {
    if (engineRef.current) return engineRef.current;
    if (!canvasRef.current) return null;

    const engine = new CanvasEngine({
      canvas: canvasRef.current,
      width: 1080,
      height: 1920,
      fitMode: "contain",
    });

    // Katman Seçimi
    engine.on("select", (layer: BaseLayer | null) => {
      setSelectedLayer(layer);
      if (layer instanceof TextLayer) {
        setActiveFontPreset(layer.fontPreset);
        setActiveBgPreset(layer.bgPreset);
        setActiveTextColor(layer.style.color || "#FFFFFF");
        setActiveTextAlign(layer.style.textAlign || "center");
      }
    });

    // Tek Dokunma (Single Tap): Metin katmanı ise font ailesini döngüsel değiştir
    engine.on("single-tap", (layer: BaseLayer) => {
      if (layer instanceof TextLayer) {
        const nextFont = layer.cycleFontPreset();
        setActiveFontPreset(nextFont);
        engine.requestRender();
      }
    });

    // Çift Dokunma (Double Tap): Tam ekran canlı metin düzenleme modunu aç
    engine.on("double-tap", (layer: BaseLayer) => {
      if (layer instanceof TextLayer) {
        openTextEditor(layer);
      } else {
        openTextEditor();
      }
    });

    // Filtre Kaydırma (Swipe) Olayı: Ekranın ortasında 0.5s minimal rozet göster ve arka plan gradyanını güncelle
    engine.on("filter-swipe", (_dir: string, filterName: string) => {
      const currentPreset = engine.getCurrentFilterPreset();
      setActiveFilterGradient(currentPreset.backgroundGradient);
      setFilterToast(filterName);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setFilterToast(null);
      }, 550);
    });

    engineRef.current = engine;
    return engine;
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 1. TABAN MEDYA GİRİŞ GÜVENLİĞİ (BASE MEDIA GUARD)
  // Editör açıldığında taban medya yoksa doğrudan dosya seçici tetiklenir.
  // Seçim iptal edilirse editör açılmaz, bir önceki sayfaya dönülür.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mounted && !hasMedia && !guardTriggeredRef.current) {
      guardTriggeredRef.current = true;
      setTimeout(() => {
        baseFileInputRef.current?.click();
      }, 80);
    }
  }, [mounted, hasMedia]);

  // Taban medya seçici iptal edildiğinde sayfadan geri dön
  useEffect(() => {
    const input = baseFileInputRef.current;
    if (!input) return;

    const onCancel = () => {
      if (!hasMedia) {
        router.back();
      }
    };

    input.addEventListener("cancel", onCancel);
    return () => {
      input.removeEventListener("cancel", onCancel);
    };
  }, [hasMedia, router]);

  // Taban Medya Seçimi
  const handleBaseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      if (!hasMedia) {
        router.back();
      }
      return;
    }

    try {
      const engine = getOrCreateEngine();
      if (!engine) return;

      await engine.loadMedia(file, undefined, false);
      setHasMedia(true);
      e.target.value = "";
    } catch (err) {
      console.error("Taban medya yüklenemedi:", err);
      if (!hasMedia) {
        router.back();
      }
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 2. İKİNCİL MEDYA / ÇIKARTMA (OVERLAY IMAGE)
  // Taban medya oturduktan sonra seçilen yeni görsel arka planı ezmez,
  // sahneye çıkartma olarak eklenir.
  // ─────────────────────────────────────────────────────────────
  const handleOverlayFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const engine = getOrCreateEngine();
      if (!engine) return;

      await engine.addOverlayImage(file, 0.5, 0.5);
      e.target.value = "";
    } catch (err) {
      console.error("İkincil görsel eklenemedi:", err);
      e.target.value = "";
    }
  };

  // Temizleme
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  // Metin Düzenleme Modunu Aç
  const openTextEditor = (layer?: TextLayer) => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    let target = layer;
    if (!target) {
      target = engine.addText("", {
        fontSize: 54,
        color: activeTextColor,
      }, 0.5, 0.45);
      target.setFontPreset(activeFontPreset);
      target.setBgPreset(activeBgPreset);
    }

    setSelectedLayer(target);
    setEditingText(target.style.text === "Yazı Ekleyin" ? "" : target.style.text);
    setActiveFontPreset(target.fontPreset);
    setActiveBgPreset(target.bgPreset);
    setActiveTextColor(target.style.color || "#FFFFFF");
    setActiveTextAlign(target.style.textAlign || "center");
    setIsTextEditing(true);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 80);
  };

  // Metin Düzenleme Modunu Kapat / Bitti
  const closeTextEditor = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      if (!editingText.trim()) {
        engineRef.current.removeLayer(selectedLayer.id);
        setSelectedLayer(null);
      } else {
        selectedLayer.setText(editingText);
        engineRef.current.requestRender();
      }
    }
    setIsTextEditing(false);
  };

  // Canlı Metin Değişimi
  const handleLiveTextChange = (text: string) => {
    setEditingText(text);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setText(text);
      engineRef.current.requestRender();
    }
  };

  // Font Preset Değiştir
  const handleCycleFont = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      const nextFont = selectedLayer.cycleFontPreset();
      setActiveFontPreset(nextFont);
      engineRef.current.requestRender();
    }
  };

  // Arka Plan Hapı Değiştir (A)
  const handleCycleBg = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      const nextBg = selectedLayer.cycleBgPreset();
      setActiveBgPreset(nextBg);
      setActiveTextColor(selectedLayer.style.color);
      engineRef.current.requestRender();
    }
  };

  // Hizalama Değiştir
  const handleToggleAlign = () => {
    const order: Array<"left" | "center" | "right"> = ["center", "left", "right"];
    const nextAlign = order[(order.indexOf(activeTextAlign) + 1) % order.length];
    setActiveTextAlign(nextAlign);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setStyle({ textAlign: nextAlign });
      engineRef.current.requestRender();
    }
  };

  // Renk Değiştir
  const handleSelectColor = (color: string) => {
    setActiveTextColor(color);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setStyle({ color });
      if (selectedLayer.fontPreset === "neon") {
        selectedLayer.setStyle({ shadowColor: color });
      }
      engineRef.current.requestRender();
    }
  };

  // Çıkartma / @Tag Ekle
  const handleAddTagSticker = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    const usernameTag = profile?.username ? `@${profile.username}` : "@sigalmedia";
    const layer = engine.addText(usernameTag, {
      fontSize: 48,
      color: "#000000",
      backgroundColor: "#ffffff",
      borderRadius: 9999,
      backgroundPadding: 16,
      fontWeight: "800",
      fontFamily: "'Plus Jakarta Sans', 'Google Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }, 0.5, 0.5);

    setSelectedLayer(layer);
  };

  // Seçili Katmanı Sil
  const handleDeleteSelected = () => {
    if (selectedLayer && engineRef.current) {
      engineRef.current.removeLayer(selectedLayer.id);
      setSelectedLayer(null);
    }
  };

  // Cihaza İndir
  const handleDownloadImage = async () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    try {
      await engine.downloadImage(`sigalmedia_story_${Date.now()}.jpg`, {
        mimeType: "image/jpeg",
        quality: 0.95,
      });
    } catch (e) {
      console.error("İndirme hatası:", e);
    }
  };

  // Hikayeyi / Gönderiyi Paylaş
  const handlePublish = async () => {
    if (!profile?.uid || !engineRef.current || isPublishing) return;

    try {
      setIsPublishing(true);

      // Temiz, borderless, yüksek çözünürlüklü JPEG çıktısı
      const blob = await engineRef.current.exportImage({
        mimeType: "image/jpeg",
        quality: 0.92,
      });

      const timestamp = Date.now();
      const filename = `story_${profile.uid}_${timestamp}.jpg`;
      const storageRef = ref(storage, `posts/${profile.uid}/${filename}`);

      await uploadBytes(storageRef, blob, {
        contentType: "image/jpeg",
      });

      const mediaUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "posts"), {
        authorId: profile.uid,
        authorUsername: profile.username || "kullanici",
        authorDisplayName: profile.displayName || "Kullanıcı",
        authorPhotoURL: profile.photoURL || "",
        mediaUrl,
        mediaType: "image",
        type: "reels",
        caption: "",
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", profile.uid), {
        "stats.postsCount": increment(1),
        updatedAt: serverTimestamp(),
      });

      await refreshProfile();

      setTimeout(() => {
        router.push("/profile");
      }, 500);
    } catch (err) {
      console.error("Paylaşım hatası:", err);
      setIsPublishing(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Seçili Font Konfigürasyonu
  const currentFontCfg = FONT_PRESET_CONFIGS[activeFontPreset];

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-black text-white overflow-hidden select-none no-select touch-none">
      {/* 1. Görünmez Taban Medya Dosya Seçici */}
      <input
        type="file"
        ref={baseFileInputRef}
        onChange={handleBaseFileChange}
        accept="image/*,video/*"
        className="hidden"
      />

      {/* 2. Görünmez İkincil Medya / Çıkartma Dosya Seçici */}
      <input
        type="file"
        ref={overlayFileInputRef}
        onChange={handleOverlayFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* 3. TAM EKRAN ÇERÇEVESİZ TUVAL (BORDERLESS CANVAS STAGE) */}
      <div
        className="fixed inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none"
        style={{
          background: activeFilterGradient,
          transition: "background 400ms cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: "background"
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            aspectRatio: "9 / 16",
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            touchAction: "none",
          }}
          className="shadow-2xl cursor-default"
        />
      </div>

      {/* 4. CANLI FİLTRE ROZETİ (0.5s Minimal Instagram Swipe Toast) */}
      {filterToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/60 backdrop-blur-md px-5 py-2 rounded-full text-sm font-bold text-white shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          {filterToast}
        </div>
      )}

      {/* 5. SOL ÜST: GERİ VE İNDİRME BUTONLARI */}
      {!isTextEditing && hasMedia && (
        <div className="fixed left-4 top-6 z-40 flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPublishing}
            title="Geri"
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={isPublishing}
            title="Cihaza Kaydet"
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <Download className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      )}

      {/* 6. SAĞ DİKEY ARAÇ ÇUBUĞU (RIGHT ACTION STACK) */}
      {!isTextEditing && hasMedia && (
        <div className="fixed right-4 top-6 flex flex-col gap-3.5 z-40 pointer-events-auto animate-in fade-in duration-200">
          {/* #1: Metin Aracı (CaseSensitive) */}
          <button
            type="button"
            onClick={() => openTextEditor()}
            title="Metin Ekle"
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <CaseSensitive className="w-5 h-5" />
          </button>

          {/* #2: Çıkartmalar & Medya Aracı (Sticker) */}
          <button
            type="button"
            onClick={() => setActiveDrawer('sticker_sheet')}
            title="Çıkartma & Medya"
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === 'sticker_sheet'
                ? 'bg-white text-black border-white'
                : 'bg-black/50 border-white/15 text-white hover:bg-black/70'
            }`}
          >
            <Sticker className="w-5 h-5 text-emerald-400" />
          </button>

          {/* #3: Müzik Katmanı Aracı (Music) */}
          <button
            type="button"
            onClick={() => setActiveDrawer('music')}
            title="Müzik Ekle"
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === 'music'
                ? 'bg-white text-black border-white'
                : 'bg-black/50 border-white/15 text-white hover:bg-black/70'
            }`}
          >
            <Music className="w-5 h-5 text-pink-400" />
          </button>

          {/* #4: Etiketleme Aracı (AtSign) */}
          <button
            type="button"
            onClick={() => setActiveDrawer('tag')}
            title="Kişi Etiketle"
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === 'tag'
                ? 'bg-white text-black border-white'
                : 'bg-black/50 border-white/15 text-white hover:bg-black/70'
            }`}
          >
            <AtSign className="w-5 h-5 text-cyan-400" />
          </button>
        </div>
      )}

      {/* 7. SAĞ ALT AKSİYON: PAYLAŞIM BUTONU (PRIMARY CTA) */}
      {!isTextEditing && hasMedia && (
        <div className="fixed right-4 bottom-6 z-40 pointer-events-auto animate-in fade-in duration-200">
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            title="Hikayeyi Paylaş"
            className="group flex items-center gap-2 pl-4 pr-1.5 py-1.5 rounded-full bg-white text-black font-semibold text-sm shadow-2xl hover:bg-neutral-100 active:scale-95 transition-all disabled:opacity-50"
          >
            {isPublishing ? (
              <>
                <span className="text-xs font-bold">Paylaşılıyor</span>
                <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </>
            ) : (
              <>
                <span className="text-xs font-bold">Paylaş</span>
                <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CircleChevronRight className="w-5 h-5" />
                </div>
              </>
            )}
          </button>
        </div>
      )}

      {/* 8. KARARTMA VE PANEL KAPATMA KATMANI */}
      {activeDrawer !== 'none' && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-45 animate-in fade-in duration-200"
          onClick={() => setActiveDrawer('none')}
        />
      )}

      {/* 9. ALTTAN AÇILAN ÇIKARTMA & MEDYA PANELİ (STICKER BOTTOM SHEET) */}
      {activeDrawer === 'sticker_sheet' && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Çıkartmalar ve Medya</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer('none')}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 overflow-y-auto no-scrollbar py-1">
            {/* 1. Fotoğraf Ekle Kartı */}
            <button
              type="button"
              onClick={() => {
                setActiveDrawer('none');
                overlayFileInputRef.current?.click();
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Fotoğraf</span>
            </button>

            {/* 2. @Bahset Kartı */}
            <button
              type="button"
              onClick={() => {
                setActiveDrawer('none');
                handleAddTagSticker();
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <AtSign className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">@Bahset</span>
            </button>

            {/* 3. Anket (Gelecek Slot) */}
            <div className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/5 text-zinc-400 opacity-60">
              <div className="w-11 h-11 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <BarChart2 className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Anket</span>
            </div>

            {/* 4. Soru (Gelecek Slot) */}
            <div className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/5 text-zinc-400 opacity-60">
              <div className="w-11 h-11 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Soru</span>
            </div>

            {/* 5. Konum (Gelecek Slot) */}
            <div className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/5 text-zinc-400 opacity-60">
              <div className="w-11 h-11 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Konum</span>
            </div>

            {/* 6. GIF (Gelecek Slot) */}
            <div className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/5 text-zinc-400 opacity-60">
              <div className="w-11 h-11 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">GIF</span>
            </div>
          </div>
        </div>
      )}

      {/* 10. ALTTAN AÇILAN MÜZİK PANELİ (MusicSelectorDrawer) */}
      {activeDrawer === 'music' && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Müzik Ekle</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer('none')}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 mb-4">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              placeholder="Müzik veya sanatçı ara..."
              disabled
              className="bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none w-full cursor-not-allowed"
            />
          </div>

          <div className="space-y-2.5 overflow-y-auto no-scrollbar">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0">
                    <Music className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="h-3 w-28 bg-white/20 rounded mb-1.5 animate-pulse" />
                    <div className="h-2.5 w-16 bg-white/10 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-2.5 w-8 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 11. ALTTAN AÇILAN ETİKETLEME PANELİ (TaggingDrawer) */}
      {activeDrawer === 'tag' && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Kişi Etiketle</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer('none')}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 mb-4">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              placeholder="Kullanıcı adı ara..."
              disabled
              className="bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none w-full cursor-not-allowed"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveDrawer('none');
              handleAddTagSticker();
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-white transition-all text-left"
          >
            <div className="w-9 h-9 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <AtSign className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">Profilini Etiketle</p>
              <p className="text-[11px] text-purple-300 truncate">@{profile?.username || 'kullanici'}</p>
            </div>
          </button>
        </div>
      )}

      {/* 6. SİLME ALANI (Metin veya Çıkartma seçiliyken ekranın altında belirir) */}
      {!isTextEditing && selectedLayer && selectedLayer.type !== "media" && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-30 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={handleDeleteSelected}
            title="Seçiliyi Sil"
            className="p-3 rounded-full bg-black/60 backdrop-blur-md border border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10 active:scale-90 transition-all shadow-2xl flex items-center gap-1.5"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* 7. CANLI METİN YAZMA & RENK MODU (INSTAGRAM STORY OVERLAY) */}
      {isTextEditing && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex flex-col justify-between p-4 pt-safe pb-safe animate-in fade-in duration-150">
          {/* Üst Düzenleme Çubuğu */}
          <div className="h-14 flex items-center justify-between">
            {/* Metin Hizalama */}
            <button
              type="button"
              onClick={handleToggleAlign}
              className="p-2.5 rounded-full bg-white/10 text-white active:scale-90 transition-all"
            >
              {activeTextAlign === "left" && <AlignLeft className="w-5 h-5" />}
              {activeTextAlign === "center" && <AlignCenter className="w-5 h-5" />}
              {activeTextAlign === "right" && <AlignRight className="w-5 h-5" />}
            </button>

            {/* Font Stili Seçici Rozeti (Modern / Neon / Daktilo / Klasik / Kalın) */}
            <button
              type="button"
              onClick={handleCycleFont}
              className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold tracking-wide active:scale-95 transition-all"
            >
              {currentFontCfg.name}
            </button>

            {/* Arka Plan Hapı Butonu (A) */}
            <button
              type="button"
              onClick={handleCycleBg}
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border transition-all active:scale-90 ${
                activeBgPreset === "dark"
                  ? "bg-black text-white border-white/30"
                  : activeBgPreset === "white"
                  ? "bg-white text-black border-transparent"
                  : "bg-transparent text-white border-white/40"
              }`}
            >
              A
            </button>

            {/* Bitti Butonu */}
            <button
              type="button"
              onClick={closeTextEditor}
              className="px-4 py-1.5 rounded-full bg-white text-black font-bold text-xs active:scale-95 transition-all shadow-lg"
            >
              Bitti
            </button>
          </div>

          {/* Ortalanmış Canlı Metin Alanı */}
          <div className="flex-1 flex items-center justify-center px-4">
            <textarea
              ref={textareaRef}
              value={editingText}
              onChange={(e) => handleLiveTextChange(e.target.value)}
              placeholder="Yazmaya başlayın..."
              rows={2}
              style={{
                fontFamily: currentFontCfg.fontFamily,
                fontWeight: currentFontCfg.fontWeight,
                fontStyle: currentFontCfg.fontStyle,
                color: activeTextColor,
                textAlign: activeTextAlign,
                backgroundColor:
                  activeBgPreset === "dark"
                    ? "#000000"
                    : activeBgPreset === "white"
                    ? "#ffffff"
                    : "transparent",
              }}
              className="w-full max-w-sm rounded-2xl p-4 text-2xl font-bold border-none outline-none resize-none placeholder:text-zinc-500 shadow-2xl transition-all"
            />
          </div>

          {/* Alt Yatay Kaydırılabilir Renk Paleti */}
          <div className="pb-3 flex items-center justify-center">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2 px-4 max-w-sm">
              {STORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleSelectColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full shrink-0 border transition-all active:scale-90 ${
                    activeTextColor.toUpperCase() === c.toUpperCase()
                      ? "border-white scale-125 shadow-xl ring-2 ring-white/60"
                      : "border-white/20"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
