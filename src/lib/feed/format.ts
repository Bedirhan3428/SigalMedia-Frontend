export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "şimdi";
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  return `${Math.floor(h / 24)} g`;
}

export function timeLeft(endsAt: string, now = Date.now()): string {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "Anket sona erdi";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} dk kaldı`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa ${m % 60} dk kaldı`;
  return `Bitmesine ${Math.ceil(h / 24)} gün`;
}

export function fmtDur(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}
