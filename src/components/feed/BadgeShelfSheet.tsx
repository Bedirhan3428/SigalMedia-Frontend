"use client";
import { useEffect, useState } from "react";
import { feedService } from "@/lib/feed/feedService";
import { BADGES, SHELF_IDS, TIER_LABEL } from "@/lib/feed/badgeRules";
import type { Badge, FeedUser } from "@/lib/feed/types";
import { BadgeIcon } from "./BadgeIcon";
import { Sheet } from "./Sheet";
import { Avatar } from "./UserParts";

export function BadgeShelfSheet({ userId, onClose, opener }: { userId: string; onClose: () => void; opener?: HTMLElement | null }) {
  const [owned, setOwned] = useState<Badge[] | null>(null);
  const user: FeedUser = feedService.getUser(userId);
  useEffect(() => {
    let live = true;
    feedService.getUserBadges(userId).then((r) => live && setOwned(r.owned));
    return () => { live = false; };
  }, [userId]);
  const has = new Set((owned ?? []).map((b) => b.id));

  return (
    <Sheet titleId="fd-prT" title="Mini profil" onClose={onClose} opener={opener}>
      <div className="fd-sb">
        <div className="fd-pro-top">
          <Avatar user={user} size={56} />
          <div>
            <b style={{ fontSize: 17 }}>@{user.username}</b>
            <p style={{ color: "var(--tx2)", fontSize: 13.5 }}>{user.bio}</p>
          </div>
        </div>
        <p className="fd-lab">ROZET RAFI · <span data-testid="fd-shelf-count">{owned ? `${has.size} / ${SHELF_IDS.length}` : "…"}</span></p>
        <div className="fd-shelf">
          {SHELF_IDS.map((id) => {
            const own = has.has(id);
            return (
              <div className="fd-sl" key={id} data-owned={own}>
                <BadgeIcon id={id} size="lg" locked={!own} />
                <b>{nameOf(id)}</b>
                <span>{own ? tierOf(id) : "kilitli"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
const nameOf = (id: string) => BADGES[id].name;
const tierOf = (id: string) => TIER_LABEL[BADGES[id].tier!];
