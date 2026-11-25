// Sahte kullanıcılar ve örnek gönderiler (taslaktaki içerik). Yalnızca ön yüz; harici görsel yok, medya SVG ile üretilir.
import type { ArtKey, FeedUser, Post } from "./types";

export const MOCK_USERS: Record<string, FeedUser> = {
  ece: { id: "ece", username: "ece", bio: "Gün batımı koleksiyoncusu", avatarGradient: "linear-gradient(135deg,#ff9a6b,#ff4d8d)", badgeIds: ["zincir", "seri", "ilk"] },
  mert: { id: "mert", username: "mert", bio: "Kaykay, dalga, kahve", avatarGradient: "linear-gradient(135deg,#4cc9f0,#4361ee)", badgeIds: ["trend", "begeni"] },
  deniz: { id: "deniz", username: "deniz", bio: "Anket delisi", avatarGradient: "linear-gradient(135deg,#a99bff,#6f5cff)", badgeIds: ["kahin", "ilk", "oy"] },
  zeynep: { id: "zeynep", username: "zeynep", bio: "Her şeye anket açarım", avatarGradient: "linear-gradient(135deg,#ffd24a,#ff8a3d)", badgeIds: ["kral", "kahin"] },
  selin: { id: "selin", username: "selin", bio: "Fotoğraf, yürüyüş", avatarGradient: "linear-gradient(135deg,#4ade80,#0ea5a5)", badgeIds: ["begeni"] },
};

export const ART_KEYS: ArtKey[] = ["sunset", "wave", "hills", "city", "pink"];

const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
const inMin = (min: number) => new Date(NOW + min * 60000).toISOString();

interface SeedBase {
  id: string;
  authorId: string;
  min: number; // kaç dakika önce
  likes: number;
  comments: number;
  /** Zincirde görünmeyen eski yanıtların sayısı (toplam sayıya eklenir). */
  olderReplies?: number;
  pills?: string[];
  reply?: { parentId: string; depth: number };
  caption?: string;
}
type Seed =
  | (SeedBase & { type: "photo"; art: ArtKey; arts?: ArtKey[] })
  | (SeedBase & { type: "video"; art: ArtKey; dur: number })
  | (SeedBase & { type: "poll"; question: string; options: { id: string; text: string; votes: number; art?: ArtKey }[]; endsInMin: number; my?: string });

