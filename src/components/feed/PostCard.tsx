"use client";
import { memo, useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/feed/types";
import { timeAgo } from "@/lib/feed/format";
import { Art } from "./Art";
import { Icon } from "./glyphs";
import { PostPill } from "./BadgeIcon";
import { PollView } from "./PollView";
import { VideoBody } from "./VideoBody";
import { Who, useFeedUser } from "./UserParts";
import { useFeedActions } from "./FeedContext";

export const PostCard = memo(function PostCard({ post, child = false }: { post: Post; child?: boolean }) {
  const { like, openReply, openChain, toast } = useFeedActions();
  const author = useFeedUser(post.authorId);
  const [pop, setPop] = useState(false);
  const prevLiked = useRef(post.likedByMe);
  useEffect(() => {
    if (post.likedByMe && !prevLiked.current) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 400);
      prevLiked.current = true;
      return () => clearTimeout(t);
    }
    prevLiked.current = post.likedByMe;
  }, [post.likedByMe]);

  return (
    <article className={`fd-card${child ? " fd-child" : ""}`} id={`c-${post.id}`} data-post={post.id} aria-label={`@${author.username} gönderisi`}>
      <div className="fd-ch"><Who userId={post.authorId} time={timeAgo(post.createdAt)} /></div>

      {post.type === "photo" ? (
        <>
          <div className="fd-media">
            {post.mediaUrl ? <img src={post.mediaUrl} alt={post.caption ?? "Gönderi görseli"} loading="lazy" decoding="async" /> : <Art k={post.art} />}
            <div className="fd-pills">{post.postBadges.map((b) => <PostPill key={b} id={b} />)}</div>
          </div>
          {post.caption ? <p className="fd-cap">{post.caption}</p> : null}
        </>
      ) : post.type === "video" ? (
        <>
          <VideoBody post={post} />
          {post.caption ? <p className="fd-cap">{post.caption}</p> : null}
        </>
      ) : (
        <>
          <PollView post={post} />
          {post.postBadges.length ? <div className="fd-pillrow">{post.postBadges.map((b) => <PostPill key={b} id={b} />)}</div> : null}
        </>
      )}

      <div className="fd-act">
        <button
          type="button"
          className={`fd-ab fd-like${post.likedByMe ? " fd-on" : ""}${pop ? " fd-pop" : ""}`}
          aria-pressed={post.likedByMe}
          aria-label="Beğen"
          onClick={() => like(post)}
        >
          <Icon id="i-heart" /><span>{post.likeCount}</span>
        </button>
        <button type="button" className="fd-ab" aria-label={`Yorumlar, ${post.commentCount}`} onClick={() => toast("Yorumlar yakında.")}>
          <Icon id="i-chat" /><span>{post.commentCount}</span>
        </button>
        <button type="button" className="fd-ab fd-rep" aria-label="Yanıtla" onClick={(e) => openReply(post, e.currentTarget)}>
          <Icon id="i-reply" />
        </button>
        <button
          type="button"
          className="fd-ab fd-rep fd-repn"
          style={{ paddingLeft: 2, marginLeft: -6 }}
          aria-label={post.replyCount > 0 ? `${post.replyCount} yanıt, zinciri aç` : "Henüz yanıt yok, yanıtla"}
          onClick={(e) => (post.replyCount > 0 ? openChain(post.replyTo?.rootId ?? post.id, e.currentTarget) : openReply(post, e.currentTarget))}
        >
          <span>{post.replyCount}</span>
        </button>
        <span className="fd-sp" />
      </div>
    </article>
  );
});
