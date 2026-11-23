import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FALLBACK_BANNER,
  isBannerId,
  type ProfileBannerId,
} from "./profileBanners";
import { DEFAULT_THEME, isThemeId, type ProfileThemeId } from "./profileThemes";

export interface ProfileSong {
  trackId: number;
  title: string;
  artist: string;
  artworkUrl: string;
  previewUrl: string;
}

export interface ProfileStyle {
  v: 1;
  theme: ProfileThemeId;
  banner: ProfileBannerId | null;
  song: ProfileSong | null;
}

export const DEFAULT_PROFILE_STYLE: ProfileStyle = {
  v: 1,
  theme: DEFAULT_THEME,
  banner: null,
  song: null,
};

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

function isHttps(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

function parseSong(raw: unknown): ProfileSong | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.trackId !== "number" || !Number.isFinite(s.trackId)) return null;
  if (!isHttps(s.previewUrl)) return null;
  const title = clip(s.title, 120);
  if (!title) return null;
  return {
    trackId: s.trackId,
    title,
    artist: clip(s.artist, 120),
    artworkUrl: isHttps(s.artworkUrl) ? (s.artworkUrl as string) : "",
    previewUrl: s.previewUrl,
  };
}

/** Firestore'dan gelen ham değeri doğrular; geçersiz her şey varsayılana düşer. */
export function parseProfileStyle(raw: unknown): ProfileStyle {
  if (!raw || typeof raw !== "object") return DEFAULT_PROFILE_STYLE;
  const r = raw as Record<string, unknown>;
  return {
    v: 1,
    theme: isThemeId(r.theme) ? r.theme : DEFAULT_THEME,
    banner: isBannerId(r.banner) ? r.banner : null,
    song: parseSong(r.song),
  };
}

/** Ekranda gerçekten çizilecek banner: sade temada seçilmediyse yok, diğer temalarda yıldızlı gece. */
export function effectiveBanner(style: ProfileStyle): ProfileBannerId | null {
  if (style.banner) return style.banner;
  return style.theme === "sade" ? null : FALLBACK_BANNER;
}

/** Kaydetme: yalnızca bu modül Firestore'a dokunur (ileride arka uç ile değiştirilebilir). */
export async function saveProfileStyle(uid: string, style: ProfileStyle): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    profileStyle: style,
    updatedAt: serverTimestamp(),
  });
}
