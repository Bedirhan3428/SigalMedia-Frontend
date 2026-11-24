"use client";
import { useState } from "react";
import type { Badge } from "@/lib/feed/types";
import { TIER_LABEL } from "@/lib/feed/badgeRules";
import { BadgeIcon } from "./BadgeIcon";
import { Sheet } from "./Sheet";
import { useReducedMotion } from "./hooks";

const COLS = ["#ffd24a", "#a99bff", "#ff6b81", "#7ee0ff", "#4ade80"];

export function BadgeCelebration({ badge, onClose, opener }: { badge: Badge; onClose: () => void; opener?: HTMLElement | null }) {
  const rm = useReducedMotion();
  // Konfeti: 36 parça, rastgele konum/gecikme (render başına bir kez)
  const [pieces] = useState(() => Array.from({ length: 36 }, (_, i) => ({ left: Math.random() * 100, bg: COLS[i % 5], delay: Math.random() * 0.8, dur: 1.8 + Math.random() * 1.2 })));
  return (
    <Sheet titleId="fd-ceT" title="Rozet kazandın!" onClose={onClose} className="fd-cel" hideHeader opener={opener}>
      {!rm ? (
        <div className="fd-conf" aria-hidden="true" data-testid="fd-confetti">
          {pieces.map((p, i) => <i key={i} style={{ left: `${p.left}%`, background: p.bg, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />)}
        </div>
      ) : null}
      <div className="fd-sb" style={{ alignItems: "center", paddingTop: 28, position: "relative" }}>
        <p className="fd-eyebrow">Yeni rozet</p>
        <BadgeIcon id={badge.id} size="xl" />
        <h3 id="fd-ceT" className="fd-h3">Rozet kazandın!</h3>
        <p style={{ color: "var(--tx2)", textAlign: "center" }}>{badge.name} · {TIER_LABEL[badge.tier!]}. {badge.description}</p>
        <button type="button" className="fd-cta" style={{ width: "100%" }} onClick={onClose}>Harika!</button>
      </div>
    </Sheet>
  );
}
