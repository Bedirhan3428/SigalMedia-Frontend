"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { EditorPortal } from "./EditorPortal";
import { EDITOR_Z } from "./layers";
import { useBackLayer } from "./hooks/useEditorBackStack";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { usePresence } from "./hooks/usePresence";
import { useVisualViewportFrameStyle } from "./hooks/useVisualViewport";

const EXIT_MS = 200;
const DRAG_SLOP = 6;

/** Props of {@link Sheet}. */
export interface SheetProps {
  /** Whether the sheet is shown. The sheet animates in/out and stays mounted during the exit. */
  open: boolean;
  /**
   * Requested close (X, backdrop tap, drag down, Back gesture, Escape). The parent must set
   * `open` to false. Not called while `dismissible` is false.
   */
  onClose: () => void;
  /** Title shown in the header row (Turkish). Also the dialog's accessible name if a string. */
  title?: ReactNode;
  /** Element on the left of the title (e.g. a back chevron for a sub-view). */
  headerStart?: ReactNode;
  /** Extra actions on the right of the title, before the X button. */
  headerEnd?: ReactNode;
  /** Sheet body. Scrolls inside the sheet (never the page), with `overscroll-behavior: contain`. */
  children?: ReactNode;
  /** Sticky area under the body (e.g. a primary button). Safe-area padding is applied below it. */
  footer?: ReactNode;
  /**
   * Maximum height as a CSS length (default `"85dvh"`). Always capped to the visible area
   * (above the keyboard, below the top safe area).
   */
  maxHeight?: string;
  /** Fixed height as a CSS length (e.g. `"60dvh"`); by default the sheet sizes to its content. */
  height?: string;
  /**
   * When false, X / backdrop / drag / Back do nothing (use only briefly, e.g. while an action
   * is running). Default true.
   */
  dismissible?: boolean;
  /** Show the X button in the header (default true). */
  showCloseButton?: boolean;
  /** z-scale level (default `"sheet"`; use `"modal"` for a sheet opened above a modal). */
  layer?: "sheet" | "modal";
  /**
   * `"dim"` (default) darkens the editor behind; `"clear"` keeps it visible but still catches
   * taps outside the sheet (tap = close).
   */
  backdrop?: "dim" | "clear";
  /** Accessible name when `title` is not a string. */
  ariaLabel?: string;
  /** Stable id for the back stack (optional). */
  backLayerId?: string;
  /** Extra classes for the panel. */
  className?: string;
  /** Classes for the scrollable body (default `"px-4 pb-4"`). */
  contentClassName?: string;
}

/**
 * Bottom sheet: drag-to-close (header/handle area), backdrop tap, X button, Back gesture
 * (via the nearest {@link EditorBackStackProvider}) and Escape. Rendered in a portal at
 * `--z-sheet`, keyboard aware (`visualViewport`), safe-area padded, body scroll locked while
 * open. Animations respect `prefers-reduced-motion`.
 */
export function Sheet({
  open,
  onClose,
  title,
  headerStart,
  headerEnd,
  children,
  footer,
  maxHeight = "85dvh",
  height,
  dismissible = true,
  showCloseButton = true,
  layer = "sheet",
  backdrop = "dim",
  ariaLabel,
  backLayerId,
  className = "",
  contentClassName = "px-4 pb-4",
}: SheetProps) {
  const { rendered, closing } = usePresence(open, EXIT_MS);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: number;
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
    dy: number;
    captured: boolean;
  } | null>(null);

  const requestClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useBackLayer(open, requestClose, { id: backLayerId });
  useBodyScrollLock(open);
  const frameStyle = useVisualViewportFrameStyle();

  // Yeniden açılışta sürükleme kalıntılarını temizle; panele odaklan
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = "";
    panel.style.transition = "";
    if (!panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true });
    }
  }, [open]);

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dismissible || !open || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragRef.current = {
      id: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      dy: 0,
      captured: false,
    };
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const panel = panelRef.current;
    if (!d || d.id !== e.pointerId || !panel) return;
    const raw = e.clientY - d.startY;
    if (!d.captured) {
      if (Math.abs(raw) < DRAG_SLOP) return;
      if (raw < 0) {
        dragRef.current = null;
        return;
      }
      d.captured = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* yoksay */
      }
      panel.style.transition = "none";
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.dy = raw > 0 ? raw : raw * 0.2;
    panel.style.transform = `translate3d(0, ${d.dy}px, 0)`;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    const panel = panelRef.current;
    if (!d || !d.captured || !panel) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* yoksay */
    }
    const h = panel.offsetHeight || 1;
    const shouldClose =
      e.type !== "pointercancel" &&
      (d.dy > Math.min(160, h * 0.3) || (d.velocity > 0.6 && d.dy > 24));
    if (shouldClose) {
      // Çıkış animasyonu mevcut konumdan devam eder
      panel.style.transition = "";
      onClose();
    } else {
      panel.style.transition = "transform 220ms var(--editor-ease-out)";
      panel.style.transform = "";
    }
  };

  if (!rendered) return null;

  const rootStyle: CSSProperties = { zIndex: EDITOR_Z[layer], ...frameStyle };
  const panelStyle: CSSProperties = {
    maxHeight: `min(${maxHeight}, calc(100% - var(--sat) - 12px))`,
    height: height ? `min(${height}, calc(100% - var(--sat) - 12px))` : undefined,
  };
  const label = ariaLabel ?? (typeof title === "string" ? title : undefined);
  const hasTitleRow = Boolean(title || headerStart || headerEnd || showCloseButton);

  return (
    <EditorPortal>
      <div
        className={`fixed inset-0 flex flex-col justify-end ${closing ? "pointer-events-none" : ""}`}
        style={rootStyle}
      >
        <div
          aria-hidden="true"
          onClick={requestClose}
          className={`absolute inset-0 ${backdrop === "dim" ? "bg-black/60" : "bg-transparent"} ${
            closing ? "editor-anim-fade-out" : "editor-anim-fade-in"
          }`}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={`relative w-full max-w-lg mx-auto flex flex-col min-h-0 rounded-t-3xl bg-neutral-900/95 backdrop-blur-2xl border-t border-white/10 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] text-white outline-none pb-safe px-safe will-change-transform ${
            closing ? "editor-anim-sheet-out" : "editor-anim-sheet-in"
          } ${className}`}
          style={panelStyle}
        >
          {/* Sürükleme alanı: tutamaç + başlık satırı */}
          <div
            className="shrink-0 select-none"
            style={{ touchAction: "none" }}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="flex justify-center pt-2.5 pb-1.5">
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>
            {hasTitleRow && (
              <div className="flex items-center gap-1 px-2 min-h-12">
                {headerStart}
                <div className="flex-1 min-w-0 px-2 text-[15px] font-semibold text-white truncate">
                  {title}
                </div>
                {headerEnd}
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={requestClose}
                    disabled={!dismissible}
                    aria-label="Kapat"
                    className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-zinc-300 active:scale-90 active:bg-white/10 transition-transform disabled:opacity-40"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div
            className={`flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar ${contentClassName}`}
          >
            {children}
          </div>

          {footer && <div className="shrink-0 px-4 pt-3 pb-3">{footer}</div>}
        </div>
      </div>
    </EditorPortal>
  );
}
