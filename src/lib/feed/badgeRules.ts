// Rozet kataloğu ve kazanma kuralları (tek dosya). Kurallar bilerek basit tutuldu; arka uç bağlanınca sunucuya taşınır.
import type { Badge, Tier } from "./types";

export const TIER_LABEL: Record<Tier, string> = { bronz: "bronz", gumus: "gümüş", altin: "altın" };

const A = (id: string, name: string, glyph: string, description: string, tier: Tier): Badge => ({ id, kind: "achievement", tier, name, glyph, description });
const P = (id: string, name: string, glyph: string, description: string, tier: Tier): Badge => ({ id, kind: "poll", tier, name, glyph, description });

export const BADGES: Record<string, Badge> = {
  ilk: A("ilk", "İlk Gönderi", "g-pen", "İlk gönderini paylaştın.", "bronz"),
  seri: A("seri", "7 Günlük Seri", "g-flame", "7 gün üst üste paylaşım yaptın.", "gumus"),
  begeni: A("begeni", "100 Beğeni", "g-heart", "Gönderilerin toplam 100 beğeni aldı.", "gumus"),
  zincir: A("zincir", "Zincir Ustası", "g-link", "3 yanıt zinciri başlattın ya da sürdürdün.", "altin"),
  trend: A("trend", "Trend Avcısı", "g-trend", "Gündemdeki bir gönderiye yanıt verdin.", "altin"),
  kahin: P("kahin", "Kahin", "g-eye", "10 ankete oy verdin.", "gumus"),
  kral: P("kral", "Anket Kralı", "g-crown", "Haftanın en çok oy alan anketi senin.", "altin"),
  oy: P("oy", "Oy Avcısı", "g-vote", "50 ankete oy verdin.", "bronz"),
};

/** Raf sırası (mini profil). */
export const SHELF_IDS = ["ilk", "seri", "begeni", "zincir", "trend", "kahin", "kral", "oy"];

export const POST_BADGES: Record<string, { name: string; glyph: string; description: string }> = {
  gundem: { name: "Gündemde", glyph: "g-flame", description: "Son saatte hızla etkileşim alıyor." },
  yeni: { name: "Yeni", glyph: "g-bolt", description: "Son 30 dakikada paylaşıldı." },
  gunun: { name: "Günün Gönderisi", glyph: "g-crown", description: "Bugün en çok beğenilen gönderi." },
  zincir: { name: "Zincirin Başı", glyph: "g-link", description: "Bu gönderiye yanıt zinciri bağlı." },
};

export const VOTES_FOR_KAHIN = 10;
export const VOTES_FOR_OY = 50;
export const REPLIES_FOR_ZINCIR = 3;

export interface RuleState {
  postsCreated: number;
  repliesCreated: number;
  votesCast: number;
  unlocked: string[];
}

const TIER_RANK: Record<Tier, number> = { altin: 3, gumus: 2, bronz: 1 };

export function sortBadgeIds(ids: string[]): string[] {
  return [...ids].filter((i) => BADGES[i]).sort((a, b) => TIER_RANK[BADGES[b].tier!] - TIER_RANK[BADGES[a].tier!]);
}

/** Kullanıcı adının yanında gösterilecek en yüksek öncelikli rozet. */
export function topBadgeId(ids: string[]): string | undefined {
  return [...ids].filter((i) => BADGES[i]).sort((a, b) => TIER_RANK[BADGES[b].tier!] - TIER_RANK[BADGES[a].tier!])[0];
}

function grant(state: RuleState, id: string, out: string[]) {
  if (!state.unlocked.includes(id)) {
    state.unlocked.push(id);
    out.push(id);
  }
}

/** Gönderi/yanıt oluşturulduktan sonra çağrılır (state önce güncellenmiş olmalı). Yeni açılan rozet kimliklerini döner. */
export function evaluateAfterCreate(state: RuleState, ctx: { isReply: boolean; parentIsTrending: boolean }): string[] {
  const out: string[] = [];
  if (state.postsCreated + state.repliesCreated >= 1) grant(state, "ilk", out);
  if (ctx.isReply && ctx.parentIsTrending) grant(state, "trend", out);
  if (state.repliesCreated >= REPLIES_FOR_ZINCIR) grant(state, "zincir", out);
  return out;
}

export function evaluateAfterVote(state: RuleState): string[] {
  const out: string[] = [];
  if (state.votesCast >= VOTES_FOR_KAHIN) grant(state, "kahin", out);
  if (state.votesCast >= VOTES_FOR_OY) grant(state, "oy", out);
  return out;
}
