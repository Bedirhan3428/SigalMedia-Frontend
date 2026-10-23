// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Scissors,
  Music,
  Gauge,
  Palette,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Copy,
  Type,
  Crop,
  RotateCw,
  FlipHorizontal2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Check,
  X,
} from "lucide-react";
import { BsStars } from "react-icons/bs";
import { PiStickerLight } from "react-icons/pi";
import { TbPhotoPlus } from "react-icons/tb";
import { RiColorFilterAiLine } from "react-icons/ri";
import {
  BaseLayer,
  CanvasEngine,
  FILTER_PRESETS,
  OverlayImageLayer,
  OverlayTrackItem,
  REELS_EFFECT_PRESETS,
  ReelsEffectClip,
  ReelsEffectId,
  StoryAudioMeta,
  VideoState,
  VideoTrackClip,
  captureFramePreview,
} from "@/lib/canvas-editor";
import VideoTimelineNLE from "./VideoTimelineNLE";
import MusicSettingsPanel from "./MusicSettingsPanel";
import PreviewThumb from "./PreviewThumb";
import { NLESelectedType } from "./TimelineOverlayTracks";
import OnCanvasCropOverlay from "./OnCanvasCropOverlay";

export interface ReelsEditorProps {
  engine?: CanvasEngine | null;
  selectedCanvasLayer?: BaseLayer | null;
  videoState: VideoState;
  thumbnails: string[];
  selectedMusic: StoryAudioMeta | null;
  musicVolume: number;
  activeFilterIndex: number;
  activeReelsEffect: ReelsEffectId;
  effectClips?: ReelsEffectClip[];
  isPublishing: boolean;
  getCurrentTime?: () => number;
  onChangeTrim: (start: number, end: number) => void;
  onChangeSpeed: (rate: number) => void;
  onChangeVolume: (volume: number, muted?: boolean) => void;
  onChangeMusicVolume: (volume: number) => void;
  onChangeMusicMeta?: (music: StoryAudioMeta | null) => void;
  onChangeEffectClips?: (clips: ReelsEffectClip[]) => void;
  onCropModeChange?: (isCropping: boolean) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onOpenTextEditor: () => void;
  onOpenMusicPicker: (intent?: "replace" | "trim") => void;
  onOpenStickerSheet?: () => void;
  onOpenPhotoOverlay?: () => void;
  onSelectFilterIndex: (index: number) => void;
  onSelectReelsEffect: (effect: ReelsEffectId) => void;
  onPublish: () => void;
}

type ActiveToolStrip =
  | "none"
  | "effects"
  | "audio_speed"
  | "music"
  | "filters"
  | "crop";

type NLEHistorySnapshot = {
  clips: VideoTrackClip[];
  effectClips: ReelsEffectClip[];
  musicClip: StoryAudioMeta | null;
  overlayTimings: Array<{ layerId: string; start: number; end: number }>;
};

const SPEED_OPTIONS = [0.5, 1.0, 1.5, 2.0];

// İşlemlerin anında tetiklenip birbirine karışmaması için kısa gecikme
const ACTION_DELAY_MS = 180;
// Menülerin açılmadan önceki bekleme ve animasyon süreleri
const SHEET_OPEN_DELAY_MS = 120;
const SHEET_ANIM_MS = 280;
// Yeni efekt klibi varsayılan süresi ve önizleme süresi (sn)
const EFFECT_CLIP_SPAN_SEC = 2;

