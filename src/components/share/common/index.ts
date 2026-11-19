/**
 * Shared editor UI (WP0). Phase 2 packages import only from this index.
 *
 * Wiring in the route shell (sketch):
 *
 *   const { sessionKey, newSession } = useEditorSession({ onHide: stopEverything });
 *   return <EditorShell key={sessionKey} onFreshSession={newSession} />;
 *
 *   // inside EditorShell
 *   const backStack = useEditorBackStack({ onExitRequest });
 *   <EditorBackStackProvider value={backStack}>
 *     <EditorToastProvider> …editor, sheets, dialogs… </EditorToastProvider>
 *   </EditorBackStackProvider>
 *
 * Rules every consumer relies on:
 * - All overlays here render through a portal to `document.body` and use the z-scale
 *   (`EDITOR_Z`, CSS vars `--z-*`, Tailwind `z-chrome` / `z-sheet` / …).
 * - Every overlay registers itself with the back stack while open; consumers do not call
 *   `push`/`pop` for them. Custom overlays use `useBackLayer(open, onClose)`.
 * - Before navigating away programmatically, `await backStack.release()`.
 * - Body scroll lock is released on close, unmount and Activity hide.
 */

// Layering
export { EDITOR_Z, type EditorLayer } from "./layers";
export { EditorPortal, type EditorPortalProps } from "./EditorPortal";

// Building blocks
export { Sheet, type SheetProps } from "./Sheet";
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";
export { EditorIconButton, type EditorIconButtonProps } from "./EditorIconButton";
export {
  EditorToastProvider,
  useEditorToast,
  type EditorToastProviderProps,
  type EditorToastApi,
  type EditorToastOptions,
  type EditorToastAction,
  type EditorToastVariant,
} from "./EditorToast";

// Text editing
export { TextEditorOverlay, type TextEditorOverlayProps } from "./TextEditorOverlay";
export {
  DEFAULT_TEXT_EDITOR_VALUE,
  TEXT_BG_PRESETS,
  TEXT_COLORS,
  TEXT_FONT_BY_ID,
  TEXT_FONT_OPTIONS,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  type TextAlign,
  type TextBackgroundPreset,
  type TextEditorValue,
  type TextFontOption,
  type TextFontPreset,
} from "./textPresets";

// Stickers
export {
  StickerSheet,
  searchMentionUsers,
  MENTION_STICKER_TEXT_STYLE,
  type StickerSheetProps,
  type StickerSheetAction,
  type MentionUser,
  type SearchMentionUsers,
} from "./StickerSheet";
export { EMOJI_CATEGORIES, type EmojiCategory } from "./emojiData";

// Publish
export { PublishScreen, CAPTION_MAX_LENGTH, type PublishScreenProps } from "./PublishScreen";

// Hooks
export {
  useEditorBackStack,
  EditorBackStackProvider,
  useBackStack,
  useBackLayer,
  type EditorBackStack,
  type EditorBackStackOptions,
  type EditorBackStackProviderProps,
  type BackLayerOptions,
} from "./hooks/useEditorBackStack";
export {
  useEditorSession,
  type EditorSession,
  type EditorSessionOptions,
} from "./hooks/useEditorSession";
export { useBodyScrollLock } from "./hooks/useBodyScrollLock";
export {
  useVisualViewport,
  useVisualViewportFrameStyle,
  type VisualViewportState,
} from "./hooks/useVisualViewport";
export { usePresence, type PresenceState } from "./hooks/usePresence";

// Existing share components brought up to the same standards (re-exported for convenience)
export { default as ExportProgress, type ExportProgressProps } from "../ExportProgress";
export { default as ModeSelectorModal, type ModeSelectorModalProps } from "../ModeSelectorModal";
export { default as MusicSettingsPanel, type MusicSettingsPanelProps } from "../MusicSettingsPanel";
export { default as PreviewThumb, type PreviewThumbProps } from "../PreviewThumb";
