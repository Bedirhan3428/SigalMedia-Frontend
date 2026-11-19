"use client";

import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Key written into `history.state` of the single guard entry. Next's patched `pushState` copies its
 * own `__NA` / tree fields next to it, so Next treats the guard as a normal same-URL entry.
 */
const GUARD_KEY = "__sigalEditorGuard";
// release() sonrası bu süre boyunca jest ile tekrar koruma eklenmez (navigasyon bitsin diye)
const RELEASE_HOLD_MS = 2000;
// history.back() sonrası popstate gelmezse beklemeyi bitir
const RELEASE_TIMEOUT_MS = 700;

/** Options for {@link useEditorBackStack}. */
export interface EditorBackStackOptions {
  /**
   * Called when the user presses Back (browser button, Android back, iOS edge swipe) while **no**
   * layer is registered. The guard entry has already been re-pushed, so the user stays on the
   * page; the shell decides what to do (e.g. show the "discard changes?" confirm, or leave).
   * To actually leave, call `await backStack.release()` first, then navigate.
   */
  onExitRequest: () => void;
  /**
   * When false, no guard entry is pushed on the next gesture (default true). Turning it off does
   * not remove an already pushed guard; call `release()` for that.
   */
  enabled?: boolean;
}

/**
 * Back-gesture stack for one editor. Obtain it with {@link useEditorBackStack} in the shell and
 * hand it down with {@link EditorBackStackProvider}; overlays register through {@link useBackLayer}.
 *
 * Contract:
 * - Exactly **one** history entry (the "guard") is pushed, on the first user gesture
 *   (`pointerup` / `click` / `keydown`) after the editor becomes visible, never on mount, so
 *   browsers' history-manipulation interventions don't mark it skippable.
 * - On `popstate` away from the guard: the guard is re-pushed immediately, then the **topmost**
 *   registered layer's `onClose` runs. Only when the stack is empty is `onExitRequest` called.
 *   Escape (desktop) closes the topmost layer as well, without touching history.
 * - A layer whose `onClose` ignores the request (e.g. busy) simply stays open; Back is swallowed.
 * - Never call `router.back()` / `history.back()` while the guard is armed: that pops the guard
 *   and is indistinguishable from a user Back. Call `await release()` first, then navigate
 *   (`router.back()`, `router.replace()`, `router.push()`).
 * - When the editor is hidden by `<Activity>` or unmounted, all listeners are removed and the
 *   stack is cleared. A guard entry that was left behind (navigation without `release()`) is
 *   **adopted** next time the editor is shown on it, so entries never pile up.
 * - Does not fight Next's router: same-URL entries only, Next's own state is preserved, and
 *   `popstate` events that leave the page URL (multi-step traversal) are left to Next.
 * - The guard is only pushed while the URL equals the one the editor was shown on. Don't change
 *   the URL (search params) while editing; keep editor steps in React state.
 * - Synthetic events (`input.click()`) never push the guard; only trusted gestures do.
 */
export interface EditorBackStack {
  /**
   * Registers a layer on top of the stack. Re-pushing an existing `id` moves it to the top.
   * Returns an unregister function (safe to call more than once).
   */
  push(id: string, onClose: () => void): () => void;
  /** Removes the layer with this `id` (no-op if absent). */
  pop(id: string): void;
  /** Whether a layer with this `id` is registered. */
  has(id: string): boolean;
  /** Number of registered layers. */
  size(): number;
  /** Calls the topmost layer's `onClose`. Returns false when the stack is empty. */
  closeTop(): boolean;
  /**
   * Removes the guard entry (via `history.back()` when it is the current entry) and resolves
   * once the browser has settled. Call before any programmatic navigation away from the editor.
   * Re-arming by gesture is suppressed for ~2 s afterwards.
   */
  release(): Promise<void>;
  /** True while the guard entry is the current history entry. */
  isArmed(): boolean;
}

type Entry = { id: string; onClose: () => void };

function safeCall(fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error("[useEditorBackStack]", err);
  }
}

function readGuard(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const v = (state as Record<string, unknown>)[GUARD_KEY];
  return typeof v === "string" ? v : null;
}

