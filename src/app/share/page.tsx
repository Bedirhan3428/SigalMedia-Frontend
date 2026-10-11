"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import {
  CanvasEngine,
  TextLayer,
  FontPreset,
  TextBgPreset,
  FONT_PRESET_CONFIGS,
  MediaFilters,
  DEFAULT_FILTERS,
} from "@/lib/canvas-editor";
import {
  ChevronLeft,
  Image as ImageIcon,
  Send,
  Loader2,
  Trash2,
  Sparkles,
  Download,
  AtSign,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Crop,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  X,
} from "lucide-react";

// Instagram Hikaye Filtreleri
interface StoryFilter {
  name: string;
  filters: Partial<MediaFilters>;
}

const STORY_FILTERS: StoryFilter[] = [
  { name: "Normal", filters: { ...DEFAULT_FILTERS } },
  { name: "Canlı", filters: { saturation: 140, contrast: 115, brightness: 105 } },
  { name: "Siyah Beyaz", filters: { grayscale: 100, contrast: 125, brightness: 102 } },
  { name: "Sepya", filters: { sepia: 70, contrast: 95, brightness: 105 } },
  { name: "Sıcak", filters: { sepia: 25, hueRotate: -10, saturation: 115, brightness: 105 } },
  { name: "Soğuk", filters: { hueRotate: 22, saturation: 90, contrast: 108, brightness: 100 } },
  { name: "Sinematik", filters: { contrast: 130, saturation: 110, brightness: 95 } },
];

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

