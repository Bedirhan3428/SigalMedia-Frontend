"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaseSensitive, Music, Play, Trash2, Volume2 } from "lucide-react";
import { PiStickerLight } from "react-icons/pi";
import { TbPhotoPlus } from "react-icons/tb";
import {
  OverlayImageLayer,
  TextLayer,
  isMediaLoadError,
  type BaseLayer,
  type CanvasEngine,
  type DragInfo,
  type StoryAudioMeta,
} from "@/lib/canvas-editor";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_TEXT_EDITOR_VALUE,
  EditorIconButton,
  MENTION_STICKER_TEXT_STYLE,
  MusicSettingsPanel,
  Sheet,
  StickerSheet,
  TextEditorOverlay,
  useEditorToast,
  type MentionUser,
  type TextEditorValue,
} from "../common";
import MusicPickerDrawer from "../MusicPickerDrawer";
import { useStoryMusicPreview } from "./useStoryMusicPreview";

export interface StoryEditorProps {
  engine: CanvasEngine;
  /** Tuval elemanı (arka plana dokunarak oynat/duraklat için). */
  canvas: HTMLCanvasElement | null;
  /** Sayfanın tuttuğu seçili müzik (paylaşım bunu kullanır). */
  selectedMusic: StoryAudioMeta | null;
  onMusicChange: (music: StoryAudioMeta | null) => void;
  musicVolume: number;
  onMusicVolumeChange: (volume: number) => void;
  /** Dışa aktarma/paylaşım sürerken önizleme sesi susar. */
  suspendAudio?: boolean;
}

const TRASH_RADIUS = 75;
const PLACEHOLDER_TEXT = "Yazı Ekleyin";

/**
 * Hikaye düzenleme arayüzü: metin, çıkartma/bahset, müzik, çöp kutusu, oynat/duraklat,
 * ses aç, filtre adı. Paylaş / indir / geri düğmeleri sayfada kalır.
 */
