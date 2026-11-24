/**
 * Paylaşılan gönderi mesajı: düz metin mesajıdır. Biçim: `<site>/p/<id>` ve isteğe bağlı olarak yeni satırdan sonra not.
 * Tek mesaj gönderilir (kart ile not birlikte kalır, bildirimde de bağlantı görünür).
 */
const KNOWN_HOSTS = ["sigalmedia.com.tr", "www.sigalmedia.com.tr"];
const RE = /^\s*https?:\/\/([^/\s]+)\/p\/([A-Za-z0-9_-]+)\/?(?:[?#]\S*)?(?:[ \t]*\r?\n([\s\S]*))?\s*$/;

export interface PostLink {
  postId: string;
  note: string;
}

export function parsePostLink(text: string | undefined | null, host?: string): PostLink | null {
  if (!text) return null;
  const m = RE.exec(text);
  if (!m) return null;
  const h = (host ?? (typeof window !== "undefined" ? window.location.host : "")).toLowerCase();
  const mh = m[1].toLowerCase();
  if (mh !== h && !KNOWN_HOSTS.includes(mh)) return null;
  return { postId: m[2], note: (m[3] ?? "").trim() };
}

export function buildPostShareText(origin: string, postId: string, note: string): string {
  const url = `${origin}/p/${postId}`;
  const n = note.trim();
  return n ? `${url}\n${n}` : url;
}
