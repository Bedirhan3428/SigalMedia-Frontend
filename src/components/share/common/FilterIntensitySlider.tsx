"use client";

import { useState } from "react";

/** Guarded engine contract (WP-14 implements it); the slider hides when missing. */
export type FilterIntensityEngine = {
  setFilterIntensity?: (v: number) => void;
  getFilterIntensity?: () => number;
};

export function supportsFilterIntensity(engine: unknown): boolean {
  const e = engine as FilterIntensityEngine;
  return typeof e.setFilterIntensity === "function" && typeof e.getFilterIntensity === "function";
}

interface Props {
  engine: unknown;
  className?: string;
  /** Changing the key re-reads the engine value (e.g. when the active filter changes). */
  syncKey?: string | number;
}

export function FilterIntensitySlider({ engine, className = "", syncKey }: Props) {
  const e = engine as FilterIntensityEngine;
  const supported = supportsFilterIntensity(engine);
  const read = () => {
    const v = supported ? e.getFilterIntensity?.() : 1;
    return Math.round((typeof v === "number" && isFinite(v) ? v : 1) * 100);
  };
  const [value, setValue] = useState(read);
  const [seenKey, setSeenKey] = useState(syncKey);
  if (seenKey !== syncKey) {
    setSeenKey(syncKey);
    setValue(read());
  }
  if (!supported) return null;
  return (
    <div className={`flex items-center gap-2 h-11 ${className}`}>
      <span className="w-14 shrink-0 text-xs font-semibold text-[var(--ed-tx2,#98a2b3)]">Yoğunluk</span>
      <input
        type="range"
        aria-label="Filtre yoğunluğu"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(ev) => {
          const n = Number(ev.target.value);
          setValue(n);
          e.setFilterIntensity?.(n / 100);
        }}
        onDoubleClick={() => {
          setValue(100);
          e.setFilterIntensity?.(1);
        }}
        className="editor-range flex-1 min-w-0"
        style={{ ["--range-pct" as string]: `${value}%` }}
      />
      <span className="w-9 text-right text-xs font-bold tabular-nums text-[var(--ed-tx,#e8ecf1)] shrink-0">{value}</span>
    </div>
  );
}
