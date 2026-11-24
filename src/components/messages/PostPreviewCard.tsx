"use client";
import { useEffect, useState, type ReactNode } from "react";
import { feedService } from "@/lib/feed/feedService";
import type { Post } from "@/lib/feed/types";
import type { PostLink } from "@/lib/chat/postLink";

type Loaded = { status: "loading" } | { status: "missing" } | { status: "ok"; post: Post };

// Küçük bellek içi önbellek: aynı gönderi birden çok mesajda ya da menü kopyasında tekrar çekilmez.
const cache = new Map<string, Post | null>();
const inflight = new Map<string, Promise<Post | null>>();

function load(id: string): Promise<Post | null> {
  let p = inflight.get(id);
  if (!p) {
    p = feedService.getPost(id).then((r) => {
      cache.set(id, r ?? null);
      inflight.delete(id);
      return r ?? null;
    }, () => {
      inflight.delete(id);
      return null;
    });
    inflight.set(id, p);
  }
  return p;
}

function usePost(id: string): Loaded {
  const [state, setState] = useState<Loaded>(() => {
    if (cache.has(id)) { const c = cache.get(id)!; return c ? { status: "ok", post: c } : { status: "missing" }; }
    const peek = feedService.peekPost(id);
    return peek ? { status: "ok", post: peek } : { status: "loading" };
  });
  useEffect(() => {
    if (state.status !== "loading") return;
    let live = true;
    void load(id).then((r) => { if (live) setState(r ? { status: "ok", post: r } : { status: "missing" }); });
    return () => { live = false; };
  }, [id, state.status]);
  return state;
}

function thumbOf(post: Post): string | undefined {
  if (post.type === "photo") return post.photos?.[0]?.url ?? post.mediaUrl;
  if (post.type === "video") return post.posterUrl;
  return undefined;
}

/** Sohbette paylaşılan gönderi önizlemesi: küçük görsel, yazar ve açıklama; dokununca /p/<id>. */
export function PostPreviewCard({ link, onOpen, interactive = true, footer }: { link: PostLink; onOpen?: () => void; interactive?: boolean; footer?: ReactNode }) {
  const s = usePost(link.postId);
  const author = s.status === "ok" ? feedService.getUser(s.post.authorId) : null;
  const post = s.status === "ok" ? s.post : null;
  const thumb = post ? thumbOf(post) : undefined;
  const text = post ? (post.type === "poll" ? post.question : post.caption) : undefined;
  const kind = post ? (post.type === "poll" ? "Anket" : post.type === "video" ? "Video" : "Fotoğraf") : "";

  const body = (
    <>
      <span className="block relative w-full overflow-hidden rounded-[10px] bg-black/25" style={{ aspectRatio: "16 / 10" }} data-testid="post-card-thumb">
        {s.status === "loading" ? (
          <span className="absolute inset-0 animate-pulse bg-white/10" data-testid="post-card-skeleton" />
        ) : thumb ? (
          <img src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[13px] font-semibold opacity-80">
            {s.status === "missing" ? "Gönderi bulunamadı" : post?.type === "poll" ? (
              <span className="flex items-center gap-1.5">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
                Anket
              </span>
            ) : kind}
          </span>
        )}
      </span>
      {s.status === "ok" ? (
        <span className="mt-1.5 block min-w-0">
          <span className="block truncate text-[13px] font-semibold">@{author?.username}</span>
          {text ? <span className="mt-0.5 block text-[13px] leading-[1.3] opacity-90" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</span> : null}
        </span>
      ) : s.status === "loading" ? (
        <span className="mt-1.5 block"><span className="block h-3 w-1/2 animate-pulse rounded bg-white/10" /></span>
      ) : null}
    </>
  );

  const cls = "block w-[232px] max-w-full text-left";
  return (
    <span className="block" data-testid="post-card">
      {interactive && s.status !== "missing" ? (
        <a
          href={`/p/${link.postId}`}
          className={cls}
          aria-label={post ? `Paylaşılan gönderi, @${author?.username}` : "Paylaşılan gönderi"}
          onClick={(e) => { e.preventDefault(); onOpen?.(); }}
          draggable={false}
        >
          {body}
        </a>
      ) : (
        <span className={cls}>{body}</span>
      )}
      {link.note ? <span className="mt-1.5 block whitespace-pre-wrap" data-testid="post-card-note">{link.note}</span> : null}
      {footer}
    </span>
  );
}
