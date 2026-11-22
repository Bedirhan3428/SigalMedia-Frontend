// WP-09: debounced otomatik kayıt. Kayıtlar sıraya girer; silme (discard) bekleyen/uçuştaki kaydı geçersiz kılar.

import type { CanvasEngine } from "@/lib/canvas-editor";
import { DraftError, deleteDraft, saveDraft, type DraftMode } from "./DraftStore";
import { captureDraft } from "./serialize";

export const DRAFT_DEBOUNCE_MS = 1500;

export interface AutosaverDeps {
  getEngine: () => CanvasEngine | null;
  getMode: () => DraftMode;
  isDirty: () => boolean;
  getMusicVolume: () => number;
  onError: (message: string) => void;
}

export class DraftAutosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private generation = 0;
  private warned = false;
  private stopped = false;

  constructor(private deps: AutosaverDeps) {}

  schedule() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      // BUG-10: yakalama + yazma ana iş parçacığını 70-270 ms bloklayıp oynatmada donma yapıyordu.
      // Oynatma sürerken kaydı ertele; durunca / sekme gizlenince (flush) kaydedilir.
      const eng = this.deps.getEngine();
      if (eng && !eng.isDestroyed() && eng.isPlaying()) {
        this.schedule();
        return;
      }
      void this.run();
    }, DRAFT_DEBOUNCE_MS);
  }

  /** Bekleyen kaydı hemen başlat (sekme gizlenirken / sayfa kapanırken). */
  flush() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    void this.run();
  }

  private run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.saveOnce().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    });
    return this.running;
  }

  private async saveOnce() {
    const engine = this.deps.getEngine();
    if (!engine || engine.isDestroyed() || !this.deps.isDirty()) return;
    const gen = this.generation;
    const mode = this.deps.getMode();
    try {
      const cap = await captureDraft(engine, mode, { musicVolume: this.deps.getMusicVolume() });
      if (gen !== this.generation || cap.state.clips.length === 0) return;
      await saveDraft({ mode, state: cap.state, blobs: cap.blobs, isCurrent: () => gen === this.generation });
      this.warned = false;
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        const code = e instanceof DraftError ? e.code : "";
        this.deps.onError(
          code === "quota" || code === "too-large"
            ? "Taslak kaydedilemedi: depolama alanı yetersiz."
            : "Taslak kaydedilemedi."
        );
      }
    }
  }

  /** Taslağı sil: bekleyen kaydı iptal et, uçuştakini geçersiz kıl, sonra kaydı kaldır. */
  async discard(mode: DraftMode) {
    this.generation++;
    this.again = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      await this.running;
    } catch {}
    await deleteDraft(mode);
  }

  /** Yayın sonrası: bir daha kayıt yapma. */
  stop() {
    this.stopped = true;
    this.dispose();
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.generation++;
  }
}
