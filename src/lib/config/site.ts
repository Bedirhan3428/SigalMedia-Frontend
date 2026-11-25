// Tek yerden marka/site sabitleri. Alan adı henüz kesinleşmedi: paylaşım
// kökeni tarayıcıda window.location.origin'den gelir.
export const SITE_NAME = "Shovrum";
export const SITE_DESCRIPTION =
  "Yeni nesil modern, hızlı ve bağlantıda tutan sosyal medya platformu.";
export const FILE_PREFIX = "shovrum";

// Yasal/destek yer tutucuları (gerçek değerler sahibi tarafından girilecek).
export const LEGAL_CONTROLLER_NAME = "[VERİ SORUMLUSU ADI]";
export const SUPPORT_EMAIL = "[İLETİŞİM E-POSTASI]";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
export const LEGAL_LAST_UPDATED = "25 Kasım 2026";

// Sunucu tarafı (metadata/OG) için yedek köken; istemci window.location.origin kullanır.
export const FALLBACK_ORIGIN = "https://sigalmedia.com.tr";

export function getShareOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return (process.env.NEXT_PUBLIC_APP_URL || FALLBACK_ORIGIN).trim();
}
