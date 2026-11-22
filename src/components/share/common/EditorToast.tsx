"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { EditorPortal } from "./EditorPortal";
import { EDITOR_Z } from "./layers";

/** Toast flavour. `error` stays longer and shows a red icon. */
export type EditorToastVariant = "info" | "success" | "error";

/** Optional button inside a toast (e.g. "Tekrar dene" after an export failure). */
export interface EditorToastAction {
  /** Button label (Turkish, short). */
  label: string;
  /** Runs on tap; the toast is dismissed afterwards. */
  onClick: () => void;
}

/** Options for {@link EditorToastApi.show}. */
export interface EditorToastOptions {
  /** Default `"info"`. */
  variant?: EditorToastVariant;
  /**
   * Auto-dismiss delay in ms. Defaults: info/success 2200, error 4000, any toast with an
   * action 6000. `0` keeps it until tapped or dismissed.
   */
  duration?: number;
  /** Optional action button. */
  action?: EditorToastAction;
  /** Stable id: showing again with the same id replaces that toast instead of stacking. */
  id?: string;
}

/** Imperative toast API returned by {@link useEditorToast}. All methods are stable. */
export interface EditorToastApi {
  /** Shows a toast and returns its id. Identical message+variant re-uses the visible toast. */
  show(message: string, options?: EditorToastOptions): string;
  /** `show` with `variant: "info"`. */
  info(message: string, options?: Omit<EditorToastOptions, "variant">): string;
  /** `show` with `variant: "success"`. */
  success(message: string, options?: Omit<EditorToastOptions, "variant">): string;
  /** `show` with `variant: "error"`. Use for every user-visible failure (never fail silently). */
  error(message: string, options?: Omit<EditorToastOptions, "variant">): string;
  /** Dismisses one toast. */
  dismiss(id: string): void;
  /** Dismisses all toasts. */
  clear(): void;
}

interface ToastItem {
  id: string;
  message: string;
  variant: EditorToastVariant;
  action?: EditorToastAction;
}

const ToastContext = createContext<EditorToastApi | null>(null);

let warned = false;
const fallbackApi: EditorToastApi = {
  show(message) {
    if (!warned) {
      warned = true;
      console.warn("[useEditorToast] EditorToastProvider yok; toast gösterilemedi:", message);
    }
    return "";
  },
  info(message) {
    return fallbackApi.show(message);
  },
  success(message) {
    return fallbackApi.show(message);
  },
  error(message) {
    return fallbackApi.show(message);
  },
  dismiss() {},
  clear() {},
};

/** Props of {@link EditorToastProvider}. */
export interface EditorToastProviderProps {
  children?: ReactNode;
  /** Distance below the top safe-area inset, in px (default 64: below the editor top bar). */
  topOffset?: number;
  /** Maximum toasts visible at once; oldest are dropped (default 3). */
  max?: number;
}

/**
 * Hosts editor toasts (portal at `--z-toast`, top centre, under the safe area). Wrap the editor
 * shell once. All timers are cleared and toasts dropped on unmount and on Activity hide.
 */
export function EditorToastProvider({ children, topOffset = 64, max = 3 }: EditorToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const itemsRef = useRef<ToastItem[]>([]);
  const seqRef = useRef(0);
  const maxRef = useRef(max);

  useLayoutEffect(() => {
    maxRef.current = max;
  });

  const api = useMemo<EditorToastApi>(() => {
    const clearTimer = (id: string) => {
      const t = timersRef.current.get(id);
      if (t) clearTimeout(t);
      timersRef.current.delete(id);
    };
    const commit = (next: ToastItem[]) => {
      itemsRef.current = next;
      setToasts(next);
    };
    const dismiss = (id: string) => {
      clearTimer(id);
      if (!itemsRef.current.some((t) => t.id === id)) return;
      commit(itemsRef.current.filter((t) => t.id !== id));
    };
    const show = (message: string, options: EditorToastOptions = {}) => {
      const variant = options.variant ?? "info";
      const duplicate = options.id
        ? undefined
        : itemsRef.current.find((t) => t.message === message && t.variant === variant);
      seqRef.current += 1;
      const id = options.id ?? duplicate?.id ?? `toast-${seqRef.current}`;
      const item: ToastItem = { id, message, variant, action: options.action };
      const rest = itemsRef.current.filter((t) => t.id !== id);
      const next = [...rest, item];
      const overflow = next.length - Math.max(1, maxRef.current);
      if (overflow > 0) next.splice(0, overflow).forEach((t) => clearTimer(t.id));
      commit(next);

      clearTimer(id);
      const duration =
        options.duration ?? (options.action ? 6000 : variant === "error" ? 4000 : 2200);
      if (duration > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    };
    return {
      show,
      info: (m, o) => show(m, { ...o, variant: "info" }),
      success: (m, o) => show(m, { ...o, variant: "success" }),
      error: (m, o) => show(m, { ...o, variant: "error" }),
      dismiss,
      clear: () => {
        timersRef.current.forEach((t) => clearTimeout(t));
        timersRef.current.clear();
        commit([]);
      },
    };
  }, []);

  // Gizlenince / kaldırılınca tüm zamanlayıcıları temizle
  useLayoutEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      itemsRef.current = [];
      setToasts([]);
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <EditorPortal>
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none"
          style={{ zIndex: EDITOR_Z.toast, top: `calc(var(--sat) + ${topOffset}px)` }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto max-w-[min(92vw,420px)] flex items-center gap-2.5 rounded-full bg-neutral-900/95 backdrop-blur-xl border border-[var(--ed-line,#2a303a)] pl-4 pr-2 min-h-11 shadow-[0_10px_30px_rgba(0,0,0,0.5)] editor-anim-toast-in"
            >
              {t.variant === "error" && <AlertCircle className="w-4 h-4 text-[var(--ed-danger,#ff5c6c)] shrink-0" />}
              {t.variant === "success" && (
                <CheckCircle2 className="w-4 h-4 text-[var(--ed-ac,#38d5c8)] shrink-0" />
              )}
              <button
                type="button"
                onClick={() => api.dismiss(t.id)}
                className={`flex-1 min-w-0 min-h-11 text-left text-[13px] font-semibold text-white leading-tight py-2 ${
                  t.action ? "" : "pr-2"
                }`}
              >
                {t.message}
              </button>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    api.dismiss(t.id);
                    t.action?.onClick();
                  }}
                  className="shrink-0 min-h-11 px-3 rounded-full text-[13px] font-bold text-[var(--ed-ac,#38d5c8)] active:bg-white/10"
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </EditorPortal>
    </ToastContext.Provider>
  );
}

/**
 * Returns the editor toast API. Outside an {@link EditorToastProvider} it returns a no-op API
 * (and warns once in the console) so components never crash.
 *
 * @example
 * const toast = useEditorToast();
 * toast.error("Dışa aktarılamadı", { action: { label: "Tekrar dene", onClick: retry } });
 */
export function useEditorToast(): EditorToastApi {
  return useContext(ToastContext) ?? fallbackApi;
}
