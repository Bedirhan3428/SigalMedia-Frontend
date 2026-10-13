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
  OverlayImageLayer,
  MusicStickerLayer,
  FontPreset,
  TextBgPreset,
  FONT_PRESET_CONFIGS,
  StoryAudioMeta,
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
  Play,
  Check,
} from "lucide-react";

// 18 Canlı Instagram Hikaye Renk Paleti
const STORY_COLORS = [
  "#FFFFFF", // Beyaz
  "#000000", // Siyah
  "#737373", // Nötr Gri
  "#EF4444", // Kırmızı
  "#F97316", // Turuncu
  "#F59E0B", // Kehribar
  "#EAB308", // Sarı
  "#84CC16", // Fıstık Yeşili
  "#10B981", // Zümrüt Yeşili
  "#06B6D4", // Camgöbeği
  "#0EA5E9", // Gökyüzü Mavisi
  "#3B82F6", // Mavi
  "#6366F1", // İndigo
  "#8B5CF6", // Menekşe
  "#A855F7", // Mor
  "#D946EF", // Fuşya
  "#EC4899", // Pembe
  "#F43F5E", // Gül
];

// Popüler Hikaye Trend Müzikleri
const TRENDING_MUSIC: StoryAudioMeta[] = [
  {
    id: "m1",
    title: "Midnight City Beats",
    artist: "M83 Vibe",
    duration: 15,
    startTime: 0,
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
  },
  {
    id: "m2",
    title: "Golden Sunset Chill",
    artist: "Summer Waves",
    duration: 15,
    startTime: 4,
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=chill-abstract-intention-12099.mp3",
  },
  {
    id: "m3",
    title: "Neon Skyline Dream",
    artist: "Synth Retro",
    duration: 15,
    startTime: 0,
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=electronic-future-beats-117997.mp3",
  },
  {
    id: "m4",
    title: "Parisian Cafe Waltz",
    artist: "Acoustic Morning",
    duration: 15,
    startTime: 0,
    url: "https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=warm-acoustic-guitar-124008.mp3",
  },
  {
    id: "m5",
    title: "Tokyo Night Drive",
    artist: "Hyper Bass",
    duration: 15,
    startTime: 2,
    url: "https://cdn.pixabay.com/download/audio/2023/04/10/audio_51cbfae388.mp3?filename=drive-breakbeat-144013.mp3",
  },
  {
    id: "m6",
    title: "Mediterranean Breeze",
    artist: "Sigal Sound",
    duration: 15,
    startTime: 0,
    url: "https://cdn.pixabay.com/download/audio/2022/03/24/audio_33bb630aa9.mp3?filename=in-the-forest-ambient-12199.mp3",
  },
];

