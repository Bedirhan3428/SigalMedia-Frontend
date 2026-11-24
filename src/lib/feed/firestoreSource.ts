// Gerçek gönderiler için Firestore okuyucu (yalnızca okuma). Beğeni, anket ve rozetler yerelde kalır.
// Sorgular tek alanlı eşitlik/sıralama kullanır: bileşik dizin gerekmez.
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, Timestamp, where, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ART_KEYS } from "./mockData";
import type { FeedUser, PhotoItem, Post, ReplyRef } from "./types";

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

interface MediaItem { url?: string; type?: string; width?: number; height?: number; posterUrl?: string }

export interface RemotePost { post: Post; user: FeedUser }

function toIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return new Date().toISOString();
}

/** Firestore `posts` belgesini akış gönderisine çevirir; hikaye ve medyasız belgeler null döner. */
export function docToPost(id: string, d: DocumentData): RemotePost | null {
  if (d.type === "story") return null;
  const media: MediaItem[] = Array.isArray(d.media) && d.media.length ? d.media : d.mediaUrl ? [{ url: d.mediaUrl, type: d.mediaType }] : [];
  const first = media[0];
  if (!first?.url) return null;
  const rt = d.replyTo as Partial<ReplyRef> | undefined;
  const replyTo: ReplyRef | undefined = rt?.parentId ? { parentId: rt.parentId, rootId: rt.rootId ?? rt.parentId, depth: rt.depth ?? 1 } : undefined;
  const base = {
    id,
    authorId: String(d.authorId ?? ""),
    createdAt: toIso(d.createdAt),
    caption: d.caption || undefined,
    likeCount: Number(d.likesCount) || 0,
    commentCount: Number(d.commentsCount) || 0,
    replyCount: 0,
    likedByMe: false,
    postBadges: [] as string[],
    replyTo,
  };
  const art = ART_KEYS[hash(id) % ART_KEYS.length];
  const post: Post =
    first.type === "video" || d.mediaType === "video"
      ? { ...base, type: "video", art, mediaUrl: first.url, posterUrl: first.posterUrl, durationSec: Number(d.duration) || 0 }
      : {
          ...base,
          type: "photo",
          art,
          mediaUrl: first.url,
          photos: media.filter((m) => m.url).map((m): PhotoItem => ({ url: m.url, width: m.width, height: m.height })),
        };
  const user: FeedUser = {
    id: base.authorId,
    username: d.authorUsername || d.authorDisplayName || "kullanici",
    avatarUrl: d.authorPhotoURL || undefined,
    badgeIds: [],
  };
  return { post, user };
}

const RAW = 30;
/** Çevrimdışı/yavaş ağda akış örnek içerikle açılsın diye her okumaya üst süre koyar. */
const TIMEOUT_MS = 6000;
function within<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("firestore-timeout")), TIMEOUT_MS);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Orijinal (yanıt olmayan) gönderiler, en yeni önce. beforeMs: bu zamandan eski olanlar. */
export async function fetchOriginals(beforeMs: number | undefined, want = 10): Promise<{ items: RemotePost[]; nextMs: number | null }> {
  const col = collection(db, "posts");
  const q = beforeMs ? query(col, orderBy("createdAt", "desc"), where("createdAt", "<", Timestamp.fromMillis(beforeMs)), limit(RAW)) : query(col, orderBy("createdAt", "desc"), limit(RAW));
  const snap = await within(getDocs(q));
  const items: RemotePost[] = [];
  let lastMs: number | null = null;
  for (const s of snap.docs) {
    const r = docToPost(s.id, s.data());
    if (!r || r.post.replyTo) continue;
    if (items.length >= want) break;
    items.push(r);
    lastMs = new Date(r.post.createdAt).getTime();
  }
  const more = snap.docs.length === RAW || items.length >= want;
  return { items, nextMs: more && lastMs ? lastMs : null };
}

/** Bir kökün tüm yanıtları (en çok 100). */
export async function fetchReplies(rootId: string): Promise<RemotePost[]> {
  const snap = await within(getDocs(query(collection(db, "posts"), where("replyTo.rootId", "==", rootId), limit(100))));
  return snap.docs.map((s) => docToPost(s.id, s.data())).filter((x): x is RemotePost => !!x);
}

export async function fetchPost(id: string): Promise<RemotePost | null> {
  const s = await within(getDoc(doc(db, "posts", id)));
  return s.exists() ? docToPost(s.id, s.data()) : null;
}

/** Zincirdeki toplam yanıt sayısı (sunucu toplulaştırması). */
export async function countReplies(rootId: string): Promise<number> {
  const s = await within(getCountFromServer(query(collection(db, "posts"), where("replyTo.rootId", "==", rootId))));
  return s.data().count;
}
