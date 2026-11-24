// Shovrum akış: ön yüz veri tipleri. Yalnızca ön yüz; arka uç bağlandığında feedService yerine geçecek.
export type PostType = "photo" | "video" | "poll";
export type BadgeKind = "achievement" | "post" | "poll";
export type Tier = "bronz" | "gumus" | "altin";
export type ArtKey = "sunset" | "wave" | "hills" | "city" | "pink";
export type ChainSort = "popular" | "new";
export type DurationKey = "1s" | "1g" | "3g" | "7g";

export interface Badge {
  id: string;
  kind: BadgeKind;
  /** Gönderi rozetlerinde (kind 'post') seviye yoktur. */
  tier?: Tier;
  name: string;
  description: string;
  glyph: string;
}

export interface ReplyRef {
  parentId: string;
  rootId: string;
  /** Her zaman 1: zincirler düzdür, yanıt hep köke gider. */
  depth: number;
}

export interface FeedUser {
  id: string;
  username: string;
  bio?: string;
  avatarGradient?: string;
  avatarUrl?: string;
  /** Sahip olunan rozet kimlikleri; ilki kullanıcı adının yanında gösterilir. */
  badgeIds: string[];
  isMe?: boolean;
}

interface PostBase {
  id: string;
  type: PostType;
  authorId: string;
  createdAt: string; // ISO
  caption?: string;
  likeCount: number;
  commentCount: number;
  /** Zincirdeki tüm alt yanıtların sayısı. */
  replyCount: number;
  likedByMe: boolean;
  postBadges: string[];
  replyTo?: ReplyRef;
}

export interface PhotoItem {
  /** Yoksa art yer tutucusu gösterilir (örnek içerik). */
  url?: string;
  art?: ArtKey;
  width?: number;
  height?: number;
}

export interface PhotoPost extends PostBase {
  type: "photo";
  /** Gerçek görsel (blob/URL). Yoksa art kullanılır. */
  mediaUrl?: string;
  /** Çoklu fotoğraf (en çok 7); ilki mediaUrl ile aynıdır. */
  photos?: PhotoItem[];
  art: ArtKey;
}

export interface VideoPost extends PostBase {
  type: "video";
  /** Gerçek video kaynağı. Yoksa art + durationSec ile simüle edilir. */
  mediaUrl?: string;
  posterUrl?: string;
  art: ArtKey;
  durationSec: number;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  art?: ArtKey;
}

export interface PollPost extends PostBase {
  type: "poll";
  question: string;
  options: PollOption[];
  endsAt: string; // ISO
  myVoteOptionId: string | null;
}

export type Post = PhotoPost | VideoPost | PollPost;

export interface PollVote {
  pollId: string;
  optionId: string;
  userId: string;
  at: string;
}

export interface PollDraft {
  kind: "poll";
  question: string;
  options: string[];
  durationKey: DurationKey;
}

export interface MediaDraft {
  kind: "photo" | "video";
  media: File | string;
  caption?: string;
  durationSec?: number;
}

export type PostDraft = MediaDraft | PollDraft;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CurrentUserInfo {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface FeedService {
  setCurrentUser(u: CurrentUserInfo): void;
  getUser(id: string): FeedUser;
  /** Yalnızca orijinal gönderiler (yanıtlar akışta ayrı kart olmaz; kartın altında ReplyRail ile görünür). */
  listFeed(cursor?: string, limit?: number): Promise<Page<Post>>;
  /** Kökün en popüler yanıtları (beğeni >= 1; çok beğenilen önce, eşitlikte yeni önce). Eşzamanlı, yüklü önbellekten. */
  getPopularReplies(rootId: string, n?: number): Post[];
  /** Tek gönderi (yoksa undefined). */
  getPost(id: string): Promise<Post | undefined>;
  /** Editörde Firebase'e yayımlanan bir yanıt için rozet kurallarını işletir. */
  notePublished(isReply: boolean, parentId?: string): Promise<void>;
  getChain(rootId: string, sort: ChainSort): Promise<{ root: Post; replies: Post[] }>;
  toggleLike(postId: string): Promise<Post>;
  vote(pollId: string, optionId: string): Promise<PollPost>;
  createPost(draft: PostDraft): Promise<Post>;
  createReply(parentId: string, draft: PostDraft): Promise<Post>;
  getUserBadges(userId: string): Promise<{ owned: Badge[]; all: Badge[] }>;
  onBadgeUnlocked(cb: (b: Badge) => void): () => void;
  subscribe(cb: () => void): () => void;
  getVersion(): number;
  /** Kahin rozeti için kalan oy sayısı. */
  votesToKahin(): number;
}
