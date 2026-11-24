/** "Görüldü" etiketi: okunma zamanı biliniyorsa göreli süre eklenir, bilinmiyorsa yalnızca "Görüldü". */
export function formatSeenLabel(readAt: number | undefined, now: number): string {
  if (typeof readAt !== "number" || !Number.isFinite(readAt) || readAt <= 0) return "Görüldü";
  const diff = Math.max(0, now - readAt);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Şimdi görüldü";
  if (min < 60) return `${min} dk önce görüldü`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce görüldü`;
  return `${Math.floor(hr / 24)} g önce görüldü`;
}
