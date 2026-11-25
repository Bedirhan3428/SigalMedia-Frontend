// WP-37: uygulama genelinde bellek içi yayın kuyruğu.
// Dışa aktarma biter bitmez blob'lar + gönderi verisi buraya devredilir; kullanıcı editörden hemen çıkar.
// Her iş: dosyalar Storage'a yeniden başlatılabilir (resumable) yüklenir (gerçek bayt ilerlemesi, video + poster paralel),
// sonra gönderi belgesi yazılır. SINIRLAMA: kuyruk yalnızca bellektedir; sekme kapanırsa/yenilenirse yükleme kaybolur
// (sekme kapatılırken devam eden iş varsa tarayıcı uyarısı gösterilir). Başarısız iş bellekte kalır ve "Tekrar dene" ile sürer.
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

export type JobStatus = "uploading" | "saving" | "done" | "error";
export type JobKind = "story" | "reels" | "post" | "reply";

export interface UploadFile {
  /** createPost'a verilen url haritasının anahtarı */
  key: string;
  path: string;
  blob: Blob;
  contentType: string;
}

export interface PublishJobInput {
  kind: JobKind;
  files: UploadFile[];
  /** Tüm dosyalar yüklendikten sonra gönderi belgesini yazar ve kimliğini döndürür (yeniden denemede yalnızca bir kez başarılı olmalıdır). */
  createPost: (urls: Record<string, string>) => Promise<string>;
  /** Gönderi yazıldıktan sonra (rozet, sayaç, profil yenileme). Hatalar yutulur. */
  afterCreate?: (postId: string) => Promise<void> | void;
  /** Başarıdan sonra (taslak silme gibi) */
  onDone?: () => void;
  /** "Görüntüle" hedefi */
  href: (postId: string) => string;
}

export interface JobSnapshot {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** 0..1 (yalnızca baytlar; "saving" iken 1) */
  progress: number;
  bytesDone: number;
  bytesTotal: number;
  postId?: string;
  href?: string;
  error?: string;
}

interface Job {
  id: string;
  input: PublishJobInput;
  status: JobStatus;
  transferred: Record<string, number>;
  urls: Record<string, string>;
  postId?: string;
  created: boolean;
  error?: string;
}

const CACHE_CONTROL = "public,max-age=31536000,immutable";
const CONCURRENCY = 3;

class UploadQueue {
  private jobs: Job[] = [];
  private listeners = new Set<() => void>();
  private publishedListeners = new Set<(postId: string, kind: JobKind) => void>();
  private snap: JobSnapshot[] = [];
  private seq = 0;
  private guardOn = false;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = () => this.snap;
  getServerSnapshot = () => EMPTY;

  /** Bir iş başarıyla yayımlanınca çağrılır (akış / profil yenileme). */
  onPublished(cb: (postId: string, kind: JobKind) => void) {
    this.publishedListeners.add(cb);
    return () => {
      this.publishedListeners.delete(cb);
    };
  }

  enqueue(input: PublishJobInput): string {
    const job: Job = { id: `job${Date.now()}_${++this.seq}`, input, status: "uploading", transferred: {}, urls: {}, created: false };
    this.jobs.push(job);
    this.emit();
    void this.run(job);
    return job.id;
  }

  retry(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status !== "error") return;
    job.error = undefined;
    job.status = "uploading";
    // yarım kalan dosyaların sayacı sıfırlanır (tamamlananlar url ile korunur)
    for (const f of job.input.files) if (!job.urls[f.key]) job.transferred[f.key] = 0;
    this.emit();
    void this.run(job);
  }

  dismiss(id: string) {
    const i = this.jobs.findIndex((j) => j.id === id);
    if (i < 0) return;
    if (this.jobs[i].status === "uploading" || this.jobs[i].status === "saving") return;
    this.jobs.splice(i, 1);
    this.emit();
  }

  hasActive() {
    return this.jobs.some((j) => j.status === "uploading" || j.status === "saving");
  }

  private async run(job: Job) {
    try {
      const todo = job.input.files.filter((f) => !job.urls[f.key]);
      let next = 0;
      const worker = async () => {
        while (next < todo.length) {
          const f = todo[next++];
          await this.uploadOne(job, f);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
      job.status = "saving";
      this.emit();
      if (!job.created) {
        job.postId = await job.input.createPost(job.urls);
        job.created = true;
      }
      job.status = "done";
      this.emit();
      try {
        await job.input.afterCreate?.(job.postId as string);
      } catch (e) {
        console.warn("Yayın sonrası adım başarısız:", e);
      }
      try {
        job.input.onDone?.();
      } catch {
        /* yoksay */
      }
      this.publishedListeners.forEach((cb) => cb(job.postId as string, job.input.kind));
    } catch (e) {
      job.status = "error";
      job.error = e instanceof Error ? e.message : String(e);
      console.error("Yayın yüklemesi başarısız:", e);
      this.emit();
    }
  }

  private uploadOne(job: Job, f: UploadFile): Promise<void> {
    return new Promise((resolve, reject) => {
      const r = ref(storage, f.path);
      const task = uploadBytesResumable(r, f.blob, { contentType: f.contentType, cacheControl: CACHE_CONTROL });
      task.on(
        "state_changed",
        (s) => {
          job.transferred[f.key] = s.bytesTransferred;
          this.emit();
        },
        (err) => reject(err),
        () => {
          getDownloadURL(task.snapshot.ref).then((url) => {
            job.transferred[f.key] = f.blob.size;
            job.urls[f.key] = url;
            this.emit();
            resolve();
          }, reject);
        }
      );
    });
  }

  private emit() {
    this.snap = this.jobs.map((j) => {
      const total = j.input.files.reduce((a, f) => a + f.blob.size, 0) || 1;
      const done = Math.min(total, j.input.files.reduce((a, f) => a + (j.transferred[f.key] ?? 0), 0));
      const finished = j.status === "saving" || j.status === "done";
      return {
        id: j.id,
        kind: j.input.kind,
        status: j.status,
        progress: finished ? 1 : done / total,
        bytesDone: finished ? total : done,
        bytesTotal: total,
        postId: j.postId,
        href: j.postId ? j.input.href(j.postId) : undefined,
        error: j.error,
      };
    });
    this.syncUnloadGuard();
    this.listeners.forEach((cb) => cb());
  }

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!this.hasActive()) return;
    e.preventDefault();
    e.returnValue = "";
  };

  private syncUnloadGuard() {
    if (typeof window === "undefined") return;
    const need = this.hasActive();
    if (need && !this.guardOn) {
      window.addEventListener("beforeunload", this.onBeforeUnload);
      this.guardOn = true;
    } else if (!need && this.guardOn) {
      window.removeEventListener("beforeunload", this.onBeforeUnload);
      this.guardOn = false;
    }
  }
}

const EMPTY: JobSnapshot[] = [];
export const uploadQueue = new UploadQueue();
