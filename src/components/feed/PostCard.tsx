"use client";
import { memo, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Post } from "@/lib/feed/types";
import { timeAgo } from "@/lib/feed/format";
import { Art } from "./Art";
import { Icon } from "./glyphs";
import { PostPill } from "./BadgeIcon";
import { PollView } from "./PollView";
import { VideoBody } from "./VideoBody";
import { Who, useFeedUser } from "./UserParts";
import { useFeedActions } from "./FeedContext";
import { PhotoCarousel } from "./PhotoCarousel";

export const PostCard = memo(function PostCard({ post, child = false }: { post: Post; child?: boolean }) {
  const { like, likeOnly, save, openMenu, openReply, openChain, toast } = useFeedActions();
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

  // Çift dokunma: 300 ms içinde, az hareketle iki dokunuş. Kaydırma pointercancel/büyük hareket olduğundan sayılmaz; düğmeler hariç.
  const [heart, setHeart] = useState<{ n: number; x: number; y: number; r: number } | null>(null);
  const tapRef = useRef<{ t: number; x: number; y: number; dx: number; dy: number; at: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const postRef = useRef(post);
  useEffect(() => { postRef.current = post; });
  useEffect(() => {
    if (!heart) return;
    const t = setTimeout(() => setHeart(null), 900);
    return () => clearTimeout(t);
  }, [heart]);
  const onMediaDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) { tapRef.current = null; return; }
    tapRef.current = { t: e.timeStamp, x: e.clientX, y: e.clientY, dx: 0, dy: 0, at: Date.now() };
  };
  const onMediaMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = tapRef.current;
    if (d && (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10)) tapRef.current = null;
  };
  const onMediaUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = tapRef.current;
    tapRef.current = null;
    if (!d || e.timeStamp - d.t > 350) { lastTap.current = null; return; }
    const prev = lastTap.current;
    if (prev && d.at - prev.t <= 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
      lastTap.current = null;
      likeOnly(postRef.current);
      const box = e.currentTarget.getBoundingClientRect();
      setHeart((h) => ({ n: (h?.n ?? 0) + 1, x: e.clientX - box.left, y: e.clientY - box.top, r: Math.round(Math.random() * 24 - 12) }));
    } else lastTap.current = { t: d.at, x: e.clientX, y: e.clientY };
  };

  return (
    <article className={`fd-card${child ? " fd-child" : ""}`} id={`c-${post.id}`} data-post={post.id} aria-label={`@${author.username} gönderisi`}>
      <div className="fd-ch">
        <Who userId={post.authorId} time={timeAgo(post.createdAt)} />
        <button type="button" className="fd-pm" aria-label="Gönderi seçenekleri" aria-haspopup="dialog" onClick={(e) => openMenu(post, e.currentTarget)}><Icon id="i-more" /></button>
      </div>

      {post.type === "photo" ? (
        <>
          <div className="fd-media fd-dt" onPointerDown={onMediaDown} onPointerMove={onMediaMove} onPointerUp={onMediaUp} onPointerCancel={() => { tapRef.current = null; }} style={post.photos?.[0]?.width && post.photos[0].height ? { aspectRatio: `${post.photos[0].width} / ${post.photos[0].height}` } : undefined}>
            {post.photos && post.photos.length > 1 ? <PhotoCarousel photos={post.photos} alt={post.caption ?? "Gönderi görseli"} /> : post.mediaUrl ? <img src={post.mediaUrl} alt={post.caption ?? "Gönderi görseli"} loading="lazy" decoding="async" /> : <Art k={post.art} />}
            <div className="fd-pills">{post.postBadges.map((b) => <PostPill key={b} id={b} />)}</div>
            {heart ? (
              <svg key={heart.n} className="fd-bigheart" data-testid="fd-bigheart" viewBox="0 0 24 24" aria-hidden="true" style={{ left: heart.x, top: heart.y, ["--r" as string]: `${heart.r}deg` }}>
                <defs><linearGradient id={`fd-hg-${post.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7eb3" /><stop offset=".5" stopColor="#ff3d6e" /><stop offset="1" stopColor="#ff9a3d" /></linearGradient></defs>
                <path d="M12 20.6l-1.3-1.2C6.1 15.2 3.2 12.6 3.2 9.4 3.2 6.8 5.2 4.8 7.8 4.8c1.6 0 3.2.8 4.2 2 1-1.2 2.6-2 4.2-2 2.6 0 4.6 2 4.6 4.6 0 3.2-2.9 5.8-7.5 10z" fill={`url(#fd-hg-${post.id})`} />
              </svg>
            ) : null}
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
        <button type="button" className="fd-ab fd-rep" aria-label={post.replyTo ? "Zincire yanıt ver" : "Yanıtla"} onClick={(e) => openReply(post, e.currentTarget)}>
          <Icon id="i-reply" />
        </button>
        {post.replyTo ? null : (
          <button
            type="button"
            className="fd-ab fd-rep fd-repn"
            style={{ paddingLeft: 2, marginLeft: -6 }}
            aria-label={post.replyCount > 0 ? `${post.replyCount} yanıt, zinciri aç` : "Henüz yanıt yok, yanıtla"}
            onClick={(e) => (post.replyCount > 0 ? openChain(post.id, e.currentTarget) : openReply(post, e.currentTarget))}
          >
            <span>{post.replyCount}</span>
          </button>
        )}
        <span className="fd-sp" />
        <button
          type="button"
          className={`fd-ab fd-save${post.savedByMe ? " fd-on" : ""}`}
          aria-pressed={!!post.savedByMe}
          aria-label={post.savedByMe ? "Kaydedildi" : "Kaydet"}
          onClick={() => save(post)}
        >
          <Icon id="i-bookmark" />
        </button>
      </div>
    </article>
  );
});
