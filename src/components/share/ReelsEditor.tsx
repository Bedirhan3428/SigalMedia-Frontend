// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Scissors,
  Sparkles,
  Music,
  Gauge,
  Palette,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Copy,
  Sticker,
  Image as ImageIcon,
  Type,
  Crop,
  RotateCw,
  FlipHorizontal2,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
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
} from "@/lib/canvas-editor";
import VideoTimelineNLE from "./VideoTimelineNLE";
import { NLESelectedType } from "./TimelineOverlayTracks";

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
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onOpenTextEditor: () => void;
  onOpenMusicPicker: () => void;
  onOpenStickerSheet?: () => void;
  onOpenPhotoOverlay?: () => void;
  onSelectFilterIndex: (index: number) => void;
  onSelectReelsEffect: (effect: ReelsEffectId) => void;
  onPublish: () => void;
}

type ActiveToolStrip = "none" | "effects" | "audio_speed" | "filters" | "crop";

type NLEHistorySnapshot = {
  clips: VideoTrackClip[];
  effectClips: ReelsEffectClip[];
  musicClip: StoryAudioMeta | null;
  overlayTimings: Array<{ layerId: string; start: number; end: number }>;
};

const SPEED_OPTIONS = [0.5, 1.0, 1.5, 2.0];

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
    engine.on("change", handleEngineChange);
    engine.on("video-time", handleEngineChange);
    return () => {
      engine.off("change", handleEngineChange);
      engine.off("video-time", handleEngineChange);
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
    setSelectedItemId(id);
    setSelectedItemType(type);
    if (!id) {
      setActiveStrip("none");
      engine?.selectLayerById(null);
      return;
    }
    if (type === "text" || type === "sticker" || type === "photo") {
      engine?.selectLayerById(id);
    } else {
      engine?.selectLayerById(null);
    }
    if (type === "video" && engine) {
      const targetClip = clips.find((c) => c.id === id);
      if (targetClip) {
        engine.applyClipTransformToMediaLayer(targetClip);
        engine.requestRender();
      }
    }
    if (type === "effect") {
      setActiveStrip("effects");
    }
  };

  const selectedVideoClip =
    selectedItemType === "video"
      ? clips.find((c) => c.id === selectedItemId) || null
      : null;

  const selectedEffectClip =
    selectedItemType === "effect"
      ? effectClips.find((c) => c.id === selectedItemId) || null
      : null;

  const selectedPhotoLayer =
    selectedItemType === "photo" && engine
      ? (engine.getSelectedLayer() as OverlayImageLayer | null)
      : null;

  // İbre seçili klibin/katmanın içindeyse Böl butonu aktiftir
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
    return false;
  })();

  // ✂️ BÖL (SPLIT) Aksiyonu
  const handleSplitSelected = () => {
    const cur = getPlayheadTime();
    commitHistory();

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

  // 🗑️ SİL (DELETE) Aksiyonu (Manyetik Ripple / Katman Silme)
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
      onChangeMusicMeta(null);
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
    }
  };

  const addEffectClipAtPlayhead = (effectId: Exclude<ReelsEffectId, "none">) => {
    if (!onChangeEffectClips) {
      onSelectReelsEffect(effectId);
      return;
    }
    commitHistory();
    const cur = getPlayheadTime();
    const defaultSpan = Math.min(2.5, Math.max(0.8, totalDuration * 0.35));
    let clipStart = cur;
    let clipEnd = Math.min(totalDuration, clipStart + defaultSpan);
    if (clipEnd - clipStart < 0.4) {
      clipStart = Math.max(0, totalDuration - defaultSpan);
      clipEnd = totalDuration;
    }
    const newClip: ReelsEffectClip = {
      id: `fx_${Date.now().toString(36)}`,
      effect: effectId,
      startTime: Number(clipStart.toFixed(2)),
      endTime: Number(clipEnd.toFixed(2)),
      intensity: 100,
    };
    onSelectReelsEffect("none");
    onChangeEffectClips([...effectClips, newClip]);
    setSelectedItemId(newClip.id);
    setSelectedItemType("effect");
  };

  const handleSelectEffectPreset = (effectId: ReelsEffectId) => {
    if (!onChangeEffectClips) {
      onSelectReelsEffect(effectId);
      return;
    }
    if (effectId === "none") {
      if (selectedEffectClip) {
        commitHistory();
        onChangeEffectClips(effectClips.filter((c) => c.id !== selectedEffectClip.id));
        setSelectedItemId(null);
        setSelectedItemType(null);
      } else {
        onChangeEffectClips([]);
        onSelectReelsEffect("none");
      }
      return;
    }
    if (selectedEffectClip) {
      commitHistory();
      onChangeEffectClips(
        effectClips.map((c) =>
          c.id === selectedEffectClip.id ? { ...c, effect: effectId } : c
        )
      );
    } else {
      addEffectClipAtPlayhead(effectId);
    }
  };

  const handleMusicTimelineChange = (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number
  ) => {
    if (!selectedMusic || !onChangeMusicMeta) return;
    onChangeMusicMeta({
      ...selectedMusic,
      timelineStart,
      timelineEnd,
      startTime: typeof songOffset === "number" ? songOffset : selectedMusic.startTime,
    });
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

  const effectiveMusicVolume = Math.round(musicVolume * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-black pt-1.5 pb-5 flex flex-col gap-2.5 pointer-events-auto select-none">
      {/* 1. Sabit PPS (60px/s) ve Sabit Merkez İbreli NLE Zaman Çizelgesi */}
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
        onOpenMusicPicker={onOpenMusicPicker}
        onOpenTextEditor={onOpenTextEditor}
        onQuickAddEffect={() => {
          setActiveStrip("effects");
          addEffectClipAtPlayhead("zoom_pulse");
        }}
        onCommitHistory={commitHistory}
      />

      {/* 2. Açılır Alt Ayar Şeridi (Kırp & Kadraj / Efektler / Ses & Hız / Filtreler) */}
      {activeStrip === "crop" &&
        (selectedItemType === "video" || selectedItemType === "photo") && (
          <div className="flex flex-col gap-2 px-4">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {selectedItemType === "video" && selectedVideoClip && engine && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      commitHistory();
                      engine.updateClipTransform(selectedVideoClip.id, undefined, "cover");
                      syncFromEngine();
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-all active:scale-95 ${
                      activeClipFitMode === "cover"
                        ? "bg-amber-400 text-black border-amber-400"
                        : "bg-[#1c1c1e] text-zinc-200 border-white/10"
                    }`}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>9:16 Doldur</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      commitHistory();
                      engine.updateClipTransform(selectedVideoClip.id, undefined, "contain");
                      syncFromEngine();
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-all active:scale-95 ${
                      activeClipFitMode === "contain"
                        ? "bg-amber-400 text-black border-amber-400"
                        : "bg-[#1c1c1e] text-zinc-200 border-white/10"
                    }`}
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>9:16 Sığdır</span>
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
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 bg-[#1c1c1e] text-zinc-200 border border-white/10 active:scale-95"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>90° Döndür</span>
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-all active:scale-95 ${
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
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 bg-[#1c1c1e] text-zinc-300 border border-white/10 active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Sıfırla</span>
                  </button>
                </>
              )}

              {selectedItemType === "photo" && selectedPhotoLayer && engine && (
                <>
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
                </>
              )}
            </div>

            {/* Yakınlaştırma (Zoom / Scale 1.0x - 3.0x) Slider */}
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
                  const nextScale = Number((Number(e.target.value) / 100).toFixed(2));
                  if (selectedItemType === "video" && selectedVideoClip && engine) {
                    engine.updateClipTransform(selectedVideoClip.id, {
                      scale: nextScale,
                    });
                    syncFromEngine();
                  } else if (selectedItemType === "photo" && selectedPhotoLayer && engine) {
                    selectedPhotoLayer.transform.scale = nextScale;
                    engine.requestRender();
                    syncFromEngine();
                  }
                }}
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <span className="text-xs font-semibold text-white w-10 text-right tabular-nums">
                {activeClipScale.toFixed(1)}x
              </span>
            </div>
          </div>
        )}

      {activeStrip === "effects" && (
        <div className="flex flex-col gap-2 px-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {REELS_EFFECT_PRESETS.map((eff) => {
              const active = selectedEffectClip
                ? selectedEffectClip.effect === eff.id
                : eff.id === "none"
                  ? effectClips.length === 0 && activeReelsEffect === "none"
                  : activeReelsEffect === eff.id;

              return (
                <button
                  key={eff.id}
                  type="button"
                  onClick={() => handleSelectEffectPreset(eff.id)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-semibold shrink-0 border transition-all active:scale-95 flex items-center gap-1.5 ${
                    active
                      ? "bg-white text-black border-white"
                      : "bg-[#1c1c1e] text-zinc-300 border-white/5 hover:bg-[#26262a]"
                  }`}
                >
                  {eff.id !== "none" && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: eff.color }}
                    />
                  )}
                  <span>{eff.name}</span>
                </button>
              );
            })}

            {onChangeEffectClips && (
              <button
                type="button"
                onClick={() => addEffectClipAtPlayhead("zoom_pulse")}
                className="px-3.5 py-2 rounded-2xl text-xs font-semibold shrink-0 border border-white/15 text-white bg-[#1c1c1e] hover:bg-[#26262a] active:scale-95 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Yeni Efekt</span>
              </button>
            )}
          </div>

          {selectedEffectClip && onChangeEffectClips && (
            <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2 border border-white/5">
              <span className="text-xs font-medium text-zinc-400 shrink-0">
                Yoğunluk
              </span>
              <input
                type="range"
                min={15}
                max={100}
                value={selectedEffectClip.intensity}
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
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
                {selectedEffectClip.intensity}%
              </span>
            </div>
          )}
        </div>
      )}

      {activeStrip === "audio_speed" && (
        <div className="flex flex-col gap-2 px-4">
          {selectedItemType === "audio" && selectedMusic ? (
            <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2">
              <Music className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-xs font-medium text-zinc-300 w-16 truncate shrink-0">
                {selectedMusic.title}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={effectiveMusicVolume}
                onChange={(e) =>
                  onChangeMusicVolume(Number(e.target.value) / 100)
                }
                className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
                {effectiveMusicVolume}%
              </span>
            </div>
          ) : (
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
                          engine.updateClipSpeed(selectedVideoClip.id, rate);
                          syncFromEngine();
                        } else {
                          onChangeSpeed(rate);
                        }
                      }}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
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
                <div className="flex items-center gap-3 bg-[#16171b] rounded-2xl px-3.5 py-2">
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
                      <VolumeX className="w-4 h-4 text-red-400" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-zinc-300" />
                    )}
                  </button>
                  <span className="text-xs font-medium text-zinc-400 w-14 shrink-0">
                    Klip Sesi
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
                    className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-white"
                  />
                  <span className="text-xs font-semibold text-white w-9 text-right tabular-nums">
                    {activeClipVolume}%
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeStrip === "filters" && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4">
          {FILTER_PRESETS.map((preset, idx) => {
            const active = activeFilterIndex === idx;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectFilterIndex(idx)}
                className={`px-4 py-2 rounded-2xl text-xs font-semibold shrink-0 border transition-all active:scale-95 ${
                  active
                    ? "bg-white text-black border-white"
                    : "bg-[#1c1c1e] text-zinc-300 border-white/5 hover:bg-[#26262a]"
                }`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 3. DİNAMİK ALT ARAÇ ÇUBUĞU (Contextual Action Toolbar) */}
      {selectedItemId && selectedItemType ? (
        /* BİR KLİP VEYA KATMAN SEÇİLİYKEN: [ ✂️ Böl ] [ 🗑️ Sil ] [ 📐 Kırp ] [ 🔊 Ses / Hız ] [ 📑 Kopyala ] */
        <div className="flex items-center justify-between gap-2 px-4 pt-0.5">
          {selectedItemType !== "audio" && (
            <button
              type="button"
              onClick={handleSplitSelected}
              disabled={!canSplitSelected}
              className="flex-1 flex flex-col items-center gap-1 disabled:opacity-35 group"
            >
              <div className="w-full h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-zinc-200">Böl</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={selectedItemType === "video" && clips.length <= 1}
            className="flex-1 flex flex-col items-center gap-1 disabled:opacity-35 group"
          >
            <div className="w-full h-11 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 flex items-center justify-center text-red-400 transition-all active:scale-95">
              <Trash2 className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-red-300">Sil</span>
          </button>

          {(selectedItemType === "video" || selectedItemType === "photo") && (
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

          {(selectedItemType === "video" || selectedItemType === "audio") && (
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
                Ses / Hız
              </span>
            </button>
          )}

          {selectedItemType !== "audio" && (
            <button
              type="button"
              onClick={handleDuplicateSelected}
              className="flex-1 flex flex-col items-center gap-1 group"
            >
              <div className="w-full h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                <Copy className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-zinc-200">
                Kopyala
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSelectItem(null, null)}
            className="flex flex-col items-center gap-1 shrink-0 group"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-zinc-300 transition-all active:scale-95">
              <X className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-zinc-400">Bitti</span>
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
            <span className="text-[11px] font-medium text-zinc-200">Metin</span>
          </button>

          {onOpenStickerSheet && (
            <button
              type="button"
              onClick={onOpenStickerSheet}
              className="flex flex-col items-center gap-1 shrink-0 group"
            >
              <div className="w-14 h-11 rounded-2xl bg-[#1c1c1e] group-hover:bg-[#26262a] flex items-center justify-center text-white transition-all active:scale-95">
                <Sticker className="w-4 h-4" />
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
                <ImageIcon className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-zinc-200">
                Fotoğraf
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenMusicPicker}
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
            <span className="text-[11px] font-medium text-zinc-200">Müzik</span>
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
              <Sparkles className="w-4 h-4" />
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
              <Palette className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-zinc-200">
              Filtre
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
// [END] CREATED BY Bedirhan