export default function StoryEditor({
  engine,
  canvas,
  selectedMusic,
  onMusicChange,
  musicVolume,
  onMusicVolumeChange,
  suspendAudio = false,
}: StoryEditorProps) {
  const { profile } = useAuth();
  const toast = useEditorToast();

  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState<Partial<TextEditorValue>>(DEFAULT_TEXT_EDITOR_VALUE);
  const editingIdRef = useRef<string | null>(null);

  const [stickerOpen, setStickerOpen] = useState(false);
  const [musicOpen, setMusicOpen] = useState(false);
  const [musicIntent, setMusicIntent] = useState<"replace" | "trim">("trim");
  const [musicSettingsOpen, setMusicSettingsOpen] = useState(false);

  const [isVideo, setIsVideo] = useState(() => engine.getVideoState().isVideo);
  const [playing, setPlaying] = useState(() => engine.isPlaying());
  const [soundBlocked, setSoundBlocked] = useState(() => engine.needsUserGestureForSound());
  const [filterName, setFilterName] = useState<string | null>(null);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dragging, setDragging] = useState(false);
  const [trashHot, setTrashHot] = useState(false);
  const trashHotRef = useRef(false);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);

  const overlayOpen = textOpen || stickerOpen || musicOpen || musicSettingsOpen;

  // Müzik önizlemesi
  useStoryMusicPreview(engine, selectedMusic, musicVolume, suspendAudio || musicOpen);

  // A4: panel açılınca videoyu duraklat, kapanınca (oynuyorsa) devam ettir
  const resumeRef = useRef(false);
  useEffect(() => {
    if (!engine.getVideoState().isVideo) return;
    if (overlayOpen) {
      resumeRef.current = engine.isPlaying();
      engine.pauseVideo();
    } else if (resumeRef.current) {
      resumeRef.current = false;
      engine.playVideo().catch(() => {});
    }
  }, [overlayOpen, engine]);

  // Metin düzenleme
  const openText = useCallback(
    (layer?: TextLayer) => {
      if (layer) {
        editingIdRef.current = layer.id;
        setTextValue({
          text: layer.style.text === PLACEHOLDER_TEXT ? "" : layer.style.text,
          fontPreset: layer.fontPreset,
          bgPreset: layer.bgPreset,
          color: layer.style.color || "#FFFFFF",
          align: layer.style.textAlign || "center",
          fontSize: layer.style.fontSize || DEFAULT_TEXT_EDITOR_VALUE.fontSize,
        });
      } else {
        editingIdRef.current = null;
        setTextValue(DEFAULT_TEXT_EDITOR_VALUE);
      }
      setTextOpen(true);
    },
    []
  );

  const applyTextValue = (id: string, v: TextEditorValue) => {
    engine.updateText(id, {
      text: v.text,
      fontPreset: v.fontPreset,
      bgPreset: v.bgPreset,
      style: {
        color: v.color,
        textAlign: v.align,
        fontSize: v.fontSize,
        ...(v.fontPreset === "neon" || v.bgPreset === "neon" ? { shadowColor: v.color } : {}),
      },
    });
  };

  const handleTextDone = (v: TextEditorValue) => {
    const id = editingIdRef.current;
    editingIdRef.current = null;
    setTextOpen(false);
    const empty = v.text.trim().length === 0;
    if (id) {
      if (empty) engine.removeLayer(id);
      else applyTextValue(id, v);
    } else if (!empty) {
      const layer = engine.addText(v.text, {}, 0.5, 0.45);
      applyTextValue(layer.id, v);
    }
  };

  const handleTextCancel = () => {
    editingIdRef.current = null;
    setTextOpen(false);
  };

  // Motor olayları
  useEffect(() => {
    let lastDoubleTap = 0;
    const offs: Array<() => void> = [];

    offs.push(
      engine.on("double-tap", (layer?: BaseLayer) => {
        lastDoubleTap = performance.now();
        openText(layer instanceof TextLayer ? layer : undefined);
      })
    );
    offs.push(
      engine.on("single-tap", (layer: BaseLayer) => {
        if (layer instanceof TextLayer) {
          openText(layer);
        } else if (layer instanceof OverlayImageLayer) {
          layer.cycleShapeMode();
          engine.requestRender();
        }
      })
    );
    offs.push(
      engine.on("filter-swipe", (_dir: string, name: string) => {
        setFilterName(name);
        if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
        filterTimerRef.current = setTimeout(() => setFilterName(null), 900);
      })
    );
    offs.push(engine.on("sound-blocked", (b: boolean) => setSoundBlocked(b)));
    offs.push(
      engine.on("video-time", () => {
        setPlaying(engine.isPlaying());
        setIsVideo(engine.getVideoState().isVideo);
      })
    );
    offs.push(engine.on("music-change", (m: StoryAudioMeta | null) => onMusicChange(m)));

    const overTrash = (info: DragInfo) => {
      if (!info.deletable || !Number.isFinite(info.clientX)) return false;
      const r = trashRef.current?.getBoundingClientRect();
      const cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      const cy = r ? r.top + r.height / 2 : window.innerHeight - 68;
      return Math.hypot(info.clientX - cx, info.clientY - cy) < TRASH_RADIUS;
    };
    offs.push(
      engine.on("drag-move", (info: DragInfo) => {
        if (info.layer.type === "media") return;
        setDragging(info.deletable);
        const hot = overTrash(info);
        if (hot !== trashHotRef.current) {
          trashHotRef.current = hot;
          setTrashHot(hot);
        }
      })
    );
    offs.push(
      engine.on("drag-end", (info: DragInfo) => {
        const hot = info.deletable && (overTrash(info) || trashHotRef.current);
        if (hot && info.layer.type !== "media") {
          engine.removeLayer(info.layer.id);
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(40);
        }
        trashHotRef.current = false;
        setTrashHot(false);
        setDragging(false);
      })
    );

    // Arka plana tek dokunuş: oynat/duraklat (çift dokunuşla çakışmasın diye gecikmeli)
    let tapTimer: ReturnType<typeof setTimeout> | null = null;
    let down: { x: number; y: number; t: number } | null = null;
    let multi = false;
    let pointers = 0;
    const onDown = (e: PointerEvent) => {
      pointers += 1;
      if (pointers > 1) multi = true;
      else {
        multi = false;
        down = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers = Math.max(0, pointers - 1);
      if (pointers > 0 || multi || !down) return;
      const d = down;
      down = null;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved > 8 || performance.now() - d.t > 300) return;
      if (performance.now() - lastDoubleTap < 350) return;
      const sel = engine.getSelectedLayer();
      if (sel && sel.type !== "media") return;
      if (!engine.getVideoState().isVideo) return;
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        tapTimer = null;
        if (performance.now() - lastDoubleTap < 350) return;
        engine.toggleVideoPlay().catch(() => {});
      }, 280);
    };
    const onCancel = () => {
      pointers = 0;
      down = null;
    };
    canvas?.addEventListener("pointerdown", onDown);
    canvas?.addEventListener("pointerup", onUp);
    canvas?.addEventListener("pointercancel", onCancel);

    return () => {
      offs.forEach((off) => off());
      if (tapTimer) clearTimeout(tapTimer);
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      canvas?.removeEventListener("pointerdown", onDown);
      canvas?.removeEventListener("pointerup", onUp);
      canvas?.removeEventListener("pointercancel", onCancel);
    };
  }, [engine, canvas, openText, onMusicChange]);

  // Çıkartmalar
  const addEmoji = (emoji: string) => {
    const layer = engine.addText(emoji, { fontSize: 260 }, 0.5, 0.5);
    engine.updateText(layer.id, { bgPreset: "none" });
  };
  const addMention = (user: MentionUser) => {
    engine.addText(`@${user.username}`, { ...MENTION_STICKER_TEXT_STYLE }, 0.5, 0.5);
  };
  const currentUser: MentionUser | null = profile
    ? {
        uid: profile.uid,
        username: profile.username,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
      }
    : null;

  const handleOverlayFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await engine.addOverlayImage(file, 0.5, 0.5);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast.error(isMediaLoadError(err) ? "Fotoğraf eklenemedi" : "Bir sorun oluştu, tekrar deneyin");
    }
  };

  // Müzik
  const handleSelectMusic = (meta: StoryAudioMeta) => {
    const vs = engine.getVideoState();
    const prev = selectedMusic;
    const defStart =
      typeof prev?.timelineStart === "number" ? prev.timelineStart : vs.isVideo ? vs.trimStart : 0;
    const defEnd =
      typeof prev?.timelineEnd === "number" && prev.timelineEnd > defStart
        ? prev.timelineEnd
        : vs.isVideo
          ? vs.trimEnd || vs.duration || 15
          : 15;
    const enriched: StoryAudioMeta = {
      ...meta,
      timelineStart: typeof meta.timelineStart === "number" ? meta.timelineStart : defStart,
      timelineEnd:
        typeof meta.timelineEnd === "number" && meta.timelineEnd > defStart ? meta.timelineEnd : defEnd,
      segments: undefined,
      fadeIn: meta.fadeIn ?? prev?.fadeIn,
      fadeOut: meta.fadeOut ?? prev?.fadeOut,
    };
    engine.setMusic(enriched);
    onMusicChange(enriched);
  };

  const openPicker = (intent: "replace" | "trim") => {
    setMusicSettingsOpen(false);
    setMusicIntent(intent);
    setMusicOpen(true);
  };

  const handleMusicButton = () => {
    if (selectedMusic) setMusicSettingsOpen(true);
    else openPicker("trim");
  };

  const unmute = () => {
    engine.unlockSound().catch(() => {});
    setSoundBlocked(engine.needsUserGestureForSound());
  };

  return (
    <>
      <input
        ref={overlayInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleOverlayFile}
      />

      {/* Sağ araç sütunu */}
      {!textOpen && !dragging && (
        <div className="fixed right-3 top-safe-20 z-chrome flex flex-col gap-3">
          <EditorIconButton label="Metin ekle" onClick={() => openText()}>
            <CaseSensitive className="h-5 w-5" />
          </EditorIconButton>
          <EditorIconButton label="Çıkartma ekle" onClick={() => setStickerOpen(true)}>
            <PiStickerLight className="h-5 w-5" />
          </EditorIconButton>
          <EditorIconButton
            label="Müzik"
            active={Boolean(selectedMusic)}
            variant={selectedMusic ? "light" : "glass"}
            onClick={handleMusicButton}
          >
            <Music className={`h-5 w-5 ${selectedMusic ? "text-pink-500" : "text-pink-400"}`} />
          </EditorIconButton>
        </div>
      )}

      {/* Video: ses aç + duraklatıldı göstergesi */}
      {isVideo && soundBlocked && !textOpen && (
        <button
          type="button"
          onClick={unmute}
          className="fixed left-3 top-safe-20 z-chrome flex h-11 items-center gap-2 rounded-full bg-black/55 px-4 text-xs font-semibold text-white backdrop-blur-md active:scale-95"
        >
          <Volume2 className="h-4 w-4" />
          Sesi aç
        </button>
      )}
      {isVideo && !playing && !overlayOpen && (
        <div className="pointer-events-none fixed inset-0 z-chrome flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur-md">
            <Play className="h-7 w-7 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Filtre adı */}
      {filterName && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-chrome -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-5 py-2 text-sm font-bold text-white backdrop-blur-md">
          {filterName}
        </div>
      )}

      {/* Çöp kutusu */}
      <div
        ref={trashRef}
        aria-hidden={!dragging}
        className={`pointer-events-none fixed bottom-safe-8 left-1/2 z-chrome -translate-x-1/2 transition-opacity duration-150 ${
          dragging ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition-all duration-150 ${
            trashHot
              ? "scale-125 bg-red-600 shadow-2xl ring-4 ring-red-400/40"
              : "border border-white/20 bg-black/60 backdrop-blur-md"
          }`}
        >
          <Trash2 className="h-5 w-5" />
        </div>
      </div>

      <TextEditorOverlay
        open={textOpen}
        value={textValue}
        onDone={handleTextDone}
        onCancel={handleTextCancel}
      />

      <StickerSheet
        open={stickerOpen}
        onClose={() => setStickerOpen(false)}
        onSelectEmoji={addEmoji}
        onSelectMention={addMention}
        currentUser={currentUser}
        actions={[
          {
            id: "photo",
            label: "Fotoğraf",
            icon: <TbPhotoPlus className="h-5 w-5" />,
            accentClassName: "bg-emerald-500/20 text-emerald-400",
            onSelect: () => overlayInputRef.current?.click(),
          },
          {
            id: "music",
            label: "Müzik",
            icon: <Music className="h-5 w-5" />,
            accentClassName: "bg-pink-500/20 text-pink-400",
            onSelect: handleMusicButton,
          },
        ]}
      />

      <Sheet
        open={musicSettingsOpen && Boolean(selectedMusic)}
        onClose={() => setMusicSettingsOpen(false)}
        title="Müzik"
      >
        {selectedMusic && (
          <MusicSettingsPanel
            music={selectedMusic}
            volume={musicVolume}
            onChangeVolume={onMusicVolumeChange}
            onChangeMusic={(m) => {
              engine.setMusic(m);
              onMusicChange(m);
            }}
            onReplace={() => openPicker("replace")}
            onTrim={() => openPicker("trim")}
            onRemove={() => {
              engine.setMusic(null);
              onMusicChange(null);
              setMusicSettingsOpen(false);
            }}
            onClose={() => setMusicSettingsOpen(false)}
            hideCloseButton
          />
        )}
      </Sheet>

      <MusicPickerDrawer
        isOpen={musicOpen}
        onClose={() => setMusicOpen(false)}
        onSelectMusic={handleSelectMusic}
        currentMusic={musicIntent === "trim" ? selectedMusic : null}
        mode="story"
      />
    </>
  );
}