export default function ReelsEditor({
  engine,
  selectedCanvasLayer,
  videoState,
  thumbnails,
  selectedMusic,
  musicVolume,
  activeFilterIndex,
  activeReelsEffect,
  effectClips = [],
  getCurrentTime,
  onChangeSpeed,
  onChangeVolume,
  onChangeMusicVolume,
  onChangeMusicMeta,
  onChangeEffectClips,
  onCropModeChange,
  onSeek,
  onTogglePlay,
  onOpenTextEditor,
  onOpenMusicPicker,
  onOpenStickerSheet,
  onOpenPhotoOverlay,
  onSelectFilterIndex,
  onSelectReelsEffect,
}: ReelsEditorProps) {
  const [activeStrip, setActiveStrip] = useState<ActiveToolStrip>("none");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<NLESelectedType>(null);
  const [clips, setClips] = useState<VideoTrackClip[]>([]);
  const [overlayItems, setOverlayItems] = useState<OverlayTrackItem[]>([]);
  const [historyStack, setHistoryStack] = useState<NLEHistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<NLEHistorySnapshot[]>([]);
  const appendClipInputRef = useRef<HTMLInputElement | null>(null);
  const isInternalLayerSyncRef = useRef(false);

  // Gecikmeli aksiyon kilidi: bekleyen işlem bitmeden yeni işlem kabul edilmez
  const actionLockRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);
  const [effectDraft, setEffectDraft] = useState<{
    id: string;
    isNew: boolean;
    originalEffect: ReelsEffectId;
  } | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const runDelayedAction = useCallback((key: string, fn: () => void) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setPendingActionKey(key);
    window.setTimeout(() => {
      try {
        fn();
      } finally {
        actionLockRef.current = false;
        setPendingActionKey(null);
      }
    }, ACTION_DELAY_MS);
  }, []);

  // Menü animasyonu: açılırken kısa gecikme + kayarak giriş, kapanırken çıkış animasyonu sonrası unmount
  const [renderedStrip, setRenderedStrip] = useState<ActiveToolStrip>("none");
  const [stripVisible, setStripVisible] = useState(false);
  const renderedStripRef = useRef<ActiveToolStrip>("none");
  useEffect(() => {
    const timers: number[] = [];
    setStripVisible(false);
    const closeDelay = renderedStripRef.current !== "none" ? SHEET_ANIM_MS : 0;
    timers.push(
      window.setTimeout(() => {
        renderedStripRef.current = activeStrip;
        setRenderedStrip(activeStrip);
        if (activeStrip !== "none") {
          timers.push(
            window.setTimeout(() => setStripVisible(true), SHEET_OPEN_DELAY_MS)
          );
        }
      }, closeDelay)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [activeStrip]);

  // Filtre / efekt küçük resimleri için panel açılırken tek seferlik kare
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  useEffect(() => {
    if (renderedStrip !== "filters" && renderedStrip !== "effects") return;
    setPreviewFrame(captureFramePreview(engine?.getMedia()?.element));
  }, [renderedStrip, engine]);

  const stripAnimClass = stripVisible
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-3 pointer-events-none";

  const syncFromEngine = useCallback(() => {
    if (!engine) return;
    setClips(engine.getVideoClips());
    setOverlayItems(engine.getOverlayTrackItems());
  }, [engine]);

  useEffect(() => {
    syncFromEngine();
    if (!engine) return;
    const handleEngineChange = () => {
      syncFromEngine();
    };
    const handleCanvasSelect = (layer: BaseLayer | null) => {
      if (isInternalLayerSyncRef.current) return;
      if (!layer) {
        setSelectedItemId(null);
        setSelectedItemType(null);
        setActiveStrip("none");
      }
    };
    engine.on("change", handleEngineChange);
    engine.on("video-time", handleEngineChange);
    engine.on("select", handleCanvasSelect);
    return () => {
      engine.off("change", handleEngineChange);
      engine.off("video-time", handleEngineChange);
      engine.off("select", handleCanvasSelect);
    };
  }, [engine, syncFromEngine]);

  // 9:16 önizleme sahnesinde bir metin/sticker/fotoğrafa dokunulduğunda timeline'daki barı otomatik seç
  useEffect(() => {
    if (!selectedCanvasLayer) return;
    if (selectedCanvasLayer.type === "text") {
      const items = engine?.getOverlayTrackItems() || [];
      const found = items.find((i) => i.layerId === selectedCanvasLayer.id);
      setSelectedItemId(selectedCanvasLayer.id);
      setSelectedItemType(found?.type || "text");
    } else if (selectedCanvasLayer.type === "image_overlay") {
      setSelectedItemId(selectedCanvasLayer.id);
      setSelectedItemType("photo");
    }
  }, [selectedCanvasLayer, engine]);

  const totalDuration = Math.max(
    0.5,
    clips.length > 0
      ? clips.reduce((acc, c) => acc + Math.max(0.2, c.duration), 0)
      : videoState.duration || 5
  );

  const maxSourceDuration = Math.max(
    totalDuration,
    engine?.getMedia()?.duration || videoState.duration || 60
  );

  const getPlayheadTime = () => {
    const raw = getCurrentTime ? getCurrentTime() : videoState.currentTime;
    return Math.max(0, Math.min(totalDuration, raw));
  };

  // Undo / Redo Snapshot Kaydı
  const commitHistory = useCallback(() => {
    if (!engine) return;
    const snap: NLEHistorySnapshot = {
      clips: engine.getVideoClips(),
      effectClips: effectClips.map((c) => ({ ...c })),
      musicClip: selectedMusic ? { ...selectedMusic } : null,
      overlayTimings: engine.getOverlayTrackItems().map((i) => ({
        layerId: i.layerId,
        start: i.timelineStart,
        end: i.timelineEnd,
      })),
    };
    setHistoryStack((prev) => [...prev.slice(-24), snap]);
    setRedoStack([]);
  }, [engine, effectClips, selectedMusic]);

  const applySnapshot = useCallback(
    (snap: NLEHistorySnapshot) => {
      if (!engine) return;
      engine.setVideoClips(snap.clips);
      onChangeEffectClips?.(snap.effectClips);
      onChangeMusicMeta?.(snap.musicClip);
      for (const ov of snap.overlayTimings) {
        engine.updateOverlayTrackTiming(ov.layerId, ov.start, ov.end);
      }
      syncFromEngine();
    },
    [engine, onChangeEffectClips, onChangeMusicMeta, syncFromEngine]
  );

  const handleUndo = () => {
    if (historyStack.length === 0 || !engine) return;
    const currentSnap: NLEHistorySnapshot = {
      clips: engine.getVideoClips(),
      effectClips: effectClips.map((c) => ({ ...c })),
      musicClip: selectedMusic ? { ...selectedMusic } : null,
      overlayTimings: engine.getOverlayTrackItems().map((i) => ({
        layerId: i.layerId,
        start: i.timelineStart,
        end: i.timelineEnd,
      })),
    };
    const prevSnap = historyStack[historyStack.length - 1];
    setHistoryStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, currentSnap]);
    applySnapshot(prevSnap);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !engine) return;
    const currentSnap: NLEHistorySnapshot = {
      clips: engine.getVideoClips(),
      effectClips: effectClips.map((c) => ({ ...c })),
      musicClip: selectedMusic ? { ...selectedMusic } : null,
      overlayTimings: engine.getOverlayTrackItems().map((i) => ({
        layerId: i.layerId,
        start: i.timelineStart,
        end: i.timelineEnd,
      })),
    };
    const nextSnap = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setHistoryStack((s) => [...s, currentSnap]);
    applySnapshot(nextSnap);
  };

  const handleSelectItem = (id: string | null, type: NLESelectedType) => {
    engine?.pauseVideo();
    setSelectedItemId(id);
    setSelectedItemType(type);
    if (!id) {
      setActiveStrip("none");
      isInternalLayerSyncRef.current = true;
      engine?.selectLayerById(null);
      isInternalLayerSyncRef.current = false;
      return;
    }
    isInternalLayerSyncRef.current = true;
    if (type === "text" || type === "sticker" || type === "photo") {
      engine?.selectLayerById(id);
    } else {
      engine?.selectLayerById(null);
    }
    isInternalLayerSyncRef.current = false;
    if (type === "video" && engine) {
      const targetClip = clips.find((c) => c.id === id);
      if (targetClip) {
        engine.applyClipTransformToMediaLayer(targetClip);
        engine.requestRender();
      }
    }
  };

  const selectedVideoClip =
    selectedItemType === "video"
      ? clips.find((c) => c.id === selectedItemId) || null
      : null;

  const isFullScreenCrop =
    activeStrip === "crop" &&
    selectedItemType === "video" &&
    Boolean(selectedVideoClip);

  useEffect(() => {
    engine?.setCropOverlayOpen(isFullScreenCrop);
    onCropModeChange?.(isFullScreenCrop);
    return () => {
      engine?.setCropOverlayOpen(false);
    };
  }, [engine, isFullScreenCrop, onCropModeChange]);

  const selectedEffectClip =
    selectedItemType === "effect"
      ? effectClips.find((c) => c.id === selectedItemId) || null
      : null;

  const [effectCategory, setEffectCategory] = useState<"cinema" | "dynamic">(
    "cinema"
  );

  const selectedPhotoLayer =
    selectedItemType === "photo" && engine
      ? (engine.getSelectedLayer() as OverlayImageLayer | null)
      : null;

  const getAudioSegments = () => {
    if (!selectedMusic) return [];
    if (selectedMusic.segments && selectedMusic.segments.length > 0) {
      return selectedMusic.segments;
    }
    const mStart =
      typeof selectedMusic.timelineStart === "number"
        ? Math.max(0, selectedMusic.timelineStart)
        : 0;
    const mEnd =
      typeof selectedMusic.timelineEnd === "number" &&
      selectedMusic.timelineEnd > mStart
        ? selectedMusic.timelineEnd
        : Math.max(mStart + 1, totalDuration);
    return [
      {
        id: selectedMusic.id || "audio_main",
        timelineStart: mStart,
        timelineEnd: mEnd,
        songOffset: selectedMusic.startTime || 0,
      },
    ];
  };

  // İbre seçili klibin/katmanın/şarkının içindeyse Böl butonu aktiftir
  const canSplitSelected = (() => {
    const cur = getPlayheadTime();
    if (!selectedItemId || !selectedItemType) {
      const active = engine?.getActiveClipAtTime(cur);
      return Boolean(
        active &&
          cur - active.clipTimelineStart >= 0.25 &&
          active.clipTimelineEnd - cur >= 0.25
      );
    }
    if (selectedItemType === "video") {
      const active = engine?.getActiveClipAtTime(cur);
      return Boolean(
        active &&
          active.clip.id === selectedItemId &&
          cur - active.clipTimelineStart >= 0.25 &&
          active.clipTimelineEnd - cur >= 0.25
      );
    }
    if (
      selectedItemType === "text" ||
      selectedItemType === "sticker" ||
      selectedItemType === "photo"
    ) {
      const item = overlayItems.find((i) => i.layerId === selectedItemId);
      return Boolean(
        item && cur > item.timelineStart + 0.25 && cur < item.timelineEnd - 0.25
      );
    }
    if (selectedItemType === "effect") {
      const fx = effectClips.find((c) => c.id === selectedItemId);
      return Boolean(fx && cur > fx.startTime + 0.2 && cur < fx.endTime - 0.2);
    }
    if (selectedItemType === "audio") {
      const segs = getAudioSegments();
      const seg = segs.find((s) => s.id === selectedItemId) || segs[0];
      return Boolean(
        seg && cur > seg.timelineStart + 0.25 && cur < seg.timelineEnd - 0.25
      );
    }
    return false;
  })();

  // ✂️ BÖL (SPLIT) Aksiyonu
  const handleSplitSelected = () => {
    const cur = getPlayheadTime();
    commitHistory();

    if (selectedItemType === "audio" && selectedMusic && onChangeMusicMeta) {
      const segs = getAudioSegments();
      const seg = segs.find((s) => s.id === selectedItemId) || segs[0];
      if (
        seg &&
        cur > seg.timelineStart + 0.25 &&
        cur < seg.timelineEnd - 0.25
      ) {
        const splitPt = Number(cur.toFixed(2));
        const leftSeg = {
          ...seg,
          timelineEnd: splitPt,
        };
        const rightSeg = {
          id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          timelineStart: splitPt,
          timelineEnd: seg.timelineEnd,
          songOffset: Number(
            (seg.songOffset + (splitPt - seg.timelineStart)).toFixed(2)
          ),
        };
        const nextSegs = segs.flatMap((s) =>
          s.id === seg.id ? [leftSeg, rightSeg] : [s]
        );
        onChangeMusicMeta({
          ...selectedMusic,
          segments: nextSegs,
          timelineStart: nextSegs[0].timelineStart,
          timelineEnd: nextSegs[nextSegs.length - 1].timelineEnd,
        });
        setSelectedItemId(rightSeg.id);
      }
      return;
    }

    if (selectedItemType === "effect" && selectedEffectClip && onChangeEffectClips) {
      if (
        cur > selectedEffectClip.startTime + 0.2 &&
        cur < selectedEffectClip.endTime - 0.2
      ) {
        const leftFx: ReelsEffectClip = {
          ...selectedEffectClip,
          endTime: Number(cur.toFixed(2)),
        };
        const rightFx: ReelsEffectClip = {
          ...selectedEffectClip,
          id: `fx_${Date.now().toString(36)}`,
          startTime: Number(cur.toFixed(2)),
        };
        onChangeEffectClips(
          effectClips.flatMap((c) =>
            c.id === selectedEffectClip.id ? [leftFx, rightFx] : [c]
          )
        );
        setSelectedItemId(rightFx.id);
      }
      return;
    }

    if (
      (selectedItemType === "text" ||
        selectedItemType === "sticker" ||
        selectedItemType === "photo") &&
      selectedItemId &&
      engine
    ) {
      const newLayer = engine.splitOverlayLayerAt(selectedItemId, cur);
      if (newLayer) {
        syncFromEngine();
        setSelectedItemId(newLayer.id);
      }
      return;
    }

    if (engine) {
      const rightClip = engine.splitActiveClipAt(
        cur,
        selectedItemType === "video" && selectedItemId ? selectedItemId : undefined
      );
      if (rightClip) {
        syncFromEngine();
        setSelectedItemId(rightClip.id);
        setSelectedItemType("video");
      }
    }
  };

  // 🗑️ SİL (DELETE) Aksiyonu (Manyetik Ripple / Katman / Şarkı Parçası Silme)
  const handleDeleteSelected = () => {
    if (!selectedItemId || !selectedItemType) return;
    commitHistory();

    if (selectedItemType === "video" && engine) {
      const removed = engine.removeClip(selectedItemId);
      if (removed) {
        syncFromEngine();
        setSelectedItemId(null);
        setSelectedItemType(null);
        setActiveStrip("none");
      }
      return;
    }

    if (
      (selectedItemType === "text" ||
        selectedItemType === "sticker" ||
        selectedItemType === "photo") &&
      engine
    ) {
      engine.removeLayer(selectedItemId);
      syncFromEngine();
      setSelectedItemId(null);
      setSelectedItemType(null);
      setActiveStrip("none");
      return;
    }

    if (selectedItemType === "effect" && onChangeEffectClips) {
      onChangeEffectClips(effectClips.filter((c) => c.id !== selectedItemId));
      setSelectedItemId(null);
      setSelectedItemType(null);
      setActiveStrip("none");
      return;
    }

    if (selectedItemType === "audio" && onChangeMusicMeta) {
      const segs = getAudioSegments();
      if (segs.length > 1 && selectedMusic) {
        const nextSegs = segs.filter((s) => s.id !== selectedItemId);
        onChangeMusicMeta({
          ...selectedMusic,
          segments: nextSegs,
          timelineStart: nextSegs[0]?.timelineStart ?? 0,
          timelineEnd: nextSegs[nextSegs.length - 1]?.timelineEnd ?? totalDuration,
        });
      } else {
        onChangeMusicMeta(null);
      }
      setSelectedItemId(null);
      setSelectedItemType(null);
      setActiveStrip("none");
    }
  };

  // 📑 KOPYALA (DUPLICATE) Aksiyonu
  const handleDuplicateSelected = () => {
    if (!selectedItemId || !selectedItemType) return;
    commitHistory();

    if (selectedItemType === "video" && engine) {
      const cloned = engine.duplicateClip(selectedItemId);
      if (cloned) {
        syncFromEngine();
        setSelectedItemId(cloned.id);
      }
      return;
    }

    if (
      (selectedItemType === "text" ||
        selectedItemType === "sticker" ||
        selectedItemType === "photo") &&
      engine
    ) {
      const clonedLayer = engine.duplicateOverlayLayer(selectedItemId);
      if (clonedLayer) {
        syncFromEngine();
        setSelectedItemId(clonedLayer.id);
      }
      return;
    }

    if (selectedItemType === "effect" && selectedEffectClip && onChangeEffectClips) {
      const span = Math.max(0.4, selectedEffectClip.endTime - selectedEffectClip.startTime);
      const nextStart = Math.min(totalDuration - 0.4, selectedEffectClip.endTime);
      const nextEnd = Math.min(totalDuration, nextStart + span);
      const cloneFx: ReelsEffectClip = {
        ...selectedEffectClip,
        id: `fx_${Date.now().toString(36)}`,
        startTime: Number(nextStart.toFixed(2)),
        endTime: Number(Math.max(nextStart + 0.4, nextEnd).toFixed(2)),
      };
      onChangeEffectClips([...effectClips, cloneFx]);
      setSelectedItemId(cloneFx.id);
      return;
    }

    if (selectedItemType === "audio" && selectedMusic && onChangeMusicMeta) {
      const segs = getAudioSegments();
      const seg = segs.find((s) => s.id === selectedItemId) || segs[0];
      if (seg) {
        const span = Math.max(0.4, seg.timelineEnd - seg.timelineStart);
        const nextStart = Math.min(totalDuration - 0.4, seg.timelineEnd);
        const nextEnd = Math.min(totalDuration + 10, nextStart + span);
        const cloneSeg = {
          id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
          timelineStart: Number(nextStart.toFixed(2)),
          timelineEnd: Number(Math.max(nextStart + 0.4, nextEnd).toFixed(2)),
          songOffset: seg.songOffset,
        };
        const nextSegs = [...segs, cloneSeg];
        onChangeMusicMeta({
          ...selectedMusic,
          segments: nextSegs,
          timelineStart: nextSegs[0].timelineStart,
          timelineEnd: nextSegs[nextSegs.length - 1].timelineEnd,
        });
        setSelectedItemId(cloneSeg.id);
      }
    }
  };

  const addEffectClipAtPlayhead = (
    effectId: Exclude<ReelsEffectId, "none">
  ): ReelsEffectClip | null => {
    if (!onChangeEffectClips) {
      onSelectReelsEffect(effectId);
      return null;
    }
    commitHistory();
    const cur = Number(getPlayheadTime().toFixed(2));

    // Mevcut efekt klipleri asla değiştirilmez: ibre bir efektin üzerindeyse
    // yeni efekt o efektin (ve ardışık efektlerin) bittiği ilk boş noktaya eklenir.
    const sorted = [...effectClips].sort((a, b) => a.startTime - b.startTime);
    let clipStart = cur;
    for (const c of sorted) {
      if (clipStart >= c.startTime && clipStart < c.endTime) {
        clipStart = c.endTime;
      }
    }
    let clipEnd: number;
    if (totalDuration - clipStart >= 0.4) {
      const upcomingEffects = sorted.filter((c) => c.startTime >= clipStart + 0.01);
      const nextStart = upcomingEffects[0]?.startTime ?? totalDuration;
      const maxAllowedSpan = Math.max(0.4, nextStart - clipStart);
      const span = Math.min(EFFECT_CLIP_SPAN_SEC, Math.min(totalDuration - clipStart, maxAllowedSpan));
      clipEnd = Number(Math.min(totalDuration, clipStart + span).toFixed(2));
    } else {
      // Sonda boş yer kalmadıysa ibre noktasında üst üste katman olarak ekle (mevcut klip korunur)
      clipStart = cur;
      clipEnd = Number(Math.min(totalDuration, cur + EFFECT_CLIP_SPAN_SEC).toFixed(2));
      if (clipEnd - clipStart < 0.2) return null;
    }
    clipStart = Number(clipStart.toFixed(2));

    const newClip: ReelsEffectClip = {
      id: `fx_${Date.now().toString(36)}`,
      effect: effectId,
      startTime: clipStart,
      endTime: clipEnd,
      intensity: 100,
    };
    onSelectReelsEffect("none");
    onChangeEffectClips([...effectClips, newClip]);
    setSelectedItemId(newClip.id);
    setSelectedItemType("effect");
    return newClip;
  };

  // Efekt seçildiğinde ilgili barın (en fazla 2 sn) aralığını oynatıp efekti önizler
  const stopEffectPreview = useCallback(() => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  const previewEffectClip = useCallback(
    (clip: ReelsEffectClip) => {
      if (!engine) return;
      stopEffectPreview();
      const start = clip.startTime;
      const span = Math.max(0.3, Math.min(EFFECT_CLIP_SPAN_SEC, clip.endTime - clip.startTime));
      // Efekt kliplerinin engine'e aktarılması için bir tick bekle
      previewTimerRef.current = window.setTimeout(async () => {
        previewTimerRef.current = null;
        try {
          engine.pauseVideo();
          await engine.seekVideo(start);
          await engine.playVideo();
        } catch {}
        previewTimerRef.current = window.setTimeout(() => {
          previewTimerRef.current = null;
          engine.pauseVideo();
          engine.seekVideo(start).catch(() => {});
        }, span * 1000);
      }, 30);
    },
    [engine, stopEffectPreview]
  );

  useEffect(() => stopEffectPreview, [stopEffectPreview]);

  // Panel effects dışına çıktığında taslak sonlandırılır (mevcut hali korunur)
  useEffect(() => {
    if (activeStrip !== "effects") setEffectDraft(null);
  }, [activeStrip]);

  // Tamam: taslak efekt kalıcı olur, panel kapanır
  const confirmEffectDraft = () => {
    setEffectDraft(null);
    setActiveStrip("none");
  };

  // İptal (✕ / dış alan): yeni eklenen taslak silinir, mevcut klip ise eski efektine döner
  const cancelEffectDraft = () => {
    stopEffectPreview();
    engine?.pauseVideo();
    if (effectDraft && onChangeEffectClips) {
      if (effectDraft.isNew) {
        onChangeEffectClips(effectClips.filter((c) => c.id !== effectDraft.id));
        if (selectedItemId === effectDraft.id) {
          setSelectedItemId(null);
          setSelectedItemType(null);
        }
      } else {
        onChangeEffectClips(
          effectClips.map((c) =>
            c.id === effectDraft.id ? { ...c, effect: effectDraft.originalEffect } : c
          )
        );
      }
    }
    setEffectDraft(null);
    setActiveStrip("none");
  };

  const handleSelectEffectPreset = (effectId: ReelsEffectId) => {
    engine?.pauseVideo();
    if (!onChangeEffectClips) {
      onSelectReelsEffect(effectId);
      return;
    }
    if (effectId === "none") {
      commitHistory();
      setEffectDraft(null);
      if (selectedItemType === "effect" && selectedItemId) {
        onChangeEffectClips(effectClips.filter((c) => c.id !== selectedItemId));
        setSelectedItemId(null);
        setSelectedItemType(null);
      } else {
        const cur = getPlayheadTime();
        const existing = effectClips.find(
          (c) => cur >= c.startTime && cur < c.endTime
        );
        if (existing) {
          onChangeEffectClips(effectClips.filter((c) => c.id !== existing.id));
        } else {
          onChangeEffectClips([]);
          onSelectReelsEffect("none");
        }
      }
      return;
    }

    // Tamam'a basılana kadar aynı taslak klibin efekti değiştirilir, yeni klip eklenmez
    const draftClip = effectDraft
      ? effectClips.find((c) => c.id === effectDraft.id)
      : undefined;
    if (effectDraft && draftClip) {
      const updated: ReelsEffectClip = { ...draftClip, effect: effectId };
      onChangeEffectClips(
        effectClips.map((c) => (c.id === draftClip.id ? updated : c))
      );
      setSelectedItemId(updated.id);
      setSelectedItemType("effect");
      previewEffectClip(updated);
      return;
    }

    const added = addEffectClipAtPlayhead(effectId);
    if (added) {
      setEffectDraft({ id: added.id, isNew: true, originalEffect: added.effect });
      previewEffectClip(added);
    }
  };

  const applyCropAspectPreset = (
    preset: "free" | "9:16" | "1:1" | "4:5" | "16:9"
  ) => {
    if (!selectedVideoClip || !engine) return;
    engine.pauseVideo();
    commitHistory();
    if (preset === "free" || preset === "9:16") {
      engine.updateClipCropRect(selectedVideoClip.id, {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      });
    } else if (preset === "1:1") {
      const h = 9 / 16; // 0.5625
      engine.updateClipCropRect(selectedVideoClip.id, {
        x: 0,
        y: Number(((1 - h) / 2).toFixed(4)),
        width: 1,
        height: Number(h.toFixed(4)),
      });
    } else if (preset === "4:5") {
      const h = (9 / 16) * (5 / 4); // 0.703125
      engine.updateClipCropRect(selectedVideoClip.id, {
        x: 0,
        y: Number(((1 - h) / 2).toFixed(4)),
        width: 1,
        height: Number(h.toFixed(4)),
      });
    } else if (preset === "16:9") {
      const h = (9 / 16) * (9 / 16); // 0.3164
      engine.updateClipCropRect(selectedVideoClip.id, {
        x: 0,
        y: Number(((1 - h) / 2).toFixed(4)),
        width: 1,
        height: Number(h.toFixed(4)),
      });
    }
    syncFromEngine();
  };

  const handleMusicTimelineChange = (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number,
    segmentId?: string
  ) => {
    if (!selectedMusic || !onChangeMusicMeta) return;
    const segs = getAudioSegments();
    const targetId = segmentId || selectedItemId || segs[0]?.id;
    const nextSegs = segs.map((s) =>
      s.id === targetId
        ? {
            ...s,
            timelineStart,
            timelineEnd,
            songOffset:
              typeof songOffset === "number" ? songOffset : s.songOffset,
          }
        : s
    );
    onChangeMusicMeta({
      ...selectedMusic,
      timelineStart: nextSegs[0]?.timelineStart ?? timelineStart,
      timelineEnd: nextSegs[nextSegs.length - 1]?.timelineEnd ?? timelineEnd,
      startTime:
        typeof songOffset === "number" ? songOffset : selectedMusic.startTime,
      segments: nextSegs,
    });
  };

  const handleAppendClipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !engine) return;
    commitHistory();
    const added = await engine.appendVideoClip(file);
    if (added) {
      syncFromEngine();
      setSelectedItemId(added.id);
      setSelectedItemType("video");
    }
  };

  const activeClipVolume = selectedVideoClip
    ? selectedVideoClip.muted
      ? 0
      : Math.round(selectedVideoClip.volume * 100)
    : videoState.muted
      ? 0
      : Math.round(videoState.volume * 100);

  const activeClipSpeed = selectedVideoClip
    ? selectedVideoClip.playbackRate
    : videoState.playbackRate;

  const activeClipScale = selectedVideoClip
    ? selectedVideoClip.transform?.scale ?? 1
    : selectedPhotoLayer
      ? selectedPhotoLayer.transform.scale
      : 1;

  const activeClipFitMode = selectedVideoClip?.fitMode || "cover";


  return (
    <>
      {/* Ana Bar Sonuna Klip Ekleme Gizli Dosya Seçici */}
      <input
        ref={appendClipInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleAppendClipFile}
      />

      {/* TAM EKRAN 8 TUTAMAÇLI KIRPMA MODU (Timeline gizlenir, video büyür, kırpma kutusu en üstte) */}
      {isFullScreenCrop && selectedVideoClip && engine ? (
        <>
          <OnCanvasCropOverlay
            cropRect={
              selectedVideoClip.cropRect || { x: 0, y: 0, width: 1, height: 1 }
            }
            onCommitHistory={commitHistory}
            onChangeCropRect={(nextRect) => {
              engine.pauseVideo();
              engine.updateClipCropRect(selectedVideoClip.id, nextRect);
              syncFromEngine();
            }}
          />

          <div
            onPointerDownCapture={() => engine.pauseVideo()}
            onWheelCapture={() => engine.pauseVideo()}
            className="fixed inset-x-0 bottom-0 h-28 z-50 bg-black/95 border-t border-white/10 px-4 py-2.5 flex flex-col justify-between pointer-events-auto select-none"
          >
            {/* Üst Satır: Oran Presetleri + Döndür + Aynala + Sıfırla */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {(["free", "9:16", "1:1", "4:5", "16:9"] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => applyCropAspectPreset(ratio)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 bg-[#1c1c1e] hover:bg-[#28282d] text-zinc-200 border border-white/10 active:scale-95 transition-all"
                >
                  {ratio === "free" ? "Serbest" : ratio}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  commitHistory();
                  engine.updateClipTransform(
                    selectedVideoClip.id,
                    undefined,
                    activeClipFitMode === "cover" ? "contain" : "cover"
                  );
                  syncFromEngine();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 bg-[#1c1c1e] text-zinc-200 border border-white/10 active:scale-95"
              >
                {activeClipFitMode === "cover" ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sığdır</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Doldur</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  commitHistory();
                  const curRot = selectedVideoClip.transform?.rotation ?? 0;
                  engine.updateClipTransform(selectedVideoClip.id, {
                    rotation: (curRot + 90) % 360,
                  });
                  syncFromEngine();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 bg-[#1c1c1e] text-zinc-200 border border-white/10 active:scale-95"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>90°</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  commitHistory();
                  const curFlip = Boolean(selectedVideoClip.transform?.flipH);
                  engine.updateClipTransform(selectedVideoClip.id, {
                    flipH: !curFlip,
                  });
                  syncFromEngine();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 border transition-all active:scale-95 ${
                  selectedVideoClip.transform?.flipH
                    ? "bg-amber-400 text-black border-amber-400"
                    : "bg-[#1c1c1e] text-zinc-200 border-white/10"
                }`}
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                <span>Aynala</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  commitHistory();
                  engine.resetClipTransform(selectedVideoClip.id);
                  syncFromEngine();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 bg-[#1c1c1e] text-zinc-300 border border-white/10 active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Sıfırla</span>
              </button>
            </div>

            {/* Alt Satır: Yakınlaştırma (Zoom) + [ ✓ Bitti ] Butonu */}
            <div className="flex items-center gap-2.5">
              <div className="flex-1 flex items-center gap-2.5 bg-[#16171b] rounded-xl px-3 py-1.5 border border-white/5">
                <span className="text-[11px] font-medium text-zinc-400 shrink-0">
                  Yakınlaştır
                </span>
                <input
                  type="range"
                  min={50}
                  max={300}
                  value={Math.round(activeClipScale * 100)}
                  onChange={(e) => {
                    const nextScale = Number(
                      (Number(e.target.value) / 100).toFixed(2)
                    );
                    engine.updateClipTransform(selectedVideoClip.id, {
                      scale: nextScale,
                    });
                    syncFromEngine();
                  }}
                  className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
                  {activeClipScale.toFixed(1)}x
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveStrip("none")}
                className="h-9 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center gap-1.5 shrink-0 active:scale-95 transition-all shadow-lg"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Bitti</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-black pt-1.5 pb-5 flex flex-col gap-2.5 pointer-events-auto select-none">
          {/* 1. Sabit Merkez İbreli (Fixed Center Playhead) ve 60 FPS Analog Kayar NLE Zaman Çizelgesi */}
          <VideoTimelineNLE
            clips={clips}
            overlayItems={overlayItems}
            effectClips={effectClips}
            musicClip={selectedMusic}
            totalDuration={totalDuration}
            maxSourceDuration={maxSourceDuration}
            currentTime={videoState.currentTime}
            isPlaying={videoState.isPlaying}
            thumbnails={thumbnails}
            selectedItemId={selectedItemId}
            selectedItemType={selectedItemType}
            canUndo={historyStack.length > 0}
            canRedo={redoStack.length > 0}
            getCurrentTime={getCurrentTime}
            onSelectItem={handleSelectItem}
            onTrimClip={(clipId, newStart, newEnd) => {
              engine?.updateClipTrim(clipId, newStart, newEnd);
              syncFromEngine();
            }}
            onReorderClips={(fromIdx, toIdx) => {
              engine?.reorderClips(fromIdx, toIdx);
              syncFromEngine();
            }}
            onAppendClipClick={() => appendClipInputRef.current?.click()}
            onChangeOverlayTiming={(layerId, start, end) => {
              engine?.updateOverlayTrackTiming(layerId, start, end);
              syncFromEngine();
            }}
            onReorderOverlayLayer={(layerId, direction) => {
              commitHistory();
              engine?.reorderOverlayLayer(layerId, direction);
              syncFromEngine();
            }}
            onChangeEffectClips={onChangeEffectClips}
            onChangeMusicTimeline={handleMusicTimelineChange}
            onSeek={onSeek}
            onPauseVideo={() => engine?.pauseVideo()}
            onTogglePlay={onTogglePlay}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onOpenMusicPicker={() => onOpenMusicPicker()}
            onOpenTextEditor={onOpenTextEditor}
            onQuickAddEffect={() => {
              engine?.pauseVideo();
              setActiveStrip("effects");
            }}
            onCommitHistory={commitHistory}
          />

          {/* Alt Araç Şeritleri ve Butonlar: Dokunulduğunda veya kaydırıldığında videoyu otomatik durdurur */}
          <div
            onPointerDownCapture={() => engine?.pauseVideo()}
            onWheelCapture={() => engine?.pauseVideo()}
            className="flex flex-col gap-2.5"
          >
            {/* 2. Açılır Alt Ayar Şeridi (Fotoğraf Kırp / Efektler / Ses & Hız / Filtreler) */}
            {renderedStrip === "crop" &&
              selectedItemType === "photo" &&
              selectedPhotoLayer &&
              engine && (
                <div
                  className={`flex flex-col gap-2 px-4 transition-all ease-out ${stripAnimClass}`}
                  style={{ transitionDuration: `${SHEET_ANIM_MS}ms` }}
                >
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => {
                        selectedPhotoLayer.cycleShapeMode();
                        engine.requestRender();
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 bg-[#1c1c1e] text-zinc-200 border border-white/10 active:scale-95"
                    >
                      <Crop className="w-3.5 h-3.5 text-amber-400" />
                      <span>Çerçeve Şekli</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        selectedPhotoLayer.transform.rotation =
                          (selectedPhotoLayer.transform.rotation + 90) % 360;
                        engine.requestRender();
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 bg-[#1c1c1e] text-zinc-200 border border-white/10 active:scale-95"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>90° Döndür</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        selectedPhotoLayer.transform = {
                          x: 0.5,
                          y: 0.5,
                          scale: 1,
                          rotation: 0,
                        };
                        engine.requestRender();
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 bg-[#1c1c1e] text-zinc-300 border border-white/10 active:scale-95"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Sıfırla</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2 border border-white/5">
                    <span className="text-xs font-medium text-zinc-400 shrink-0">
                      Yakınlaştır
                    </span>
                    <input
                      type="range"
                      min={50}
                      max={300}
                      value={Math.round(activeClipScale * 100)}
                      onChange={(e) => {
                        const nextScale = Number(
                          (Number(e.target.value) / 100).toFixed(2)
                        );
                        selectedPhotoLayer.transform.scale = nextScale;
                        engine.requestRender();
                        syncFromEngine();
                      }}
                      className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                    <span className="text-xs font-semibold text-white w-10 text-right tabular-nums">
                      {activeClipScale.toFixed(1)}x
                    </span>
                  </div>
                </div>
              )}

            {renderedStrip === "effects" && (
              <>
                {/* Yarım ekran efekt paneli: üst yarıya dokununca kapanır */}
                <button
                  type="button"
                  aria-label="Kapat"
                  onClick={cancelEffectDraft}
                  className={`fixed inset-0 z-[45] bg-black/25 transition-opacity ease-out ${
                    stripVisible ? "opacity-100" : "opacity-0 pointer-events-none"
                  }`}
                  style={{ transitionDuration: `${SHEET_ANIM_MS}ms` }}
                />
                <div
                  className={`fixed inset-x-0 bottom-0 z-50 h-[50vh] flex flex-col bg-[#0c0c0f] border-t border-white/10 rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.6)] transition-transform ease-out ${
                    stripVisible ? "translate-y-0" : "translate-y-full"
                  }`}
                  style={{ transitionDuration: `${SHEET_ANIM_MS}ms` }}
                >
                  <div className="flex justify-center pt-2.5 pb-1">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                  </div>

                  <div className="flex items-center justify-between px-5 pt-1 pb-3">
                    <span className="text-sm font-bold text-white">Efektler</span>
                    <div className="flex items-center gap-2">
                      {effectClips.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            runDelayedAction("fx_clear", () =>
                              handleSelectEffectPreset("none")
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-xs font-semibold text-red-300 active:scale-95 transition-all"
                        >
                          Temizle
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={cancelEffectDraft}
                        className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 flex items-center justify-center active:scale-90 transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={confirmEffectDraft}
                        disabled={pendingActionKey !== null}
                        className="h-8 px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-60"
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        <span>Tamam</span>
                      </button>
                    </div>
                  </div>

                  <div className="px-5 pb-3">
                    <div className="grid grid-cols-2 gap-1 bg-[#16171b] p-1 rounded-2xl border border-white/5">
                      {([
                        ["cinema", "Sinema"],
                        ["dynamic", "Dinamik"],
                      ] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setEffectCategory(key)}
                          className={`py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                            effectCategory === key
                              ? "bg-amber-400 text-black shadow-sm"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedEffectClip && onChangeEffectClips ? (
                    <div className="mx-5 mb-3 flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2 border border-white/5">
                      <span className="text-xs font-medium text-zinc-400 shrink-0">
                        Yoğunluk
                      </span>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={selectedEffectClip.intensity ?? 80}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onChangeEffectClips(
                            effectClips.map((c) =>
                              c.id === selectedEffectClip.id
                                ? { ...c, intensity: val }
                                : c
                            )
                          );
                        }}
                        className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      />
                      <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
                        {selectedEffectClip.intensity ?? 80}%
                      </span>
                    </div>
                  ) : null}

                  <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-6">
                    <div className="grid grid-cols-4 gap-2">
                      {REELS_EFFECT_PRESETS.filter((eff) =>
                        effectCategory === "cinema"
                          ? ["cinema_warm", "vhs_grain", "rgb_shift", "glitch"].includes(
                              eff.id
                            )
                          : ["zoom_pulse", "flash", "shake", "cyber_neon"].includes(
                              eff.id
                            )
                      ).map((eff) => {
                        const active = selectedEffectClip?.effect === eff.id;
                        const pending = pendingActionKey === `fx_${eff.id}`;
                        return (
                          <PreviewThumb
                            key={eff.id}
                            src={previewFrame}
                            label={eff.name}
                            active={active || pending}
                            tint={eff.color}
                            className="w-full"
                            disabled={pendingActionKey !== null}
                            icon={
                              <BsStars
                                className={`w-4 h-4 ${pending ? "animate-pulse" : ""}`}
                              />
                            }
                            onClick={() =>
                              runDelayedAction(`fx_${eff.id}`, () =>
                                handleSelectEffectPreset(eff.id)
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {renderedStrip === "audio_speed" && (
              <div
                className={`flex flex-col gap-1.5 px-4 transition-all ease-out ${stripAnimClass}`}
                style={{ transitionDuration: `${SHEET_ANIM_MS}ms` }}
              >
                <div className="flex items-center justify-between pb-0.5">
                  <span className="text-[11px] font-bold text-zinc-300">
                    Hız & Ses
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveStrip("none")}
                    className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-300 flex items-center justify-center active:scale-90 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <>
                    {/* Klip Hız Seçenekleri (0.5x - 2x) */}
                    <div className="grid grid-cols-4 gap-2">
                      {SPEED_OPTIONS.map((rate) => {
                        const active = Math.abs(activeClipSpeed - rate) < 0.01;
                        return (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              commitHistory();
                              if (selectedVideoClip && engine) {
                                engine.updateClipSpeed(
                                  selectedVideoClip.id,
                                  rate
                                );
                                syncFromEngine();
                              } else {
                                onChangeSpeed(rate);
                              }
                            }}
                            className={`py-1 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                              active
                                ? "bg-amber-400 text-black border-amber-400"
                                : "bg-[#1c1c1e] text-white border-white/5 hover:bg-[#26262a]"
                            }`}
                          >
                            {rate}x
                          </button>
                        );
                      })}
                    </div>

                    {/* Klip Ses Seviyesi (0 - 100) */}
                    {!videoState.isMotionPhoto && (
                      <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            commitHistory();
                            const nextMuted = activeClipVolume > 0;
                            const nextVol = nextMuted ? 0 : 1;
                            if (selectedVideoClip && engine) {
                              engine.updateClipVolume(
                                selectedVideoClip.id,
                                nextVol,
                                nextMuted
                              );
                              syncFromEngine();
                            } else {
                              onChangeVolume(nextVol, nextMuted);
                            }
                          }}
                          className="text-white shrink-0"
                        >
                          {activeClipVolume === 0 ? (
                            <VolumeX className="w-3.5 h-3.5 text-red-400" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-zinc-300" />
                          )}
                        </button>
                        <span className="text-[11px] font-medium text-zinc-400 w-12 shrink-0">
                          Ses
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={activeClipVolume}
                          onChange={(e) => {
                            const val = Number(e.target.value) / 100;
                            if (selectedVideoClip && engine) {
                              engine.updateClipVolume(
                                selectedVideoClip.id,
                                val,
                                val === 0
                              );
                              syncFromEngine();
                            } else {
                              onChangeVolume(val, val === 0);
                            }
                          }}
                          className="flex-1 h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
                        />
                        <span className="text-[11px] font-semibold text-white w-8 text-right tabular-nums">
                          {activeClipVolume}%
                        </span>
                      </div>
                    )}
                </>
              </div>
            )}

            {renderedStrip === "music" && selectedMusic && (
              <div
                className={`px-4 transition-all ease-out ${stripAnimClass}`}
                style={{ transitionDuration: `${SHEET_ANIM_MS}ms` }}
              >
                <MusicSettingsPanel
                  music={selectedMusic}
                  volume={musicVolume}
                  onChangeVolume={onChangeMusicVolume}
                  onChangeMusic={(next) => onChangeMusicMeta?.(next)}
                  onBeforeChange={commitHistory}
                  onReplace={() => onOpenMusicPicker("replace")}
                  onTrim={() => onOpenMusicPicker("trim")}
                  onRemove={() => {
                    commitHistory();
                    onChangeMusicMeta?.(null);
                    setSelectedItemId(null);
                    setSelectedItemType(null);
                    setActiveStrip("none");
                  }}
                  onClose={() => setActiveStrip("none")}
                />
              </div>
            )}

            {renderedStrip === "filters" && (
              <div
                className={`flex items-center gap-2 px-4 transition-all ease-out ${stripAnimClass}`}
                style={{ transitionDuration: `${SHEET_ANIM_MS}ms` }}
              >
                <div className="flex-1 flex items-start gap-2 overflow-x-auto no-scrollbar py-0.5">
                  {FILTER_PRESETS.map((preset, idx) => (
                    <PreviewThumb
                      key={preset.id}
                      src={previewFrame}
                      label={preset.name}
                      active={activeFilterIndex === idx}
                      cssFilter={preset.cssFilter}
                      onClick={() => onSelectFilterIndex(idx)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStrip("none")}
                  className="w-7 h-7 self-start rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 flex items-center justify-center shrink-0 active:scale-90 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 3. DİNAMİK ALT ARAÇ ÇUBUĞU (Contextual Action Toolbar) */}
            {selectedItemId && selectedItemType ? (
              /* BİR KLİP, KATMAN VEYA ŞARKI PARÇASI SEÇİLİYKEN: [ ✂️ Böl ] [ 🗑️ Sil ] [ 📐 Kırp ] [ 🔊 Hız & Ses | 🎵 Müzik ] [ 📑 Kopyala ] */
              <div className="flex items-center justify-between gap-2 px-4 pt-0.5">
                <button
                  type="button"
                  onClick={() => runDelayedAction("split", handleSplitSelected)}
                  disabled={!canSplitSelected || pendingActionKey !== null}
                  className="flex-1 flex flex-col items-center gap-1 disabled:opacity-35 group"
                >
                  <div className="w-full h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-200">
                    Böl
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => runDelayedAction("delete", handleDeleteSelected)}
                  disabled={
                    (selectedItemType === "video" && clips.length <= 1) ||
                    pendingActionKey !== null
                  }
                  className="flex-1 flex flex-col items-center gap-1 disabled:opacity-35 group"
                >
                  <div className="w-full h-11 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 flex items-center justify-center text-red-400 transition-all active:scale-95">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-red-300">
                    Sil
                  </span>
                </button>

                {selectedItemType === "effect" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedEffectClip) {
                        setEffectDraft({
                          id: selectedEffectClip.id,
                          isNew: false,
                          originalEffect: selectedEffectClip.effect,
                        });
                      }
                      setActiveStrip("effects");
                    }}
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div className="w-full h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                      <BsStars className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-200">
                      Efekt
                    </span>
                  </button>
                )}

                {(selectedItemType === "video" ||
                  selectedItemType === "photo") && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveStrip((p) => (p === "crop" ? "none" : "crop"))
                    }
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div
                      className={`w-full h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
                        activeStrip === "crop"
                          ? "bg-amber-400 text-black"
                          : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
                      }`}
                    >
                      <Crop className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-200">
                      Kırp
                    </span>
                  </button>
                )}

                {selectedItemType === "audio" && selectedMusic && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveStrip((p) => (p === "music" ? "none" : "music"))
                    }
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div
                      className={`w-full h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
                        activeStrip === "music"
                          ? "bg-amber-400 text-black"
                          : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
                      }`}
                    >
                      <Music className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-200">
                      Müzik
                    </span>
                  </button>
                )}

                {selectedItemType === "video" && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveStrip((p) =>
                        p === "audio_speed" ? "none" : "audio_speed"
                      )
                    }
                    className="flex-1 flex flex-col items-center gap-1 group"
                  >
                    <div
                      className={`w-full h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
                        activeStrip === "audio_speed"
                          ? "bg-amber-400 text-black"
                          : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
                      }`}
                    >
                      <Gauge className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-200">
                      Hız & Ses
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => runDelayedAction("duplicate", handleDuplicateSelected)}
                  disabled={pendingActionKey !== null}
                  className="flex-1 flex flex-col items-center gap-1 group disabled:opacity-60"
                >
                  <div className="w-full h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                    <Copy className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-200">
                    Kopyala
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectItem(null, null)}
                  className="flex flex-col items-center gap-1 shrink-0 group"
                >
                  <div className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-zinc-300 transition-all active:scale-95">
                    <X className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-400">
                    Bitti
                  </span>
                </button>
              </div>
            ) : (
              /* HİÇBİR ÖĞE SEÇİLİ DEĞİLKEN: [ 📝 Metin ] [ 🌟 Sticker ] [ 🖼️ Fotoğraf ] [ 🎵 Müzik ] [ ⚡ Efektler ] [ 🎨 Filtre ] */
              <div className="flex items-start justify-between gap-2 overflow-x-auto no-scrollbar px-4 pt-0.5">
                <button
                  type="button"
                  onClick={onOpenTextEditor}
                  className="flex flex-col items-center gap-1 shrink-0 group"
                >
                  <div className="w-14 h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                    <Type className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-200">
                    Metin
                  </span>
                </button>

                {onOpenStickerSheet && (
                  <button
                    type="button"
                    onClick={onOpenStickerSheet}
                    className="flex flex-col items-center gap-1 shrink-0 group"
                  >
                    <div className="w-14 h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                      <PiStickerLight className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-200">
                      Sticker
                    </span>
                  </button>
                )}

                {onOpenPhotoOverlay && (
                  <button
                    type="button"
                    onClick={onOpenPhotoOverlay}
                    className="flex flex-col items-center gap-1 shrink-0 group"
                  >
                    <div className="w-14 h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                      <TbPhotoPlus className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-zinc-200">
                      Fotoğraf
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    selectedMusic
                      ? setActiveStrip((p) => (p === "music" ? "none" : "music"))
                      : onOpenMusicPicker()
                  }
                  className="flex flex-col items-center gap-1 shrink-0 group"
                >
                  <div
                    className={`w-14 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
                      selectedMusic
                        ? "bg-white text-black"
                        : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
                    }`}
                  >
                    <Music className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-200">
                    Müzik
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveStrip((p) => (p === "effects" ? "none" : "effects"))
                  }
                  className="flex flex-col items-center gap-1 shrink-0 group"
                >
                  <div
                    className={`w-14 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
                      activeStrip === "effects" ||
                      activeReelsEffect !== "none" ||
                      effectClips.length > 0
                        ? "bg-white text-black"
                        : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
                    }`}
                  >
                    <BsStars className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-200">
                    Efektler
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveStrip((p) => (p === "filters" ? "none" : "filters"))
                  }
                  className="flex flex-col items-center gap-1 shrink-0 group"
                >
                  <div
                    className={`w-14 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 ${
                      activeStrip === "filters" || activeFilterIndex > 0
                        ? "bg-white text-black"
                        : "bg-[#1c1c1e] group-hover:bg-[#26262a] text-white"
                    }`}
                  >
                    <RiColorFilterAiLine className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-zinc-200">
                    Filtre
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
// [END] CREATED BY Bedirhan
