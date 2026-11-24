"use client";

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
// [MODIFIED BY Bedirhan]
import {
  CanvasEngine,
  BaseLayer,
  TextLayer,
  OverlayImageLayer,
  FontPreset,
  TextBgPreset,
  FONT_PRESET_CONFIGS,
  StoryAudioMeta,
  VideoState,
  VideoExporter,
  ImageExporter,
  generateVideoThumbnails,
  generatePhotoThumbnails,
  ShareMode,
  PostAdjustmentState,
  DEFAULT_POST_ADJUSTMENTS,
  ReelsEffectClip,
  ReelsEffectId,
  FILTER_PRESETS,
  getMusicFadeGain,
  getMusicTimelineRange,
  isMediaLoadError,
  MediaSourceManager,
  POST_WORK_IMAGE_PX,
} from "@/lib/canvas-editor";
import MusicPickerDrawer from "@/components/share/MusicPickerDrawer";
import MusicSettingsPanel from "@/components/share/MusicSettingsPanel";
// [START] CREATED BY Bedirhan
import ExportProgress from "@/components/share/ExportProgress";
import ModeSelectorModal from "@/components/share/ModeSelectorModal";
import { ReplyBanner, ReplyMissingNotice } from "@/components/share/ReplyBanner";
import { feedService } from "@/lib/feed/feedService";
import type { Post } from "@/lib/feed/types";
import {
  ConfirmDialog,
  EditorBackStackProvider,
  useBackLayer,
  useEditorBackStack,
} from "@/components/share/common";
import StoryEditor from "@/components/share/story/StoryEditor";
import ReelsEditor from "@/components/share/reels/ReelsEditor";
import PostEditor from "@/components/share/post/PostEditor";
import { PublishStep, type PublishCover } from "@/components/share/common/PublishStep";
import { parseHashtags } from "@/components/share/common/hashtags";
import { DraftAutosaver } from "@/lib/drafts/DraftAutosaver";
import { deleteDraft, listDrafts, loadDraftFiles, requestPersistence, type DraftMode, type DraftRecord } from "@/lib/drafts/DraftStore";
import { adoptBlobKey, applyDraft, baseMediaKeyOf, captureDraft, type CapturedDraft, type DraftState } from "@/lib/drafts/serialize";
import PhotoStrip from "@/components/share/post/PhotoStrip";
// [END] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
import {
  ChevronLeft,
  ChevronDown,
  ArrowRight,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Download,
  AtSign,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sticker,
  CircleChevronRight,
  X,
  Music,
} from "lucide-react";
import { TbPhotoPlus } from "react-icons/tb";

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

// [MODIFIED BY Bedirhan]
type ActiveDrawer = "none" | "sticker_sheet" | "tag" | "video_tools" | "music_settings";

// [START] CREATED BY Bedirhan
const INITIAL_VIDEO_STATE: VideoState = {
  isVideo: false,
  duration: 0,
  trimStart: 0,
  trimEnd: 0,
  playbackRate: 1.0,
  volume: 1.0,
  muted: false,
  currentTime: 0,
  isPlaying: false,
};
// [END] CREATED BY Bedirhan

let hasHandledShareReload = false;

// F-03: sayfanın kendi içinde açtığı katmanları (çekmeceler, metin odak modu) geri yığınına kaydeder
function PageBackLayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackLayer(open, onClose);
  return null;
}

// F-05: "en az bir düzenleme" tespiti. Medya yüklendikten sonraki belge durumunun imzası; ilk
// imzadan farklıysa düzenleme vardır (yalnız medya yüklemek kirli sayılmaz).
function editSignature(engine: CanvasEngine, music: StoryAudioMeta | null): string {
  const s = engine.snapshot();
  return JSON.stringify([
    s.mode,
    s.postAspect,
    s.layers.map(({ layer, state }) => [layer.id, state]),
    s.media,
    s.clips.map((c) => ({ ...c, thumbnails: undefined })),
    s.filterIndex,
    s.music,
    music,
  ]);
}

export default function ShareStoryPage() {
  // useSearchParams (yanıt modu) Suspense sınırı ister
  return (
    <Suspense fallback={null}>
      <ShareStoryPageInner />
    </Suspense>
  );
}

