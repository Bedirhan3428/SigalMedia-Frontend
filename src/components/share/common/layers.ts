/**
 * Editor z-index scale. The values live as CSS variables in `app/globals.css`
 * (`--z-canvas` … `--z-toast`) with matching Tailwind utilities (`z-canvas`, `z-chrome`,
 * `z-sheet`, `z-modal`, `z-blocking`, `z-toast`). Use the utilities in class names, or these
 * constants in inline styles. Never use raw z numbers in editor code.
 *
 * - canvas   0  the preview canvas
 * - chrome   10 top/bottom bars, floating buttons, trash target
 * - sheet    20 bottom sheets (stickers, music, tools)
 * - modal    30 full-screen overlays and dialogs (text editor, publish screen, confirm)
 * - blocking 40 progress overlays that block input (export)
 * - toast    50 toasts, always on top
 *
 * Shared overlays render through a portal to `document.body`, so they stack above the editor
 * root regardless of where they are mounted.
 */
export const EDITOR_Z = {
  canvas: "var(--z-canvas)",
  chrome: "var(--z-chrome)",
  sheet: "var(--z-sheet)",
  modal: "var(--z-modal)",
  blocking: "var(--z-blocking)",
  toast: "var(--z-toast)",
} as const;

/** Name of a level in {@link EDITOR_Z}. */
export type EditorLayer = keyof typeof EDITOR_Z;