type ActiveDrawer = "none" | "sticker_sheet" | "music" | "tag";

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
  const [activeFilterGradient, setActiveFilterGradient] = useState<string>("#000000");
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>("none");
  const [selectedMusic, setSelectedMusic] = useState<StoryAudioMeta | null>(null);

  // Mıknatıslı Çöp Kutusu Durumu
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isTrashHot, setIsTrashHot] = useState(false);

  // Canlı Metin Düzenleme Modu (Instagram Story Focus Overlay)
  const [isTextEditing, setIsTextEditing] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [activeFontPreset, setActiveFontPreset] = useState<FontPreset>("modern");
  const [activeBgPreset, setActiveBgPreset] = useState<TextBgPreset>("solid");
  const [activeTextColor, setActiveTextColor] = useState("#FFFFFF");
  const [activeTextAlign, setActiveTextAlign] = useState<"left" | "center" | "right">("center");

  // Müzik Arama ve Çıkartma Filtreleri
  const [searchMusicQuery, setSearchMusicQuery] = useState("");

  // İşlem Durumları
  const [isPublishing, setIsPublishing] = useState(false);

  const openTextEditorRef = useRef<(layer?: TextLayer) => void>(() => {});

  useEffect(() => {
    setMounted(true);
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        engineRef.current?.requestRender();
      });
    }
  }, []);

  // Tuval Motorunu Başlatma (Instagram 9:16 Dikey Çözünürlük, Olay Tetiklemeli Çizim)
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

    // Tek Dokunma:
    // - Metin katmanı ise 5 ana arketip arasında geçiş yapar (Modern ➔ Klasik ➔ Neon ➔ Daktilo ➔ Güçlü)
    // - İkincil fotoğraf ise 5 kesim maskesi arasında geçiş yapar (Kare ➔ Daire ➔ Polaroid ➔ Kalp ➔ Yıldız)
    engine.on("single-tap", (layer: BaseLayer) => {
      if (layer instanceof TextLayer) {
        const nextFont = layer.cycleFontPreset(() => engine.requestRender());
        setActiveFontPreset(nextFont);
        engine.requestRender();
      } else if (layer instanceof OverlayImageLayer) {
        layer.cycleShapeMode();
        engine.requestRender();
      }
    });

    // Çift Dokunma: Doğrudan Canlı Metin Yazma Ekranını Aç
    engine.on("double-tap", (layer?: BaseLayer) => {
      if (layer instanceof TextLayer) {
        openTextEditorRef.current(layer);
      } else {
        openTextEditorRef.current();
      }
    });

    // Filtre Kaydırma (Swipe): 0.5s minimal rozet ve radyal gradyan arka plan
    engine.on("filter-swipe", (_dir: string, filterName: string) => {
      const currentPreset = engine.getCurrentFilterPreset();
      setActiveFilterGradient(currentPreset.backgroundGradient);
      setFilterToast(filterName);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setFilterToast(null);
      }, 500);
    });

    // Mıknatıslı Çöp Kutusu Sürükleme Takibi
    engine.on("drag-move", (info: { layer: BaseLayer; clientX: number; clientY: number; isDragging: boolean }) => {
      if (info.layer.type === "media") return;
      setIsDraggingObject(true);

      const trashCenterX = window.innerWidth / 2;
      const trashCenterY = window.innerHeight - 68;
      const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);
      const isOver = dist < 75;

      setIsTrashHot(isOver);
    });

    // Mıknatıslı Çöp Kutusu Bırakma Takibi
    engine.on("drag-end", (info: { layer: BaseLayer; clientX: number; clientY: number }) => {
      setIsDraggingObject(false);

      if (info.layer && info.layer.type !== "media") {
        const trashCenterX = window.innerWidth / 2;
        const trashCenterY = window.innerHeight - 68;
        const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);

        if (dist < 75) {
          if (info.layer instanceof MusicStickerLayer) {
            setSelectedMusic(null);
          }
          engine.removeLayer(info.layer.id);
          setSelectedLayer(null);

          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(40);
          }
        }
      }
      setIsTrashHot(false);
    });

    engineRef.current = engine;
    return engine;
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 1. TABAN MEDYA GİRİŞ GÜVENLİĞİ (BASE MEDIA GUARD)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mounted && !hasMedia && !guardTriggeredRef.current) {
      guardTriggeredRef.current = true;
      setTimeout(() => {
        baseFileInputRef.current?.click();
      }, 80);
    }
  }, [mounted, hasMedia]);

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
      console.error("Taban görsel yüklenemedi:", err);
      if (!hasMedia) {
        router.back();
      }
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 2. İKİNCİL FOTOĞRAF ÇIKARTMASI (FOTOĞRAF ÜZERİNE FOTOĞRAF)
  // Tuval genişliğinin %40'ı boyutunda ortada açılır
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

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 3. TİPOGRAFİ VE CANLI METİN DÜZENLEME AKIŞI (ODAK MODU)
  // ─────────────────────────────────────────────────────────────
  const openTextEditor = (layer?: TextLayer) => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    let target = layer;
    if (!target) {
      target = engine.addText(
        "",
        {
          fontSize: 54,
          color: activeTextColor,
        },
        0.5,
        0.45
      );
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
    }, 60);
  };
  openTextEditorRef.current = openTextEditor;

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

  const handleLiveTextChange = (text: string) => {
    setEditingText(text);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setText(text);
      engineRef.current.requestRender();
    }
  };

  // Font Preset Değiştir: Modern ➔ Klasik ➔ Neon ➔ Daktilo ➔ Güçlü
  const handleCycleFont = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      const nextFont = selectedLayer.cycleFontPreset(() => engineRef.current?.requestRender());
      setActiveFontPreset(nextFont);
      engineRef.current.requestRender();
    }
  };

  // Arka Plan Hapı Değiştir (A): Saf Yazı ➔ Tam Dolgulu Kutu ➔ Yarı Saydam Buzlu Kutu ➔ Neon Dış Parlama
  const handleCycleBg = () => {
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      const nextBg = selectedLayer.cycleBgPreset(() => engineRef.current?.requestRender());
      setActiveBgPreset(nextBg);
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

  // Renk Değiştir (18 renk)
  const handleSelectColor = (color: string) => {
    setActiveTextColor(color);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setStyle({ color });
      if (selectedLayer.fontPreset === "neon" || selectedLayer.bgPreset === "neon") {
        selectedLayer.setStyle({ shadowColor: color });
      }
      engineRef.current.requestRender();
    }
  };

  // @Bahset Çıkartması Ekle
  const handleAddTagSticker = (customTag?: string) => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    const tagText = customTag || (profile?.username ? `@${profile.username}` : "@sigalmedia");
    const layer = engine.addText(
      tagText,
      {
        fontSize: 48,
        color: "#000000",
        backgroundColor: "#ffffff",
        borderRadius: 12,
        backgroundPadding: 16,
        fontWeight: "800",
        fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, sans-serif",
      },
      0.5,
      0.5
    );

    setSelectedLayer(layer);
  };

  // Müzik Çıkartması Ekle
  const handleSelectMusicTrack = (track: StoryAudioMeta) => {
    const engine = getOrCreateEngine();
    if (!engine) return;

    setSelectedMusic(track);
    engine.addMusicSticker(track, 0.5, 0.68);
    setActiveDrawer("none");
  };

  // Cihaza WebP İndir
  const handleDownloadImage = async () => {
    const engine = getOrCreateEngine();
    if (!engine) return;
    try {
      await engine.downloadImage(`sigalmedia_${Date.now()}.webp`, {
        mimeType: "image/webp",
        quality: 0.95,
      });
    } catch (e) {
      console.error("İndirme hatası:", e);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 4. HİKAYEYİ / GÖNDERİYİ PAYLAŞ (AKILLI HİBRİT ÇIKTI MODELİ)
  // Saniyelerce video bekleme süresi yerine 15ms WebP + Müzik metaverisi
  // ─────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!profile?.uid || !engineRef.current || isPublishing) return;

    try {
      setIsPublishing(true);

      // 15 milisaniyede yüksek kaliteli 1080x1920 WebP çıktısı
      const blob = await engineRef.current.exportImage({
        mimeType: "image/webp",
        quality: 0.92,
      });

      const timestamp = Date.now();
      const filename = `story_${profile.uid}_${timestamp}.webp`;
      const storageRef = ref(storage, `posts/${profile.uid}/${filename}`);

      await uploadBytes(storageRef, blob, {
        contentType: "image/webp",
      });

      const mediaUrl = await getDownloadURL(storageRef);

      const postData: Record<string, unknown> = {
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
      };

      // Müzik seçildiyse metaveri olarak ekle
      if (selectedMusic) {
        postData.audioMeta = {
          id: selectedMusic.id,
          title: selectedMusic.title,
          artist: selectedMusic.artist,
          url: selectedMusic.url,
          startTime: selectedMusic.startTime || 0,
          duration: 15,
        };
      }

      await addDoc(collection(db, "posts"), postData);

      await updateDoc(doc(db, "users", profile.uid), {
        "stats.postsCount": increment(1),
        updatedAt: serverTimestamp(),
      });

      await refreshProfile();

      setTimeout(() => {
        router.push("/profile");
      }, 400);
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

  const currentFontCfg = FONT_PRESET_CONFIGS[activeFontPreset];
  const filteredMusic = TRENDING_MUSIC.filter(
    (m) =>
      m.title.toLowerCase().includes(searchMusicQuery.toLowerCase()) ||
      m.artist.toLowerCase().includes(searchMusicQuery.toLowerCase())
  );

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

      {/* 3. TAM EKRAN ÇERÇEVESİZ TUVAL (BORDERLESS CANVAS STAGE - KATMAN 0 & KATMAN 1) */}
      <div
        className="fixed inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none"
        style={{
          background: activeFilterGradient,
          transition: "background 400ms cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: "background",
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
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={isPublishing}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <Download className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      )}

      {/* 6. SAĞ DİKEY 4'LÜ AKSİYON BARI (KATMAN 4) */}
      {!isTextEditing && hasMedia && (
        <div className="fixed right-4 top-6 flex flex-col gap-3.5 z-40 pointer-events-auto animate-in fade-in duration-200">
          {/* #1: Metin Aracı (Aa) */}
          <button
            type="button"
            onClick={() => openTextEditor()}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
          >
            <CaseSensitive className="w-5 h-5" />
          </button>

          {/* #2: Çıkartmalar & Fotoğraf Ekle (Sticker) */}
          <button
            type="button"
            onClick={() => setActiveDrawer("sticker_sheet")}
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === "sticker_sheet"
                ? "bg-white text-black border-white"
                : "bg-black/50 border-white/15 text-white hover:bg-black/70"
            }`}
          >
            <Sticker className="w-5 h-5 text-emerald-400" />
          </button>

          {/* #3: Müzik Aracı (Music) */}
          <button
            type="button"
            onClick={() => setActiveDrawer("music")}
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === "music"
                ? "bg-white text-black border-white"
                : "bg-black/50 border-white/15 text-white hover:bg-black/70"
            }`}
          >
            <Music className="w-5 h-5 text-pink-400" />
          </button>

          {/* #4: @Etiketleme Aracı (AtSign) */}
          <button
            type="button"
            onClick={() => setActiveDrawer("tag")}
            className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
              activeDrawer === "tag"
                ? "bg-white text-black border-white"
                : "bg-black/50 border-white/15 text-white hover:bg-black/70"
            }`}
          >
            <AtSign className="w-5 h-5 text-cyan-400" />
          </button>
        </div>
      )}

      {/* 7. SAĞ ALT: PAYLAŞ OKU (PRIMARY CTA) */}
      {!isTextEditing && hasMedia && (
        <div className="fixed right-4 bottom-6 z-40 pointer-events-auto animate-in fade-in duration-200">
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
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

      {/* 8. MIKNATISLI ÇÖP KUTUSU (MAGNETIC TRASH) */}
      {!isTextEditing && isDraggingObject && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 ${
              isTrashHot
                ? "scale-125 bg-red-600 text-white shadow-2xl shadow-red-500/50 ring-4 ring-red-400/40"
                : "bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl"
            }`}
          >
            <Trash2 className="w-5 h-5" />
          </div>
        </div>
      )}

      {/* 9. KARARTMA VE PANEL KAPATMA KATMANI */}
      {activeDrawer !== "none" && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-45 animate-in fade-in duration-200"
          onClick={() => setActiveDrawer("none")}
        />
      )}

      {/* 10. ALTTAN AÇILAN ÇIKARTMA & MEDYA PANELİ (STICKER SHEET) */}
      {activeDrawer === "sticker_sheet" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Çıkartmalar</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 overflow-y-auto no-scrollbar py-1">
            {/* Fotoğraf Ekle Kartı */}
            <button
              type="button"
              onClick={() => {
                setActiveDrawer("none");
                overlayFileInputRef.current?.click();
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Fotoğraf</span>
            </button>

            {/* @Bahset Kartı */}
            <button
              type="button"
              onClick={() => {
                setActiveDrawer("none");
                handleAddTagSticker();
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <AtSign className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">@Bahset</span>
            </button>

            {/* Müzik Kartı */}
            <button
              type="button"
              onClick={() => setActiveDrawer("music")}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Music className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Müzik</span>
            </button>
          </div>
        </div>
      )}

      {/* 11. ALTTAN AÇILAN MÜZİK PANELİ */}
      {activeDrawer === "music" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[58vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Müzik Ekle</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 mb-4">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={searchMusicQuery}
              onChange={(e) => setSearchMusicQuery(e.target.value)}
              placeholder="Şarkı veya sanatçı ara..."
              className="bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none w-full"
            />
          </div>

          <div className="space-y-2 overflow-y-auto no-scrollbar">
            {filteredMusic.map((track) => {
              const isSelected = selectedMusic?.id === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleSelectMusicTrack(track)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                    isSelected
                      ? "bg-pink-500/15 border-pink-500/30 text-white"
                      : "bg-white/5 hover:bg-white/10 border-white/5 text-white"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0">
                      <Music className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{track.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{track.artist}</p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-xs text-zinc-400">
                    <span>15s</span>
                    {isSelected ? (
                      <Check className="w-4 h-4 text-pink-400" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 12. ALTTAN AÇILAN ETİKETLEME PANELİ */}
      {activeDrawer === "tag" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Kişi Etiketle</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveDrawer("none");
              handleAddTagSticker(`@${profile?.username || "kullanici"}`);
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-white transition-all text-left"
          >
            <div className="w-9 h-9 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <AtSign className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">Profilini Etiketle</p>
              <p className="text-[11px] text-purple-300 truncate">@{profile?.username || "kullanici"}</p>
            </div>
          </button>
        </div>
      )}

      {/* 13. CANLI METİN YAZMA & RENK MODU (INSTAGRAM STORY ODAK MODU) */}
      {isTextEditing && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex flex-col justify-between p-4 pt-safe pb-safe animate-in fade-in duration-150">
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

            {/* Font Stili Seçici Rozeti (5 Font: Modern / Klasik / Neon / Daktilo / Güçlü) */}
            <button
              type="button"
              onClick={handleCycleFont}
              className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold tracking-wide active:scale-95 transition-all"
            >
              {currentFontCfg.name}
            </button>

            {/* Arka Plan Hapı Butonu (A - 4 Mod) */}
            <button
              type="button"
              onClick={handleCycleBg}
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border transition-all active:scale-90 ${
                activeBgPreset === "solid"
                  ? "bg-black text-white border-white/30"
                  : activeBgPreset === "translucent"
                  ? "bg-black/50 text-white border-white/40"
                  : activeBgPreset === "neon"
                  ? "bg-transparent text-emerald-400 border-emerald-400 shadow-lg shadow-emerald-400/40"
                  : "bg-transparent text-white border-white/20"
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
                  activeBgPreset === "solid"
                    ? "#000000"
                    : activeBgPreset === "translucent"
                    ? "rgba(0, 0, 0, 0.55)"
                    : "transparent",
                textShadow:
                  activeBgPreset === "neon" || activeFontPreset === "neon"
                    ? `0 0 24px ${activeTextColor}`
                    : "none",
              }}
              className="w-full max-w-sm rounded-xl p-4 text-2xl font-bold border-none outline-none resize-none placeholder:text-zinc-500 shadow-2xl transition-all"
            />
          </div>

          {/* Alt Yatay Kaydırılabilir 18 Renk Şeridi */}
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
