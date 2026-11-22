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

function TimelineRuler({
  totalDuration,
  pps,
  onSeekToTime,
}: TimelineRulerProps) {
  // Cetvel içerik sonunda biter (sonrasında boş kaydırma alanı yok)
  const rulerWidthPx = Math.max(1, totalDuration * pps);
  const lastLabelSec = Math.floor(totalDuration);

  const labels: number[] = [];
  for (let s = 0; s <= lastLabelSec; s++) {
    labels.push(s);
  }

  // Saniye çizgileri ve yarım saniye noktaları CSS gradient ile çizilir (saniye başına DOM düğümü yok)
  const tickStyle: React.CSSProperties = {
    width: `${rulerWidthPx}px`,
    backgroundImage:
      "linear-gradient(to right, #71717a 1px, transparent 1px), radial-gradient(circle at center, #52525b 2px, transparent 2.5px)",
    backgroundSize: `${pps}px 8px, ${pps}px 4px`,
    backgroundPosition: "0 18px, 0 10px",
    backgroundRepeat: "repeat-x, repeat-x",
  };

  return (
    <div
      className="relative h-6 select-none cursor-pointer"
      style={tickStyle}
      onClick={(e) => {
        if (!onSeekToTime) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = Math.max(0, e.clientX - rect.left);
        const targetSec = Math.max(0, Math.min(totalDuration, clickX / pps));
        onSeekToTime(Number(targetSec.toFixed(2)));
      }}
    >
      {labels.map((sec) => (
        <span
          key={sec}
          className="absolute top-0 -translate-x-1/2 text-[10px] font-medium tabular-nums leading-none text-[var(--ed-tx2,#98a2b3)] pointer-events-none"
          style={{ left: `${sec * pps}px` }}
        >
          {formatRulerLabel(sec)}
        </span>
      ))}
    </div>
  );
}
// [END] CREATED BY Bedirhan

export default React.memo(TimelineRuler);