function ShareStoryPageInner() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { profile, loading, refreshProfile } = useAuth();

  // WP-27: /share?replyTo=<postId> -> zincire yanıt modu (yalnızca Gönderi ve Reels)
  const searchParams = useSearchParams();
  const [replyDismissed, setReplyDismissed] = useState(false);
  const replyToId = replyDismissed ? null : searchParams.get("replyTo");
  const hasReplyParamRef = useRef(false);
  const replyParamPresent = !!searchParams.get("replyTo");
  useEffect(() => {
    hasReplyParamRef.current = replyParamPresent;
  }, [replyParamPresent]);
  const [replyParent, setReplyParent] = useState<Post | null>(null);
  const [replyMissing, setReplyMissing] = useState(false);
  const replyParentRef = useRef<Post | null>(null);

  // WP-27: Gönderi modunda çoklu fotoğraf (yeni gönderi en çok 7, yanıt en çok 3)
  interface PhotoSlot {
    id: string;
    file: File;
    captured: CapturedDraft | null;
  }
  const [slots, setSlots] = useState<PhotoSlot[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [slotBusy, setSlotBusy] = useState(false);
  const slotFiles = useMemo(() => slots.map((s) => s.file), [slots]);
  // WP-35: etkin olmayan fotoğrafların çalışma kopyalarını sırayla, tarayıcı boştayken hazırla; geçişte
  // yeniden çözme/kodlama olmasın. Bellekte yalnızca küçültülmüş Blob kalır (WeakMap, dosyayla birlikte gider).
  useEffect(() => {
    if (slotFiles.length < 2) return;
    let cancelled = false;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const later = (cb: () => void) => (ric ? ric(cb, { timeout: 1500 }) : window.setTimeout(cb, 250));
    void (async () => {
      for (let i = 0; i < slotFiles.length && !cancelled; i++) {
        await new Promise<void>((r) => later(r));
        if (cancelled) return;
        await MediaSourceManager.prepareWorkingCopy(slotFiles[i], POST_WORK_IMAGE_PX);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slotFiles]);
  const slotsRef = useRef<PhotoSlot[]>([]);
  const activeSlotRef = useRef(0);
  const addPhotosInputRef = useRef<HTMLInputElement | null>(null);
  const [publishProgress, setPublishProgress] = useState<{ phase: "export" | "upload"; done: number; total: number } | null>(null);
  const commitSlots = (next: PhotoSlot[], active: number) => {
    slotsRef.current = next;
    activeSlotRef.current = active;
    setSlots(next);
    setActiveSlot(active);
  };
  useEffect(() => {
    replyParentRef.current = replyParent;
  }, [replyParent]);

  // Canvas ve Motor Referansları
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const baseFileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayFileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // [START] CREATED BY Bedirhan
  // 3 Modlu Medya Editörü Durumları (Hikaye / Reels / Gönderi)
  const [shareMode, setShareMode] = useState<ShareMode>("story");
  const shareModeRef = useRef<ShareMode>("story");
  const [isModeSelectorOpen, setIsModeSelectorOpen] = useState<boolean>(true);
  const [, setPostAdjustments] = useState<PostAdjustmentState>(DEFAULT_POST_ADJUSTMENTS);
  // Post: alt panel yüksekliği + tuval en-boy oranı (PostEditor bildirir)
  const [postLayout, setPostLayout] = useState({ bottom: 0, ratio: 4 / 5 });
  // Reels: alt panel yüksekliği (ReelsEditor ölçüp bildirir); önizleme bunun üstünde kalır (C5)
  const [reelsLayout, setReelsLayout] = useState({ bottom: 0 });
  const [activeFilterIndex, setActiveFilterIndex] = useState<number>(0);
  const [activeReelsEffect, setActiveReelsEffect] = useState<ReelsEffectId>("none");
  const [effectClips, setEffectClips] = useState<ReelsEffectClip[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  // [END] CREATED BY Bedirhan

  // Editör Durumları
  const [canvasKey, setCanvasKey] = useState<number>(0);
  const [hasMedia, setHasMedia] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<BaseLayer | null>(null);
  const [filterToast, setFilterToast] = useState<string | null>(null);
  const [activeFilterGradient, setActiveFilterGradient] = useState<string>("#000000");
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>("none");

  // Mıknatıslı Çöp Kutusu Durumu
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [isTrashHot, setIsTrashHot] = useState(false);

  // Canlı Metin Düzenleme Modu (Instagram Story Focus Overlay)
  const [isTextEditing, setIsTextEditing] = useState(false);
  // Reels: metin düzenleyici ReelsEditor içinde açılır; bu sayaç ona istek iletir
  const [reelsTextRequest, setReelsTextRequest] = useState<{ layerId: string | null; seq: number } | null>(null);
  const [editingText, setEditingText] = useState("");
  const [activeFontPreset, setActiveFontPreset] = useState<FontPreset>("modern");
  const [activeBgPreset, setActiveBgPreset] = useState<TextBgPreset>("solid");
  const [activeTextColor, setActiveTextColor] = useState("#FFFFFF");
  const [activeTextAlign, setActiveTextAlign] = useState<"left" | "center" | "right">("center");

  // Müzik Durumları
  const [isMusicDrawerOpen, setIsMusicDrawerOpen] = useState(false);
  // "replace": seçici mevcut şarkıyı ön seçmeden açılır; "trim": mevcut şarkının kırpıcısıyla açılır
  const [musicPickerIntent, setMusicPickerIntent] = useState<"replace" | "trim">("trim");
  const [selectedMusic, setSelectedMusic] = useState<StoryAudioMeta | null>(null);

  // [START] CREATED BY Bedirhan
  // Video Düzenleme ve Dışa Aktarma Durumları
  const [videoState, setVideoState] = useState<VideoState>(INITIAL_VIDEO_STATE);
  const [videoThumbnails, setVideoThumbnails] = useState<string[]>([]);
  const [musicVolume, setMusicVolume] = useState<number>(0.85);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [isReelsCropping, setIsReelsCropping] = useState<boolean>(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const thumbAbortRef = useRef<AbortController | null>(null);
  // [END] CREATED BY Bedirhan

  // İşlem Durumları
  const [isPublishing, setIsPublishing] = useState(false);
  // WP-34: Reels / Gönderi için paylaşım ekranı (Hikaye doğrudan paylaşır)
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishCaption, setPublishCaption] = useState("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // F-01/F-02: medya yüklüyken seçilen farklı mod, onay bekler
  const [pendingMode, setPendingMode] = useState<ShareMode | null>(null);
  // WP-09: bulunan taslak (geri yükle / sil teklifi)
  const [draftOffer, setDraftOffer] = useState<DraftRecord<DraftState> | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const autosaverRef = useRef<DraftAutosaver | null>(null);
  const isDirtyRef = useRef<() => boolean>(() => false);
  const musicVolumeRef = useRef(0.85);
  // F-05: medya yüklendiği andaki belge imzası; farklıysa "düzenleme var"
  const baselineSigRef = useRef<string | null>(null);
  const selectedMusicRef = useRef<StoryAudioMeta | null>(null);
  useEffect(() => {
    selectedMusicRef.current = selectedMusic;
  }, [selectedMusic]);

  const openTextEditorRef = useRef<(layer?: TextLayer) => void>(() => {});

  // 0. SAYFA YENİLENİRSE DOĞRUDAN ANA SAYFAYA YÖNLENDİR (RELOAD KORUMASI)
  // & EDİTÖRE HER GİRİŞTE HER ŞEYİ BAŞTAN BAŞLAT
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Eski hatalı sessionStorage bayraklarını tamamen temizle
      sessionStorage.removeItem("sigal_editor_reloaded");
      sessionStorage.removeItem("sigal_editor_active");

      // Yalnızca /share üzerinde tarayıcı yenilemesi (F5 / Reload) yapılmışsa ve taslak yoksa ana sayfaya yönlendir
      let redirectIfNoDraft = false;
      if (!hasHandledShareReload) {
        hasHandledShareReload = true;
        const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        const isReload = navEntries.length > 0 && navEntries[0].type === "reload";
        const wasOnShare = navEntries.length > 0 && (navEntries[0].name.endsWith("/share") || navEntries[0].name.includes("/share?"));

        if (isReload && wasOnShare) {
          redirectIfNoDraft = true;
        }
      }
      // WP-09: kayıtlı taslak varsa geri yükle / sil teklif et; yenilemede taslak yoksa eski yönlendirme
      listDrafts()
        .then((drafts) => {
          // WP-27: yanıt modunda Hikaye taslağı önerilmez
          const offer = hasReplyParamRef.current ? drafts.find((d) => d.mode !== "story") : drafts[0];
          if (offer) setDraftOffer(offer as DraftRecord<DraftState>);
          else if (redirectIfNoDraft) router.replace("/");
        })
        .catch(() => {
          if (redirectIfNoDraft) router.replace("/");
        });
      void requestPersistence();
    }

    // Tuvali ve arkaplanı kesin olarak sıfırla, yeni bir tuval anahtarı üret
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    setCanvasKey((prev) => prev + 1);
    setMounted(true);
    if (baseFileInputRef.current) baseFileInputRef.current.value = "";
    if (overlayFileInputRef.current) overlayFileInputRef.current.value = "";

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        engineRef.current?.requestRender();
      });
    }

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };
  }, [router]);

  // F-11: önizleme sesini bırak (durdur, kaynağı kaldır, ref'i boşalt). Aksi halde ayrılmış Audio
  // öğesi resetEditor kapanışındaki previewAudioRef üzerinden yaşar ve her editör açılışında sızar.
  const releasePreviewAudio = useCallback(() => {
    const audio = previewAudioRef.current;
    previewAudioRef.current = null;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  // [MODIFIED BY Bedirhan]
  // Editörü Tamamen Temizleme Fonksiyonu
  const resetEditor = useCallback(() => {
    // WP-09: kullanıcı düzenlemeleri bilerek siliyor -> taslak da silinir (düzenleme yoksa eski taslağa dokunma)
    if (engineRef.current && isDirtyRef.current()) {
      void autosaverRef.current?.discard(shareModeRef.current as DraftMode);
    }
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    exportAbortRef.current?.abort();
    thumbAbortRef.current?.abort();
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    setCanvasKey((prev) => prev + 1);
    if (baseFileInputRef.current) baseFileInputRef.current.value = "";
    if (overlayFileInputRef.current) overlayFileInputRef.current.value = "";

    slotsRef.current = [];
    activeSlotRef.current = 0;
    setSlots([]);
    setActiveSlot(0);
    setHasMedia(false);
    setSelectedLayer(null);
    setFilterToast(null);
    setActiveFilterGradient("#000000");
    setActiveDrawer("none");
    setIsDraggingObject(false);
    setIsTrashHot(false);
    setIsTextEditing(false);
    setEditingText("");
    setActiveFontPreset("modern");
    setActiveBgPreset("solid");
    setActiveTextColor("#FFFFFF");
    setActiveTextAlign("center");
    setSelectedMusic(null);
    setIsMusicDrawerOpen(false);
    setVideoState(INITIAL_VIDEO_STATE);
    setVideoThumbnails([]);
    setMusicVolume(0.85);
    setIsExportingVideo(false);
    setIsReelsCropping(false);
    setPublishOpen(false);
    setPublishCaption("");
    setExportProgress(0);
    setPostAdjustments(DEFAULT_POST_ADJUSTMENTS);
    setActiveFilterIndex(0);
    setActiveReelsEffect("none");
    setEffectClips([]);
    releasePreviewAudio();
    baselineSigRef.current = null;
    setPendingMode(null);
    setShowExitConfirm(false);
  }, [releasePreviewAudio]);

  // Sayfadan çıkışta sesi tamamen durdur
  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
      thumbAbortRef.current?.abort();
      releasePreviewAudio();
    };
  }, [releasePreviewAudio]);

  // [START] CREATED BY Bedirhan
  // Arka plana geçildiğinde (document.hidden) oynatmayı ve sesleri derhal duraklat, Android bildirim çubuğunda medya çaları gizle
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (previewAudioRef.current && !previewAudioRef.current.paused) {
          previewAudioRef.current.pause();
        }
        if (engineRef.current && engineRef.current.getVideoState().isPlaying) {
          engineRef.current.pauseVideo();
        }
        if ("mediaSession" in navigator) {
          try {
            navigator.mediaSession.playbackState = "none";
            navigator.mediaSession.metadata = null;
          } catch {}
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleVisibilityChange);
    };
  }, []);
  // [END] CREATED BY Bedirhan

  // [START] CREATED BY Bedirhan
  // Canlı Önizleme Ses Senkronizasyonu: Timeline üzerindeki şarkı kesimi (timelineStart..timelineEnd) ile birebir senkronize çalar
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Story önizleme sesi story/StoryEditor içinde yönetilir (B12)
    if (shareMode === "story" || !selectedMusic?.streamUrl || !hasMedia || isExportingVideo || isMusicDrawerOpen) {
      const idle = previewAudioRef.current;
      if (idle && !idle.paused) idle.pause();
      return;
    }
    // Audio yalnız gerçekten çalınacağı zaman oluşturulur (boşta ayrılmış öğe tutulmaz)
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.crossOrigin = "anonymous";
      previewAudioRef.current.preload = "auto";
    }
    const audio = previewAudioRef.current;

    if (audio.src !== selectedMusic.streamUrl) {
      audio.src = selectedMusic.streamUrl;
    }
    const baseVolume = Math.max(0, Math.min(1, musicVolume));
    audio.volume = baseVolume;
    const fadeRange = getMusicTimelineRange(
      selectedMusic,
      videoState.trimStart,
      videoState.trimEnd || videoState.duration
    );

    let rafId: number | null = null;
    const syncAudioTick = () => {
      const eng = engineRef.current;
      if (!eng || !selectedMusic) return;

      if (videoState.isVideo && videoState.isPlaying) {
        audio.volume =
          baseVolume * getMusicFadeGain(selectedMusic, eng.getCurrentTime(), fadeRange);
      }

      if (!videoState.isVideo) {
        if (audio.paused) {
          audio.currentTime = selectedMusic.startTime || 0;
          audio.play().catch(() => {});
        }
        return;
      }

      if (!videoState.isPlaying) {
        if (!audio.paused) audio.pause();
        return;
      }

      const cur = eng.getCurrentTime();
      if (selectedMusic.segments && selectedMusic.segments.length > 0) {
        const activeSeg = selectedMusic.segments.find(
          (s) => cur >= s.timelineStart && cur <= s.timelineEnd
        );
        if (activeSeg) {
          const expectedSongTime =
            Math.max(0, activeSeg.songOffset || 0) +
            Math.max(0, cur - activeSeg.timelineStart);
          if (Math.abs(audio.currentTime - expectedSongTime) > 0.35) {
            try {
              audio.currentTime = expectedSongTime;
            } catch {}
          }
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        } else {
          if (!audio.paused) audio.pause();
        }
      } else {
        const clipStart =
          typeof selectedMusic.timelineStart === "number"
            ? selectedMusic.timelineStart
            : videoState.trimStart;
        const clipEnd =
          typeof selectedMusic.timelineEnd === "number" &&
          selectedMusic.timelineEnd > clipStart
            ? selectedMusic.timelineEnd
            : videoState.trimEnd || videoState.duration;

        if (cur >= clipStart && cur <= clipEnd) {
          const expectedSongTime =
            Math.max(0, selectedMusic.startTime || 0) + Math.max(0, cur - clipStart);
          if (Math.abs(audio.currentTime - expectedSongTime) > 0.35) {
            try {
              audio.currentTime = expectedSongTime;
            } catch {}
          }
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        } else {
          if (!audio.paused) audio.pause();
        }
      }

      rafId = requestAnimationFrame(syncAudioTick);
    };

    rafId = requestAnimationFrame(syncAudioTick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (previewAudioRef.current && !previewAudioRef.current.paused) {
        previewAudioRef.current.pause();
      }
    };
  }, [
    hasMedia,
    isExportingVideo,
    isMusicDrawerOpen,
    shareMode,
    musicVolume,
    selectedMusic,
    videoState.duration,
    videoState.isPlaying,
    videoState.isVideo,
    videoState.trimEnd,
    videoState.trimStart,
  ]);
  // [END] CREATED BY Bedirhan
  

  // F-05: en az bir düzenleme var mı (yalnız medya yüklemek kirli sayılmaz)
  const isDirty = useCallback((): boolean => {
    const engine = engineRef.current;
    const base = baselineSigRef.current;
    if (!engine || base === null) return false;
    try {
      return editSignature(engine, selectedMusicRef.current) !== base;
    } catch {
      return true;
    }
  }, []);

  // F-03: tarayıcı/donanım Geri tuşu önce en üstteki katmanı kapatır; katman yoksa çıkış istenir
  const exitRequestRef = useRef<() => void>(() => {});
  const backStack = useEditorBackStack({ onExitRequest: () => exitRequestRef.current() });

  // Editörden ayrıl: önce geri koruma girdisini kaldır (history.back() tuzağı), sonra sıfırla ve git
  const leaveEditor = useCallback(
    async (dest: "back" | "home") => {
      await backStack.release();
      resetEditor();
      if (dest === "home") router.replace("/");
      else router.back();
    },
    [backStack, resetEditor, router]
  );

  // Çıkış isteği (Geri butonu veya Geri tuşu): düzenleme varsa onay, yoksa doğrudan çık
  const requestExit = () => {
    if (isPublishing) return;
    if (isDirty()) setShowExitConfirm(true);
    else void leaveEditor("back");
  };
  useEffect(() => {
    exitRequestRef.current = requestExit;
  });

  const handleBackClick = requestExit;

  // Çıkışı Onaylama: Editörü Temizle ve Ana Sayfaya Dön
  const handleConfirmExit = () => {
    void leaveEditor("home");
  };

  // Sayfa Kapatma / Yenileme Öncesi Tarayıcı Güvenlik Uyarısı (yalnız düzenleme varken)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirty = isDirty();
      autosaverRef.current?.flush();
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  // WP-09: otomatik taslak kaydı (debounce 1.5 sn); sekme gizlenirken / kapanırken hemen başlat
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(() => {
    musicVolumeRef.current = musicVolume;
    autosaverRef.current?.schedule();
  }, [musicVolume, selectedMusic]);
  useEffect(() => {
    const a = new DraftAutosaver({
      getEngine: () => engineRef.current,
      getMode: () => shareModeRef.current as DraftMode,
      isDirty: () => isDirtyRef.current(),
      getMusicVolume: () => musicVolumeRef.current,
      onError: (msg) => {
        setFilterToast(msg);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setFilterToast(null), 3500);
      },
    });
    autosaverRef.current = a;
    const onHide = () => {
      if (document.visibilityState === "hidden") a.flush();
    };
    const onPageHide = () => a.flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      a.dispose();
      autosaverRef.current = null;
    };
  }, []);

  // [MODIFIED BY Bedirhan]
  // Tuval Motorunu Başlatma (Moda Göre 9:16 Tam Ekran veya 4:3 Gönderi Boyutları)
  const getOrCreateEngine = useCallback(() => {
    if (engineRef.current) return engineRef.current;
    if (!canvasRef.current) return null;

    const currentMode = shareModeRef.current;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1080;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1920;
    const aspect = vh / (vw || 1);
    const canvasWidth = currentMode === "post" ? 1440 : 1080;
    const canvasHeight = currentMode === "post" ? 1080 : Math.round(1080 * aspect);

    const engine = new CanvasEngine({
      canvas: canvasRef.current,
      width: canvasWidth,
      height: canvasHeight,
      fitMode: currentMode === "post" ? "cover" : "contain",
    });
    engine.setShareMode(currentMode);

    engine.on("change", () => autosaverRef.current?.schedule());
    engine.on("music-change", () => autosaverRef.current?.schedule());

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
      if (shareModeRef.current === "story") return; // Story: story/StoryEditor yönetir
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
      if (shareModeRef.current === "story") return;
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
      setActiveFilterIndex(engine.getCurrentFilterIndex());
      if (shareModeRef.current === "story") return; // Story rozeti StoryEditor içinde
      setFilterToast(filterName);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setFilterToast(null);
      }, 500);
    });

    // Mıknatıslı Çöp Kutusu Sürükleme Takibi (Reels NLE modunda fırlatarak silme kapalıdır)
    engine.on("drag-move", (info: { layer: BaseLayer; clientX: number; clientY: number; isDragging: boolean }) => {
      if (info.layer.type === "media" || shareModeRef.current !== "post") return;
      setIsDraggingObject(true);

      const trashCenterX = window.innerWidth / 2;
      const trashCenterY = window.innerHeight - 68;
      const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);
      const isOver = dist < 75;

      setIsTrashHot(isOver);
    });

    // Mıknatıslı Çöp Kutusu Bırakma Takibi (Reels NLE modunda silme yalnızca Sil butonuyla yapılır)
    engine.on("drag-end", (info: { layer: BaseLayer; clientX: number; clientY: number }) => {
      setIsDraggingObject(false);

      if (info.layer && info.layer.type !== "media" && shareModeRef.current === "post") {
        const trashCenterX = window.innerWidth / 2;
        const trashCenterY = window.innerHeight - 68;
        const dist = Math.hypot(info.clientX - trashCenterX, info.clientY - trashCenterY);

        if (dist < 75) {
          if (info.layer.type === "music_sticker") {
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

    // [START] CREATED BY Bedirhan
    engine.on("video-time", (vState: VideoState) => {
      setVideoState(vState);
    });
    // [END] CREATED BY Bedirhan

    engineRef.current = engine;
    return engine;
  }, []);

  // [MODIFIED BY Bedirhan]
  // Pencere boyutu değiştiğinde tuval çözünürlüğünü dinamik olarak güncelle
  useEffect(() => {
    const handleResize = () => {
      if (engineRef.current && canvasRef.current) {
        if (shareModeRef.current === "post") {
          return; // Post: mantıksal boyutu en-boy seçimi belirler, pencere değil
        } else if (shareModeRef.current === "reels") {
          engineRef.current.updateCanvasResolution(1080, 1920);
        } else {
          const vw = window.innerWidth || 1080;
          const vh = window.innerHeight || 1920;
          const aspect = vh / (vw || 1);
          const w = 1080;
          const h = Math.round(1080 * aspect);
          engineRef.current.updateCanvasResolution(w, h);
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // [START] CREATED BY Bedirhan
  // 1. MOD SEÇİMİ VE TABAN MEDYA AKIŞI (HİKAYE / REELS / GÖNDERİ)
  const handleSelectMode = useCallback(
    (mode: ShareMode) => {
      if (mode === "story" && replyParentRef.current) return; // yanıt modunda Hikaye yok
      // F-01/F-02: medya yüklüyken mod değişimi mevcut çalışmayı siler; önce onay iste
      if (hasMedia) {
        if (mode === shareModeRef.current) setIsModeSelectorOpen(false);
        else setPendingMode(mode);
        return;
      }
      shareModeRef.current = mode;
      setShareMode(mode);
      setIsModeSelectorOpen(false);
      setActiveDrawer("none");

      const engine = getOrCreateEngine();
      if (engine) {
        if (mode === "post") {
          engine.setFitMode("cover");
          engine.updateCanvasResolution(1440, 1080);
        } else if (mode === "reels") {
          engine.setFitMode("cover");
          engine.updateCanvasResolution(1080, 1920);
        } else {
          const vw = typeof window !== "undefined" ? window.innerWidth : 1080;
          const vh = typeof window !== "undefined" ? window.innerHeight : 1920;
          const aspect = vh / (vw || 1);
          engine.setFitMode("contain");
          engine.updateCanvasResolution(1080, Math.round(1080 * aspect));
        }
        engine.setShareMode(mode);
        setVideoState(engine.getVideoState());
      }

      if (!hasMedia) {
        setTimeout(() => {
          baseFileInputRef.current?.click();
        }, 60);
      }
    },
    [getOrCreateEngine, hasMedia]
  );

  // Onaylandı: motor medyası, katmanlar, müzik ve geri alma geçmişi dahil tam sıfırlama + yeni mod
  const confirmModeSwitch = () => {
    const mode = pendingMode;
    if (!mode) return;
    resetEditor();
    shareModeRef.current = mode;
    setShareMode(mode);
    setIsModeSelectorOpen(false);
    setTimeout(() => {
      baseFileInputRef.current?.click();
    }, 60);
  };

  const handleSelectFilterIndex = useCallback((index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setFilterByIndex(index);
    setActiveFilterIndex(index);
    const preset = FILTER_PRESETS[index];
    if (preset) {
      setActiveFilterGradient(preset.backgroundGradient);
    }
  }, []);

  const handleSelectReelsEffect = useCallback((effect: ReelsEffectId) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setReelsEffect(effect);
    setActiveReelsEffect(effect);
  }, []);

  const handleChangeEffectClips = useCallback((clips: ReelsEffectClip[]) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setEffectClips(clips);
    // Motor video sonunu geçen efektleri kırpar; ekrandaki durum motorla aynı olmalı
    setEffectClips(engine.getEffectClips());
  }, []);
  // [END] CREATED BY Bedirhan

  // [MODIFIED BY Bedirhan]
  const processBaseFile = async (file: File) => {
    const MAX_FILE_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_FILE_BYTES) {
      setFilterToast("Maksimum 100 MB dosya seçilebilir");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setFilterToast(null), 2200);
      if (baseFileInputRef.current) baseFileInputRef.current.value = "";
      return;
    }

    if (shareModeRef.current === "post" && file.type.startsWith("video/")) {
      setFilterToast("Gönderi modunda yalnızca fotoğraf seçilebilir");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setFilterToast(null), 2200);
      if (baseFileInputRef.current) baseFileInputRef.current.value = "";
      return;
    }

    try {
      const engine = getOrCreateEngine();
      if (!engine) return;

      engine.setShareMode(shareModeRef.current);
      if (shareModeRef.current === "post") {
        engine.setFitMode("cover");
        engine.updateCanvasResolution(1440, 1080);
      } else if (shareModeRef.current === "reels") {
        engine.setFitMode("cover");
        engine.updateCanvasResolution(1080, 1920);
      } else {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1080;
        const vh = typeof window !== "undefined" ? window.innerHeight : 1920;
        const aspect = vh / (vw || 1);
        engine.setFitMode("contain");
        engine.updateCanvasResolution(1080, Math.round(1080 * aspect));
      }

      thumbAbortRef.current?.abort();
      setVideoThumbnails([]);

      const media = await engine.loadMedia(file, undefined, shareModeRef.current === "post");
      baselineSigRef.current = editSignature(engine, selectedMusicRef.current);
      if (shareModeRef.current === "post" && slotsRef.current.length === 0) {
        commitSlots([{ id: `s${Date.now().toString(36)}`, file, captured: null }], 0);
      }
      setHasMedia(true);
      setPostAdjustments(engine.getPostAdjustments());
      setActiveFilterIndex(engine.getCurrentFilterIndex());
      setActiveReelsEffect(engine.getReelsEffect());
      setEffectClips(engine.getEffectClips());
      if (baseFileInputRef.current) baseFileInputRef.current.value = "";

      if (media.type === "video") {
        setVideoState(engine.getVideoState());
        const abortCtrl = new AbortController();
        thumbAbortRef.current = abortCtrl;
        generateVideoThumbnails(file, {
          count: 8,
          signal: abortCtrl.signal,
          onThumbnail: (thumbs) => setVideoThumbnails(thumbs),
        }).catch(() => {});
      } else if (shareModeRef.current === "reels") {
        // Reels modunda fotoğraf otomatik 5 saniyelik hareketli klibe dönüşür
        setVideoState(engine.getVideoState());
        generatePhotoThumbnails(file, 8)
          .then((thumbs) => setVideoThumbnails(thumbs))
          .catch(() => {});
      } else {
        setVideoState(INITIAL_VIDEO_STATE);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("Taban görsel yüklenemedi:", err);
      const msg = isMediaLoadError(err)
        ? "Bu dosya açılamadı. Dosya desteklenmiyor veya bozuk."
        : "Dosya yüklenemedi, lütfen tekrar deneyin.";
      setFilterToast(msg);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setFilterToast(null), 3000);
      if (baseFileInputRef.current) baseFileInputRef.current.value = "";
    }
  };

  // WP-09: taslağı geri yükle (medya + katmanlar + klipler + müzik + filtreler), sonra React durumunu motorla eşle
  const restoreDraft = async (rec: DraftRecord<DraftState>) => {
    setDraftBusy(true);
    try {
      const st = rec.state;
      const files = await loadDraftFiles(rec);
      const baseKey = baseMediaKeyOf(st);
      const baseFile = baseKey ? files.get(baseKey) : undefined;
      if (!baseFile) throw new Error("draft-media-missing");
      for (const [k, f] of files) adoptBlobKey(f, k);
      shareModeRef.current = st.mode;
      setShareMode(st.mode);
      setIsModeSelectorOpen(false);
      setActiveDrawer("none");
      await processBaseFile(baseFile);
      const engine = engineRef.current;
      if (!engine || !engine.getMedia()) throw new Error("draft-base-load");
      if (!(await applyDraft(engine, st, files))) throw new Error("draft-apply");
      setPostAdjustments(engine.getPostAdjustments());
      const fi = engine.getCurrentFilterIndex();
      setActiveFilterIndex(fi);
      const preset = FILTER_PRESETS[fi];
      if (preset) setActiveFilterGradient(preset.backgroundGradient);
      setActiveReelsEffect(engine.getReelsEffect());
      setEffectClips(engine.getEffectClips());
      setVideoState(engine.getVideoState());
      setSelectedMusic(st.music ? engine.getMusic() : null);
      setMusicVolume(st.musicVolume ?? 0.85);
      setDraftOffer(null);
    } catch (err) {
      console.error("Taslak geri yüklenemedi:", err);
      setDraftOffer(null);
      setFilterToast("Taslak geri yüklenemedi.");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setFilterToast(null), 3000);
    } finally {
      setDraftBusy(false);
    }
  };

  // WP-28: yanıtta da gönderi gibi en çok 7 fotoğraf
  const maxPhotos = () => 7;
  const flashToast = (msg: string, ms = 2600) => {
    setFilterToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setFilterToast(null), ms);
  };

  // Mevcut gönderiye fotoğraf ekler (üst sınır: 7)
  const addPhotos = (picked: File[]) => {
    const imgs = picked.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const max = maxPhotos();
    const room = max - slotsRef.current.length;
    if (room <= 0) {
      flashToast(`En fazla ${max} fotoğraf ekleyebilirsin`);
      return;
    }
    if (imgs.length > room) flashToast(`En fazla ${max} fotoğraf ekleyebilirsin; ilk ${room} tanesi eklendi`);
    const added = imgs.slice(0, room).map((f, i) => ({ id: `s${Date.now().toString(36)}${i}`, file: f, captured: null as CapturedDraft | null }));
    commitSlots([...slotsRef.current, ...added], activeSlotRef.current);
  };

  const captureActiveSlot = async () => {
    const eng = engineRef.current;
    const s = slotsRef.current[activeSlotRef.current];
    if (!eng || !s) return;
    try {
      s.captured = await captureDraft(eng, "post", { musicVolume: 0.85 });
    } catch {
      /* düzenleme kaydedilemezse fotoğraf özgün haliyle yüklenir */
    }
  };

  // Seçili fotoğrafı motora yükler; tek paylaşılan en-boy oranı korunur, fotoğrafın kendi düzenlemeleri geri kurulur
  const activateSlot = async (j: number, capture = true) => {
    const target = slotsRef.current[j];
    const eng0 = engineRef.current;
    if (!target || !eng0) return;
    if (capture) await captureActiveSlot();
    const shared = eng0.getPostAspect();
    await processBaseFile(target.file);
    const eng = engineRef.current;
    if (!eng) return;
    eng.setPostAspect(shared);
    if (target.captured) {
      const files = new Map<string, File>();
      for (const [k, cb] of target.captured.blobs) {
        files.set(k, cb.blob instanceof File ? cb.blob : new File([cb.blob], cb.name, { type: cb.type }));
      }
      await applyDraft(eng, { ...target.captured.state, postAspect: shared }, files);
    }
    activeSlotRef.current = j;
    setActiveSlot(j);
    setPostAdjustments(eng.getPostAdjustments());
    setActiveFilterIndex(eng.getCurrentFilterIndex());
  };

  const runSlotOp = async (op: () => Promise<void>) => {
    if (slotBusy || isPublishing) return;
    setSlotBusy(true);
    try {
      await op();
    } finally {
      setSlotBusy(false);
    }
  };
  const selectSlot = (j: number) => {
    if (j === activeSlotRef.current) return;
    void runSlotOp(() => activateSlot(j));
  };
  const removeSlot = (j: number) => {
    if (slotsRef.current.length <= 1) return;
    void runSlotOp(async () => {
      const cur = activeSlotRef.current;
      const next = slotsRef.current.filter((_, i) => i !== j);
      if (j === cur) {
        const idx = Math.min(j, next.length - 1);
        commitSlots(next, idx);
        await activateSlot(idx, false);
      } else {
        commitSlots(next, j < cur ? cur - 1 : cur);
      }
    });
  };
  const moveSlot = (j: number, dir: -1 | 1) => {
    const list = [...slotsRef.current];
    const k = j + dir;
    if (k < 0 || k >= list.length) return;
    [list[j], list[k]] = [list[k], list[j]];
    const cur = activeSlotRef.current;
    commitSlots(list, cur === j ? k : cur === k ? j : cur);
  };

  const handleBaseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    await processBaseFile(picked[0]);
    if (shareModeRef.current === "post" && picked.length > 1 && engineRef.current?.getMedia()) addPhotos(picked.slice(1));
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && !hasMedia) {
      processBaseFile(file);
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



  // ─────────────────────────────────────────────────────────────
  // 3. TİPOGRAFİ VE CANLI METİN DÜZENLEME AKIŞI (ODAK MODU)
  // ─────────────────────────────────────────────────────────────
  const openTextEditor = (layer?: TextLayer) => {
    if (shareModeRef.current === "reels") {
      setReelsTextRequest((p) => ({ layerId: layer?.id ?? null, seq: (p?.seq ?? 0) + 1 }));
      return;
    }
    const engine = getOrCreateEngine();
    if (!engine) return;

    engine.pauseVideo();

    let target = layer;
    if (!target) {
      target = engine.addText(
        "",
        {
          fontSize: 90,
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
        selectedLayer.visible = true;
        selectedLayer.temporalVisible = true;
        engineRef.current.selectLayerById(selectedLayer.id);
        engineRef.current.render();
        engineRef.current.requestRender();
        engineRef.current.emit("change");
        setSelectedLayer(selectedLayer);
      }
    }
    setIsTextEditing(false);
  };

  // F-04: Escape ve Geri tuşu metin editörünü geri yığınındaki katmanla kapatır (aşağıdaki PageBackLayer)

  const handleLiveTextChange = (text: string) => {
    setEditingText(text);
    if (selectedLayer && selectedLayer instanceof TextLayer && engineRef.current) {
      selectedLayer.setText(text);
      engineRef.current.render();
      engineRef.current.requestRender();
      engineRef.current.emit("change");
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
        fontSize: 72,
        color: "#000000",
        backgroundColor: "#ffffff",
        borderRadius: 14,
        backgroundPadding: 18,
        fontWeight: "800",
        fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, sans-serif",
      },
      0.5,
      0.5
    );

    setSelectedLayer(layer);
  };

  // Şarkıyı Seç ve Tuvale Çıkartma Olarak Ekle
  const handleSelectMusic = (meta: StoryAudioMeta) => {
    const engine = getOrCreateEngine();
    const vState = engine ? engine.getVideoState() : videoState;
    // Şarkı değiştirilirken timeline yerleşimi ve fade ayarları korunur; segmentler tek parçaya döner
    const prev = selectedMusic;
    const defaultStart =
      typeof prev?.timelineStart === "number"
        ? prev.timelineStart
        : vState.isVideo
          ? vState.trimStart
          : 0;
    const defaultEnd =
      typeof prev?.timelineEnd === "number" && prev.timelineEnd > defaultStart
        ? prev.timelineEnd
        : vState.isVideo
          ? vState.trimEnd || vState.duration || 15
          : 15;
    const enrichedMeta: StoryAudioMeta = {
      ...meta,
      timelineStart:
        typeof meta.timelineStart === "number" ? meta.timelineStart : defaultStart,
      timelineEnd:
        typeof meta.timelineEnd === "number" && meta.timelineEnd > defaultStart
          ? meta.timelineEnd
          : defaultEnd,
      segments: undefined,
      fadeIn: meta.fadeIn ?? prev?.fadeIn,
      fadeOut: meta.fadeOut ?? prev?.fadeOut,
    };
    setSelectedMusic(enrichedMeta);
    if (engine) {
      // Reels: tuvalde çıkartma yok, yalnızca meta (B6); diğer modlarda müzik çıkartması
      if (shareModeRef.current === "reels") engine.setMusic(enrichedMeta);
      else engine.addMusicSticker(enrichedMeta, 0.5, 0.65);
    }
  };

  const openMusicPicker = (intent: "replace" | "trim" = "trim") => {
    setActiveDrawer("none");
    setMusicPickerIntent(intent);
    setIsMusicDrawerOpen(true);
  };

  // Hikaye: müzik varsa ayar paneli, yoksa seçici açılır
  const handleStoryMusicButton = () => {
    if (selectedMusic) {
      setActiveDrawer("music_settings");
    } else {
      openMusicPicker();
    }
  };

  const handleRemoveMusic = () => {
    const engine = engineRef.current;
    const sticker = engine?.getMusicSticker();
    if (engine && sticker) engine.removeLayer(sticker.id);
    setSelectedMusic(null);
    setActiveDrawer("none");
  };

  // [START] CREATED BY Bedirhan
  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
    setIsExportingVideo(false);
    setIsPublishing(false);
    setExportProgress(0);
    engineRef.current?.playVideo().catch(() => {});
  };
  // [END] CREATED BY Bedirhan
  // E-01: kodlayıcı 1080p desteklemiyorsa (WP-03 onWarning) kullanıcıyı bilgilendir
  const handleExportWarning = (code: "downscaled-720p") => {
    if (code !== "downscaled-720p") return;
    setFilterToast("Cihaz 1080p kodlamayı desteklemiyor, 720p'ye düşürüldü");
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setFilterToast(null), 3200);
  };


  // [MODIFIED BY Bedirhan]
  // Cihaza WebP veya MP4 İndir
  const handleDownloadImage = async () => {
    const engine = getOrCreateEngine();
    if (!engine || isPublishing || isExportingVideo) return;
    try {
      if (videoState.isVideo) {
        setIsExportingVideo(true);
        setExportProgress(0);
        const abortCtrl = new AbortController();
        exportAbortRef.current = abortCtrl;
        const blob = await VideoExporter.exportToBlob(engine, {
          fps: 30,
          music: selectedMusic,
          musicVolume,
          onProgress: (p) => setExportProgress(p),
          signal: abortCtrl.signal,
          onWarning: handleExportWarning,
        });
        setIsExportingVideo(false);
        const ext = blob.type.includes("webm") ? "webm" : "mp4";
        ImageExporter.downloadBlob(blob, `sigalmedia_${Date.now()}.${ext}`);
        await engine.playVideo();
      } else {
        await engine.downloadImage(`sigalmedia_${Date.now()}.webp`, {
          mimeType: "image/webp",
          quality: 0.95,
        });
      }
    } catch (e) {
      setIsExportingVideo(false);
      if ((e as Error)?.name !== "AbortError") {
        console.error("İndirme hatası:", e);
      }
    }
  };

  // [MODIFIED BY Bedirhan]
  // ─────────────────────────────────────────────────────────────
  // 4. HİKAYEYİ / GÖNDERİYİ PAYLAŞ (GÖRSEL WEBP VEYA VİDEO MP4)
  // ─────────────────────────────────────────────────────────────
  // WP-27: yanıt modu — üst gönderiyi bul (mock akış servisi), Hikaye'yi dışla
  useEffect(() => {
    if (!replyToId || !profile?.uid) return;
    let dead = false;
    feedService.setCurrentUser({ id: profile.uid, username: profile.username || profile.displayName || "sen", avatarUrl: profile.photoURL || undefined });
    void feedService.getPost(replyToId).then(async (found) => {
      if (dead) return;
      // WP-28: yanıta yanıt yoktur; hedef bir yanıtsa kökü kullanılır (banner kök yazarını gösterir)
      let p = found;
      const rootId = found?.replyTo?.rootId;
      if (found && rootId && rootId !== found.id) p = (await feedService.getPost(rootId)) ?? found;
      if (dead) return;
      if (!p) {
        setReplyMissing(true);
        setReplyDismissed(true);
        return;
      }
      setReplyParent(p);
      if (shareModeRef.current === "story") {
        shareModeRef.current = "post";
        setShareMode("post");
      }
    });
    return () => {
      dead = true;
    };
  }, [replyToId, profile?.uid, profile?.username, profile?.displayName, profile?.photoURL]);

  const cancelReplyMode = () => {
    setReplyParent(null);
    setReplyDismissed(true);
    try {
      window.history.replaceState(window.history.state, "", "/share");
    } catch {
      /* yoksay */
    }
  };

  // Anketle yanıt: editörden çık, akışta anket sayfasını aç
  const replyWithPoll = async () => {
    const parent = replyParentRef.current;
    if (!parent || isPublishing) return;
    await backStack.release();
    resetEditor();
    router.replace(`/?pollReplyTo=${encodeURIComponent(parent.id)}`);
  };

  /** Reels / Gönderi: son düğme paylaşmaz, paylaşım ekranını açar. */
  const getEngineForPublish = () => engineRef.current;
  const openPublishScreen = () => {
    if (isPublishing || isExportingVideo) return;
    setPublishOpen(true);
  };

  const handlePublish = async (opts?: { caption: string; cover: PublishCover }) => {
    if (!profile?.uid || !engineRef.current || isPublishing || isExportingVideo) return;
    const replyTarget = replyParentRef.current;
    const engine = engineRef.current;

    try {
      setIsPublishing(true);
      const timestamp = Date.now();
      interface PublishItem {
        blob: Blob;
        filename: string;
        contentType: string;
        type: "image" | "video";
        poster?: Blob;
      }
      const items: PublishItem[] = [];
      const multi = shareModeRef.current === "post" && slotsRef.current.length > 1;

      if (videoState.isVideo) {
        // WP-27: yanıt modunda kapak karesi (mevcut kare); alınamazsa posterSiz devam
        let poster: Blob | undefined;
        if (replyTarget || opts?.cover.ms != null) {
          try {
            // WP-34: seçilen kapak karesi (yoksa mevcut kare)
            if (opts?.cover.ms != null) await engine.seekVideo(opts.cover.ms / 1000);
            poster = await engine.exportImage({ mimeType: "image/jpeg", quality: 0.8 });
          } catch {
            poster = undefined;
          }
        }
        setIsExportingVideo(true);
        setExportProgress(0);
        const abortCtrl = new AbortController();
        exportAbortRef.current = abortCtrl;

        const blob = await VideoExporter.exportToBlob(engine, {
          fps: 30,
          music: selectedMusic,
          musicVolume,
          onProgress: (p) => setExportProgress(p),
          signal: abortCtrl.signal,
          onWarning: handleExportWarning,
        });
        setIsExportingVideo(false);
        const isWebm = blob.type.includes("webm");
        items.push({
          blob,
          filename: `${shareMode}_${profile.uid}_${timestamp}.${isWebm ? "webm" : "mp4"}`,
          contentType: isWebm ? "video/webm" : "video/mp4",
          type: "video",
          poster,
        });
      } else if (multi) {
        // WP-27: çoklu fotoğraf — her fotoğrafı (kendi düzenlemeleriyle) sırayla dışa aktar
        const total = slotsRef.current.length;
        setPublishProgress({ phase: "export", done: 0, total });
        await captureActiveSlot();
        // WP-34: kapak seçilen fotoğraf ilk sıraya alınır (editördeki sıra değişmez)
        const coverIdx = Math.min(Math.max(opts?.cover.slot ?? 0, 0), total - 1);
        const order = [coverIdx, ...Array.from({ length: total }, (_, k) => k).filter((k) => k !== coverIdx)];
        for (let n = 0; n < total; n++) {
          await activateSlot(order[n], false);
          const i = n;
          const blob = await engine.exportImage({ mimeType: "image/webp", quality: 0.92 });
          items.push({ blob, filename: `${shareMode}_${profile.uid}_${timestamp}_${i + 1}.webp`, contentType: "image/webp", type: "image" });
          setPublishProgress({ phase: "export", done: i + 1, total });
        }
      } else {
        const blob = await engine.exportImage({
          mimeType: "image/webp",
          quality: 0.92,
        });
        items.push({ blob, filename: `${shareMode}_${profile.uid}_${timestamp}.webp`, contentType: "image/webp", type: "image" });
      }

      // Yükleme: ayrı dosyalar sırayla (ilerleme göstergesiyle)
      const media: { url: string; type: "image" | "video"; width?: number; height?: number; posterUrl?: string }[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (items.length > 1) setPublishProgress({ phase: "upload", done: i, total: items.length });
        const storageRef = ref(storage, `posts/${profile.uid}/${it.filename}`);
        await uploadBytes(storageRef, it.blob, { contentType: it.contentType });
        const url = await getDownloadURL(storageRef);
        const entry: (typeof media)[number] = { url, type: it.type };
        if (it.type === "image") {
          try {
            const bm = await createImageBitmap(it.blob);
            entry.width = bm.width;
            entry.height = bm.height;
            bm.close();
          } catch {
            /* boyut bilgisi isteğe bağlı */
          }
        }
        if (it.poster) {
          const posterRef = ref(storage, `posts/${profile.uid}/${it.filename.replace(/\.[a-z0-9]+$/i, "")}_poster.jpg`);
          await uploadBytes(posterRef, it.poster, { contentType: "image/jpeg" });
          entry.posterUrl = await getDownloadURL(posterRef);
        }
        media.push(entry);
        if (items.length > 1) setPublishProgress({ phase: "upload", done: i + 1, total: items.length });
      }

      const postData: Record<string, unknown> = {
        authorId: profile.uid,
        authorUsername: profile.username || "kullanici",
        authorDisplayName: profile.displayName || "Kullanıcı",
        authorPhotoURL: profile.photoURL || "",
        // Eski tek-medya alanları ilk öğeyle dolar (profil ızgarası uyumu)
        mediaUrl: media[0].url,
        mediaType: media[0].type,
        media,
        type: shareMode,
        caption: opts?.caption ?? "",
        hashtags: parseHashtags(opts?.caption ?? ""),
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp(),
      };
      if (videoState.isVideo && opts?.cover.ms != null) postData.coverTimeMs = opts.cover.ms;
      if (replyTarget) {
        postData.replyTo = {
          // Zincirler düz: ebeveyn her zaman kök, derinlik 1
          parentId: replyTarget.replyTo?.rootId ?? replyTarget.id,
          rootId: replyTarget.replyTo?.rootId ?? replyTarget.id,
          depth: 1,
        };
      }

      // Müzik seçildiyse metaveriyi gönderiye ekle (streamUrl: iTunes önizleme adresi)
      if (selectedMusic) {
        postData.audio = {
          id: selectedMusic.id,
          title: selectedMusic.title,
          artist: selectedMusic.artist,
          album: selectedMusic.album || "",
          thumbnail: selectedMusic.thumbnail || "",
          streamUrl: selectedMusic.streamUrl,
          startTime: selectedMusic.startTime,
          duration: selectedMusic.duration,
          totalDuration: selectedMusic.totalDuration,
          lyricsSnippet: selectedMusic.lyricsSnippet || "",
        };
      }

      // Otomatik test kancası (yalnızca tarayıcı testlerinde tanımlanır): gerçek gönderi oluşturmadan yükü inceler
      const testSink = (window as unknown as { __SIGAL_TEST_PUBLISH__?: (d: Record<string, unknown>) => string | void }).__SIGAL_TEST_PUBLISH__;
      const stubId = testSink?.({ ...postData, createdAt: "SERVER_TIMESTAMP" });
      let newId: string;
      if (stubId) {
        newId = stubId;
      } else {
        const created = await addDoc(collection(db, "posts"), postData);
        newId = created.id;

        await updateDoc(doc(db, "users", profile.uid), {
          "stats.postsCount": increment(1),
          updatedAt: serverTimestamp(),
        });

        await refreshProfile();
      }

      // WP-09: yayınlandı -> taslak silinir ve bir daha kaydedilmez
      const autosaver = autosaverRef.current;
      autosaver?.stop();
      await autosaver?.discard(shareModeRef.current as DraftMode);

      if (replyTarget) {
        // WP-27: rozet kuralları + akışta yeni yanıta dön
        await feedService.notePublished(true, replyTarget.id);
        router.replace(`/?highlight=${encodeURIComponent(newId)}`);
        return;
      }
      setTimeout(() => {
        router.push("/profile");
      }, 400);
    } catch (err) {
      setIsExportingVideo(false);
      setIsPublishing(false);
      setPublishProgress(null);
      if ((err as Error)?.name !== "AbortError") {
        console.error("Paylaşım hatası:", err);
      }
    }
  };

  if (!mounted || loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-[var(--ed-ac,#38d5c8)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentFontCfg = FONT_PRESET_CONFIGS[activeFontPreset];
  const modeLabel =
    shareMode === "story" ? "Hikaye" : shareMode === "reels" ? "Reels" : "Gönderi";

  return (
    <EditorBackStackProvider value={backStack}>
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleRootDrop}
      className="fixed inset-0 w-screen h-[100dvh] bg-black text-white overflow-hidden select-none no-select touch-none"
    >
      {/* 1. Görünmez Taban Medya Dosya Seçici */}
      <input
        type="file"
        ref={baseFileInputRef}
        onChange={handleBaseFileChange}
        accept={shareMode === "post" ? "image/*" : "image/*,video/*"}
        multiple={shareMode === "post"}
        className="hidden"
      />
      <input
        type="file"
        ref={addPhotosInputRef}
        data-testid="add-photos-input"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          addPhotos(picked);
        }}
        accept="image/*"
        multiple
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

      {/* [MODIFIED BY Bedirhan] */}
      {/* 3. TUVAL SAHNESİ: Hikaye için 9:16 Tam Ekran, Reels için Sabit Çerçeveli Güvenli Önizleme (top-16 bottom-[390px]), Gönderi için 4:3 Stüdyo Çerçevesi */}
      <div
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            engineRef.current?.pauseVideo();
            engineRef.current?.selectLayerById(null);
          }
        }}
        className={
          shareMode === "reels" && hasMedia
            ? "fixed inset-x-0 [@media(min-width:1024px)_and_(min-height:600px)]:left-[168px] [@media(min-width:1024px)_and_(min-height:600px)]:right-[168px] flex items-center justify-center p-3 [@media(min-width:1024px)_and_(min-height:600px)]:p-1 overflow-hidden select-none bg-black z-20"
            : shareMode === "post"
              ? "fixed inset-x-0 flex items-center justify-center overflow-hidden select-none"
              : "fixed inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none"
        }
        style={{
          ...(shareMode === "post"
            ? {
                top: `calc(env(safe-area-inset-top, 0px) + ${replyParent ? 116 : 68}px)`,
                bottom: hasMedia ? postLayout.bottom + 64 : 0,
                containerType: "size" as const,
              }
            : shareMode === "reels" && hasMedia
              ? {
                  top: "calc(env(safe-area-inset-top, 0px) + 64px)",
                  bottom: reelsLayout.bottom,
                }
              : {}),
          background:
            shareMode === "reels"
              ? "#000000"
              : shareMode === "post"
                ? "#09090b"
                : activeFilterGradient,
          transition: "background 400ms cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: "background",
        }}
      >
        <div
          style={
            shareMode === "post"
              ? {
                  aspectRatio: String(postLayout.ratio),
                  width: `min(100cqw, calc(100cqh * ${postLayout.ratio}))`,
                }
              : undefined
          }
          className={
            shareMode === "post"
              ? "shrink-0 overflow-hidden bg-black shadow-2xl"
              : shareMode === "reels" && hasMedia
                ? "h-full max-h-full max-w-[85vw] aspect-[9/16] rounded-2xl overflow-hidden border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.85)] bg-neutral-950 flex items-center justify-center shrink-0"
                : "w-full h-full"
          }
        >
          <canvas
            key={canvasKey}
            ref={canvasRef}
            style={{
              width: "100%",
              height: "100%",
              touchAction: "none",
            }}
            className="w-full h-full block cursor-default select-none touch-none"
          />
        </div>
      </div>

      {/* 4. CANLI FİLTRE ROZETİ (0.5s Minimal Instagram Swipe Toast) / BİLDİRİM */}
      {filterToast && (
        <div
          data-testid="filter-toast"
          className={`fixed left-1/2 -translate-x-1/2 z-40 bg-black/60 backdrop-blur-md px-5 py-2 rounded-full text-sm font-bold text-white shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${
            hasMedia ? "top-1/2 -translate-y-1/2" : "top-20"
          }`}
        >
          {filterToast}
        </div>
      )}

      {publishProgress && isPublishing && (
        <div role="status" data-testid="publish-progress" className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-full bg-black/75 backdrop-blur-md px-4 py-2 text-xs font-bold text-white">
          {publishProgress.phase === "export" ? "Hazırlanıyor" : "Yükleniyor"} {Math.min(publishProgress.done + (publishProgress.phase === "upload" && publishProgress.done < publishProgress.total ? 1 : 0), publishProgress.total)}/{publishProgress.total}
        </div>
      )}
      {replyParent && !isTextEditing && !isModeSelectorOpen && (
        <ReplyBanner parent={replyParent} onCancel={cancelReplyMode} onPoll={() => void replyWithPoll()} disabled={isPublishing} />
      )}
      {replyMissing && !isTextEditing && !isModeSelectorOpen && <ReplyMissingNotice onDone={() => setReplyMissing(false)} />}

      {/* 5. ÜST BAR: GERİ, ORTADA MOD SEÇİCİ HAP VE SAĞ ÜST PAYLAŞ / İNDİR */}
      {!isTextEditing && !isModeSelectorOpen && (
        <div className="fixed inset-x-0 top-4 z-40 px-4 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackClick}
              disabled={isPublishing}
              aria-label="Geri"
              className="w-11 h-11 rounded-full bg-[var(--ed-bg2,#1a1e25)] hover:bg-[var(--ed-bg3,#232932)] active:scale-90 transition-all shadow-xl flex items-center justify-center text-white"
            >
              {shareMode === "reels" ? (
                <ChevronDown className="w-6 h-6" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>

            {hasMedia && (
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isPublishing}
                aria-label="İndir"
                className="w-11 h-11 rounded-full bg-[var(--ed-bg2,#1a1e25)] hover:bg-[var(--ed-bg3,#232932)] active:scale-90 transition-all shadow-xl flex items-center justify-center text-white"
              >
                <Download className="w-4 h-4 text-[var(--ed-tx,#e8ecf1)]" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsModeSelectorOpen(true)}
            disabled={isPublishing}
            className="h-11 px-4 rounded-2xl bg-[var(--ed-bg2,#1a1e25)] hover:bg-[var(--ed-bg3,#232932)] active:scale-95 transition-all shadow-xl flex items-center gap-2 text-sm font-semibold text-white"
          >
            <span className="w-4 h-4 rounded-md bg-[var(--ed-ac,#38d5c8)] inline-block shrink-0" />
            <span>{modeLabel}</span>
          </button>

          {shareMode === "reels" && hasMedia ? (
            <button
              type="button"
              onClick={openPublishScreen}
              disabled={isPublishing}
              aria-label="İleri"
              className="w-11 h-11 rounded-full bg-white text-black hover:bg-zinc-200 active:scale-90 transition-all shadow-xl flex items-center justify-center disabled:opacity-50"
            >
              {isPublishing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              )}
            </button>
          ) : (
            <div className="w-11" />
          )}
        </div>
      )}

      {/* Taban Medya Henüz Seçilmediyse: Ortada Minimal Medya Seç Butonu */}
      {!hasMedia && !isModeSelectorOpen && (
        <div className="fixed inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
          <button
            type="button"
            data-testid="media-picker-btn"
            onClick={() => baseFileInputRef.current?.click()}
            className="pointer-events-auto flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 backdrop-blur-xl border border-white/20 text-white font-semibold text-sm shadow-2xl transition-all"
          >
            <ImageIcon className="w-5 h-5 text-[var(--ed-ac,#38d5c8)]" />
            <span>
              {shareMode === "post" ? "Fotoğraf Seç" : "Fotoğraf veya Video Seç"}
            </span>
          </button>
        </div>
      )}

      {/* [START] CREATED BY Bedirhan */}
      {/* 6A. HİKAYE MODU (STORY): Video kırpma kapalı, dikey hikaye araçları + Sağ Alt Paylaş */}
      {hasMedia && shareMode === "story" && engineRef.current && !isModeSelectorOpen && (
        <>
          <StoryEditor
            engine={engineRef.current}
            canvas={canvasRef.current}
            selectedMusic={selectedMusic}
            onMusicChange={setSelectedMusic}
            musicVolume={musicVolume}
            onMusicVolumeChange={setMusicVolume}
            suspendAudio={isExportingVideo || isPublishing}
          />

          <div className="fixed right-4 bottom-6 z-40 pointer-events-auto animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => void handlePublish()}
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
        </>
      )}

      {/* 6B. REELS MODU (SABİT PPS MERKEZ İBRELİ NLE TIMELINE + DİNAMİK ALT AKSİYON ÇUBUĞU) */}
      {hasMedia && shareMode === "reels" && (
        <ReelsEditor
          engine={engineRef.current}
          selectedCanvasLayer={selectedLayer}
          videoState={videoState}
          thumbnails={videoThumbnails}
          selectedMusic={selectedMusic}
          musicVolume={musicVolume}
          activeFilterIndex={activeFilterIndex}
          activeReelsEffect={activeReelsEffect}
          effectClips={effectClips}
          isPublishing={isPublishing}
          onChangeTrim={(start, end) => engineRef.current?.setTrim(start, end)}
          onChangeSpeed={(rate) => engineRef.current?.setSpeed(rate)}
          onChangeVolume={(vol, muted) => engineRef.current?.setVolume(vol, muted)}
          onChangeMusicVolume={(vol) => setMusicVolume(vol)}
          onChangeMusicMeta={(nextMusic) => setSelectedMusic(nextMusic)}
          onChangeEffectClips={handleChangeEffectClips}
          onCropModeChange={setIsReelsCropping}
          onSeek={(t) => engineRef.current?.seekVideo(t)}
          onTogglePlay={() => engineRef.current?.toggleVideoPlay()}
          textEditRequest={reelsTextRequest}
          onOpenMusicPicker={openMusicPicker}
          onAddMention={() => handleAddTagSticker()}
          onSelectFilterIndex={handleSelectFilterIndex}
          onSelectReelsEffect={handleSelectReelsEffect}
          onLayout={setReelsLayout}
        />
      )}

      {/* 6C. GÖNDERİ MODU (4:3 PROFESYONEL FOTOĞRAF STÜDYOSU) */}
      {!isTextEditing && hasMedia && shareMode === "post" && (
        <>
          <div className="fixed right-4 top-6 flex flex-col gap-2.5 z-40 pointer-events-auto">
            <button
              type="button"
              onClick={() => openTextEditor()}
              aria-label="Metin ekle"
              className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center font-bold text-xs"
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => setActiveDrawer("tag")}
              aria-label="Kişi etiketle"
              className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
            >
              <AtSign className="w-5 h-5 text-cyan-400" />
            </button>
          </div>

          <PhotoStrip
            files={slotFiles}
            active={activeSlot}
            max={7}
            busy={slotBusy || isPublishing}
            bottom={postLayout.bottom}
            onSelect={selectSlot}
            onAdd={() => addPhotosInputRef.current?.click()}
            onRemove={removeSlot}
            onMove={moveSlot}
          />
          {engineRef.current && (
            <PostEditor
              key={activeSlot}
              engine={engineRef.current}
              canvas={canvasRef.current}
              isPublishing={isPublishing}
              onPublish={openPublishScreen}
              onLayout={setPostLayout}
            />
          )}
        </>
      )}

      {/* WP-34: Reels / Gönderi paylaşım ekranı (açıklama, #etiket, kapak) */}
      {publishOpen && hasMedia && (shareMode === "reels" || shareMode === "post") && (
        <PublishStep
          mode={shareMode}
          getEngine={getEngineForPublish}
          slots={slots}
          activeSlot={activeSlot}
          aspect={postLayout.ratio}
          caption={publishCaption}
          onCaptionChange={setPublishCaption}
          subtitle={replyParent ? `@${feedService.getUser(replyParent.authorId).username}'e yanıt` : undefined}
          busy={isPublishing || isExportingVideo}
          busyProgress={
            isExportingVideo
              ? exportProgress
              : publishProgress
                ? (publishProgress.done + (publishProgress.phase === "upload" ? publishProgress.total : 0)) / (publishProgress.total * 2)
                : undefined
          }
          onBack={() => setPublishOpen(false)}
          onShare={(caption, cover) => handlePublish({ caption, cover })}
        />
      )}

      {/* 3 MOD SEÇİCİ MODAL (Hikaye / Reels / Gönderi) */}
      <ModeSelectorModal
        isOpen={isModeSelectorOpen}
        activeMode={hasMedia ? shareMode : null}
        hiddenModes={replyParent ? ["story"] : undefined}
        notice={replyParent ? `↳ @${feedService.getUser(replyParent.authorId).username}'a yanıt veriyorsun. Gönderi veya Reels seç.` : undefined}
        onSelectMode={handleSelectMode}
        onBack={() => {
          if (hasMedia) {
            setIsModeSelectorOpen(false);
          } else {
            void leaveEditor("back");
          }
        }}
      />
      <ConfirmDialog
        open={pendingMode !== null}
        title="Mevcut çalışma silinsin mi?"
        message="Mod değiştirirseniz yüklediğiniz medya ve tüm düzenlemeler silinir."
        confirmLabel="Sil ve Değiştir"
        cancelLabel="Vazgeç"
        destructive
        onConfirm={confirmModeSwitch}
        onCancel={() => setPendingMode(null)}
      />
      <ConfirmDialog
        open={draftOffer !== null}
        title="Kayıtlı taslak bulundu"
        message={
          draftOffer
            ? `${draftOffer.mode === "story" ? "Hikaye" : draftOffer.mode === "reels" ? "Reels" : "Gönderi"} · ${new Date(draftOffer.savedAt).toLocaleString("tr-TR")}`
            : undefined
        }
        confirmLabel="Taslağı geri yükle"
        secondaryLabel="Sil"
        cancelLabel="Şimdilik kapat"
        busy={draftBusy}
        onConfirm={() => draftOffer && void restoreDraft(draftOffer)}
        onSecondary={() => {
          const mode = draftOffer?.mode;
          setDraftOffer(null);
          if (mode) void deleteDraft(mode);
        }}
        onCancel={() => setDraftOffer(null)}
      />
      <PageBackLayer open={activeDrawer !== "none"} onClose={() => setActiveDrawer("none")} />
      <PageBackLayer open={isTextEditing} onClose={closeTextEditor} />
      {/* [END] CREATED BY Bedirhan */}

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
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-[var(--ed-line,#2a303a)] p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Çıkartmalar</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1 rounded-full text-[var(--ed-tx2,#98a2b3)] hover:text-white transition-colors"
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
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-[var(--ed-bg2,#1a1e25)] hover:bg-white/10 border border-[var(--ed-line,#2a303a)] active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-[rgba(56,213,200,0.20)] text-[var(--ed-ac,#38d5c8)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <TbPhotoPlus className="w-5 h-5" />
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
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-[var(--ed-bg2,#1a1e25)] hover:bg-white/10 border border-[var(--ed-line,#2a303a)] active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-[rgba(56,213,200,0.20)] text-[var(--ed-ac,#38d5c8)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <AtSign className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">@Bahset</span>
            </button>

            {/* Müzik Kartı */}
            <button
              type="button"
              onClick={() => {
                if (selectedMusic) {
                  setActiveDrawer("music_settings");
                } else {
                  openMusicPicker();
                }
              }}
              className="flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl bg-[var(--ed-bg2,#1a1e25)] hover:bg-white/10 border border-[var(--ed-line,#2a303a)] active:scale-95 transition-all text-white group"
            >
              <div className="w-11 h-11 rounded-full bg-[rgba(56,213,200,0.20)] text-[var(--ed-ac,#38d5c8)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Music className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium">Müzik</span>
            </button>
          </div>
        </div>
      )}

      {/* 11. ALTTAN AÇILAN MÜZİK ÇEKMECESİ (TAM EKRAN EN ÜSTE KADAR) */}
      <MusicPickerDrawer
        isOpen={isMusicDrawerOpen}
        onClose={() => setIsMusicDrawerOpen(false)}
        onSelectMusic={handleSelectMusic}
        currentMusic={musicPickerIntent === "trim" ? selectedMusic : null}
        mode={shareMode}
        clipDuration={engineRef.current?.getTotalTimelineDuration() || videoState.duration}
      />

      {/* 11B. SEÇİLİ ŞARKI AYAR PANELİ (HİKAYE) */}
      {activeDrawer === "music_settings" && selectedMusic && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-[var(--ed-line,#2a303a)] p-5 pb-8 animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <MusicSettingsPanel
            music={selectedMusic}
            volume={musicVolume}
            onChangeVolume={setMusicVolume}
            onChangeMusic={setSelectedMusic}
            onReplace={() => openMusicPicker("replace")}
            onTrim={() => openMusicPicker("trim")}
            onRemove={handleRemoveMusic}
            onClose={() => setActiveDrawer("none")}
          />
        </div>
      )}
      {/* 12. ALTTAN AÇILAN ETİKETLEME PANELİ */}
      {activeDrawer === "tag" && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-[var(--ed-line,#2a303a)] p-5 pb-8 flex flex-col max-h-[52vh] animate-in slide-in-from-bottom duration-200 shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-white font-semibold text-base">Kişi Etiketle</h3>
            <button
              type="button"
              onClick={() => setActiveDrawer("none")}
              className="p-1 rounded-full text-[var(--ed-tx2,#98a2b3)] hover:text-white transition-colors"
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
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-[rgba(56,213,200,0.10)] border border-[rgba(56,213,200,0.20)] hover:bg-[rgba(56,213,200,0.20)] text-white transition-all text-left"
          >
            <div className="w-9 h-9 rounded-full bg-[rgba(56,213,200,0.20)] text-[var(--ed-ac,#38d5c8)] flex items-center justify-center shrink-0">
              <AtSign className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">Profilini Etiketle</p>
              <p className="text-[11px] text-[var(--ed-ac,#38d5c8)] truncate">@{profile?.username || "kullanici"}</p>
            </div>
          </button>
        </div>
      )}

      <ExportProgress
        isOpen={isExportingVideo}
        progress={exportProgress}
        clipCount={engineRef.current?.getVideoClips().length || 1}
        onCancel={handleCancelExport}
      />
      {/* [END] CREATED BY Bedirhan */}

      {/* 13. CANLI METİN YAZMA & RENK MODU (INSTAGRAM STORY ODAK MODU) */}
      {isTextEditing && (
        <div role="dialog" aria-modal="true" aria-label="Metin düzenle" className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex flex-col justify-between p-4 pt-safe pb-safe animate-in fade-in duration-150">
          {/* Üst Düzenleme Çubuğu */}
          <div className="h-14 flex items-center justify-between">
            {/* Metin Hizalama */}
            <button
              type="button"
              onClick={handleToggleAlign}
              aria-label="Hizalama"
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
              className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-[var(--ed-line,#2a303a)] text-xs font-bold tracking-wide active:scale-95 transition-all"
            >
              {currentFontCfg.name}
            </button>

            {/* Arka Plan Hapı Butonu (A - 4 Mod) */}
            <button
              type="button"
              onClick={handleCycleBg}
              aria-label="Arka plan"
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
              className="w-full max-w-sm rounded-xl p-4 text-2xl font-bold border-none outline-none resize-none placeholder:text-[var(--ed-tx3,#5b6574)] shadow-2xl transition-all"
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

      {/* 14. ÇIKIŞ VE DEĞİŞİKLİKLERİ SİLME ONAY MODALI (geri yığınına kayıtlı) */}
      <ConfirmDialog
        open={showExitConfirm}
        title="Değişiklikler silinsin mi?"
        message="Şimdi çıkarsanız yaptığınız tüm değişiklikler kaybolacak."
        confirmLabel="Değişiklikleri Sil"
        cancelLabel="Düzenlemeye Devam Et"
        destructive
        onConfirm={handleConfirmExit}
        onCancel={() => setShowExitConfirm(false)}
      />
    </div>
    </EditorBackStackProvider>
  );
}
