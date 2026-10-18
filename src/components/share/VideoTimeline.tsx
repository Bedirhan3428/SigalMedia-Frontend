// [START] CREATED BY Bedirhan
"use client";

import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

export interface VideoTimelineProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  isPlaying: boolean;
  thumbnails: string[];
  onChangeTrim: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  const tenths = Math.floor((Math.max(0, sec) % 1) * 10);
  return `${mins}:${rem.toString().padStart(2, "0")}.${tenths}`;
}

type DragTarget = "start" | "end" | "scrub" | null;

export default function VideoTimeline({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  isPlaying,
  thumbnails,
  onChangeTrim,
  onSeek,
  onTogglePlay,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const wasPlayingRef = useRef<boolean>(false);

  const safeDuration = Math.max(0.1, Math.min(duration || 0.1, 60));
  const safeStart = Math.max(0, Math.min(trimStart, safeDuration - 0.1));
  const safeEnd = Math.max(safeStart + 0.1, Math.min(trimEnd || safeDuration, safeDuration));
  const safeCurrent = Math.max(safeStart, Math.min(currentTime, safeEnd));

  const startPct = (safeStart / safeDuration) * 100;
  const endPct = (safeEnd / safeDuration) * 100;
  const currentPct = (safeCurrent / safeDuration) * 100;
  const trimmedDuration = Math.max(0.1, safeEnd - safeStart);

  const clientXToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    return ratio * safeDuration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, target: DragTarget) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    wasPlayingRef.current = isPlaying;
    setDragTarget(target);

    if (target === "scrub") {
      const t = Math.max(safeStart, Math.min(safeEnd, clientXToTime(e.clientX)));
      onSeek(t);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragTarget) return;
    e.stopPropagation();
    const t = clientXToTime(e.clientX);

    if (dragTarget === "start") {
      const nextStart = Math.max(0, Math.min(t, safeEnd - 0.5));
      onChangeTrim(nextStart, safeEnd);
      onSeek(nextStart);
    } else if (dragTarget === "end") {
      const nextEnd = Math.max(safeStart + 0.5, Math.min(t, safeDuration));
      onChangeTrim(safeStart, nextEnd);
      onSeek(nextEnd);
    } else if (dragTarget === "scrub") {
      const nextTime = Math.max(safeStart, Math.min(safeEnd, t));
      onSeek(nextTime);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragTarget) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setDragTarget(null);
  };

  return (
    <div className="w-full flex flex-col gap-2.5 select-none touch-none">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={onTogglePlay}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition-all flex items-center justify-center text-white"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 tabular-nums">
          <span className="text-white">{formatTime(safeCurrent - safeStart)}</span>
          <span className="text-zinc-500">/</span>
          <span>{formatTime(trimmedDuration)}</span>
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={(e) => handlePointerDown(e, "scrub")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative h-14 w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/10 cursor-pointer touch-none"
      >
        {/* Küçük Resim Şeridi */}
        <div className="absolute inset-0 flex w-full h-full pointer-events-none">
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

        {/* Sol ve Sağ Kırpma Dışı Karartma */}
        <div
          className="absolute inset-y-0 left-0 bg-black/70 pointer-events-none"
          style={{ width: `${startPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/70 pointer-events-none"
          style={{ width: `${Math.max(0, 100 - endPct)}%` }}
        />

        {/* Aktif Kırpma Çerçevesi */}
        <div
          className="absolute inset-y-0 border-y-2 border-emerald-400 pointer-events-none"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
          }}
        />

        {/* Sol Tutamaç */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "start")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ left: `calc(${startPct}% - 10px)` }}
          className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
        >
          <div className="w-3.5 h-full rounded-l-md bg-emerald-400 flex items-center justify-center shadow-lg">
            <div className="w-0.5 h-5 rounded-full bg-black/70" />
          </div>
        </div>

        {/* Sağ Tutamaç */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "end")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ left: `calc(${endPct}% - 10px)` }}
          className="absolute inset-y-0 w-5 z-20 flex items-center justify-center cursor-ew-resize touch-none"
        >
          <div className="w-3.5 h-full rounded-r-md bg-emerald-400 flex items-center justify-center shadow-lg">
            <div className="w-0.5 h-5 rounded-full bg-black/70" />
          </div>
        </div>

        {/* Oynatma Çubuğu (Playhead) */}
        <div
          style={{ left: `${currentPct}%` }}
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] z-10 pointer-events-none"
        />
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
