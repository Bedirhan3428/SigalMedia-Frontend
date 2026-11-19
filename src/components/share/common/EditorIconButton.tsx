"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Props of {@link EditorIconButton}. */
export interface EditorIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name (Turkish), also used as `title`. Required: icon buttons have no text. */
  label: string;
  /** The icon element (e.g. a lucide icon, ~20 px). */
  children?: ReactNode;
  /**
   * Visual style. `glass` (default): translucent dark over media; `solid`: #1c1c1e chip;
   * `light`: white pill with black icon (primary); `ghost`: no background.
   */
  variant?: "glass" | "solid" | "light" | "ghost";
  /** `md` = 44 px (default, minimum touch target), `lg` = 48 px. */
  size?: "md" | "lg";
  /** Highlights the button as active/toggled (sets `aria-pressed`). */
  active?: boolean;
}

const VARIANTS: Record<NonNullable<EditorIconButtonProps["variant"]>, string> = {
  glass: "bg-black/45 backdrop-blur-md border border-white/15 text-white",
  solid: "bg-[#1c1c1e] text-white",
  light: "bg-white text-black",
  ghost: "bg-transparent text-white",
};

/** Round 44 px icon button used across the editor chrome. No hover-only affordances. */
export const EditorIconButton = forwardRef<HTMLButtonElement, EditorIconButtonProps>(
  function EditorIconButton(
    { label, children, variant = "glass", size = "md", active, className = "", type, ...rest },
    ref
  ) {
    const dim = size === "lg" ? "w-12 h-12" : "w-11 h-11";
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        aria-label={label}
        title={label}
        aria-pressed={active === undefined ? undefined : active}
        className={`${dim} shrink-0 rounded-full flex items-center justify-center shadow-lg transition-transform duration-150 active:scale-90 disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-400 touch-manipulation ${
          active ? "ring-2 ring-white/80" : ""
        } ${VARIANTS[variant]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