class BackStackController {
  private stack: Entry[] = [];
  private token = "";
  private active = false;
  private armed = false;
  private enabled = true;
  private held = false;
  private suppress = 0;
  // Editörün açıldığı URL: koruma yalnızca bu URL üzerindeyken eklenir
  private homeHref = "";
  private onExitRequest: () => void = () => {};
  private releaseWaiters: Array<() => void> = [];
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenSeq = 0;

  readonly api: EditorBackStack = {
    push: (id, onClose) => this.push(id, onClose),
    pop: (id) => this.pop(id),
    has: (id) => this.stack.some((e) => e.id === id),
    size: () => this.stack.length,
    closeTop: () => this.closeTop(),
    release: () => this.release(),
    isArmed: () => this.armed && this.isOnGuard(),
  };

  configure(onExitRequest: () => void, enabled: boolean) {
    this.onExitRequest = onExitRequest;
    this.enabled = enabled;
  }

  activate() {
    if (this.active || typeof window === "undefined") return;
    this.active = true;
    this.tokenSeq += 1;
    this.token = `${Date.now().toString(36)}-${this.tokenSeq}`;
    this.homeHref = window.location.href;
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("pointerup", this.onGesture, true);
    window.addEventListener("click", this.onGesture, true);
    window.addEventListener("keydown", this.onKeyDown, true);

    // Önceki ziyaretten kalan koruma girdisinin üzerindeysek onu sahiplen
    const st = window.history.state;
    if (readGuard(st) !== null) {
      try {
        window.history.replaceState({ ...(st as object), [GUARD_KEY]: this.token }, "");
        this.armed = true;
      } catch {
        this.armed = false;
      }
    }
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("pointerup", this.onGesture, true);
    window.removeEventListener("click", this.onGesture, true);
    window.removeEventListener("keydown", this.onKeyDown, true);
    this.armed = false;
    this.stack = [];
    this.suppress = 0;
    this.held = false;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.flushRelease();
  }

  private isOnGuard(): boolean {
    if (typeof window === "undefined") return false;
    return readGuard(window.history.state) === this.token;
  }

  private pushGuard() {
    // Başka bir sayfaya geçilmişse (gizlenmeden hemen önce) koruma ekleme
    if (window.location.href !== this.homeHref) return;
    try {
      window.history.pushState({ [GUARD_KEY]: this.token }, "");
      this.armed = true;
    } catch {
      this.armed = false;
    }
  }

  private onGesture = (e: Event) => {
    // Programatik click() (ör. gizli dosya girdisi) kullanıcı etkinleştirmesi sayılmaz
    if (!e.isTrusted) return;
    if (!this.active || !this.enabled || this.held) return;
    if (this.isOnGuard()) {
      this.armed = true;
      return;
    }
    // Koruma girdisi bir router.replace ile ezildiyse yeniden ekle
    this.pushGuard();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!e.isComposing && this.stack.length > 0) {
        e.preventDefault();
        this.closeTop();
      }
      return;
    }
    this.onGesture(e);
  };

  private onPopState = (e: PopStateEvent) => {
    if (!this.active) return;
    const onGuard = readGuard(e.state) === this.token;

    // release() ile tetiklenen geri hareketi
    if (this.suppress > 0) {
      this.suppress -= 1;
      this.armed = onGuard;
      this.flushRelease();
      return;
    }
    // İleri tuşuyla korumaya dönüldü
    if (onGuard) {
      this.armed = true;
      return;
    }
    if (!this.armed) return;
    this.armed = false;

    // Birden çok adım geri / başka bir URL'ye geçiş: Next yönetsin
    if (window.location.href !== this.homeHref) return;
    if (!this.enabled) return;

    this.pushGuard();
    const top = this.stack[this.stack.length - 1];
    if (top) safeCall(top.onClose);
    else safeCall(this.onExitRequest);
  };

  private push(id: string, onClose: () => void): () => void {
    const existing = this.stack.findIndex((e) => e.id === id);
    if (existing >= 0) this.stack.splice(existing, 1);
    const entry: Entry = { id, onClose };
    this.stack.push(entry);
    return () => {
      const idx = this.stack.indexOf(entry);
      if (idx >= 0) this.stack.splice(idx, 1);
    };
  }

  private pop(id: string) {
    const idx = this.stack.findIndex((e) => e.id === id);
    if (idx >= 0) this.stack.splice(idx, 1);
  }

  private closeTop(): boolean {
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    safeCall(top.onClose);
    return true;
  }

  private flushRelease() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    const waiters = this.releaseWaiters;
    this.releaseWaiters = [];
    waiters.forEach((w) => w());
  }

  private release(): Promise<void> {
    this.held = true;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      this.held = false;
      this.holdTimer = null;
    }, RELEASE_HOLD_MS);

    // Devam eden bir release varsa onunla birlikte bekle
    if (this.releaseWaiters.length > 0) {
      return new Promise<void>((resolve) => this.releaseWaiters.push(resolve));
    }
    if (!this.active || !this.armed || !this.isOnGuard()) {
      this.armed = false;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.releaseWaiters.push(resolve);
      this.suppress += 1;
      this.armed = false;
      this.releaseTimer = setTimeout(() => {
        this.suppress = Math.max(0, this.suppress - 1);
        this.flushRelease();
      }, RELEASE_TIMEOUT_MS);
      try {
        window.history.back();
      } catch {
        this.suppress = Math.max(0, this.suppress - 1);
        this.flushRelease();
      }
    });
  }
}

