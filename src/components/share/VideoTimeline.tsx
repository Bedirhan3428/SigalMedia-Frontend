// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  Plus,
  Sparkles,
  Music,
  Volume2,
  VolumeX,
  Undo2,
  Scissors,
  Trash2,
} from "lucide-react";
import {
  REELS_EFFECT_PRESETS,
  ReelsEffectClip,
  StoryAudioMeta,
} from "@/lib/canvas-editor";

export interface VideoTimelineProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  isPlaying: boolean;
  isMotionPhoto?: boolean;
  thumbnails: string[];
  muted?: boolean;
  getCurrentTime?: () => number;
  playheadRef?: React.RefObject<HTMLDivElement | null>;
  trackRef?: React.RefObject<HTMLDivElement | null>;
  timeLabelRef?: React.RefObject<HTMLSpanElement | null>;
  effectClips?: ReelsEffectClip[];
  selectedEffectClipId?: string | null;
  onSelectEffectClip?: (id: string | null) => void;
  onChangeEffectClips?: (clips: ReelsEffectClip[]) => void;
  musicClip?: StoryAudioMeta | null;
  onChangeMusicTimeline?: (
    timelineStart: number,
    timelineEnd: number,
    songOffset?: number
  ) => void;
  onChangeTrim: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onToggleMute?: () => void;
  onOpenMusicPicker?: () => void;
  onQuickAddEffectAtPlayhead?: () => void;
  splitTriggerRef?: React.MutableRefObject<(() => void) | null>;
}

