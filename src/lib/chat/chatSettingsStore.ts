// Sohbete özel ayarlar için küçük, tipli adaptör. Şimdilik localStorage; backend gelince yalnızca
// bu uygulama değişir, arayüz (get/set/reset/subscribe) sabit kalır. Hiçbir ağ/Firebase çağrısı yok.
import {
  DEFAULT_CHAT_SETTINGS,
  THEME_IDS,
  type ChatSettings,
  type ChatThemeId,
} from "./chatThemes";

export interface ChatSettingsStore {
  get(chatId: string): ChatSettings;
  set(chatId: string, s: ChatSettings): void;
  reset(chatId: string): void;
  subscribe(chatId: string, fn: (s: ChatSettings) => void): () => void;
  getPhoto(chatId: string): string | null;
  /** false: depolama kotası/engel nedeniyle kaydedilemedi. null kaldırır. */
  setPhoto(chatId: string, dataUrl: string | null): boolean;
}

const settingsKey = (id: string) => `chat.settings.v1.${id}`;
const photoKey = (id: string) => `chat.photo.v1.${id}`;
/** Saklanan fotoğraf için üst sınır (data URL uzunluğu, karakter). */
export const MAX_PHOTO_CHARS = 900_000;

const clamp = (n: unknown, lo: number, hi: number, d: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;

export function normalizeSettings(raw: unknown): ChatSettings {
  const D = DEFAULT_CHAT_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...D, bg: { ...D.bg } };
  const r = raw as Record<string, unknown>;
  const bg = (r.bg && typeof r.bg === "object" ? r.bg : {}) as Record<string, unknown>;
  const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
    typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d;
  return {
    v: 1,
    theme: oneOf<ChatThemeId>(r.theme, THEME_IDS, D.theme),
    bg: {
      type: oneOf(bg.type, ["solid", "gradient", "pattern", "photo"] as const, D.bg.type),
      pattern: oneOf(bg.pattern, ["dots", "lines", "grid"] as const, D.bg.pattern),
      photo: typeof bg.photo === "string" && bg.photo.length < 20 ? bg.photo : D.bg.photo,
      blur: clamp(bg.blur, 0, 20, 0),
      dim: clamp(bg.dim, 0, 80, 0),
      ...(typeof bg.customAt === "number" && Number.isFinite(bg.customAt) ? { customAt: bg.customAt } : {}),
    },
    bubble: oneOf(r.bubble, ["round", "soft", "sharp"] as const, D.bubble),
    textSize: oneOf(r.textSize, ["S", "M", "L"] as const, D.textSize),
    compact: r.compact === true,
    nickname: typeof r.nickname === "string" ? r.nickname.slice(0, 24) : "",
  };
}

const listeners = new Map<string, Set<(s: ChatSettings) => void>>();

function emit(chatId: string) {
  const s = chatSettingsStore.get(chatId);
  listeners.get(chatId)?.forEach((fn) => fn(s));
}

export const chatSettingsStore: ChatSettingsStore = {
  get(chatId) {
    try {
      const raw = window.localStorage.getItem(settingsKey(chatId));
      return normalizeSettings(raw ? JSON.parse(raw) : null);
    } catch {
      return normalizeSettings(null);
    }
  },
  set(chatId, s) {
    try {
      window.localStorage.setItem(settingsKey(chatId), JSON.stringify(normalizeSettings(s)));
    } catch {
      /* depolama kapalı/dolu: bu oturumda uygulanır, kalıcı olmaz */
    }
    emit(chatId);
  },
  reset(chatId) {
    try {
      window.localStorage.removeItem(settingsKey(chatId));
      window.localStorage.removeItem(photoKey(chatId));
    } catch {
      /* yoksay */
    }
    emit(chatId);
  },
  subscribe(chatId, fn) {
    let set = listeners.get(chatId);
    if (!set) listeners.set(chatId, (set = new Set()));
    set.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key === settingsKey(chatId)) fn(chatSettingsStore.get(chatId));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      set.delete(fn);
      window.removeEventListener("storage", onStorage);
    };
  },
  getPhoto(chatId) {
    try {
      return window.localStorage.getItem(photoKey(chatId));
    } catch {
      return null;
    }
  },
  setPhoto(chatId, dataUrl) {
    try {
      if (dataUrl === null) window.localStorage.removeItem(photoKey(chatId));
      else {
        if (dataUrl.length > MAX_PHOTO_CHARS) return false;
        window.localStorage.setItem(photoKey(chatId), dataUrl);
      }
      return true;
    } catch {
      return false;
    }
  },
};

/** Galeriden seçilen dosyayı en çok 1280px'e küçültüp JPEG data URL'ine çevirir; sınırı aşarsa kaliteyi düşürür. */
export async function downscalePhoto(file: File): Promise<string | null> {
  try {
    const src = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("img"));
      i.src = src;
    });
    URL.revokeObjectURL(src);
    let maxSide = 1280;
    for (let attempt = 0; attempt < 4; attempt++) {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", attempt === 0 ? 0.8 : 0.65);
      if (url.length <= MAX_PHOTO_CHARS) return url;
      maxSide = Math.round(maxSide * 0.7);
    }
    return null;
  } catch {
    return null;
  }
}