export const SEEDS: Seed[] = [
  { id: "p1", type: "photo", authorId: "ece", art: "sunset", min: 90, likes: 248, comments: 31, pills: ["gundem"], caption: "Kadıköy'de gün batımı bugün fazla güzeldi. Sizin akşamınız nasıl?" },
  { id: "p2", type: "photo", authorId: "deniz", art: "hills", min: 9, likes: 96, comments: 8, pills: ["yeni"], reply: { parentId: "p1", depth: 1 }, caption: "Bu manzaraya benim cevabım: sabah sisi ve bol yeşil." },
  { id: "r1a", type: "photo", authorId: "ece", art: "pink", min: 6, likes: 14, comments: 1, reply: { parentId: "p2", depth: 2 }, caption: "Vay, bu sis nerede? Hemen gitmek istedim." },
  { id: "r1b", type: "photo", authorId: "mert", art: "wave", min: 3, likes: 5, comments: 0, reply: { parentId: "r1a", depth: 3 }, caption: "Hafta sonu hep beraber gidelim mi?" },
  { id: "r2", type: "photo", authorId: "mert", art: "wave", min: 30, likes: 41, comments: 3, reply: { parentId: "p1", depth: 1 }, caption: "Benim akşamım deniz kenarında geçti." },
  { id: "r3", type: "photo", authorId: "selin", art: "city", min: 55, likes: 128, comments: 6, reply: { parentId: "p1", depth: 1 }, caption: "Çok güzel olmuş, ellerine sağlık!" },
  { id: "p3", type: "video", authorId: "mert", art: "wave", dur: 14, min: 60, likes: 512, comments: 74, olderReplies: 11, pills: ["gundem"], caption: "Skate parkta ilk kez 360 flip tuttu! Üçüncü denemede." },
  { id: "q1", type: "photo", authorId: "selin", art: "hills", min: 20, likes: 33, comments: 2, reply: { parentId: "p3", depth: 1 }, caption: "Bu kaç denemede oldu, sayıyor muydun?" },
  { id: "p4", type: "poll", authorId: "deniz", min: 120, likes: 87, comments: 19, olderReplies: 1, question: "Hafta sonu planı hangisi olsun?", endsInMin: 134, options: [
    { id: "a", text: "Sahilde yürüyüş", votes: 142, art: "wave" }, { id: "b", text: "Evde film maratonu", votes: 96, art: "city" }, { id: "c", text: "Bisiklet turu", votes: 61, art: "hills" }] },
  { id: "p5", type: "poll", authorId: "zeynep", min: 300, likes: 164, comments: 42, olderReplies: 4, question: "Pazartesi kahvesi?", endsInMin: 24 * 60, my: "b", options: [
    { id: "a", text: "Filtre kahve", votes: 310 }, { id: "b", text: "Latte", votes: 455 }, { id: "c", text: "Çay, kahve değil", votes: 288 }, { id: "d", text: "Hiçbiri, uyku", votes: 197 }] },
  { id: "p6", type: "photo", authorId: "selin", art: "city", min: 20, likes: 1240, comments: 96, pills: ["gunun", "yeni"], caption: "Gece yürüyüşünde şehir ışıkları. Bugünün favorisi bu." },
  { id: "q2", type: "photo", authorId: "ece", art: "sunset", min: 12, likes: 60, comments: 4, reply: { parentId: "p6", depth: 1 }, caption: "Bu kareyi duvar kağıdı yaptım bile." },
  { id: "p13", type: "photo", authorId: "ece", art: "sunset", arts: ["sunset", "wave", "hills", "city", "pink"], min: 40, likes: 310, comments: 22, pills: ["yeni"], caption: "Haftanın fotoğraf dizisi: beş kare, beş ruh hali." },
  { id: "p14", type: "photo", authorId: "selin", art: "city", arts: ["city", "pink", "hills"], min: 150, likes: 87, comments: 6, caption: "Üç kare, tek gezi." },
  { id: "p7", type: "photo", authorId: "mert", art: "hills", min: 380, likes: 72, comments: 5, caption: "Sabah koşusu, bugün 8 km. Kahve hak edildi." },
  { id: "r4", type: "photo", authorId: "ece", art: "sunset", min: 30, likes: 0, comments: 0, reply: { parentId: "p7", depth: 1 }, caption: "Ben de yarın koşuya çıkıyorum." },
  { id: "p8", type: "poll", authorId: "ece", min: 3000, likes: 51, comments: 9, question: "En iyi mevsim hangisi?", endsInMin: -120, options: [
    { id: "a", text: "Yaz", votes: 220 }, { id: "b", text: "Sonbahar", votes: 340 }, { id: "c", text: "Kış", votes: 90 }] },
  { id: "p9", type: "video", authorId: "selin", art: "city", dur: 22, min: 460, likes: 301, comments: 18, caption: "Kadıköy iskelesinde akşam, ses açık dinleyin." },
  { id: "p10", type: "photo", authorId: "zeynep", art: "pink", min: 520, likes: 44, comments: 2, caption: "Yeni tablo bitti. İsim önerisi alıyorum." },
  { id: "p11", type: "poll", authorId: "mert", min: 600, likes: 38, comments: 7, question: "Bu akşam hangi dizi?", endsInMin: 3 * 24 * 60, options: [
    { id: "a", text: "Polisiye", votes: 18 }, { id: "b", text: "Komedi", votes: 25 }, { id: "c", text: "Bilim kurgu", votes: 31 }, { id: "d", text: "Belgesel", votes: 9 }] },
  { id: "p12", type: "photo", authorId: "deniz", art: "wave", min: 700, likes: 129, comments: 11, caption: "Dalgaların sesi ders çalışmaktan iyi." },
];

export interface SeedMeta {
  post: Post;
  olderReplies: number;
}

/** Tohumları Post'a çevirir. Yanıt/beğeni sayıları servis tarafından türetilir. */
export function buildSeedPosts(): Map<string, SeedMeta> {
  const byId = new Map<string, Seed>(SEEDS.map((s) => [s.id, s]));
  const rootOf = (s: Seed): string => (s.reply ? rootOf(byId.get(s.reply.parentId)!) : s.id);
  const map = new Map<string, SeedMeta>();
  for (const s of SEEDS) {
    const base = {
      id: s.id,
      kind: "post" as const,
      authorId: s.authorId,
      createdAt: ago(s.min),
      caption: s.caption,
      likeCount: s.likes,
      commentCount: s.comments,
      replyCount: 0,
      likedByMe: false,
      postBadges: s.pills ?? [],
      replyTo: s.reply ? { parentId: s.reply.parentId, rootId: rootOf(s), depth: s.reply.depth } : undefined,
    };
    let post: Post;
    if (s.type === "photo") post = { ...base, type: "photo", art: s.art, photos: s.arts?.map((a) => ({ art: a })) };
    else if (s.type === "video") post = { ...base, type: "video", art: s.art, durationSec: s.dur };
    else
      post = {
        ...base,
        type: "poll",
        question: s.question,
        options: s.options.map((o) => ({ ...o })),
        endsAt: inMin(s.endsInMin),
        myVoteOptionId: s.my ?? null,
      };
    map.set(s.id, { post, olderReplies: s.olderReplies ?? 0 });
  }
  return map;
}

/** Akışta görünen orijinal gönderilerin sırası. */
export const FEED_ORDER = ["p1", "p13", "p3", "p14", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"];
