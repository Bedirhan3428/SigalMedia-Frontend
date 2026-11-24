"use client";
import { memo } from "react";
import { feedService } from "@/lib/feed/feedService";
import { sortBadgeIds } from "@/lib/feed/badgeRules";
import type { FeedUser } from "@/lib/feed/types";
import { BadgeIcon } from "./BadgeIcon";
import { useFeedVersion } from "./hooks";
import { useFeedActions } from "./FeedContext";

export function useFeedUser(id: string): FeedUser {
  useFeedVersion();
  return feedService.getUser(id);
}

export const Avatar = memo(function Avatar({ user, size }: { user: FeedUser; size?: number }) {
  const st: React.CSSProperties = { background: user.avatarGradient, ...(size ? { width: size, height: size } : {}) };
  return (
    <span className="fd-av" style={st} aria-hidden="true">
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : user.username[0]?.toUpperCase()}
    </span>
  );
});

/** Kullanıcı adı + en üst rozet (dokununca mini profil) + zaman. */
export function Who({ userId, time, avatar = 36 }: { userId: string; time?: string; avatar?: number }) {
  const user = useFeedUser(userId);
  const { openProfile } = useFeedActions();
  const top = user.isMe ? sortBadgeIds(user.badgeIds)[0] : user.badgeIds[0];
  return (
    <>
      <Avatar user={user} size={avatar} />
      <span className="fd-who">
        <b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>@{user.username}</b>
        <button type="button" className="fd-ub" aria-label={`@${user.username} rozetlerini aç`} onClick={(e) => openProfile(userId, e.currentTarget)}>
          {top ? <BadgeIcon id={top} /> : <span className="fd-bdg" data-k="ach" data-tier="bronz" style={{ opacity: 0.35 }} aria-hidden="true" />}
        </button>
        {time ? <small>· {time}</small> : null}
      </span>
    </>
  );
}
