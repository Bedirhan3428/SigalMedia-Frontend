// Sahte akış servisi (yalnızca ön yüz). Gerçek arka uç bağlandığında FeedService arayüzü aynı kalır, bu dosya değişir.
// Durum bellekte tutulur; beğeni/oy/oluşturulan gönderiler localStorage'a (try/catch) yazılır.
import { BADGES, SHELF_IDS, VOTES_FOR_KAHIN, evaluateAfterCreate, evaluateAfterVote, sortBadgeIds, type RuleState } from "./badgeRules";
import { countReplies, fetchOriginals, fetchPost, fetchReplies, fetchRepliesBatch, type RemotePost } from "./firestoreSource";
import { ART_KEYS, FEED_ORDER, MOCK_USERS, buildSeedPosts } from "./mockData";
import type {
  ArtKey, Badge, ChainSort, CurrentUserInfo, FeedService, FeedUser, Page, PollDraft, Post, PostDraft,
} from "./types";

const STORE_KEY = "shovrum.feed.v1";
const DUR_MIN: Record<string, number> = { "1s": 60, "1g": 1440, "3g": 4320, "7g": 10080 };

interface Persisted {
  v: 1;
  likes: Record<string, boolean>;
  votes: Record<string, string>;
  created: Post[];
  rule: RuleState;
}

const emptyState = (): Persisted => ({
  v: 1,
  likes: {},
  votes: {},
  created: [],
  rule: { postsCreated: 0, repliesCreated: 0, votesCast: 0, unlocked: [] },
});

const delay = (ms = 90 + Math.random() * 110) => new Promise<void>((r) => setTimeout(r, ms));
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

class MockFeedService implements FeedService {
  private me: CurrentUserInfo = { id: "me", username: "sen" };
  private seeds = buildSeedPosts();
  private state: Persisted = emptyState();
  private loadedFor: string | null = null;
  private listeners = new Set<() => void>();
  private badgeListeners = new Set<(b: Badge) => void>();
  private version = 0;
  /** Oturumda oluşturulan, kalıcı olmayan blob adresleri (yalnızca bellekte). */
  private blobs = new Map<string, string>();
  /** Firestore'dan okunan gerçek gönderiler (yalnızca bellek önbelleği). */
  private remote = new Map<string, Post>();
  private remoteUsers = new Map<string, FeedUser>();
  /** Zincir başına sunucu sayımı (getCountFromServer), önbellekli. */
  private remoteCounts = new Map<string, number>();
  private chainLoaded = new Map<string, number>();
  /** Firestore ulaşılamadıysa bu zamana kadar (ms) sorgulanmaz; akış örnek içerikle açılır. */
  private remoteDownUntil = 0;
  private async remoteCall<T>(fn: () => Promise<T>): Promise<T> {
    if (Date.now() < this.remoteDownUntil) throw new Error("remote-down");
    try {
      return await fn();
    } catch (e) {
      if ((e as Error).message === "firestore-timeout") this.remoteDownUntil = Date.now() + 60000;
      throw e;
    }
  }
  /** Dinleyici yokken (ör. düzenleyicide) açılan rozetler; akış açılınca teslim edilir. */
  private pendingBadges: Badge[] = [];

  setCurrentUser(u: CurrentUserInfo) {
    const changed = this.me.id !== u.id || this.me.username !== u.username || this.me.avatarUrl !== u.avatarUrl;
    this.me = u;
    if (this.loadedFor !== u.id) {
      this.loadedFor = u.id;
      this.state = this.read(u.id);
    }
    if (changed) this.emit();
  }

  private read(uid: string): Persisted {
    try {
      const raw = localStorage.getItem(`${STORE_KEY}.${uid}`);
      if (raw) {
        const p = JSON.parse(raw) as Persisted;
        if (p && p.v === 1) return { ...emptyState(), ...p };
      }
    } catch {
      /* depolama yok */
    }
    return emptyState();
  }

  private write() {
    try {
      // blob adresleri kalıcı olmaz: yerine art yer tutucusu kalır.
      const created = this.state.created.map((p) => {
        if ((p.type === "photo" || p.type === "video") && p.mediaUrl) return { ...p, mediaUrl: undefined };
        return p;
      });
      localStorage.setItem(`${STORE_KEY}.${this.loadedFor ?? this.me.id}`, JSON.stringify({ ...this.state, created }));
    } catch {
      /* kota/gizli mod */
    }
  }

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  getVersion() {
    return this.version;
  }
  onBadgeUnlocked(cb: (b: Badge) => void) {
    this.badgeListeners.add(cb);
    const pending = this.pendingBadges.splice(0);
    if (pending.length) setTimeout(() => pending.forEach((b) => cb(b)), 0);
    return () => this.badgeListeners.delete(cb);
  }
  votesToKahin() {
    return Math.max(0, VOTES_FOR_KAHIN - this.state.rule.votesCast);
  }

  getUser(id: string): FeedUser {
    if (id === this.me.id) {
      return {
        id,
        username: this.me.username,
        avatarUrl: this.me.avatarUrl,
        avatarGradient: "linear-gradient(135deg,#a99bff,#6f5cff)",
        bio: "Bu sensin",
        badgeIds: sortBadgeIds(this.state.rule.unlocked),
        isMe: true,
      };
    }
    return MOCK_USERS[id] ?? this.remoteUsers.get(id) ?? { id, username: id, badgeIds: [] };
  }

  // ---- gönderi birleştirme ----

  private rawAll(): Post[] {
    return [...[...this.seeds.values()].map((s) => s.post), ...this.remote.values(), ...this.state.created];
  }

  /** Zincirler düzdür: bir kökün tüm yanıtları (eski, derin veriler dahil) rootId ile bulunur. */
  private descendants(id: string, all: Post[]): Post[] {
    return all.filter((p) => p.replyTo?.rootId === id && p.id !== id);
  }

  /** Beğeni/oy/yanıt sayılarını ve geçici rozetleri uygular. */
  private materialize(p: Post, all: Post[]): Post {
    const liked = !!this.state.likes[p.id];
    const desc = this.descendants(p.id, all).length;
    const extra = this.seeds.get(p.id)?.olderReplies ?? 0;
    const postBadges = [...p.postBadges];
    if (!p.replyTo && desc > 0 && !postBadges.includes("zincir")) postBadges.push("zincir");
    const base = {
      ...p,
      // Eski veride derinlik > 1 olabilir: düzleştirilmiş gösterilir (ebeveyn = kök, derinlik 1).
      replyTo: p.replyTo ? { parentId: p.replyTo.rootId, rootId: p.replyTo.rootId, depth: 1 } : undefined,
      likedByMe: liked,
      likeCount: p.likeCount + (liked ? 1 : 0),
      replyCount: extra + Math.max(desc, this.remoteCounts.get(p.id) ?? 0),
      postBadges,
    };
    const blob = this.blobs.get(p.id);
    if (base.type === "poll") {
      const mine = this.state.votes[p.id];
      return {
        ...base,
        myVoteOptionId: mine ?? base.myVoteOptionId,
        options: base.options.map((o) => ({ ...o, votes: o.votes + (mine === o.id ? 1 : 0) })),
      };
    }
    return blob ? { ...base, mediaUrl: blob } : base;
  }

  private find(id: string): Post | undefined {
    const all = this.rawAll();
    const p = all.find((x) => x.id === id);
    return p ? this.materialize(p, all) : undefined;
  }

  // ---- okuma ----

  private ingest(rs: RemotePost[]) {
    for (const r of rs) {
      this.remote.set(r.post.id, r.post);
      if (r.user.id && !MOCK_USERS[r.user.id]) this.remoteUsers.set(r.user.id, r.user);
    }
  }

  /** Bir kökün gerçek yanıtlarını önbelleğe alır (kısa süre içinde tekrar sorgulanmaz). */
  private async loadChain(rootId: string, force = false) {
    const at = this.chainLoaded.get(rootId);
    if (!force && at && Date.now() - at < 15000) return;
    this.chainLoaded.set(rootId, Date.now());
    try {
      const rs = await this.remoteCall(() => fetchReplies(rootId));
      this.ingest(rs);
      // Sunucu toplulaştırması yalnızca sayfalama sınırı aşılırsa gerekir
      if (rs.length >= 100) this.remoteCounts.set(rootId, await this.remoteCall(() => countReplies(rootId)));
    } catch {
      /* çevrimdışı: yalnızca örnek içerik */
    }
  }

