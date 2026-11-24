// [START] CREATED BY Bedirhan
"use client";

import type { ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { MdHistoryEdu } from "react-icons/md";
import { FaPhotoFilm } from "react-icons/fa6";
import { IoCamera } from "react-icons/io5";
import type { ShareMode } from "@/lib/canvas-editor/types";
import { EditorPortal } from "./common/EditorPortal";
import { EDITOR_Z } from "./common/layers";
import { useBackLayer } from "./common/hooks/useEditorBackStack";
import { useBodyScrollLock } from "./common/hooks/useBodyScrollLock";

export interface ModeSelectorModalProps {
  /** Shows the full-screen selector. */
  isOpen: boolean;
  /** Mode of the running session (highlighted), or null when nothing is loaded yet. */
  activeMode: ShareMode | null;
  /** A mode was chosen. */
  onSelectMode: (mode: ShareMode) => void;
  /** Back / close button. */
  onBack: () => void;
  /**
   * Register with the back stack so the Back gesture calls `onBack`. Default: only when
   * `activeMode` is set (selector opened over a session). As the root screen it stays
   * unregistered, so Back reaches the shell's `onExitRequest`.
   */
  registerBackLayer?: boolean;
  /** Optional info line under the title (e.g. "unsaved work was lost on reload"). */
  notice?: string | null;
  /** Gizlenecek modlar (ör. yanıt modunda "story"). */
  hiddenModes?: ShareMode[];
}

interface ModeOption {
  mode: ShareMode;
  title: string;
  badge: string;
  icon: ReactNode;
  activeClass: string;
  iconClass: string;
}

const MODES: ModeOption[] = [
  {
    mode: "story",
    title: "Hikaye",
    badge: "9:16",
    icon: <MdHistoryEdu className="w-6 h-6" />,
    activeClass: "bg-[var(--ed-ac-soft,rgba(56,213,200,0.14))] border-[var(--ed-ac,#38d5c8)]",
    iconClass: "bg-[var(--ed-bg3,#232932)] text-[var(--ed-ac,#38d5c8)]",
  },
  {
    mode: "reels",
    title: "Reels",
    badge: "Video · 60 sn",
    icon: <FaPhotoFilm className="w-6 h-6" />,
    activeClass: "bg-[var(--ed-ac-soft,rgba(56,213,200,0.14))] border-[var(--ed-ac,#38d5c8)]",
    iconClass: "bg-[var(--ed-bg3,#232932)] text-[var(--ed-ac,#38d5c8)]",
  },
  {
    mode: "post",
    title: "Gönderi",
    badge: "Fotoğraf",
    icon: <IoCamera className="w-6 h-6" />,
    activeClass: "bg-[var(--ed-ac-soft,rgba(56,213,200,0.14))] border-[var(--ed-ac,#38d5c8)]",
    iconClass: "bg-[var(--ed-bg3,#232932)] text-[var(--ed-ac,#38d5c8)]",
  },
];

export default function ModeSelectorModal({
  isOpen,
  activeMode,
  onSelectMode,
  onBack,
  registerBackLayer,
  notice,
  hiddenModes,
}: ModeSelectorModalProps) {
  const overSession = activeMode !== null;
  useBackLayer(isOpen && (registerBackLayer ?? overSession), onBack);
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <EditorPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Oluştur"
        className="fixed inset-0 h-[100dvh] bg-[var(--ed-bg0,#0b0d10)]/95 backdrop-blur-2xl flex flex-col pt-safe pb-safe px-safe select-none editor-anim-fade-in"
        style={{ zIndex: EDITOR_Z.modal }}
      >
        <div className="h-14 px-3 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onBack}
            aria-label={overSession ? "Kapat" : "Geri"}
            className="w-11 h-11 rounded-full bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] text-[var(--ed-tx,#e8ecf1)] active:scale-90 transition-transform flex items-center justify-center"
          >
            {overSession ? <X className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
          <span className="text-sm font-bold tracking-wide text-white">Oluştur</span>
          <div className="w-11" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar flex flex-col justify-center px-6 py-4">
          <div className="w-full max-w-sm mx-auto flex flex-col gap-3.5">
            {notice ? (
              <p
                role="status"
                className="rounded-md border border-[var(--ed-warn,#ffb020)]/40 bg-[var(--ed-bg2,#1a1e25)] px-4 py-3 text-xs font-medium leading-snug text-[var(--ed-warn,#ffb020)]"
              >
                {notice}
              </p>
            ) : null}
            {MODES.filter((m) => !hiddenModes?.includes(m.mode)).map((m) => {
              const active = activeMode === m.mode;
              return (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => onSelectMode(m.mode)}
                  aria-pressed={active}
                  className={`w-full min-h-[76px] flex items-center gap-4 p-4 rounded-[10px] border transition-transform active:scale-[0.98] text-left text-white ${
                    active ? m.activeClass : "bg-[var(--ed-bg2,#1a1e25)] border-[var(--ed-line,#2a303a)] active:bg-[var(--ed-bg3,#232932)]"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-md flex items-center justify-center shrink-0 ${m.iconClass}`}>
                    {m.icon}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-white">{m.title}</span>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-[3px] bg-[var(--ed-bg3,#232932)] text-[var(--ed-tx2,#98a2b3)] whitespace-nowrap">
                      {m.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </EditorPortal>
  );
}
// [END] CREATED BY Bedirhan