export function formatTimelineTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, "0")}`;
}

type DragState =
  | { type: "scrub" }
  | {
      type: "video-start" | "video-end" | "video-move";
      initialPointerTime: number;
      initialStart: number;
      initialEnd: number;
      initialClientX: number;
      hasMoved: boolean;
    }
  | {
      type: "video-split-handle";
      splitIndex: number;
      initialPointerTime: number;
      initialSplitTime: number;
    }
  | {
      type: "fx-move" | "fx-start" | "fx-end";
      clipId: string;
      initialPointerTime: number;
      initialStart: number;
      initialEnd: number;
      initialClientX: number;
      hasMoved: boolean;
    }
  | {
      type: "audio-move" | "audio-start" | "audio-end";
      initialPointerTime: number;
      initialStart: number;
      initialEnd: number;
      initialSongOffset: number;
      initialClientX: number;
      hasMoved: boolean;
    }
  | {
      type: "audio-split-handle";
      splitIndex: number;
      initialPointerTime: number;
      initialSplitTime: number;
    }
  | null;

export default function VideoTimeline({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  isPlaying,
  isMotionPhoto = false,
  thumbnails,
  muted = false,
  getCurrentTime,
  playheadRef: externalPlayheadRef,
  trackRef: externalTrackRef,
  timeLabelRef: externalTimeLabelRef,
  effectClips = [],
  selectedEffectClipId = null,
  onSelectEffectClip,
  onChangeEffectClips,
  musicClip = null,
  onChangeMusicTimeline,
  onChangeTrim,
  onSeek,
  onTogglePlay,
  onToggleMute,
  onOpenMusicPicker,
  onQuickAddEffectAtPlayhead,
  splitTriggerRef,
}: VideoTimelineProps) {
  const internalTrackRef = useRef<HTMLDivElement | null>(null);
  const internalPlayheadRef = useRef<HTMLDivElement | null>(null);
  const internalTimeLabelRef = useRef<HTMLSpanElement | null>(null);

  const trackRef = externalTrackRef || internalTrackRef;
  const playheadRef = externalPlayheadRef || internalPlayheadRef;
  const timeLabelRef = externalTimeLabelRef || internalTimeLabelRef;

  const [dragState, setDragState] = useState<DragState>(null);
  const [selectedTrack, setSelectedTrack] = useState<"video" | "fx" | "audio">("video");

  // Bölme (Split) noktaları: klibin süresini düşürmeden 2 (veya daha fazla) parçaya ayırır
  const [videoSplits, setVideoSplits] = useState<number[]>([]);
  const [selectedVideoSegIdx, setSelectedVideoSegIdx] = useState<number>(0);

  const [audioSplits, setAudioSplits] = useState<number[]>([]);
  const [selectedAudioSegIdx, setSelectedAudioSegIdx] = useState<number>(0);

  const currentTimeRef = useRef<number>(currentTime);

  const baseDuration = Math.max(0.5, Math.min(duration || 5, 60));
  const safeStart = Math.max(0, Math.min(trimStart, 59.5));
  const safeEnd = Math.max(
    safeStart + 0.5,
    Math.min(trimEnd || baseDuration, isMotionPhoto ? 60 : baseDuration)
  );
  const trimmedDuration = Math.max(0.5, safeEnd - safeStart);

  const musicStart =
    musicClip && typeof musicClip.timelineStart === "number"
      ? Math.max(0, Math.min(musicClip.timelineStart, 59.5))
      : safeStart;
  const musicEnd =
    musicClip &&
    typeof musicClip.timelineEnd === "number" &&
    musicClip.timelineEnd > musicStart + 0.3
      ? Math.min(60, musicClip.timelineEnd)
      : safeEnd;

  // Görsel (isMotionPhoto) veya müzik uzatılırken sağda her zaman rahat kaydırma/uzatma alanı bırak
  const timelineSpan = useMemo(() => {
    const maxEdge = Math.max(
      safeEnd,
      musicClip ? musicEnd : 0,
      ...effectClips.map((c) => c.endTime)
    );
    if (isMotionPhoto) {
      return Math.min(60, Math.max(10, Math.ceil((maxEdge + 3) / 5) * 5));
    }
    return Math.max(baseDuration, maxEdge);
  }, [baseDuration, effectClips, isMotionPhoto, musicClip, musicEnd, safeEnd]);

  // Geçerli aralık içindeki video parçaları (Segments)
  const validVideoSplits = useMemo(
    () =>
      videoSplits
        .filter((pt) => pt > safeStart + 0.25 && pt < safeEnd - 0.25)
        .sort((a, b) => a - b),
    [safeEnd, safeStart, videoSplits]
  );

  const videoSegments = useMemo(() => {
    const pts = [safeStart, ...validVideoSplits, safeEnd];
    const segs: { index: number; start: number; end: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ index: i, start: pts[i], end: pts[i + 1] });
    }
    return segs;
  }, [safeEnd, safeStart, validVideoSplits]);

  // Geçerli aralık içindeki ses/müzik parçaları (Segments)
  const validAudioSplits = useMemo(
    () =>
      audioSplits
        .filter((pt) => pt > musicStart + 0.25 && pt < musicEnd - 0.25)
        .sort((a, b) => a - b),
    [audioSplits, musicEnd, musicStart]
  );

  const audioSegments = useMemo(() => {
    const pts = [musicStart, ...validAudioSplits, musicEnd];
    const segs: { index: number; start: number; end: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ index: i, start: pts[i], end: pts[i + 1] });
    }
    return segs;
  }, [musicEnd, musicStart, validAudioSplits]);

  // Playhead konumunu React state kullanmadan doğrudan DOM style.transform ile 60 FPS güncelle
  const syncPlayheadDom = useCallback(
    (rawTime: number) => {
      currentTimeRef.current = rawTime;
      const clamped = Math.max(0, Math.min(rawTime, timelineSpan));
      const trackEl = trackRef.current;
      const playheadEl = playheadRef.current;
      if (trackEl && playheadEl) {
        const trackW = trackEl.clientWidth || 1;
        const xPx = (clamped / timelineSpan) * trackW;
        playheadEl.style.transform = `translate3d(${xPx.toFixed(2)}px, 0, 0)`;
      }
      if (timeLabelRef.current) {
        const rel = Math.max(0, Math.min(trimmedDuration, clamped - safeStart));
        timeLabelRef.current.textContent = formatTimelineTime(rel);
      }
    },
    [playheadRef, safeStart, timeLabelRef, timelineSpan, trackRef, trimmedDuration]
  );

  useEffect(() => {
    const t = getCurrentTime ? getCurrentTime() : currentTime;
    syncPlayheadDom(t);
  }, [currentTime, getCurrentTime, syncPlayheadDom]);

  useEffect(() => {
    if (!isPlaying || !getCurrentTime) return;
    let rafId: number | null = null;

    const loop = () => {
      syncPlayheadDom(getCurrentTime());
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, getCurrentTime, syncPlayheadDom]);

  const clientXToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    return ratio * timelineSpan;
  };

  const getActivePlayheadTime = useCallback((): number => {
    const raw = getCurrentTime ? getCurrentTime() : currentTimeRef.current;
    return Math.max(0, Math.min(timelineSpan, raw));
  }, [getCurrentTime, timelineSpan]);

  // BÖL (SPLIT) İŞLEMİ: Klibin süresini düşürmez, playhead noktasından 2 parçaya ayırır!
  const handleSplitAction = useCallback(() => {
    const cur = getActivePlayheadTime();

    // 1. Seçili Efekt klibi varsa 2 ayrı efekt klibine böl
    if (selectedTrack === "fx" && selectedEffectClipId && onChangeEffectClips) {
      const target = effectClips.find((c) => c.id === selectedEffectClipId);
      if (target) {
        const splitPt =
          cur > target.startTime + 0.2 && cur < target.endTime - 0.2
            ? cur
            : (target.startTime + target.endTime) / 2;
        if (splitPt > target.startTime + 0.15 && splitPt < target.endTime - 0.15) {
          const firstHalf: ReelsEffectClip = {
            ...target,
            endTime: Number(splitPt.toFixed(2)),
          };
          const secondHalf: ReelsEffectClip = {
            ...target,
            id: `fx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            startTime: Number(splitPt.toFixed(2)),
          };
          onChangeEffectClips(
            effectClips.flatMap((c) =>
              c.id === target.id ? [firstHalf, secondHalf] : [c]
            )
          );
          onSelectEffectClip?.(secondHalf.id);
          return;
        }
      }
    }

    // 2. Seçili Ses/Müzik kanalıysa şarkıyı 2 parçaya ayır (süresi düşmez)
    if (selectedTrack === "audio" && musicClip) {
      const splitPt =
        cur > musicStart + 0.25 && cur < musicEnd - 0.25
          ? cur
          : (musicStart + musicEnd) / 2;
      if (
        splitPt > musicStart + 0.2 &&
        splitPt < musicEnd - 0.2 &&
        !validAudioSplits.some((p) => Math.abs(p - splitPt) < 0.2)
      ) {
        const nextSplits = [...validAudioSplits, Number(splitPt.toFixed(2))].sort(
          (a, b) => a - b
        );
        setAudioSplits(nextSplits);
        setSelectedAudioSegIdx(nextSplits.indexOf(Number(splitPt.toFixed(2))) + 1);
      }
      return;
    }

    // 3. Video / Görsel kanalını 2 parçaya ayır (süresi düşmez!)
    const splitPt =
      cur > safeStart + 0.25 && cur < safeEnd - 0.25
        ? cur
        : (safeStart + safeEnd) / 2;
    if (
      splitPt > safeStart + 0.2 &&
      splitPt < safeEnd - 0.2 &&
      !validVideoSplits.some((p) => Math.abs(p - splitPt) < 0.2)
    ) {
      const rounded = Number(splitPt.toFixed(2));
      const nextSplits = [...validVideoSplits, rounded].sort((a, b) => a - b);
      setVideoSplits(nextSplits);
      setSelectedTrack("video");
      setSelectedVideoSegIdx(nextSplits.indexOf(rounded) + 1);
    }
  }, [
    effectClips,
    getActivePlayheadTime,
    musicClip,
    musicEnd,
    musicStart,
    onChangeEffectClips,
    onSelectEffectClip,
    safeEnd,
    safeStart,
    selectedEffectClipId,
    selectedTrack,
    validAudioSplits,
    validVideoSplits,
  ]);

  // ReelsEditor alt barındaki "Kes" butonu da aynı ikiye bölme fonksiyonunu tetiklesin
  useEffect(() => {
    if (splitTriggerRef) {
      splitTriggerRef.current = handleSplitAction;
    }
  }, [handleSplitAction, splitTriggerRef]);

  const handleResetAllTrims = () => {
    setVideoSplits([]);
    setAudioSplits([]);
    setSelectedVideoSegIdx(0);
    setSelectedAudioSegIdx(0);
    onChangeTrim(0, isMotionPhoto ? 5 : baseDuration);
    if (musicClip && onChangeMusicTimeline) {
      onChangeMusicTimeline(0, isMotionPhoto ? 5 : baseDuration, musicClip.startTime || 0);
    }
    syncPlayheadDom(0);
    onSeek(0);
  };

  // Seçili parçayı (Efekt veya bölünmüş Video/Ses parçası) silme
  const handleDeleteSelectedPiece = () => {
    if (selectedTrack === "fx" && selectedEffectClipId && onChangeEffectClips) {
      onChangeEffectClips(effectClips.filter((c) => c.id !== selectedEffectClipId));
      onSelectEffectClip?.(null);
      return;
    }
    if (selectedTrack === "audio" && audioSegments.length > 1 && onChangeMusicTimeline) {
      const seg = audioSegments[selectedAudioSegIdx] || audioSegments[0];
      if (seg.index === 0) {
        const nextStart = seg.end;
        const delta = Math.max(0, nextStart - musicStart);
        setAudioSplits(validAudioSplits.slice(1));
        setSelectedAudioSegIdx(0);
        onChangeMusicTimeline(
          Number(nextStart.toFixed(2)),
          Number(musicEnd.toFixed(2)),
          Number(((musicClip?.startTime || 0) + delta).toFixed(2))
        );
      } else if (seg.index === audioSegments.length - 1) {
        const nextEnd = seg.start;
        setAudioSplits(validAudioSplits.slice(0, -1));
        setSelectedAudioSegIdx(Math.max(0, seg.index - 1));
        onChangeMusicTimeline(
          Number(musicStart.toFixed(2)),
          Number(nextEnd.toFixed(2)),
          musicClip?.startTime || 0
        );
      }
      return;
    }
    if (selectedTrack === "video" && videoSegments.length > 1) {
      const seg = videoSegments[selectedVideoSegIdx] || videoSegments[0];
      if (seg.index === 0) {
        const nextStart = seg.end;
        setVideoSplits(validVideoSplits.slice(1));
        setSelectedVideoSegIdx(0);
        onChangeTrim(Number(nextStart.toFixed(2)), safeEnd);
        syncPlayheadDom(nextStart);
        onSeek(nextStart);
      } else if (seg.index === videoSegments.length - 1) {
        const nextEnd = seg.start;
        setVideoSplits(validVideoSplits.slice(0, -1));
        setSelectedVideoSegIdx(Math.max(0, seg.index - 1));
        onChangeTrim(safeStart, Number(nextEnd.toFixed(2)));
        syncPlayheadDom(nextEnd);
        onSeek(nextEnd);
      }
    }
  };

  const beginDrag = (e: React.PointerEvent<HTMLElement>, state: DragState) => {
    e.stopPropagation();
    const container = trackRef.current;
    if (container) {
      try {
        container.setPointerCapture(e.pointerId);
      } catch {}
    }
    setDragState(state);

    if (state?.type === "scrub") {
      const t = Math.max(0, Math.min(timelineSpan, clientXToTime(e.clientX)));
      syncPlayheadDom(t);
      onSeek(Math.max(safeStart, Math.min(safeEnd, t)));
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    e.stopPropagation();
    const t = clientXToTime(e.clientX);
    const maxAllowed = isMotionPhoto ? 60 : baseDuration;

    if (dragState.type === "scrub") {
      const nextTime = Math.max(0, Math.min(timelineSpan, t));
      syncPlayheadDom(nextTime);
      onSeek(Math.max(safeStart, Math.min(safeEnd, nextTime)));
      return;
    }

    if (
      dragState.type === "video-start" ||
      dragState.type === "video-end" ||
      dragState.type === "video-move"
    ) {
      const movedPx = Math.abs(e.clientX - dragState.initialClientX);
      if (movedPx > 3 && !dragState.hasMoved) {
        dragState.hasMoved = true;
      }
      const delta = t - dragState.initialPointerTime;
      const clipLen = Math.max(0.5, dragState.initialEnd - dragState.initialStart);

      if (dragState.type === "video-start") {
        const maxStart =
          validVideoSplits.length > 0
            ? validVideoSplits[0] - 0.25
            : dragState.initialEnd - 0.5;
        const nextStart = Math.max(0, Math.min(maxStart, dragState.initialStart + delta));
        onChangeTrim(Number(nextStart.toFixed(2)), dragState.initialEnd);
        syncPlayheadDom(nextStart);
        onSeek(nextStart);
      } else if (dragState.type === "video-end") {
        const minEnd =
          validVideoSplits.length > 0
            ? validVideoSplits[validVideoSplits.length - 1] + 0.25
            : dragState.initialStart + 0.5;
        const nextEnd = Math.max(
          minEnd,
          Math.min(maxAllowed, dragState.initialEnd + delta)
        );
        onChangeTrim(dragState.initialStart, Number(nextEnd.toFixed(2)));
        syncPlayheadDom(nextEnd);
        onSeek(nextEnd);
      } else if (dragState.type === "video-move" && dragState.hasMoved) {
        const nextStart = Math.max(
          0,
          Math.min(maxAllowed - clipLen, dragState.initialStart + delta)
        );
        const shift = nextStart - dragState.initialStart;
        if (validVideoSplits.length > 0) {
          setVideoSplits(validVideoSplits.map((pt) => Number((pt + shift).toFixed(2))));
        }
        onChangeTrim(
          Number(nextStart.toFixed(2)),
          Number((nextStart + clipLen).toFixed(2))
        );
        syncPlayheadDom(nextStart);
      }
      return;
    }

    if (dragState.type === "video-split-handle") {
      const delta = t - dragState.initialPointerTime;
      const prevBound =
        dragState.splitIndex > 0
          ? validVideoSplits[dragState.splitIndex - 1] + 0.25
          : safeStart + 0.25;
      const nextBound =
        dragState.splitIndex < validVideoSplits.length - 1
          ? validVideoSplits[dragState.splitIndex + 1] - 0.25
          : safeEnd - 0.25;
      const nextSplit = Math.max(
        prevBound,
        Math.min(nextBound, dragState.initialSplitTime + delta)
      );
      setVideoSplits(
        validVideoSplits.map((pt, idx) =>
          idx === dragState.splitIndex ? Number(nextSplit.toFixed(2)) : pt
        )
      );
      syncPlayheadDom(nextSplit);
      onSeek(nextSplit);
      return;
    }

    if (
      (dragState.type === "fx-move" ||
        dragState.type === "fx-start" ||
        dragState.type === "fx-end") &&
      onChangeEffectClips
    ) {
      const movedPx = Math.abs(e.clientX - dragState.initialClientX);
      if (movedPx > 3 && !dragState.hasMoved) {
        dragState.hasMoved = true;
      }
      const delta = t - dragState.initialPointerTime;
      const clipLen = Math.max(0.25, dragState.initialEnd - dragState.initialStart);

      onChangeEffectClips(
        effectClips.map((c) => {
          if (c.id !== dragState.clipId) return c;
          if (dragState.type === "fx-move") {
            const nextStart = Math.max(
              0,
              Math.min(maxAllowed - clipLen, dragState.initialStart + delta)
            );
            return {
              ...c,
              startTime: Number(nextStart.toFixed(2)),
              endTime: Number((nextStart + clipLen).toFixed(2)),
            };
          }
          if (dragState.type === "fx-start") {
            const nextStart = Math.max(
              0,
              Math.min(dragState.initialEnd - 0.25, dragState.initialStart + delta)
            );
            return { ...c, startTime: Number(nextStart.toFixed(2)) };
          }
          const nextEnd = Math.max(
            dragState.initialStart + 0.25,
            Math.min(maxAllowed, dragState.initialEnd + delta)
          );
          return { ...c, endTime: Number(nextEnd.toFixed(2)) };
        })
      );
      return;
    }

    if (
      (dragState.type === "audio-move" ||
        dragState.type === "audio-start" ||
        dragState.type === "audio-end") &&
      onChangeMusicTimeline
    ) {
      const movedPx = Math.abs(e.clientX - dragState.initialClientX);
      if (movedPx > 3 && !dragState.hasMoved) {
        dragState.hasMoved = true;
      }
      const delta = t - dragState.initialPointerTime;
      const clipLen = Math.max(0.3, dragState.initialEnd - dragState.initialStart);

      if (dragState.type === "audio-move") {
        const nextStart = Math.max(
          0,
          Math.min(maxAllowed - clipLen, dragState.initialStart + delta)
        );
        const shift = nextStart - dragState.initialStart;
        if (validAudioSplits.length > 0) {
          setAudioSplits(validAudioSplits.map((pt) => Number((pt + shift).toFixed(2))));
        }
        onChangeMusicTimeline(
          Number(nextStart.toFixed(2)),
          Number((nextStart + clipLen).toFixed(2)),
          dragState.initialSongOffset
        );
      } else if (dragState.type === "audio-start") {
        const maxStart =
          validAudioSplits.length > 0
            ? validAudioSplits[0] - 0.25
            : dragState.initialEnd - 0.3;
        const nextStart = Math.max(
          0,
          Math.min(maxStart, dragState.initialStart + delta)
        );
        const startShift = nextStart - dragState.initialStart;
        onChangeMusicTimeline(
          Number(nextStart.toFixed(2)),
          Number(dragState.initialEnd.toFixed(2)),
          Number(Math.max(0, dragState.initialSongOffset + startShift).toFixed(2))
        );
      } else {
        const minEnd =
          validAudioSplits.length > 0
            ? validAudioSplits[validAudioSplits.length - 1] + 0.25
            : dragState.initialStart + 0.3;
        const nextEnd = Math.max(
          minEnd,
          Math.min(maxAllowed, dragState.initialEnd + delta)
        );
        onChangeMusicTimeline(
          Number(dragState.initialStart.toFixed(2)),
          Number(nextEnd.toFixed(2)),
          dragState.initialSongOffset
        );
      }
      return;
    }

    if (dragState.type === "audio-split-handle") {
      const delta = t - dragState.initialPointerTime;
      const prevBound =
        dragState.splitIndex > 0
          ? validAudioSplits[dragState.splitIndex - 1] + 0.25
          : musicStart + 0.25;
      const nextBound =
        dragState.splitIndex < validAudioSplits.length - 1
          ? validAudioSplits[dragState.splitIndex + 1] - 0.25
          : musicEnd - 0.25;
      const nextSplit = Math.max(
        prevBound,
        Math.min(nextBound, dragState.initialSplitTime + delta)
      );
      setAudioSplits(
        validAudioSplits.map((pt, idx) =>
          idx === dragState.splitIndex ? Number(nextSplit.toFixed(2)) : pt
        )
      );
      syncPlayheadDom(nextSplit);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    e.stopPropagation();

    // Eğer kullanıcı klibi sürüklemeden sadece dokunduysa, playhead'i o noktaya taşı!
    if (
      (dragState.type === "video-move" ||
        dragState.type === "audio-move" ||
        dragState.type === "fx-move") &&
      !dragState.hasMoved
    ) {
      const clickTime = Math.max(safeStart, Math.min(safeEnd, clientXToTime(e.clientX)));
      syncPlayheadDom(clickTime);
      onSeek(clickTime);
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setDragState(null);
  };

  const canDeleteSelectedPiece =
    (selectedTrack === "fx" && Boolean(selectedEffectClipId)) ||
    (selectedTrack === "video" && videoSegments.length > 1) ||
    (selectedTrack === "audio" && audioSegments.length > 1);

  // Zaman cetveli etiketleri (1sn • 3sn • 5sn)
  const tickMarks = [
    Math.max(1, Math.round(timelineSpan * 0.2)),
    Math.max(2, Math.round(timelineSpan * 0.5)),
    Math.max(3, Math.round(timelineSpan * 0.8)),
  ];

  return (
    <div className="w-full flex flex-col gap-3 select-none touch-none">
      {/* 1. Ferah Oynatma & Zaman Kontrol Satırı */}
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          onClick={onTogglePlay}
          className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all flex items-center justify-center text-white"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-white" />
          ) : (
            <Play className="w-4 h-4 fill-white ml-0.5" />
          )}
        </button>

        <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 tabular-nums">
          <span ref={timeLabelRef} className="text-zinc-200">
            {formatTimelineTime(Math.max(0, currentTime - safeStart))}
          </span>
          <span>/</span>
          <span>{formatTimelineTime(trimmedDuration)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetAllTrims}
            title="Sıfırla"
            className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all flex items-center justify-center text-zinc-300"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {canDeleteSelectedPiece && (
            <button
              type="button"
              onClick={handleDeleteSelectedPiece}
              title="Seçili Parçayı Sil"
              className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/30 active:scale-90 transition-all flex items-center justify-center text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSplitAction}
            title="İki Parçaya Böl"
            className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-[#28282c] active:scale-90 transition-all flex items-center justify-center text-zinc-200"
          >
            <Scissors className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Ferah Çok Kanallı Timeline Alanı */}
      <div className="w-full border-t border-white/10 pt-2">
        <div className="flex items-stretch w-full">
          {/* Sol Kanal İkon Sütunu (Ses Kapat/Aç) */}
          <div className="w-12 shrink-0 flex flex-col gap-1.5 pt-6 pr-1.5">
            <div className="h-14 rounded-r-md bg-[#16171b] flex items-center justify-center">
              {onToggleMute ? (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-zinc-300" />
                  )}
                </button>
              ) : (
                <Volume2 className="w-4 h-4 text-zinc-400" />
              )}
            </div>
            <div className="h-9 rounded-r-md bg-[#16171b]" />
            <div className="h-9 rounded-r-md bg-[#16171b]" />
          </div>

          {/* Sağ Interaktif Zaman Çizelgesi Gövdesi */}
          <div
            ref={trackRef}
            onPointerDown={(e) => {
              beginDrag(e, { type: "scrub" });
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative flex-1 flex flex-col gap-1.5 cursor-pointer touch-none pr-3"
          >
            {/* Üst Saniye Cetveli (Dokunarak/Sürükleyerek Playhead Taşınır) */}
            <div className="h-5 flex items-center justify-evenly text-[11px] font-medium text-zinc-400 select-none">
              <span>{tickMarks[0]}sn</span>
              <span className="text-zinc-600">•</span>
              <span>{tickMarks[1]}sn</span>
              <span className="text-zinc-600">•</span>
              <span>{tickMarks[2]}sn</span>
            </div>

            {/* 1. KANAL: VİDEO / GÖRSEL FİLM ŞERİDİ (Bölünebilir, Uzatılıp Kısaltılabilir, Sağa/Sola Kaydırılabilir) */}
            <div
              onClick={() => setSelectedTrack("video")}
              className="relative h-14 w-full rounded-md overflow-visible bg-[#16171b]"
            >
              {/* Parçalar (Bölündüğünde 2 veya daha fazla bağımsız parça olarak görünür) */}
              {videoSegments.map((seg) => {
                const segStartPct = (seg.start / timelineSpan) * 100;
                const segEndPct = (seg.end / timelineSpan) * 100;
                const isSelectedSeg =
                  selectedTrack === "video" && selectedVideoSegIdx === seg.index;

                return (
                  <div
                    key={`vseg-${seg.index}`}
                    onPointerDown={(e) => {
                      setSelectedTrack("video");
                      setSelectedVideoSegIdx(seg.index);
                      onSelectEffectClip?.(null);
                      beginDrag(e, {
                        type: "video-move",
                        initialPointerTime: clientXToTime(e.clientX),
                        initialStart: safeStart,
                        initialEnd: safeEnd,
                        initialClientX: e.clientX,
                        hasMoved: false,
                      });
                    }}
                    style={{
                      left: `${segStartPct}%`,
                      width: `${Math.max(2, segEndPct - segStartPct)}%`,
                    }}
                    className={`absolute inset-y-0 rounded-md overflow-hidden cursor-grab active:cursor-grabbing border-2 transition-colors ${
                      isSelectedSeg
                        ? "border-white z-10 shadow-md"
                        : "border-white/30 z-0"
                    }`}
                  >
                    <div className="w-full h-full flex pointer-events-none">
                      {thumbnails.length > 0 ? (
                        thumbnails.map((src, idx) => (
                          <img
                            key={idx}
                            src={src}
                            alt=""
                            draggable={false}
                            className="h-full flex-1 object-cover select-none"
                          />
                        ))
                      ) : (
                        <div className="w-full h-full bg-zinc-800/70" />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Bölme (Split) Noktası Ayırıcı Tutamaçları */}
              {validVideoSplits.map((splitPt, idx) => {
                const splitPct = (splitPt / timelineSpan) * 100;
                return (
                  <div
                    key={`vsplit-${idx}`}
                    onPointerDown={(e) => {
                      setSelectedTrack("video");
                      setSelectedVideoSegIdx(idx + 1);
                      beginDrag(e, {
                        type: "video-split-handle",
                        splitIndex: idx,
                        initialPointerTime: clientXToTime(e.clientX),
                        initialSplitTime: splitPt,
                      });
                    }}
                    style={{ left: `calc(${splitPct}% - 6px)` }}
                    className="absolute inset-y-0 w-3 z-20 flex items-center justify-center cursor-ew-resize touch-none"
                  >
                    <div className="w-1.5 h-full bg-black border-x border-white/80 shadow" />
                  </div>
                );
              })}

              {/* Sol Beyaz Hap Tutamaç (Kısalt / Uzat) */}
              <div
                onPointerDown={(e) => {
                  setSelectedTrack("video");
                  setSelectedVideoSegIdx(0);
                  beginDrag(e, {
                    type: "video-start",
                    initialPointerTime: clientXToTime(e.clientX),
                    initialStart: safeStart,
                    initialEnd: safeEnd,
                    initialClientX: e.clientX,
                    hasMoved: true,
                  });
                }}
                style={{ left: `calc(${(safeStart / timelineSpan) * 100}% - 10px)` }}
                className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
              >
                <div className="w-4 h-7 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                </div>
              </div>

              {/* Sağ Beyaz Hap Tutamaç (Uzat / Kısalt) */}
              <div
                onPointerDown={(e) => {
                  setSelectedTrack("video");
                  setSelectedVideoSegIdx(videoSegments.length - 1);
                  beginDrag(e, {
                    type: "video-end",
                    initialPointerTime: clientXToTime(e.clientX),
                    initialStart: safeStart,
                    initialEnd: safeEnd,
                    initialClientX: e.clientX,
                    hasMoved: true,
                  });
                }}
                style={{ left: `calc(${(safeEnd / timelineSpan) * 100}% - 10px)` }}
                className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
              >
                <div className="w-4 h-7 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                  <div className="w-0.5 h-3 bg-zinc-700 rounded-full mx-[1px]" />
                </div>
              </div>
            </div>

            {/* 2. KANAL: SES / MÜZİK ŞERİDİ ("+ Ses ekle" veya Sürüklenebilir / Uzatılabilir / Bölünebilir Şarkı) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTrack("audio");
                onSelectEffectClip?.(null);
              }}
              className="relative h-9 w-full rounded-md bg-[#16171b] overflow-visible flex items-center"
            >
              {!musicClip ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMusicPicker?.();
                  }}
                  className="w-full h-full px-3 flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4 text-zinc-400" />
                  <span>Ses ekle</span>
                </button>
              ) : (
                <>
                  {audioSegments.map((seg) => {
                    const segStartPct = (seg.start / timelineSpan) * 100;
                    const segEndPct = (seg.end / timelineSpan) * 100;
                    const isSelectedAudioSeg =
                      selectedTrack === "audio" && selectedAudioSegIdx === seg.index;

                    return (
                      <div
                        key={`aseg-${seg.index}`}
                        onPointerDown={(e) => {
                          setSelectedTrack("audio");
                          setSelectedAudioSegIdx(seg.index);
                          onSelectEffectClip?.(null);
                          beginDrag(e, {
                            type: "audio-move",
                            initialPointerTime: clientXToTime(e.clientX),
                            initialStart: musicStart,
                            initialEnd: musicEnd,
                            initialSongOffset: musicClip.startTime || 0,
                            initialClientX: e.clientX,
                            hasMoved: false,
                          });
                        }}
                        style={{
                          left: `${segStartPct}%`,
                          width: `${Math.max(4, segEndPct - segStartPct)}%`,
                        }}
                        className={`absolute inset-y-0.5 rounded-md bg-purple-600/40 border flex items-center justify-between px-3 cursor-grab active:cursor-grabbing ${
                          isSelectedAudioSeg
                            ? "border-white ring-1 ring-white/50 z-10"
                            : "border-purple-400/60 z-0"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden pointer-events-none w-full justify-between px-1">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <Music className="w-3 h-3 text-purple-200 shrink-0" />
                            <span className="text-xs font-semibold text-purple-100 truncate">
                              {musicClip.title}
                            </span>
                          </div>
                          {seg.index === 0 && (
                            <span className="text-[10px] font-medium text-purple-200/80 tabular-nums shrink-0">
                              +{Math.round(musicClip.startTime || 0)}s
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Ses Bölme Noktası Tutamaçları */}
                  {validAudioSplits.map((splitPt, idx) => {
                    const splitPct = (splitPt / timelineSpan) * 100;
                    return (
                      <div
                        key={`asplit-${idx}`}
                        onPointerDown={(e) => {
                          setSelectedTrack("audio");
                          setSelectedAudioSegIdx(idx + 1);
                          beginDrag(e, {
                            type: "audio-split-handle",
                            splitIndex: idx,
                            initialPointerTime: clientXToTime(e.clientX),
                            initialSplitTime: splitPt,
                          });
                        }}
                        style={{ left: `calc(${splitPct}% - 6px)` }}
                        className="absolute inset-y-0 w-3 z-20 flex items-center justify-center cursor-ew-resize touch-none"
                      >
                        <div className="w-1.5 h-full bg-black border-x border-purple-200 shadow" />
                      </div>
                    );
                  })}

                  {/* Sol Ses Uzatma/Kısaltma Hap Tutamacı */}
                  <div
                    onPointerDown={(e) => {
                      setSelectedTrack("audio");
                      setSelectedAudioSegIdx(0);
                      beginDrag(e, {
                        type: "audio-start",
                        initialPointerTime: clientXToTime(e.clientX),
                        initialStart: musicStart,
                        initialEnd: musicEnd,
                        initialSongOffset: musicClip.startTime || 0,
                        initialClientX: e.clientX,
                        hasMoved: true,
                      });
                    }}
                    style={{ left: `calc(${(musicStart / timelineSpan) * 100}% - 8px)` }}
                    className="absolute inset-y-0 w-4 z-20 flex items-center justify-center cursor-ew-resize touch-none"
                  >
                    <div className="w-2.5 h-6 rounded-full bg-white shadow-md" />
                  </div>

                  {/* Sağ Ses Uzatma/Kısaltma Hap Tutamacı */}
                  <div
                    onPointerDown={(e) => {
                      setSelectedTrack("audio");
                      setSelectedAudioSegIdx(audioSegments.length - 1);
                      beginDrag(e, {
                        type: "audio-end",
                        initialPointerTime: clientXToTime(e.clientX),
                        initialStart: musicStart,
                        initialEnd: musicEnd,
                        initialSongOffset: musicClip.startTime || 0,
                        initialClientX: e.clientX,
                        hasMoved: true,
                      });
                    }}
                    style={{ left: `calc(${(musicEnd / timelineSpan) * 100}% - 8px)` }}
                    className="absolute inset-y-0 w-4 z-20 flex items-center justify-center cursor-ew-resize touch-none"
                  >
                    <div className="w-2.5 h-6 rounded-full bg-white shadow-md" />
                  </div>
                </>
              )}
            </div>

            {/* 3. KANAL: EFEKT ŞERİDİ ("+ Efekt ekle" veya Sürüklenebilir / Uzatılabilir FX Klipleri) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTrack("fx");
              }}
              className="relative h-9 w-full rounded-md bg-[#16171b] overflow-visible flex items-center"
            >
              {effectClips.length === 0 ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTrack("fx");
                    onQuickAddEffectAtPlayhead?.();
                  }}
                  className="w-full h-full px-3 flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4 text-zinc-400" />
                  <span>Efekt ekle</span>
                </button>
              ) : (
                effectClips.map((clip) => {
                  const preset = REELS_EFFECT_PRESETS.find((p) => p.id === clip.effect);
                  const cStartPct = (Math.max(0, clip.startTime) / timelineSpan) * 100;
                  const cEndPct =
                    (Math.min(
                      timelineSpan,
                      Math.max(clip.startTime + 0.2, clip.endTime)
                    ) /
                      timelineSpan) *
                    100;
                  const isSelected = selectedEffectClipId === clip.id;
                  const color = preset?.color || "#ec4899";

                  return (
                    <div
                      key={clip.id}
                      onPointerDown={(e) => {
                        setSelectedTrack("fx");
                        onSelectEffectClip?.(clip.id);
                        beginDrag(e, {
                          type: "fx-move",
                          clipId: clip.id,
                          initialPointerTime: clientXToTime(e.clientX),
                          initialStart: clip.startTime,
                          initialEnd: clip.endTime,
                          initialClientX: e.clientX,
                          hasMoved: false,
                        });
                      }}
                      style={{
                        left: `${cStartPct}%`,
                        width: `${Math.max(5, cEndPct - cStartPct)}%`,
                        backgroundColor: `${color}40`,
                        borderColor: isSelected ? "#ffffff" : color,
                      }}
                      className={`absolute inset-y-0.5 rounded-md border flex items-center justify-between px-2.5 cursor-grab active:cursor-grabbing z-10 select-none ${
                        isSelected ? "ring-1 ring-white shadow-md" : ""
                      }`}
                    >
                      <div
                        onPointerDown={(e) => {
                          setSelectedTrack("fx");
                          onSelectEffectClip?.(clip.id);
                          beginDrag(e, {
                            type: "fx-start",
                            clipId: clip.id,
                            initialPointerTime: clientXToTime(e.clientX),
                            initialStart: clip.startTime,
                            initialEnd: clip.endTime,
                            initialClientX: e.clientX,
                            hasMoved: true,
                          });
                        }}
                        className="absolute inset-y-0 -left-1.5 w-4 flex items-center justify-center cursor-ew-resize z-20"
                      >
                        <div className="w-2 h-5 rounded-full bg-white shadow" />
                      </div>

                      <div className="flex items-center gap-1.5 overflow-hidden pointer-events-none mx-auto">
                        <Sparkles className="w-3 h-3 text-white shrink-0" />
                        <span className="text-xs font-semibold text-white truncate">
                          {preset?.name || clip.effect}
                        </span>
                      </div>

                      <div
                        onPointerDown={(e) => {
                          setSelectedTrack("fx");
                          onSelectEffectClip?.(clip.id);
                          beginDrag(e, {
                            type: "fx-end",
                            clipId: clip.id,
                            initialPointerTime: clientXToTime(e.clientX),
                            initialStart: clip.startTime,
                            initialEnd: clip.endTime,
                            initialClientX: e.clientX,
                            hasMoved: true,
                          });
                        }}
                        className="absolute inset-y-0 -right-1.5 w-4 flex items-center justify-center cursor-ew-resize z-20"
                      >
                        <div className="w-2 h-5 rounded-full bg-white shadow" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Oynatma Çubuğu (Playhead) - Cetvelden en alt kanala kadar uzanan ince beyaz çizgi */}
            <div
              ref={playheadRef}
              style={{
                left: 0,
                transform: "translate3d(0px, 0, 0)",
                willChange: "transform",
              }}
              className="absolute inset-y-0 w-[2px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] z-30 pointer-events-none"
            >
              <div className="w-2 h-2 rounded-full bg-white -ml-[3px] mt-1.5 shadow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan



