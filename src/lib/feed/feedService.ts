// Sahte akış servisi (yalnızca ön yüz). Gerçek arka uç bağlandığında FeedService arayüzü aynı kalır, bu dosya değişir.
// Durum bellekte tutulur; beğeni/oy/oluşturulan gönderiler localStorage'a (try/catch) yazılır.
import { BADGES, SHELF_IDS, VOTES_FOR_KAHIN, evaluateAfterCreate, evaluateAfterVote, sortBadgeIds, type RuleState } from "./badgeRules";
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
    return MOCK_USERS[id] ?? { id, username: id, badgeIds: [] };
  }

  // ---- gönderi birleştirme ----

  private rawAll(): Post[] {
    return [...[...this.seeds.values()].map((s) => s.post), ...this.state.created];
  }

  private descendants(id: string, all: Post[]): Post[] {
    const out: Post[] = [];
    const walk = (pid: string) => {
      for (const p of all) {
        if (p.replyTo?.parentId === pid) {
          out.push(p);
          walk(p.id);
        }
      }
    };
    walk(id);
    return out;
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
      likedByMe: liked,
      likeCount: p.likeCount + (liked ? 1 : 0),
      replyCount: extra + desc,
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

  async listFeed(cursor?: string, limit = 5): Promise<Page<Post>> {
    await delay();
    const all = this.rawAll();
    const mineOriginals = this.state.created.filter((p) => !p.replyTo).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => p.id);
    const order = [...mineOriginals, ...FEED_ORDER];
    const start = cursor ? parseInt(cursor, 10) || 0 : 0;
    const slice = order.slice(start, start + limit);
    const items: Post[] = [];
    for (const id of slice) {
      const p = all.find((x) => x.id === id);
      if (!p) continue;
      items.push(this.materialize(p, all));
      const first = all
        .filter((x) => x.replyTo?.parentId === id && x.replyTo.depth === 1)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (first) items.push(this.materialize(first, all));
    }
    const next = start + limit;
    return { items, nextCursor: next < order.length ? String(next) : null };
  }

  async getChain(rootId: string, sort: ChainSort) {
    await delay(60);
    const all = this.rawAll();
    const root = all.find((p) => p.id === rootId);
    if (!root) throw new Error("Gönderi bulunamadı");
    const kids = (pid: string) => all.filter((p) => p.replyTo?.parentId === pid);
    const tops = kids(rootId).sort((a, b) =>
      sort === "popular"
        ? b.likeCount + (this.state.likes[b.id] ? 1 : 0) - (a.likeCount + (this.state.likes[a.id] ? 1 : 0))
        : b.createdAt.localeCompare(a.createdAt),
    );
    const replies: Post[] = [];
    const walk = (p: Post) => {
      replies.push(this.materialize(p, all));
      kids(p.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(walk);
    };
    tops.forEach(walk);
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
    ids.forEach((id) => BADGES[id] && this.badgeListeners.forEach((l) => l(BADGES[id])));
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
      replyTo: parent ? { parentId: parent.id, rootId: parent.replyTo?.rootId ?? parent.id, depth: (parent.replyTo?.depth ?? 0) + 1 } : undefined,
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
