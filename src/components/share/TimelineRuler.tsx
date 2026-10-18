// [START] CREATED BY Bedirhan
"use client";

import React from "react";

export interface TimelineRulerProps {
  totalDuration: number;
  pps: number;
  onSeekToTime?: (time: number) => void;
}

export function formatRulerLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function TimelineRuler({
  totalDuration,
  pps,
  onSeekToTime,
}: TimelineRulerProps) {
  // En az 10 saniye veya toplam süre + 5sn uzatma payı kadar cetvel çizilir
  const totalSeconds = Math.max(10, Math.ceil(totalDuration + 5));
  const rulerWidthPx = totalSeconds * pps;

  const ticks: number[] = [];
  for (let s = 0; s <= totalSeconds; s++) {
    ticks.push(s);
  }

  return (
    <div
      className="relative h-6 select-none cursor-pointer"
      style={{ width: `${rulerWidthPx}px` }}
      onClick={(e) => {
        if (!onSeekToTime) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = Math.max(0, e.clientX - rect.left);
        const targetSec = Math.max(0, Math.min(totalDuration, clickX / pps));
        onSeekToTime(Number(targetSec.toFixed(2)));
      }}
    >
      {ticks.map((sec) => {
        const leftPx = sec * pps;
        const isWithinActive = sec <= Math.ceil(totalDuration);
        return (
          <React.Fragment key={sec}>
            {/* Ana Saniye İşareti */}
            <div
              className="absolute top-0 bottom-0 flex flex-col items-center -translate-x-1/2 pointer-events-none"
              style={{ left: `${leftPx}px` }}
            >
              <span
                className={`text-[10px] font-medium tabular-nums leading-none ${
                  isWithinActive ? "text-zinc-400" : "text-zinc-600"
                }`}
              >
                {formatRulerLabel(sec)}
              </span>
              <div
                className={`w-[1px] h-2 mt-1 ${
                  isWithinActive ? "bg-zinc-500" : "bg-zinc-800"
                }`}
              />
            </div>

            {/* Yarım Saniye Noktası (0.5sn) */}
            {sec < totalSeconds && (
              <div
                className="absolute top-2.5 -translate-x-1/2 pointer-events-none flex items-center justify-center"
                style={{ left: `${leftPx + pps * 0.5}px` }}
              >
                <div
                  className={`w-1 h-1 rounded-full ${
                    isWithinActive ? "bg-zinc-600" : "bg-zinc-800"
                  }`}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
// [END] CREATED BY Bedirhan
