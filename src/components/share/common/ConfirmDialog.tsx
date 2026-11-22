"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { EditorPortal } from "./EditorPortal";
import { EDITOR_Z } from "./layers";
import { useBackLayer } from "./hooks/useEditorBackStack";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { usePresence } from "./hooks/usePresence";
import { useVisualViewportFrameStyle } from "./hooks/useVisualViewport";

/** Props of {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  /** Whether the dialog is shown. */
  open: boolean;
  /** Title, e.g. "Değişiklikler silinsin mi?". */
  title: ReactNode;
  /** Optional one-line explanation under the title. */
  message?: ReactNode;
  /** Confirm button label (default "Onayla"). */
  confirmLabel?: string;
  /** Cancel button label (default "Vazgeç"). */
  cancelLabel?: string;
  /** Red confirm button for destructive actions (default false). */
  destructive?: boolean;
  /** Called on the confirm button. The parent closes the dialog (or sets `busy`). */
  onConfirm: () => void;
  /** Called on cancel button, backdrop tap, Back gesture and Escape (not while `busy`). */
  onCancel: () => void;
  /** Shows a spinner on the confirm button and blocks both buttons / dismissal. */
  busy?: boolean;
  /** Optional third action between confirm and cancel (WP-09: "Sil" for the draft prompt). */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Centered confirm dialog at `--z-modal`. Closable by the cancel button, backdrop tap, Back
 * gesture (back stack) and Escape. Initial focus goes to the cancel button (the safe choice).
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  destructive = false,
  onConfirm,
  onCancel,
  busy = false,
  secondaryLabel,
  onSecondary,
}: ConfirmDialogProps) {
  const { rendered, closing } = usePresence(open, 160);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const frameStyle = useVisualViewportFrameStyle();

  useBackLayer(open, () => {
    if (!busy) onCancel();
  });
  useBodyScrollLock(open);

  useLayoutEffect(() => {
    if (open) cancelRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!rendered) return null;

  const rootStyle: CSSProperties = { zIndex: EDITOR_Z.modal, ...frameStyle };

  return (
    <EditorPortal>
      <div
        className={`fixed inset-0 flex items-center justify-center p-6 px-safe ${
          closing ? "pointer-events-none" : ""
        }`}
        style={rootStyle}
      >
        <div
          aria-hidden="true"
          onClick={() => {
            if (!busy) onCancel();
          }}
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm ${
            closing ? "editor-anim-fade-out" : "editor-anim-fade-in"
          }`}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : undefined}
          className={`relative w-full max-w-[340px] rounded-[10px] bg-[var(--ed-bg1,#12151a)] border border-[var(--ed-line,#2a303a)] p-5 pt-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.55)] ${
            closing ? "editor-anim-pop-out" : "editor-anim-pop-in"
          }`}
        >
          <h2 className="text-[var(--ed-tx,#e8ecf1)] font-semibold text-[17px] leading-snug">{title}</h2>
          {message && <p className="mt-1.5 text-[var(--ed-tx2,#98a2b3)] text-[13px] leading-snug">{message}</p>}
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`w-full min-h-12 rounded-md font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-70 ${
                destructive
                  ? "border border-[var(--ed-danger,#ff5c6c)] bg-transparent text-[var(--ed-danger,#ff5c6c)]"
                  : "bg-[var(--ed-ac,#38d5c8)] text-[var(--ed-ac-tx,#04201e)]"
              }`}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmLabel}
            </button>
            {secondaryLabel && onSecondary && (
              <button
                type="button"
                onClick={onSecondary}
                disabled={busy}
                className="w-full min-h-12 rounded-md border border-[var(--ed-danger,#ff5c6c)] text-[var(--ed-danger,#ff5c6c)] font-semibold text-sm active:scale-[0.97] transition-transform disabled:opacity-50"
              >
                {secondaryLabel}
              </button>
            )}
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="w-full min-h-12 rounded-md bg-[var(--ed-bg3,#232932)] text-[var(--ed-tx,#e8ecf1)] font-semibold text-sm active:scale-[0.97] transition-transform disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </EditorPortal>
  );
}
