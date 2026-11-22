// WP-09 (F-06): taslak deposu. JSON durum IndexedDB'de, kaynak medya dosyaları OPFS'te
// (navigator.storage.getDirectory); OPFS yoksa/yazılamıyorsa IndexedDB blob yedeği.
// Moda göre tek taslak, toplam boyut sınırı, kota hataları DraftError ile bildirilir.

export type DraftMode = "story" | "reels" | "post";

export const DRAFT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB

export type DraftErrorCode = "quota" | "too-large" | "unavailable";
export class DraftError extends Error {
  code: DraftErrorCode;
  constructor(code: DraftErrorCode, message: string) {
    super(message);
    this.name = "DraftError";
    this.code = code;
  }
}

export interface DraftMediaEntry {
  key: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  backend: "opfs" | "idb";
}

export interface DraftRecord<S = unknown> {
  mode: DraftMode;
  savedAt: number;
  totalBytes: number;
  media: DraftMediaEntry[];
  state: S;
}

const DB_NAME = "sigal-drafts";
const STORE = "drafts";
const BLOBS = "blobs";
const OPFS_DIR = "sigal-drafts";

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new DraftError("unavailable", "IndexedDB yok"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "mode" });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; code?: number } | null;
  return !!e && (e.name === "QuotaExceededError" || e.code === 22 || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

async function opfsModeDir(mode: DraftMode, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const nav = navigator as Navigator & { storage?: StorageManager };
    if (!nav.storage?.getDirectory) return null;
    const root = await nav.storage.getDirectory();
    const base = await root.getDirectoryHandle(OPFS_DIR, { create });
    return await base.getDirectoryHandle(mode, { create });
  } catch {
    return null;
  }
}

/** Kalıcı depolama izni iste (tarayıcının taslakları kendiliğinden silmesini zorlaştırır). */
export async function requestPersistence(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      if (!(await navigator.storage.persisted?.())) await navigator.storage.persist();
    }
  } catch {}
}

async function writeOpfs(dir: FileSystemDirectoryHandle, key: string, blob: Blob): Promise<boolean> {
  try {
    const fh = await dir.getFileHandle(key, { create: true });
    const w = await (fh as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
    try {
      await blob.stream().pipeTo(w);
    } catch (e) {
      try {
        await w.abort();
      } catch {}
      throw e;
    }
    return true;
  } catch (e) {
    try {
      await dir.removeEntry(key);
    } catch {}
    if (isQuotaError(e)) throw e;
    return false; // createWritable yok (ör. Safari) -> IndexedDB yedeği
  }
}

export async function listDrafts(): Promise<DraftRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const all = (await reqToPromise(tx.objectStore(STORE).getAll())) as DraftRecord[];
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getDraft<S = unknown>(mode: DraftMode): Promise<DraftRecord<S> | null> {
  const db = await openDb();
  const rec = await reqToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(mode));
  return (rec as DraftRecord<S>) || null;
}

async function removeMedia(mode: DraftMode, entries: DraftMediaEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const dir = entries.some((e) => e.backend === "opfs") ? await opfsModeDir(mode, false) : null;
  for (const e of entries) {
    if (e.backend === "opfs" && dir) {
      try {
        await dir.removeEntry(e.key);
      } catch {}
    }
  }
  if (entries.some((e) => e.backend === "idb")) {
    const db = await openDb();
    const tx = db.transaction(BLOBS, "readwrite");
    for (const e of entries) if (e.backend === "idb") tx.objectStore(BLOBS).delete(`${mode}/${e.key}`);
    await txDone(tx).catch(() => {});
  }
}

export async function deleteDraft(mode: DraftMode): Promise<void> {
  try {
    const db = await openDb();
    const rec = (await reqToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(mode))) as
      | DraftRecord
      | undefined;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(mode);
    await txDone(tx);
    if (rec) await removeMedia(mode, rec.media);
    // Kayıtsız kalmış artıkları da temizle
    try {
      const nav = navigator as Navigator & { storage?: StorageManager };
      if (nav.storage?.getDirectory) {
        const root = await nav.storage.getDirectory();
        const base = await root.getDirectoryHandle(OPFS_DIR);
        await base.removeEntry(mode, { recursive: true });
      }
    } catch {}
  } catch {}
}

