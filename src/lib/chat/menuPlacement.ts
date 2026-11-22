const MARGIN = 10;
const GAP = 8;

/** "23 Kasım 21:04" */
export function formatFullTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const day = d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/** Menü konumu: tercihen mesajın altı; yer yoksa üstü; ekran içinde kalır. Saf fonksiyon (test edilebilir). */
export function placeMenu(
  rect: { left: number; right: number; top: number; bottom: number },
  menu: { w: number; h: number },
  vp: { w: number; h: number },
  mine: boolean
): { left: number; top: number; side: "above" | "below" } {
  const below = vp.h - MARGIN - (rect.bottom + GAP);
  const above = rect.top - GAP - MARGIN;
  let side: "above" | "below";
  if (below >= menu.h) side = "below";
  else if (above >= menu.h) side = "above";
  else side = below >= above ? "below" : "above";
  let top = side === "below" ? rect.bottom + GAP : rect.top - GAP - menu.h;
  top = Math.max(MARGIN, Math.min(top, vp.h - MARGIN - menu.h));
  let left = mine ? rect.right - menu.w : rect.left;
  left = Math.max(MARGIN, Math.min(left, vp.w - MARGIN - menu.w));
  return { left, top, side };
}

