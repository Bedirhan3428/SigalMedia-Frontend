// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";
/* Motor/DOM eşitlemesi bilinçli olarak efekt içinde setState ve ref okuması yapar (kararlı geri çağrılar). */
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCw,
  FlipHorizontal2,
  RotateCcw,
  Check,
} from "lucide-react";
import {
  BaseLayer,
  EngineSnapshot,
  MAX_VIDEO_SEC,
  CanvasEngine,
  OverlayImageLayer,
  OverlayTrackItem,
  ReelsEffectClip,
  ReelsEffectId,
  StoryAudioMeta,
  VideoState,
  VideoTrackClip,
} from "@/lib/canvas-editor";
import VideoTimelineNLE from "./VideoTimelineNLE";
import ReelsMenu from "./ReelsMenu";
import TextComposer from "./TextComposer";
import { NLESelectedType } from "./TimelineOverlayTracks";
import OnCanvasCropOverlay from "./OnCanvasCropOverlay";
import { EditorToastProvider, useEditorToast } from "../common";

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
  onOpenMusicPicker: (intent?: "replace" | "trim") => void;
  /** Sayfa, tuvalde metne çift dokunulduğunda metin düzenleyiciyi açtırmak için sayacı artırır. */
  textEditRequest?: { layerId: string | null; seq: number } | null;
  /** @Bahset çıkartması ekler. */
  onAddMention?: () => void;
  onSelectFilterIndex: (index: number) => void;
  onSelectReelsEffect: (effect: ReelsEffectId) => void;
  /** Önizleme sahnesinin alttan boşluğu (px, safe-area dahil) ölçüldükçe bildirilir. */
  onLayout?: (layout: { bottom: number }) => void;
}

// Tam ekran kırpma dışındaki tüm araçlar ReelsMenu içinde yaşar
type ActiveToolStrip = "none" | "crop";

// İşlemlerin anında tetiklenip birbirine karışmaması için kısa gecikme
const ACTION_DELAY_MS = 180;
// Yeni efekt klibi varsayılan süresi ve önizleme süresi (sn)
const EFFECT_CLIP_SPAN_SEC = 2;
// Geri al yığını sınırı ve iTunes önizleme parça süresi (sn)
const HISTORY_LIMIT = 40;
const MUSIC_PREVIEW_SEC = 30;
// Alt panelin en büyük yüksekliği (ekranın ~%42si): timeline bunun içinde dikey kayar (A5)
// Menü (136 px) + timeline için en az ~200 px veya ekranın %32'si; menü timeline'ın üstüne binmez
const PANEL_MAX_HEIGHT = "calc(136px + max(200px, 32dvh))";

/** Fotoğraf katmanı dönüşümünü günceller (katman motor nesnesidir, React durumu değil). */
function patchPhotoTransform(
  layer: OverlayImageLayer,
  fn: (t: OverlayImageLayer["transform"]) => OverlayImageLayer["transform"]
) {
  layer.transform = fn(layer.transform);
}

/** Kimliği sabit, her zaman son fonksiyonu çağıran geri çağrı. */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

