/** Maximum hashtags saved with a post. */
export const MAX_HASHTAGS = 30;

/** Static suggestion list (until a trending service exists). */
export const SUGGESTED_HASHTAGS = ["shovrum", "keşfet", "günbatımı", "okul", "müzik", "spor", "sanat", "komik"];

const TAG_RE = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{1,60})/gu;

/** Lowercases (Turkish rules) and keeps unicode letters/digits/underscore. */
function normalize(tag: string): string {
  return tag.toLocaleLowerCase("tr");
}

/** Extracts unique lowercase hashtags (without `#`) in order of appearance, at most {@link MAX_HASHTAGS}. */
export function parseHashtags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const tag = normalize(m[2]);
    if (/^\d+$/.test(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}