export interface SaveDraftOptions<S> {
  mode: DraftMode;
  state: S;
  blobs: Map<string, { blob: Blob; name: string; type: string; lastModified: number }>;
  /** false dönerse (eski nesil) kayıt yazılmaz ve yazılan yeni dosyalar silinir. */
  isCurrent?: () => boolean;
}

/** Taslağı yazar. Önce yeni medya dosyaları, sonra durum kaydı, en son kullanılmayan dosyalar silinir. */
export async function saveDraft<S>(opts: SaveDraftOptions<S>): Promise<void> {
  const { mode, state, blobs } = opts;
  const db = await openDb();
  const prev = (await reqToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(mode))) as
    | DraftRecord
    | undefined;
  const others = ((await reqToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as DraftRecord[])
    .filter((r) => r.mode !== mode)
    .reduce((n, r) => n + (r.totalBytes || 0), 0);

  let total = 0;
  for (const b of blobs.values()) total += b.blob.size;
  if (total + others > DRAFT_MAX_TOTAL_BYTES) {
    throw new DraftError("too-large", "Taslak boyutu sınırı (1 GB) aşıldı");
  }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.usage !== undefined) {
      const prevBytes = prev?.totalBytes || 0;
      if (total - prevBytes > est.quota - est.usage) throw new DraftError("quota", "Depolama alanı yetersiz");
    }
  } catch (e) {
    if (e instanceof DraftError) throw e;
  }

  const prevByKey = new Map((prev?.media || []).map((m) => [m.key, m]));
  const entries: DraftMediaEntry[] = [];
  const written: DraftMediaEntry[] = [];
  const dir = await opfsModeDir(mode, true);
  try {
    for (const [key, info] of blobs) {
      const existing = prevByKey.get(key);
      if (existing) {
        entries.push(existing);
        continue;
      }
      let backend: "opfs" | "idb" = "idb";
      if (dir && (await writeOpfs(dir, key, info.blob))) backend = "opfs";
      if (backend === "idb") {
        const tx = db.transaction(BLOBS, "readwrite");
        tx.objectStore(BLOBS).put(info.blob, `${mode}/${key}`);
        await txDone(tx);
      }
      const entry: DraftMediaEntry = {
        key,
        name: info.name,
        type: info.type,
        size: info.blob.size,
        lastModified: info.lastModified,
        backend,
      };
      entries.push(entry);
      written.push(entry);
    }
    if (opts.isCurrent && !opts.isCurrent()) {
      await removeMedia(mode, written);
      return;
    }
    const rec: DraftRecord<S> = { mode, savedAt: Date.now(), totalBytes: total, media: entries, state };
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    await txDone(tx);
  } catch (e) {
    await removeMedia(mode, written);
    if (e instanceof DraftError) throw e;
    if (isQuotaError(e)) throw new DraftError("quota", "Depolama alanı doldu");
    throw e;
  }
  const keep = new Set(entries.map((e) => e.key));
  await removeMedia(
    mode,
    (prev?.media || []).filter((m) => !keep.has(m.key))
  );
}

/** Taslağın medya dosyalarını File olarak okur (OPFS dosyaları gerektiğinde diskten akıtılır). */
export async function loadDraftFiles(rec: DraftRecord): Promise<Map<string, File>> {
  const out = new Map<string, File>();
  const dir = rec.media.some((m) => m.backend === "opfs") ? await opfsModeDir(rec.mode, false) : null;
  const db = rec.media.some((m) => m.backend === "idb") ? await openDb() : null;
  for (const m of rec.media) {
    if (m.backend === "opfs" && dir) {
      const fh = await dir.getFileHandle(m.key);
      const f = await fh.getFile();
      out.set(m.key, new File([f], m.name, { type: m.type, lastModified: m.lastModified }));
    } else if (db) {
      const blob = (await reqToPromise(db.transaction(BLOBS, "readonly").objectStore(BLOBS).get(`${rec.mode}/${m.key}`))) as
        | Blob
        | undefined;
      if (blob) out.set(m.key, new File([blob], m.name, { type: m.type, lastModified: m.lastModified }));
    }
  }
  return out;
}
