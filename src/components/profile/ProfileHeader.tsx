"use client";

import type { ReactNode } from "react";
import { User as UserIcon } from "lucide-react";
import "./profile.css";
import ProfileBanner from "./ProfileBanner";
import type { ProfileBannerId } from "@/lib/profile/profileBanners";
import type { ProfileThemeId } from "@/lib/profile/profileThemes";
import { themeFontClass } from "@/lib/profile/profileFonts";

export function profileRootClass(theme: ProfileThemeId) {
  return `pf-root pf-t-${theme} ${themeFontClass(theme)}`;
}

export type StatKind = "posts" | "followers" | "following";

interface Props {
  theme: ProfileThemeId;
  banner: ProfileBannerId | null;
  photoURL?: string;
  displayName: string;
  username: string;
  bio?: string;
  counts: { posts: number; followers: number; following: number };
  /** Takipçi/Takip öğesini sayfa kendi davranışıyla çizer (Link veya button). */
  renderStat: (kind: "followers" | "following", className: string, children: ReactNode) => ReactNode;
  onAvatarClick?: () => void;
  avatarTitle?: string;
  songSlot: ReactNode;
  actions: ReactNode;
}

const LABEL = { posts: "Gönderi", followers: "Takipçi", following: "Takip" } as const;

/** Profil üst bölümü: Sade (mevcut görünüm) ve 3 tema. Sayfaların veri akışına dokunmaz. */
export default function ProfileHeader(p: Props) {
  const themed = p.theme !== "sade";
  const avatar = p.photoURL ? (
    <img
      src={p.photoURL}
      alt={p.displayName || "Profil"}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      className="w-full h-full object-cover select-none no-select"
    />
  ) : (
    <UserIcon className={themed ? "w-9 h-9" : "w-9 h-9 text-zinc-600"} />
  );

  if (!themed) {
    const cell = (kind: StatKind) => (
      <>
        <span className="text-base font-bold text-white leading-none">{p.counts[kind]}</span>
        <span className="text-[12px] text-zinc-400 mt-1">{LABEL[kind]}</span>
      </>
    );
    const linkCls = "flex flex-col items-center flex-1";
    return (
      <>
        {p.banner && (
          <div className="pf-banner-sade">
            <ProfileBanner id={p.banner} />
          </div>
        )}
        <div className="flex items-center gap-4">
          {p.onAvatarClick ? (
            <button
              type="button"
              onClick={p.onAvatarClick}
              title={p.avatarTitle}
              className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer group relative hover:opacity-90 transition-opacity btn-press-subtle"
            >
              {avatar}
            </button>
          ) : (
            <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
              {avatar}
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h1 className="text-lg font-bold text-white truncate mb-2">{p.displayName}</h1>
            <div className="flex items-center justify-between text-center">
              <div className={linkCls}>{cell("posts")}</div>
              {p.renderStat("followers", `${linkCls} hover:opacity-80 transition-opacity btn-press-subtle`, cell("followers"))}
              {p.renderStat("following", `${linkCls} hover:opacity-80 transition-opacity btn-press-subtle`, cell("following"))}
            </div>
          </div>
        </div>
        {p.bio && <p className="mt-3 text-sm text-zinc-200 whitespace-pre-line leading-relaxed">{p.bio}</p>}
        {p.songSlot && <div className="mt-3">{p.songSlot}</div>}
        <div className="mt-4">{p.actions}</div>
      </>
    );
  }

  const cell = (kind: StatKind) => (
    <>
      <b>{p.counts[kind]}</b>
      <small>{LABEL[kind]}</small>
    </>
  );
  return (
    <>
      <div className="pf-bwrap">
        <ProfileBanner id={p.banner ?? "yildiz"} />
        <i className="pf-dec pf-t1" />
        <i className="pf-dec pf-t2" />
      </div>
      <div className="pf-prof">
        <div className="pf-top">
          <div className="pf-av">
            {p.onAvatarClick ? (
              <button type="button" className="pf-av-btn" onClick={p.onAvatarClick} title={p.avatarTitle}>
                <div className="pf-av-in">{avatar}</div>
              </button>
            ) : (
              <div className="pf-av-btn"><div className="pf-av-in">{avatar}</div></div>
            )}
            <i className="pf-dec pf-tp" />
          </div>
          <div className="pf-stats">
            <div className="pf-stat">{cell("posts")}</div>
            {p.renderStat("followers", "pf-stat", cell("followers"))}
            {p.renderStat("following", "pf-stat", cell("following"))}
          </div>
        </div>
        <div className="pf-id">
          <h1 className="pf-dn">{p.displayName}</h1>
          <div className="pf-hd">@{p.username}</div>
        </div>
        {p.bio && <p className="pf-bio">{p.bio}</p>}
        {p.songSlot && <div className="pf-songslot">{p.songSlot}</div>}
        <div className="pf-btns">{p.actions}</div>
      </div>
    </>
  );
}