function ReelsEditorInner({
  engine,
  selectedCanvasLayer,
  videoState,
  thumbnails,
  selectedMusic,
  musicVolume,
  activeFilterIndex,
  effectClips = [],
  onChangeMusicVolume,
  onChangeMusicMeta,
  onChangeEffectClips,
  onCropModeChange,
  onOpenMusicPicker,
  textEditRequest,
  onAddMention,
  onSelectFilterIndex,
  onSelectReelsEffect,
  onLayout,
}: ReelsEditorProps) {
  const toast = useEditorToast();
  const [activeStrip, setActiveStrip] = useState<ActiveToolStrip>("none");
  const [quickEffectSeq, setQuickEffectSeq] = useState(0);
  // Metin düzenleyici (klavyeli): düzenleyiciyi unmount etmez, geçmiş korunur
  const [composer, setComposer] = useState<{ layerId: string | null } | null>(null);
  const openComposer = useCallback(
    (layerId: string | null) => {
      engine?.pauseVideo();
      setComposer({ layerId });
    },
    [engine]
  );
  const [seenTextRequest, setSeenTextRequest] = useState(0);
  if (textEditRequest && textEditRequest.seq !== seenTextRequest) {
    setSeenTextRequest(textEditRequest.seq);
    openComposer(textEditRequest.layerId);
  }
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<NLESelectedType>(null);
  const [clips, setClips] = useState<VideoTrackClip[]>([]);
  const [overlayItems, setOverlayItems] = useState<OverlayTrackItem[]>([]);
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
  const syncFromEngine = useCallback(() => {
    if (!engine) return;
    setClips(engine.getVideoClips());
    setOverlayItems(engine.getOverlayTrackItems());
  }, [engine]);

  useEffect(() => {
    syncFromEngine();
    if (!engine) return;
    // 'change' yapısal değişimdir (pointermove'da yayılmaz); aynı karedeki yayınlar birleşir
    let raf: number | null = null;
    const handleEngineChange = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        syncFromEngine();
      });
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
    engine.on("select", handleCanvasSelect);
    return () => {
      engine.off("change", handleEngineChange);
      engine.off("select", handleCanvasSelect);
      if (raf !== null) cancelAnimationFrame(raf);
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
    engine?.getMedia()?.duration || videoState.duration || MAX_VIDEO_SEC
  );

  const getPlayheadTime = () => {
    const raw = engine ? engine.getCurrentTime() : videoState.currentTime;
    return Math.max(0, Math.min(totalDuration, raw));
  };

  // Kararlı geri çağrılar: timeline satırları bunlara bağlı, gereksiz yeniden çizim olmaz (D1)
  const readTime = useCallback(() => engine?.getCurrentTime() ?? 0, [engine]);
  const handleSeek = useCallback(
    (t: number) => {
      engine?.seekVideo(t);
    },
    [engine]
  );
  const handleTogglePlay = useCallback(() => {
    engine?.toggleVideoPlay();
  }, [engine]);
  const handlePause = useCallback(() => engine?.pauseVideo(), [engine]);

  // Kalan süre: MAX_VIDEO_SEC - toplam (B8)
  const remainingSec = Math.max(0, MAX_VIDEO_SEC - totalDuration);

  // Alt panel ölçümü: ResizeObserver ile yükseklik sayfaya bildirilir (yalnızca değişince)
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onLayoutRef = useRef(onLayout);
  useEffect(() => {
    onLayoutRef.current = onLayout;
  }, [onLayout]);
  const lastBottomRef = useRef<number>(-1);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const report = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h === lastBottomRef.current) return;
      lastBottomRef.current = h;
      onLayoutRef.current?.({ bottom: h });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      lastBottomRef.current = -1;
      onLayoutRef.current?.({ bottom: 0 });
    };
  }, []);

  // Otomatik oynatma sesi engellendiyse küçük "sesi aç" düğmesi (B5)
  const [soundBlocked, setSoundBlocked] = useState(() => Boolean(engine?.needsUserGestureForSound()));
  useEffect(() => {
    if (!engine) return;
    setSoundBlocked(engine.needsUserGestureForSound());
    const onBlocked = (blocked: boolean) => setSoundBlocked(Boolean(blocked));
    engine.on("sound-blocked", onBlocked);
    return () => engine.off("sound-blocked", onBlocked);
  }, [engine]);
  const handleUnmute = () => {
    if (!engine) return;
    // Kullanıcı hareketi içinde eşzamanlı çağrılmalı
    engine.unlockSound().then((ok) => {
      if (!ok) toast.error("Ses açılamadı");
    });
  };


  // Geri al / yinele: engine.snapshot() / restore(). Ardışık 'change' olayları (slider sürüklemesi,
  // jest sonu vb.) 350 ms içinde tek geçmiş kaydına birleşir; restore'un yaydığı 'change' yok sayılır.
  const undoRef = useRef<EngineSnapshot[]>([]);
  const redoRef = useRef<EngineSnapshot[]>([]);
  const committedRef = useRef<EngineSnapshot | null>(null);
  const burstRef = useRef(false);
  const restoringRef = useRef(false);
  const burstTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const [historyInfo, setHistoryInfo] = useState({ undo: 0, redo: 0 });
  const bumpHistory = useCallback(() => {
    setHistoryInfo({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, []);

  useEffect(() => {
    if (!engine) return;
    committedRef.current = engine.snapshot();
    const onChange = () => {
      if (restoringRef.current) return;
      if (!burstRef.current) {
        burstRef.current = true;
        if (committedRef.current) {
          undoRef.current.push(committedRef.current);
          if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
        }
        redoRef.current = [];
        bumpHistory();
      }
      if (burstTimerRef.current !== null) window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = window.setTimeout(() => {
        burstTimerRef.current = null;
        burstRef.current = false;
        committedRef.current = engine.snapshot();
      }, 350);
    };
    engine.on("change", onChange);
    return () => {
      engine.off("change", onChange);
      if (burstTimerRef.current !== null) window.clearTimeout(burstTimerRef.current);
      if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
      burstTimerRef.current = null;
      burstRef.current = false;
    };
  }, [engine, bumpHistory]);

  const stepHistory = useCallback(
    (dir: "undo" | "redo") => {
      if (!engine) return;
      engine.pauseVideo();
      // Bekleyen birleştirme penceresini kapat: mevcut durum "şimdiki" olur
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      burstRef.current = false;
      const from = dir === "undo" ? undoRef.current : redoRef.current;
      const to = dir === "undo" ? redoRef.current : undoRef.current;
      const target = from.pop();
      if (!target) {
        bumpHistory();
        return;
      }
      const current = engine.snapshot();
      restoringRef.current = true;
      let ok = false;
      try {
        ok = engine.restore(target);
        if (ok) {
          to.push(current);
          // Sayfa durumunu motorla eşitle (müzik, efekt klipleri, filtre)
          onChangeMusicMeta?.(engine.getMusic());
          onChangeEffectClips?.(engine.getEffectClips());
          onSelectFilterIndex(engine.getCurrentFilterIndex());
          setClips(engine.getVideoClips());
          setOverlayItems(engine.getOverlayTrackItems());
          setSelectedItemId(null);
          setSelectedItemType(null);
          setActiveStrip("none");
          committedRef.current = engine.snapshot();
        }
      } finally {
        if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = window.setTimeout(() => {
          restoreTimerRef.current = null;
          restoringRef.current = false;
          committedRef.current = engine.snapshot();
        }, 150);
      }
      if (!ok) toast.error("Bu adım geri alınamadı");
      bumpHistory();
    },
    [engine, bumpHistory, onChangeMusicMeta, onChangeEffectClips, onSelectFilterIndex, toast]
  );
  const handleUndo = useCallback(() => stepHistory("undo"), [stepHistory]);
  const handleRedo = useCallback(() => stepHistory("redo"), [stepHistory]);
  // Geçmiş artık 'change' olaylarından otomatik oluşur; eski çağrı noktaları için boş kanca
  const commitHistory = useCallback(() => {}, []);

  // Sayfadaki müzik durumunu motora yaz (Reels'te tuval çıkartması yok, yalnızca meta)
  useEffect(() => {
    if (!engine) return;
    const cur = engine.getMusic();
    const a = selectedMusic ? JSON.stringify(selectedMusic) : "";
    const b = cur ? JSON.stringify(cur) : "";
    if (a !== b) engine.setMusic(selectedMusic);
  }, [engine, selectedMusic]);

  // Önizleme parçaları 30 sn: müzik bloğu en fazla 30 sn'de biter (şarkı ofseti düşülür)
  // ve hiçbir zaman videonun toplam süresini geçmez (klip kısalınca da kırpılır)
  useEffect(() => {
    if (!selectedMusic || !onChangeMusicMeta) return;
    const videoEnd = Math.max(0.5, totalDuration);
    // Cihaz müziği 30 sn ile sınırlı değildir; yalnızca video sonuyla kırpılır
    const isDevice = selectedMusic.source === "device";
    let changed = false;
    let next: StoryAudioMeta = selectedMusic;
    if (selectedMusic.segments && selectedMusic.segments.length > 0) {
      const kept = selectedMusic.segments.filter((s) => s.timelineStart < videoEnd - 0.25);
      if (kept.length !== selectedMusic.segments.length) changed = true;
      const segs = kept.map((s) => {
        const previewEnd = isDevice
          ? Infinity
          : s.timelineStart + Math.max(0.5, MUSIC_PREVIEW_SEC - (s.songOffset || 0));
        const maxEnd = Math.min(previewEnd, videoEnd);
        if (s.timelineEnd > maxEnd + 0.01) {
          changed = true;
          return { ...s, timelineEnd: Number(maxEnd.toFixed(2)) };
        }
        return s;
      });
      if (changed && segs.length === 0) {
        // Bütün parçalar video sonunun ötesindeydi: müzik tek blok olarak baştan başlar
        next = {
          ...selectedMusic,
          segments: undefined,
          timelineStart: 0,
          timelineEnd: Number(
            Math.min(
              videoEnd,
              isDevice ? videoEnd : Math.max(0.5, MUSIC_PREVIEW_SEC - (selectedMusic.startTime || 0))
            ).toFixed(2)
          ),
        };
      } else if (changed) {
        next = {
          ...selectedMusic,
          segments: segs,
          timelineEnd: segs[segs.length - 1].timelineEnd,
        };
      }
    } else if (
      typeof selectedMusic.timelineEnd === "number" &&
      selectedMusic.timelineEnd > (selectedMusic.timelineStart ?? 0)
    ) {
      let start = selectedMusic.timelineStart ?? 0;
      if (start > videoEnd - 0.5) {
        start = Math.max(0, Number((videoEnd - 0.5).toFixed(2)));
        changed = true;
      }
      const previewEnd = isDevice
        ? Infinity
        : start + Math.max(0.5, MUSIC_PREVIEW_SEC - (selectedMusic.startTime || 0));
      const maxEnd = Math.min(previewEnd, videoEnd);
      if (changed || selectedMusic.timelineEnd > maxEnd + 0.01) {
        changed = true;
        next = {
          ...selectedMusic,
          timelineStart: start,
          timelineEnd: Number(Math.min(selectedMusic.timelineEnd, maxEnd).toFixed(2)),
        };
      }
    }
    if (changed) onChangeMusicMeta(next);
  }, [selectedMusic, onChangeMusicMeta, totalDuration]);

  // Efekt klipleri de video sonunu geçemez (klip kısalınca/silinince sayfa durumu kırpılır)
  useEffect(() => {
    if (!onChangeEffectClips || effectClips.length === 0) return;
    const videoEnd = Math.max(0.5, totalDuration);
    let changed = false;
    const next: ReelsEffectClip[] = [];
    for (const c of effectClips) {
      if (c.startTime >= videoEnd - 0.05) {
        changed = true;
        continue;
      }
      if (c.endTime > videoEnd + 0.005) {
        changed = true;
        next.push({ ...c, endTime: Number(videoEnd.toFixed(2)) });
      } else {
        next.push(c);
      }
    }
    if (changed) onChangeEffectClips(next);
  }, [effectClips, totalDuration, onChangeEffectClips]);

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
        ? Math.min(selectedMusic.timelineEnd, totalDuration)
        : totalDuration;
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
      } else {
        toast.error(`${MAX_VIDEO_SEC} sn sınırı dolu, klip kopyalanamadı`);
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
        const nextEnd = Math.min(totalDuration, nextStart + span);
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
    if (engine.getRemainingTimelineCapacity() < 0.5) {
      toast.error(`En fazla ${MAX_VIDEO_SEC} sn'lik video eklenebilir`);
      return;
    }
    try {
      const added = await engine.appendVideoClip(file);
      if (added) {
        syncFromEngine();
        setSelectedItemId(added.id);
        setSelectedItemType("video");
        if (engine.getRemainingTimelineCapacity() < 0.5) {
          toast.info(`${MAX_VIDEO_SEC} sn sınırına ulaşıldı`);
        }
      } else {
        toast.error(`En fazla ${MAX_VIDEO_SEC} sn'lik video eklenebilir`);
      }
    } catch {
      toast.error("Klip eklenemedi. Dosya desteklenmiyor olabilir.");
    }
  };

  const activeClipScale = selectedVideoClip
    ? selectedVideoClip.transform?.scale ?? 1
    : selectedPhotoLayer
      ? selectedPhotoLayer.transform.scale
      : 1;

  const activeClipFitMode = selectedVideoClip?.fitMode || "cover";


  // Timeline'a giden geri çağrılar kararlı kimlikte tutulur (son sürüme yönlenir) → memo'lu satırlar
  // zaman/oynatma güncellemelerinde yeniden çizilmez.
  const stableSelectItem = useStable(handleSelectItem);
  const stableTrim = useStable((clipId: string, newStart: number, newEnd: number) => {
    engine?.updateClipTrim(clipId, newStart, newEnd);
    syncFromEngine();
  });
  const stableReorderClips = useStable((fromIdx: number, toIdx: number) => {
    engine?.reorderClips(fromIdx, toIdx);
    syncFromEngine();
  });
  const stableAppendClick = useStable(() => {
    if (engine && engine.getRemainingTimelineCapacity() < 0.5) {
      toast.error(`En fazla ${MAX_VIDEO_SEC} sn'lik video eklenebilir`);
      return;
    }
    appendClipInputRef.current?.click();
  });
  const stableOverlayTiming = useStable((layerId: string, start: number, end: number) => {
    engine?.updateOverlayTrackTiming(layerId, start, end);
    syncFromEngine();
  });
  const stableReorderOverlay = useStable((layerId: string, direction: "up" | "down") => {
    engine?.reorderOverlayLayer(layerId, direction);
    syncFromEngine();
  });
  const stableEffectClips = useStable((next: ReelsEffectClip[]) => onChangeEffectClips?.(next));
  const stableMusicTimeline = useStable(handleMusicTimelineChange);
  const stableOpenMusic = useStable(() => onOpenMusicPicker());
  const stableOpenText = useStable(() => openComposer(null));
  const stableQuickEffect = useStable(() => {
    engine?.pauseVideo();
    setQuickEffectSeq((n) => n + 1);
  });
  const handleSelectClipAtPlayhead = () => {
    if (!engine) return;
    const active = engine.getActiveClipAtTime(getPlayheadTime());
    if (active) handleSelectItem(active.clip.id, "video");
  };
  // Düzenle alt menüsündeki araç panelleri: efekt paneli kapanınca taslak sonlanır
  const handleActiveToolChange = useStable((key: string | null) => {
    if (key !== "effects") setEffectDraft(null);
  });

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

      {/* Otomatik oynatmada ses engellendiyse: sesi aç */}
      {soundBlocked && (
        <button
          type="button"
          onClick={handleUnmute}
          aria-label="Sesi aç"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 76px)" }}
          className="fixed right-4 z-30 h-11 px-4 rounded-full bg-black/70 backdrop-blur text-white text-xs font-semibold flex items-center gap-2 border border-white/20 active:scale-95 transition-transform"
        >
          <VolumeX className="w-4 h-4" />
          <span>Sesi aç</span>
        </button>
      )}

      {/* TAM EKRAN 8 TUTAMAÇLI KIRPMA MODU (Timeline gizlenir, video büyür, kırpma kutusu en üstte) */}
      <div
        ref={panelRef}
        style={{ maxHeight: PANEL_MAX_HEIGHT }}
        className="fixed inset-x-0 bottom-0 z-40 flex flex-col pointer-events-none"
      >
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
            className="relative shrink-0 z-50 bg-black/95 pb-safe min-h-28 border-t border-white/10 px-4 py-2.5 flex flex-col justify-between pointer-events-auto select-none"
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
        <div
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
          className="relative min-h-0 bg-black pt-1.5 flex flex-col gap-2 pointer-events-auto select-none"
        >
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
            canUndo={historyInfo.undo > 0}
            canRedo={historyInfo.redo > 0}
            getCurrentTime={readTime}
            remainingSec={remainingSec}
            onSelectItem={stableSelectItem}
            onTrimClip={stableTrim}
            onReorderClips={stableReorderClips}
            onAppendClipClick={stableAppendClick}
            onChangeOverlayTiming={stableOverlayTiming}
            onReorderOverlayLayer={stableReorderOverlay}
            onChangeEffectClips={onChangeEffectClips ? stableEffectClips : undefined}
            onChangeMusicTimeline={stableMusicTimeline}
            onSeek={handleSeek}
            onPauseVideo={handlePause}
            onTogglePlay={handleTogglePlay}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onOpenMusicPicker={stableOpenMusic}
            onOpenTextEditor={stableOpenText}
            onQuickAddEffect={stableQuickEffect}
          />

          {/* Alt menü: ana menü / Düzenle / araç paneli aynı sabit yükseklikte; dokunulduğunda video durur */}
          <div
            onPointerDownCapture={() => engine?.pauseVideo()}
            onWheelCapture={() => engine?.pauseVideo()}
            className="shrink-0"
          >
            {engine && (
              <ReelsMenu
                engine={engine}
                selection={
                  selectedItemId && selectedItemType
                    ? { id: selectedItemId, type: selectedItemType }
                    : null
                }
                clip={selectedVideoClip}
                clipCount={clips.length}
                canSplit={canSplitSelected}
                busy={pendingActionKey !== null}
                selectedMusic={selectedMusic}
                musicVolume={musicVolume}
                activeFilterIndex={activeFilterIndex}
                selectedEffectClip={selectedEffectClip}
                quickEffectSeq={quickEffectSeq}
                photo={
                  selectedPhotoLayer
                    ? {
                        scale: selectedPhotoLayer.transform.scale,
                        patch: (fn) => {
                          patchPhotoTransform(selectedPhotoLayer, fn);
                          engine.requestRender();
                          syncFromEngine();
                        },
                        cycleShape: () => {
                          selectedPhotoLayer.cycleShapeMode();
                          engine.requestRender();
                        },
                      }
                    : null
                }
                onSplit={() => runDelayedAction("split", handleSplitSelected)}
                onDelete={() => runDelayedAction("delete", handleDeleteSelected)}
                onDuplicate={() => runDelayedAction("duplicate", handleDuplicateSelected)}
                onCrop={() => setActiveStrip("crop")}
                onSelectClipAtPlayhead={handleSelectClipAtPlayhead}
                onSelectVideoClip={(id) => handleSelectItem(id, "video")}
                onOpenText={openComposer}
                onOpenMusicPicker={onOpenMusicPicker}
                onChangeMusicVolume={onChangeMusicVolume}
                onChangeMusicMeta={(m) => onChangeMusicMeta?.(m)}
                onSelectFilterIndex={onSelectFilterIndex}
                onPickEffect={(id) => runDelayedAction(`fx_${id}`, () => handleSelectEffectPreset(id))}
                onEffectIntensity={(v) => {
                  if (!selectedEffectClip || !onChangeEffectClips) return;
                  onChangeEffectClips(
                    effectClips.map((c) =>
                      c.id === selectedEffectClip.id ? { ...c, intensity: v } : c
                    )
                  );
                }}
                onAddMention={onAddMention}
                onActiveToolChange={handleActiveToolChange}
              />
            )}
            <div style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 4px)" }} />
          </div>
        </div>
      )}
      </div>

      {composer && engine && (
        <TextComposer engine={engine} layerId={composer.layerId} onClose={() => setComposer(null)} />
      )}
    </>
  );
}
// [END] CREATED BY Bedirhan

/** Toast sağlayıcısını bu bileşenin içine alır: sayfa sağlayıcı sunmaz. */
export default function ReelsEditor(props: ReelsEditorProps) {

  return (
    <EditorToastProvider topOffset={72}>
      <ReelsEditorInner {...props} />
    </EditorToastProvider>
  );
}