  /** Bir sayfadaki köklerin yanıtlarını tek `in` sorgusuyla yükler (kök başına sorgu yok). */
  private async loadReplies(rootIds: string[]) {
    const stale = rootIds.filter((id) => {
      const at = this.chainLoaded.get(id);
      return !at || Date.now() - at >= 15000;
    });
    if (!stale.length) return;
    stale.forEach((id) => this.chainLoaded.set(id, Date.now()));
    try {
      const rs = await this.remoteCall(() => fetchRepliesBatch(stale));
      this.ingest(rs);
      const per = new Map<string, number>();
      rs.forEach((r) => r.post.replyTo && per.set(r.post.replyTo.rootId, (per.get(r.post.replyTo.rootId) ?? 0) + 1));
      for (const [id, n] of per) if (n >= 100) this.remoteCounts.set(id, await this.remoteCall(() => countReplies(id)));
    } catch {
      /* çevrimdışı: yalnızca örnek içerik */
    }
  }

  getPopularReplies(rootId: string, n = 2): Post[] {
    const all = this.rawAll();
    return this.descendants(rootId, all)
      .map((p) => this.materialize(p, all))
      .filter((p) => p.likeCount >= 1)
      .sort((a, b) => b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt))
      .slice(0, n);
  }

  async notePublished(isReply: boolean, parentId?: string): Promise<void> {
    let trending = false;
    if (isReply && parentId) {
      const parent = this.find(parentId) ?? (await this.getPost(parentId));
      const root = parent ? this.find(parent.replyTo?.rootId ?? parent.id) ?? parent : undefined;
      trending = !!(root?.postBadges.includes("gundem") || parent?.postBadges.includes("gundem"));
    }
    if (isReply) this.state.rule.repliesCreated++;
    else this.state.rule.postsCreated++;
    const unlocked = evaluateAfterCreate(this.state.rule, { isReply, parentIsTrending: trending });
    this.write();
    this.emit();
    this.fireBadges(unlocked);
  }

  async getPost(id: string): Promise<Post | undefined> {
    const hit = this.find(id);
    if (hit) return hit;
    try {
      const r = await this.remoteCall(() => fetchPost(id));
      if (r) {
        this.ingest([r]);
        return this.find(id);
      }
    } catch {
      /* yoksay */
    }
    return undefined;
  }

  async listFeed(cursor?: string, limit = 5): Promise<Page<Post>> {
    await delay();
    const items: Post[] = [];
    // Üst düzey akışta yalnızca orijinal gönderiler olur; yanıtlar kartın altındaki ReplyRail'de görünür.
    const addOriginal = (id: string, all: Post[]) => {
      const p = all.find((x) => x.id === id);
      if (p && !p.replyTo) items.push(this.materialize(p, all));
    };
    // 1) gerçek gönderiler (en yeni önce, 10'luk sayfalar), 2) örnek içerik
    if (!cursor || cursor.startsWith("r:")) {
      const before = cursor ? parseInt(cursor.slice(2), 10) || undefined : undefined;
      let ids: string[] = [];
      let nextMs: number | null = null;
      try {
        const r = await this.remoteCall(() => fetchOriginals(before, 10));
        this.ingest(r.items);
        ids = r.items.map((x) => x.post.id);
        nextMs = r.nextMs;
        await this.loadReplies(ids);
      } catch {
        /* çevrimdışı */
      }
      const mine = cursor ? [] : this.state.created.filter((p) => !p.replyTo).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => p.id);
      if (!ids.length && !nextMs && !mine.length) return this.listFeed("m:0", limit);
      const all = this.rawAll();
      for (const id of [...mine, ...ids]) addOriginal(id, all);
      return { items, nextCursor: nextMs ? `r:${nextMs}` : "m:0" };
    }
    const order = FEED_ORDER;
    const start = parseInt(cursor.slice(2), 10) || 0;
    const slice = order.slice(start, start + limit);
    await this.loadReplies(slice);
    const all = this.rawAll();
    for (const id of slice) addOriginal(id, all);
    const next = start + limit;
    return { items, nextCursor: next < order.length ? `m:${next}` : null };
  }

  async getChain(rootId: string, sort: ChainSort) {
    await delay(60);
    if (!this.find(rootId)) await this.getPost(rootId);
    await this.loadChain(rootId, true);
    const all = this.rawAll();
    const root = all.find((p) => p.id === rootId);
    if (!root) throw new Error("Gönderi bulunamadı");
    // Düz zincir: kökün tüm yanıtları tek seviyede
    const replies = this.descendants(rootId, all)
      .map((p) => this.materialize(p, all))
      .sort((a, b) => (sort === "popular" ? b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt)));
    return { root: this.materialize(root, all), replies };
  }

  async getUserBadges(userId: string) {
    await delay(40);
    const user = this.getUser(userId);
    return { owned: user.badgeIds.filter((i) => BADGES[i]).map((i) => BADGES[i]), all: SHELF_IDS.map((i) => BADGES[i]) };
  }

  // ---- yazma ----

  async toggleLike(postId: string): Promise<Post> {
    await delay(40);
    this.state.likes[postId] = !this.state.likes[postId];
    if (!this.state.likes[postId]) delete this.state.likes[postId];
    this.write();
    this.emit();
    return this.find(postId)!;
  }

  async vote(pollId: string, optionId: string) {
    await delay(60);
    const p = this.find(pollId);
    if (!p || p.type !== "poll") throw new Error("Anket bulunamadı");
    if (p.myVoteOptionId) return p; // idempotent: tek oy
    if (new Date(p.endsAt).getTime() <= Date.now()) throw new Error("Anket sona erdi");
    if (!p.options.some((o) => o.id === optionId)) throw new Error("Seçenek yok");
    this.state.votes[pollId] = optionId;
    this.state.rule.votesCast++;
    const unlocked = evaluateAfterVote(this.state.rule);
    this.write();
    this.emit();
    this.fireBadges(unlocked);
    return this.find(pollId) as typeof p;
  }

  private fireBadges(ids: string[]) {
    ids.forEach((id) => {
      if (!BADGES[id]) return;
      if (this.badgeListeners.size === 0) this.pendingBadges.push(BADGES[id]);
      else this.badgeListeners.forEach((l) => l(BADGES[id]));
    });
  }

  private build(draft: PostDraft, reply?: { parent: Post }): Post {
    const id = `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const art: ArtKey = ART_KEYS[hash(id) % ART_KEYS.length];
    const parent = reply?.parent;
    const base = {
      id,
      authorId: this.me.id,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
      replyCount: 0,
      likedByMe: false,
      postBadges: ["yeni"],
      // Yanıta yanıt kökün yanıtıdır: ebeveyn her zaman kök, derinlik 1.
      replyTo: parent ? { parentId: parent.replyTo?.rootId ?? parent.id, rootId: parent.replyTo?.rootId ?? parent.id, depth: 1 } : undefined,
    };
    if (draft.kind === "poll") {
      const d = draft as PollDraft;
      return {
        ...base,
        type: "poll",
        question: d.question.trim().slice(0, 120),
        options: d.options.map((t) => t.trim()).filter(Boolean).slice(0, 4).map((t, i) => ({ id: String.fromCharCode(97 + i), text: t.slice(0, 40), votes: 0 })),
        endsAt: new Date(Date.now() + (DUR_MIN[d.durationKey] ?? 1440) * 60000).toISOString(),
        myVoteOptionId: null,
      };
    }
    let url: string | undefined;
    if (typeof draft.media === "string") url = draft.media;
    else if (typeof URL !== "undefined" && URL.createObjectURL) url = URL.createObjectURL(draft.media);
    if (url?.startsWith("blob:")) this.blobs.set(id, url);
    const caption = draft.caption?.trim().slice(0, 200) || undefined;
    return draft.kind === "video"
      ? { ...base, type: "video", art, durationSec: Math.round(draft.durationSec || 10), caption, mediaUrl: url }
      : { ...base, type: "photo", art, caption, mediaUrl: url };
  }

  private commit(post: Post, isReply: boolean, parentIsTrending: boolean): Post {
    this.state.created.push(post);
    if (isReply) this.state.rule.repliesCreated++;
    else this.state.rule.postsCreated++;
    const unlocked = evaluateAfterCreate(this.state.rule, { isReply, parentIsTrending });
    this.write();
    this.emit();
    this.fireBadges(unlocked);
    return this.find(post.id)!;
  }

  async createPost(draft: PostDraft): Promise<Post> {
    await delay(160);
    return this.commit(this.build(draft), false, false);
  }

  async createReply(parentId: string, draft: PostDraft): Promise<Post> {
    await delay(160);
    const parent = this.find(parentId);
    if (!parent) throw new Error("Üst gönderi bulunamadı");
    const root = this.find(parent.replyTo?.rootId ?? parent.id) ?? parent;
    const trending = root.postBadges.includes("gundem") || parent.postBadges.includes("gundem");
    return this.commit(this.build(draft, { parent }), true, trending);
  }
}

export const feedService: FeedService = new MockFeedService();