export default function ShareStoryPage() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  // Canvas ve Motor Referansları
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Editör Durumları
  const [hasMedia, setHasMedia] = useState(false);
  const [currentFitMode, setCurrentFitMode] = useState<"contain" | "cover">("contain");
  const [selectedLayer, setSelectedLayer] = useState<TextLayer | null>(null);
  const [currentFilterIdx, setCurrentFilterIdx] = useState(0);
  const [filterToast, setFilterToast] = useState<string | null>(null);
  const [isRotateBarOpen, setIsRotateBarOpen] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);

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

    // Seçim Dinleyicisi
    engine.on("select", (layer) => {
      if (layer instanceof TextLayer) {
        setSelectedLayer(layer);
      } else {
        setSelectedLayer(null);
      }
    });

    // Değişim Dinleyicisi (Açı güncellemesi için)
    engine.on("change", () => {
      if (engineRef.current) {
        setCurrentRotation(engineRef.current.getMediaRotation());
      }
    });

    // Çift Dokunma (Double Tap) -> Doğrudan Canlı Metin Düzenleme Moduna Geç
    engine.on("double-tap", (layer) => {
      if (layer instanceof TextLayer) {
        openTextEditor(layer);
      }
    });

    // Tek Dokunma (Single Tap) -> Font Stilini Döngüsel Değiştir
    engine.on("single-tap", (layer) => {
      if (layer instanceof TextLayer) {
        const nextFont = layer.cycleFontPreset();
        setActiveFontPreset(nextFont);
        engine.requestRender();
      }
    });

    engineRef.current = engine;
    return engine;
  }, []);

  // Sayfa Yüklendiğinde Varsayılan Tuvali Hazırla
  useEffect(() => {
    if (mounted && canvasRef.current) {
      const engine = getOrCreateEngine();
      if (engine && !hasMedia) {
        // Varsayılan koyu gradyan ile başlat
        const bgCanvas = document.createElement("canvas");
        bgCanvas.width = 1080;
        bgCanvas.height = 1920;
        const bgCtx = bgCanvas.getContext("2d");
        if (bgCtx) {
          const gradient = bgCtx.createLinearGradient(0, 0, 1080, 1920);
          gradient.addColorStop(0, "#18181b");
          gradient.addColorStop(0.5, "#09090b");
          gradient.addColorStop(1, "#000000");
          bgCtx.fillStyle = gradient;
          bgCtx.fillRect(0, 0, 1080, 1920);
          bgCanvas.toBlob(async (blob) => {
            if (blob && engineRef.current) {
              await engineRef.current.loadMedia(blob);
            }
          });
        }
      }
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [mounted, getOrCreateEngine, hasMedia]);

  // Metin Düzenleme Modunu Aç
  const openTextEditor = (layer?: TextLayer) => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    let target = layer;
    if (!target) {
      // Yeni metin bloğu fırlat
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
    if (selectedLayer && engineRef.current) {
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
    if (selectedLayer && engineRef.current) {
      selectedLayer.setText(text);
      engineRef.current.requestRender();
    }
  };

  // Font Preset Değiştir
  const handleCycleFont = () => {
    if (selectedLayer && engineRef.current) {
      const nextFont = selectedLayer.cycleFontPreset();
      setActiveFontPreset(nextFont);
      engineRef.current.requestRender();
    }
  };

  // Arka Plan Hapı Değiştir (A)
  const handleCycleBg = () => {
    if (selectedLayer && engineRef.current) {
      const nextBg = selectedLayer.cycleBgPreset();
      setActiveBgPreset(nextBg);
      engineRef.current.requestRender();
    }
  };

  // Hizalama Değiştir
  const handleToggleAlign = () => {
    const order: Array<"left" | "center" | "right"> = ["center", "left", "right"];
    const nextAlign = order[(order.indexOf(activeTextAlign) + 1) % order.length];
    setActiveTextAlign(nextAlign);
    if (selectedLayer && engineRef.current) {
      selectedLayer.setStyle({ textAlign: nextAlign });
      engineRef.current.requestRender();
    }
  };

  // Renk Değiştir
  const handleSelectColor = (color: string) => {
    setActiveTextColor(color);
    if (selectedLayer && engineRef.current) {
      selectedLayer.setStyle({ color });
      if (selectedLayer.fontPreset === "neon") {
        selectedLayer.setStyle({ shadowColor: color });
      }
      engineRef.current.requestRender();
    }
  };

  // Medya Dosyası Yükleme
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const engine = getOrCreateEngine();
      if (!engine) return;

      await engine.loadMedia(file, undefined, false);
      setHasMedia(true);
      setCurrentFitMode("contain");
      e.target.value = "";
    } catch (err) {
      console.error("Medya yüklenemedi:", err);
      e.target.value = "";
    }
  };

  // Görsel Sığdırma Modunu Değiştir (Sığdır / Tam Doldur)
  const handleToggleFitMode = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    const nextMode = currentFitMode === "contain" ? "cover" : "contain";
    setCurrentFitMode(nextMode);
    engine.setFitMode(nextMode);
    setFilterToast(nextMode === "contain" ? "Orantılı Sığdır" : "Tam Ekran");
    setTimeout(() => {
      setFilterToast(null);
    }, 1200);
  };

  // Döndürme ve Açı Ayarını Aç/Kapat
  const handleToggleRotateBar = () => {
    setIsRotateBarOpen((prev) => !prev);
    if (engineRef.current) {
      setCurrentRotation(engineRef.current.getMediaRotation());
    }
  };

  // Slider ile Serbest Açı Ayarı
  const handleSetRotationAngle = (deg: number) => {
    setCurrentRotation(deg);
    if (engineRef.current) {
      engineRef.current.setMediaRotation(deg);
    }
  };

  // 90 Derece Sağa Döndür
  const handleRotateRight90 = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    engine.rotateMediaOrSelected(90);
    setCurrentRotation(engine.getMediaRotation());
  };

  // 90 Derece Sola Döndür
  const handleRotateLeft90 = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    engine.rotateMediaOrSelected(-90);
    setCurrentRotation(engine.getMediaRotation());
  };

  // Yatay Çevir (Ayna / Flip)
  const handleFlipHorizontal = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    engine.flipMediaHorizontal();
  };

  // Konum ve Açıyı Sıfırla
  const handleResetTransform = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    engine.resetMediaTransform();
    setCurrentRotation(0);
  };

  // Efektler / FX Filtre Döngüsü
  const handleCycleFilter = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    const nextIdx = (currentFilterIdx + 1) % STORY_FILTERS.length;
    setCurrentFilterIdx(nextIdx);
    const preset = STORY_FILTERS[nextIdx];

    engine.setFilters(preset.filters);

    // Instagram stili geçici filtre rozeti
    setFilterToast(preset.name);
    setTimeout(() => {
      setFilterToast(null);
    }, 1200);
  };

  // Çıkartma / @Tag Ekle
  const handleAddTagSticker = () => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    const usernameTag = profile?.username ? `@${profile.username}` : "@sigalmedia";
    const layer = engine.addText(usernameTag, {
      fontSize: 48,
      color: "#09090b",
      backgroundColor: "#10B981",
      borderRadius: 24,
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

      // Temiz, gizmosuz yüksek çözünürlüklü JPEG çıktısı
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
      {/* Gizli Dosya Seçici */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,video/*"
        className="hidden"
      />

      {/* 1. TAM EKRAN TUVAL (CANVAS STAGE) */}
      <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
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

      {/* GEÇİCİ FİLTRE ADI ROZETİ (Instagram FX Toast) */}
      {filterToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-black/60 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full text-xs font-bold text-white shadow-xl animate-in fade-in duration-150">
          {filterToast}
        </div>
      )}

      {/* 2. ÜST BAR: SOL (GERİ) | SAĞ (İNDİR & PAYLAŞ) */}
      {!isTextEditing && (
        <header className="fixed top-0 left-0 right-0 h-16 px-4 flex items-center justify-between z-30 pt-safe pointer-events-none">
          {/* Geri Butonu */}
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPublishing}
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/75 active:scale-90 transition-all shadow-lg flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Sağ Aksiyonlar */}
          <div className="pointer-events-auto flex items-center gap-2">
            {/* Cihaza İndir */}
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isPublishing}
              title="Cihaza Kaydet"
              className="w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/75 active:scale-90 transition-all shadow-lg flex items-center justify-center"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Paylaş Butonu */}
            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing}
              className="px-3.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Paylaşılıyor...</span>
                </>
              ) : (
                <>
                  <span>Paylaş</span>
                  <Send className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
        </header>
      )}

      {/* 3. SAĞ YÜZEN ARAÇ ÇUBUĞU (VERTICAL FLOATING DOCK - SAĞDA VE DAHA KÜÇÜK) */}
      {!isTextEditing && (
        <aside className="fixed right-3.5 top-20 flex flex-col gap-2.5 z-30 pointer-events-none">
          {/* Görsel / Medya Yükle */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Fotoğraf / Video Seç"
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/80 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
          </button>

          {/* Yazı Ekle (Aa) */}
          <button
            type="button"
            onClick={() => openTextEditor()}
            title="Metin Ekle"
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/80 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <span className="font-bold text-xs tracking-tight">Aa</span>
          </button>

          {/* Çıkartmalar / @Tag */}
          <button
            type="button"
            onClick={handleAddTagSticker}
            title="Etiket Ekle"
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/80 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <AtSign className="w-3.5 h-3.5 text-purple-400" />
          </button>

          {/* Efektler / FX Filtreleri */}
          <button
            type="button"
            onClick={handleCycleFilter}
            title="Filtre Değiştir"
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/80 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </button>

          {/* Sığdır / Doldur (Fit Mode) */}
          {hasMedia && (
            <button
              type="button"
              onClick={handleToggleFitMode}
              title="Sığdır / Doldur"
              className="pointer-events-auto w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/80 active:scale-90 transition-all shadow-xl flex items-center justify-center"
            >
              <Crop className="w-3.5 h-3.5 text-sky-400" />
            </button>
          )}

          {/* Döndürme ve Açı Ayarı */}
          {hasMedia && (
            <button
              type="button"
              onClick={handleToggleRotateBar}
              title="Döndür ve Açı Ayarla"
              className={`pointer-events-auto w-8 h-8 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center ${
                isRotateBarOpen
                  ? "bg-emerald-500 text-zinc-950 border-emerald-400 scale-105"
                  : "bg-black/55 border-white/15 text-white hover:bg-black/80 active:scale-90"
              }`}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRotateBarOpen ? "text-zinc-950" : "text-emerald-400"}`} />
            </button>
          )}
        </aside>
      )}

      {/* 4. DÖNDÜRME VE AÇI ARAÇ ÇUBUĞU (ALT KISIM) */}
      {!isTextEditing && isRotateBarOpen && hasMedia && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-sm bg-black/80 backdrop-blur-xl border border-white/15 rounded-2xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs">
            <span className="font-semibold text-zinc-300">Açı ve Döndürme</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-emerald-400 text-xs px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                {currentRotation}°
              </span>
              <button
                type="button"
                onClick={() => setIsRotateBarOpen(false)}
                className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Hızlı Butonlar */}
          <div className="flex items-center justify-between gap-1.5 pb-2">
            <button
              type="button"
              onClick={handleRotateLeft90}
              title="Sola 90°"
              className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
            >
              <RotateCcw className="w-3 h-3 text-emerald-400" />
              <span>-90°</span>
            </button>
            <button
              type="button"
              onClick={handleRotateRight90}
              title="Sağa 90°"
              className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
            >
              <RotateCw className="w-3 h-3 text-emerald-400" />
              <span>+90°</span>
            </button>
            <button
              type="button"
              onClick={handleFlipHorizontal}
              title="Yatay Çevir"
              className="flex-1 py-1 px-2 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
            >
              <FlipHorizontal className="w-3 h-3 text-sky-400" />
              <span>Ayna</span>
            </button>
            <button
              type="button"
              onClick={handleResetTransform}
              title="Sıfırla"
              className="py-1 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-[11px] font-medium text-zinc-300 hover:text-white transition-all"
            >
              Sıfırla
            </button>
          </div>

          {/* Hassas Derece Kaydırıcı */}
          <div className="px-1 pt-1">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={currentRotation > 180 ? currentRotation - 360 : currentRotation}
              onChange={(e) => handleSetRotationAngle(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      )}

      {/* 4. SİLME ALANI (Metin seçiliyken ekranın altında belirir) */}
      {!isTextEditing && selectedLayer && (
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

      {/* 5. CANLI METİN YAZMA & RENK MODU (INSTAGRAM STORY OVERLAY) */}
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
                    ? "rgba(0, 0, 0, 0.72)"
                    : activeBgPreset === "white"
                    ? "rgba(255, 255, 255, 0.95)"
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