/**
 * Creates the editor's back-gesture stack (see {@link EditorBackStack} for the full contract).
 * Use once per editor shell, then wrap the editor in `<EditorBackStackProvider value={stack}>`.
 *
 * Listeners attach in a layout effect and detach in its cleanup, which also runs when the route
 * is hidden by `<Activity>`; on re-show a fresh token is generated and any guard entry the user
 * is standing on is adopted.
 *
 * @example
 * const backStack = useEditorBackStack({
 *   onExitRequest: () => (hasWork ? setConfirmOpen(true) : leave()),
 * });
 * const leave = async () => { await backStack.release(); router.replace("/"); };
 */
export function useEditorBackStack(options: EditorBackStackOptions): EditorBackStack {
  const [controller] = useState(() => new BackStackController());
  const { onExitRequest, enabled = true } = options;

  useLayoutEffect(() => {
    controller.configure(onExitRequest, enabled);
  });

  useLayoutEffect(() => {
    controller.activate();
    return () => controller.deactivate();
  }, [controller]);

  return controller.api;
}

const BackStackContext = createContext<EditorBackStack | null>(null);

/** Props of {@link EditorBackStackProvider}. */
export interface EditorBackStackProviderProps {
  /** The stack returned by {@link useEditorBackStack}. */
  value: EditorBackStack;
  children?: ReactNode;
}

/** Makes an {@link EditorBackStack} available to {@link useBackLayer} / {@link useBackStack}. */
export function EditorBackStackProvider({ value, children }: EditorBackStackProviderProps) {
  return <BackStackContext.Provider value={value}>{children}</BackStackContext.Provider>;
}

/** The nearest {@link EditorBackStack}, or `null` outside a provider. */
export function useBackStack(): EditorBackStack | null {
  return useContext(BackStackContext);
}

/** Options for {@link useBackLayer}. */
export interface BackLayerOptions {
  /** Stable id for the layer (defaults to a `useId()` value). */
  id?: string;
}

/**
 * Registers an overlay with the nearest back stack while `open` is true, so Back / Escape calls
 * `onClose`. Unregisters on close, unmount and Activity hide. Without a provider it falls back to
 * closing on Escape only. All shared sheets/dialogs in `components/share/common` already call it.
 *
 * Note: layers opened in the same commit register child-first; open nested layers one at a time.
 */
export function useBackLayer(open: boolean, onClose: () => void, options?: BackLayerOptions): void {
  const stack = useContext(BackStackContext);
  const reactId = useId();
  const id = options?.id ?? reactId;
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    if (!open) return;
    const close = () => onCloseRef.current();
    if (stack) return stack.push(id, close);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, stack, id]);
}
