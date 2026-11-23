export const PROFILE_BANNER_IDS = [
  "yildiz",
  "gunbatimi",
  "yagmur",
  "neon",
  "ucak",
  "defter",
  "retro",
  "konfeti",
  "kabarcik",
  "piksel",
] as const;

export type ProfileBannerId = (typeof PROFILE_BANNER_IDS)[number];

export const PROFILE_BANNERS: { id: ProfileBannerId; name: string }[] = [
  { id: "yildiz", name: "Yıldızlı Gece" },
  { id: "gunbatimi", name: "Gün Batımı" },
  { id: "yagmur", name: "Yağmurlu Cam" },
  { id: "neon", name: "Neon Şehir" },
  { id: "ucak", name: "Kağıt Uçaklar" },
  { id: "defter", name: "Defter Karalaması" },
  { id: "retro", name: "Retro Izgara" },
  { id: "konfeti", name: "Konfeti" },
  { id: "kabarcik", name: "Kabarcıklar" },
  { id: "piksel", name: "Piksel Oyun" },
];

export const FALLBACK_BANNER: ProfileBannerId = "yildiz";

export function isBannerId(v: unknown): v is ProfileBannerId {
  return typeof v === "string" && (PROFILE_BANNER_IDS as readonly string[]).includes(v);
}

export function bannerName(id: ProfileBannerId): string {
  return PROFILE_BANNERS.find((b) => b.id === id)?.name ?? id;
}
