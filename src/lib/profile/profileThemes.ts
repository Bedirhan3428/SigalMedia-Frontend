export const PROFILE_THEME_IDS = ["sade", "defter", "y2k", "dolap"] as const;
export type ProfileThemeId = (typeof PROFILE_THEME_IDS)[number];

export const DEFAULT_THEME: ProfileThemeId = "sade";

export const PROFILE_THEMES: { id: ProfileThemeId; name: string; note: string }[] = [
  { id: "sade", name: "Sade", note: "Varsayılan" },
  { id: "defter", name: "Defter Arası", note: "Bant ve el yazısı" },
  { id: "y2k", name: "Y2K Parlak", note: "Cam ve neon" },
  { id: "dolap", name: "Dolap Kapağı", note: "Kalın çerçeve" },
];

export function isThemeId(v: unknown): v is ProfileThemeId {
  return typeof v === "string" && (PROFILE_THEME_IDS as readonly string[]).includes(v);
}
