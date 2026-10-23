// [START] CREATED BY Bedirhan
"use client";

import { ReactNode } from "react";

export interface PreviewThumbProps {
  src: string | null;
  label: string;
  active: boolean;
  cssFilter?: string;
  // Efekt rengi: küçük resmin üstüne yarı saydam bindirilir
  tint?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}

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
      className={`flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-all disabled:cursor-wait ${className}`}
    >
      <div
        className={`relative w-full aspect-[9/14] rounded-xl overflow-hidden border-2 transition-all ${
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
          <img
            src={src}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover"
            style={cssFilter && cssFilter !== "none" ? { filter: cssFilter } : undefined}
            draggable={false}
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
