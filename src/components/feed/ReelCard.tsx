"use client";
import { memo, useId, useState } from "react";
import Link from "next/link";
import type { Post } from "@/lib/feed/types";
import { fmtCount } from "@/lib/feed/format";
import { Avatar, useFeedUser } from "./UserParts";
import { Icon } from "./glyphs";
import { useFeedActions } from "./FeedContext";
import { VideoPlayer } from "./VideoPlayer";

interface Props {
  post: Post;
  index: number;
  /** Ekrandan uzak öğe: video öğesi kurulmaz (bellek). */
  parked?: boolean;
  /** Sıradaki video: tarayıcı daha çok önyükler. */
  next?: boolean;
}

/** Tam ekran 9:16 Reels öğesi: ortak VideoPlayer çekirdeği + sağda dikey eylem sütunu + solda yazar/başlık/müzik. */
export const ReelCard = memo(function ReelCard({ post, index, parked = false, next = false }: Props) {
  const { like, save, openMenu, openShare, openReply, toast, resolve } = useFeedActions();
  const live = resolve(post);
  const author = useFeedUser(live.authorId);
  const uid = useId();
  const [open, setOpen] = useState(false);
  if (live.type !== "video") return null;

  const counts = [
    { id: "like", n: live.likeCount, hint: `${live.likeCount} beğeni` },
    { id: "cmt", n: live.commentCount, hint: `${live.commentCount} yorum` },
    { id: "rep", n: live.replyCount, hint: `${live.replyCount} yanıt` },
  ];
  const c = (id: string) => counts.find((x) => x.id === id)!;
  const count = (id: string) => (
    <>
      <span className="fd-rc" aria-hidden="true">{fmtCount(c(id).n)}</span>
      <span className="fd-sr" id={`${uid}-${id}`}>{c(id).hint}</span>
    </>
  );

  return (
    <article className="fd-reel" data-reel={live.id} data-index={index} aria-label={`@${author.username} reels`}>
      <VideoPlayer post={live} variant="reel" autoplay parked={parked} preload={next ? "auto" : "metadata"} />
      <div className="fd-rscrim" aria-hidden="true" />

      <div className="fd-rinfo">
        <Link href={`/profile/${encodeURIComponent(live.authorId)}`} className="fd-rwho" aria-label={`@${author.username} profiline git`}>
          <Avatar user={author} size={36} />
          <b>@{author.username}</b>
        </Link>
        {live.caption ? (
          <button type="button" className={`fd-rcap${open ? " fd-open" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{live.caption}</button>
        ) : null}
        {live.music ? <p className="fd-rmus"><Icon id="i-music" /><span>{live.music}</span></p> : null}
      </div>

      <div className="fd-rcol" role="group" aria-label="Reels eylemleri">
        <button type="button" className={`fd-rab fd-like${live.likedByMe ? " fd-on" : ""}`} aria-pressed={live.likedByMe} aria-label="Beğen" aria-describedby={`${uid}-like`} onClick={() => like(live)}>
          <Icon id="i-heart" />{count("like")}
        </button>
        <button type="button" className="fd-rab" aria-label="Yorum" aria-describedby={`${uid}-cmt`} onClick={() => toast("Yorumlar yakında.")}>
          <Icon id="i-chat" />{count("cmt")}
        </button>
        <button type="button" className="fd-rab fd-rep" aria-label="Yanıt" aria-describedby={`${uid}-rep`} onClick={(e) => openReply(live, e.currentTarget)}>
          <Icon id="i-reply" />{count("rep")}
        </button>
        <button type="button" className="fd-rab fd-shr" aria-label="Paylaş" aria-haspopup="dialog" onClick={(e) => openShare(live, e.currentTarget)}>
          <Icon id="i-send" />
        </button>
        <button type="button" className={`fd-rab fd-save${live.savedByMe ? " fd-on" : ""}`} aria-pressed={!!live.savedByMe} aria-label={live.savedByMe ? "Kaydedildi" : "Kaydet"} onClick={() => save(live)}>
          <Icon id="i-bookmark" />
        </button>
        <button type="button" className="fd-rab fd-rmore" aria-label="Gönderi seçenekleri" aria-haspopup="dialog" onClick={(e) => openMenu(live, e.currentTarget)}>
          <Icon id="i-more" />
        </button>
      </div>
    </article>
  );
});
