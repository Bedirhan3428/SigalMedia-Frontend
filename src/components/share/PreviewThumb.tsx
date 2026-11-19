// [START] CREATED BY Bedirhan
"use client";

import type { ReactNode } from "react";

export interface PreviewThumbProps {
  /** Preview frame (data/blob URL) or null for a gradient placeholder. */
  src: string | null;
  /** Turkish label under the thumbnail (also the accessible name). */
  label: string;
  /** Selected state (white border, `aria-pressed`). */
  active: boolean;
  /** CSS filter applied to the frame (e.g. a filter preset's `cssFilter`). */
  cssFilter?: string;
  // Efekt rengi: küçük resmin üstüne yarı saydam bindirilir
  tint?: string;
  /** Optional icon centred over the frame. */
  icon?: ReactNode;
  /** Width class (default `"w-14"`, 56 px; keep ≥ 44 px). */
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}

/** Filter/effect thumbnail button with a label. Touch target ≥ 44 px wide. */
export default function PreviewThumb({
  src,
  label,
  active,
  cssFilter,
  tint,
  icon,
  className = "w-14",
  disabled,
  onClick,
}: PreviewThumbProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      className={`min-w-11 flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-400 rounded-xl ${className}`}
    >
      <div
        className={`relative w-full aspect-[9/14] rounded-xl overflow-hidden border-2 transition-colors ${
          active ? "border-white" : "border-transparent"
        }`}
        style={
          src
            ? undefined
            : {
                background: `radial-gradient(circle at 30% 30%, ${tint || "#3f3f46"}, #111827)`,
              }
        }
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={cssFilter && cssFilter !== "none" ? { filter: cssFilter } : undefined}
            draggable={false}
            decoding="async"
          />
        )}
        {src && tint && (
          <div
            className="absolute inset-0 mix-blend-screen opacity-45"
            style={{ background: `linear-gradient(160deg, ${tint}, transparent 75%)` }}
          />
        )}
        {icon && (
          <div className="absolute inset-0 flex items-center justify-center text-white drop-shadow">
            {icon}
          </div>
        )}
      </div>
      <span
        aria-hidden="true"
        className={`text-[10px] font-semibold text-center leading-tight truncate w-full ${
          active ? "text-white" : "text-zinc-400"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
// [END] CREATED BY Bedirhan
