// Local, per-user chat cache in IndexedDB (tiny hand-written wrapper, no dependency).
// Holds the last ~200 messages per chat and the chat-list rows so a chat/list renders immediately
// on open; the live RTDB listener then reconciles. Everything is also kept in memory so an in-app
// navigation can read it synchronously. Cleared on logout. Total size is capped, LRU-evicted.
import {
  CACHE_MESSAGES,
  pickEvictions,
  trimForStore,
  type IndexEntry,
} from "./chatCacheLogic";
import type { ChatMessage, UserChatSummary } from "@/services/messageService";

const DB_NAME = "sigal-chat-cache";
const DB_VERSION = 1;
const MAX_CHATS = 40;
const MAX_BYTES = 6_000_000;
const SAVE_DEBOUNCE_MS = 400;

export type CachedPeer = NonNullable<UserChatSummary["peerProfile"]>;

export interface ChatRecord {
  k: string;
  uid: string;
  chatId: string;
  messages: ChatMessage[];
  /** true when `messages` is the whole chat (nothing older exists) */
  complete: boolean;
  peer?: CachedPeer;
  savedAt: number;
}

interface ListRecord {
  k: string;
  uid: string;
  rows: UserChatSummary[];
  savedAt: number;
}

const memChats = new Map<string, ChatRecord>();
const memLists = new Map<string, UserChatSummary[]>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingChat = new Map<string, ChatRecord>();
let generation = 0;
let dbPromise: Promise<IDBDatabase | null> | null = null;

const key = (uid: string, chatId: string) => `${uid}|${chatId}`;
const hasIdb = () => typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIdb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of ["chats", "lists", "meta", "idx"]) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "k" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function reqP<T>(r: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(undefined);
  });
}
function txDone(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

// ---------- chat messages ----------

export function peekChat(uid: string | null | undefined, chatId: string): ChatRecord | null {
  if (!uid || !chatId) return null;
  return memChats.get(key(uid, chatId)) ?? null;
}

export async function loadChat(uid: string, chatId: string): Promise<ChatRecord | null> {
  if (!uid || !chatId) return null;
  const k = key(uid, chatId);
  const mem = memChats.get(k);
  if (mem) return mem;
  const gen = generation;
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(["chats", "idx"], "readwrite");
    const rec = (await reqP(tx.objectStore("chats").get(k))) as ChatRecord | undefined;
    if (rec) {
      const prev = (await reqP(tx.objectStore("idx").get(k))) as IndexEntry | undefined;
      tx.objectStore("idx").put({ k, lastAccess: Date.now(), bytes: prev?.bytes ?? 0 });
    }
    await txDone(tx);
    if (!rec || gen !== generation) return null;
    memChats.set(k, rec);
    return rec;
  } catch {
    return null;
  }
}

/** Debounced write of a chat's tail. `complete` = the list is the entire chat. */
export function saveChat(
  uid: string,
  chatId: string,
  messages: ChatMessage[],
  opts: { complete: boolean; peer?: CachedPeer | null }
): void {
  if (!uid || !chatId) return;
  const k = key(uid, chatId);
  const { messages: msgs, trimmed } = trimForStore(messages);
  const rec: ChatRecord = {
    k,
    uid,
    chatId,
    messages: msgs,
    complete: opts.complete && !trimmed,
    peer: opts.peer ?? memChats.get(k)?.peer,
    savedAt: Date.now(),
  };
  memChats.set(k, rec);
  pendingChat.set(k, rec);
  const t = timers.get(k);
  if (t) clearTimeout(t);
  const gen = generation;
  timers.set(
    k,
    setTimeout(() => {
      timers.delete(k);
      const r = pendingChat.get(k);
      pendingChat.delete(k);
      if (r && gen === generation) void persistChat(r, gen);
    }, SAVE_DEBOUNCE_MS)
  );
}

async function persistChat(rec: ChatRecord, gen: number): Promise<void> {
  const db = await openDb();
  if (!db || gen !== generation) return;
  try {
    const bytes = JSON.stringify(rec).length;
    const tx = db.transaction(["chats", "idx"], "readwrite");
    tx.objectStore("chats").put(rec);
    tx.objectStore("idx").put({ k: rec.k, lastAccess: Date.now(), bytes } satisfies IndexEntry);
    await txDone(tx);
    await evict(db, gen);
  } catch {
    // cache is best-effort
  }
}

async function evict(db: IDBDatabase, gen: number): Promise<void> {
  if (gen !== generation) return;
  const tx = db.transaction(["chats", "idx"], "readwrite");
  const all = ((await reqP(tx.objectStore("idx").getAll())) as IndexEntry[] | undefined) ?? [];
  for (const k of pickEvictions(all, MAX_CHATS, MAX_BYTES)) {
    tx.objectStore("chats").delete(k);
    tx.objectStore("idx").delete(k);
    memChats.delete(k);
  }
  await txDone(tx);
}

// ---------- chat list ----------

export function peekList(uid: string | null | undefined): UserChatSummary[] | null {
  if (!uid) return null;
  return memLists.get(uid) ?? null;
}

export async function loadList(uid: string): Promise<UserChatSummary[] | null> {
  if (!uid) return null;
  const mem = memLists.get(uid);
  if (mem) return mem;
  const gen = generation;
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction("lists", "readonly");
    const rec = (await reqP(tx.objectStore("lists").get(uid))) as ListRecord | undefined;
    if (!rec || gen !== generation) return null;
    memLists.set(uid, rec.rows);
    return rec.rows;
  } catch {
    return null;
  }
}

export function saveList(uid: string, rows: UserChatSummary[]): void {
  if (!uid) return;
  // presence is live data: never show a stale "online" dot from the cache
  const clean = rows.map((r) => ({ ...r, isOnline: false }));
  memLists.set(uid, clean);
  const gen = generation;
  void openDb().then(async (db) => {
    if (!db || gen !== generation) return;
    try {
      const tx = db.transaction("lists", "readwrite");
      tx.objectStore("lists").put({ k: uid, uid, rows: clean, savedAt: Date.now() } satisfies ListRecord);
      await txDone(tx);
    } catch {}
  });
}

// ---------- last signed-in uid (so a reload can render before auth resolves) ----------

let memLastUid: string | null | undefined;

export async function getLastUid(): Promise<string | null> {
  if (memLastUid !== undefined) return memLastUid;
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction("meta", "readonly");
    const rec = (await reqP(tx.objectStore("meta").get("lastUid"))) as { v?: string } | undefined;
    memLastUid = rec?.v ?? null;
    return memLastUid;
  } catch {
    return null;
  }
}

export function peekLastUid(): string | null {
  return memLastUid ?? null;
}

/** Called when auth resolves. A different user than last time drops the previous user's cache. */
export async function rememberUser(uid: string): Promise<void> {
  const last = await getLastUid();
  if (last && last !== uid) await clearChatCache();
  memLastUid = uid;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ k: "lastUid", v: uid });
    await txDone(tx);
  } catch {}
}

// ---------- logout ----------

export async function clearChatCache(): Promise<void> {
  generation += 1;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  pendingChat.clear();
  memChats.clear();
  memLists.clear();
  memLastUid = null;
  if (!hasIdb()) return;
  try {
    const db = await openDb();
    if (db) {
      const names = ["chats", "lists", "meta", "idx"];
      const tx = db.transaction(names, "readwrite");
      for (const n of names) tx.objectStore(n).clear();
      await txDone(tx);
      db.close();
    }
  } catch {}
  dbPromise = null;
  try {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  } catch {}
}

export { CACHE_MESSAGES };
export type { ChatMessage };
