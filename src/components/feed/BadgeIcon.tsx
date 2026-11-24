import { memo } from "react";
import { BADGES, POST_BADGES, TIER_LABEL } from "@/lib/feed/badgeRules";

/** Kullanıcı (altıgen) ve anket (yuvarlak) rozeti. Seviye aria-label ile de söylenir. */
export const BadgeIcon = memo(function BadgeIcon({ id, size = "", locked = false }: { id: string; size?: "" | "lg" | "xl"; locked?: boolean }) {
  const b = BADGES[id];
  if (!b) return null;
  return (
    <span
      className={`fd-bdg ${size ? `fd-${size}` : ""} ${locked ? "fd-lock" : ""}`}
      data-k={b.kind === "poll" ? "poll" : "ach"}
      data-tier={b.tier}
      role="img"
      aria-label={`${b.name}, ${TIER_LABEL[b.tier!]}`}
    >
      <svg aria-hidden="true"><use href={`#fd-${b.glyph}`} /></svg>
    </span>
  );
});

/** Gönderi rozeti (hap etiket). */
export const PostPill = memo(function PostPill({ id }: { id: string }) {
  const b = POST_BADGES[id];
  if (!b) return null;
  return (
    <span className="fd-pill" data-p={id}>
      <svg aria-hidden="true"><use href={`#fd-${b.glyph}`} /></svg>
      {b.name}
    </span>
  );
});
