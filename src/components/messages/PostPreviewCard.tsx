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
export function PostPreviewCard({ link, onOpen, interactive = true, footer, noteClassName }: { link: PostLink; onOpen?: () => void; interactive?: boolean; footer?: ReactNode; noteClassName?: string }) {
  const s = usePost(link.postId);
  const author = s.status === "ok" ? feedService.getUser(s.post.authorId) : null;
  const post = s.status === "ok" ? s.post : null;
  const thumb = post ? thumbOf(post) : undefined;
  const text = post ? (post.type === "poll" ? post.question : post.caption) : undefined;
  const kind = post ? (post.type === "poll" ? "Anket" : post.type === "video" ? "Video" : "Fotoğraf") : "";

  const cap = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as const;
  const body = (
    <span className="block overflow-hidden rounded-[18px] bg-[#1c1c20] text-zinc-100 ring-1 ring-white/5">
      <span className="flex items-center gap-2 px-2.5 py-2" data-testid="post-card-head">
        {s.status === "ok" ? (
          <>
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-bold text-white" style={{ background: author?.avatarGradient ?? "#3f3f46" }}>
              {author?.avatarUrl ? <img src={author.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : author?.username?.[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 truncate text-[13.5px] font-semibold">{author?.username}</span>
          </>
        ) : (
          <>
            <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-white/10" />
            <span className="h-3 w-24 animate-pulse rounded bg-white/10" />
          </>
        )}
      </span>
      <span className="relative block w-full overflow-hidden bg-black/40" style={{ aspectRatio: "3 / 4" }} data-testid="post-card-thumb">
        {s.status === "loading" ? (
          <span className="absolute inset-0 animate-pulse bg-white/10" data-testid="post-card-skeleton" />
        ) : thumb ? (
          <img src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center px-4 text-center text-[13px] font-semibold opacity-80">
            {s.status === "missing" ? "Gönderi bulunamadı" : post?.type === "poll" ? (
              <span className="flex flex-col items-center gap-2">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
                Anket
              </span>
            ) : kind}
          </span>
        )}
      </span>
      {s.status === "ok" && text ? (
        <span className="block px-2.5 py-2 text-[13px] leading-[1.35]" style={cap} data-testid="post-card-caption">
          <b className="font-semibold">{author?.username}</b> {text}
        </span>
      ) : null}
    </span>
  );

  const cls = "block w-[240px] max-w-full text-left";
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
      {link.note ? (
        <span className={`mt-1 block w-fit max-w-[240px] whitespace-pre-wrap rounded-[18px] ${noteClassName?.includes("chat-sent") ? "ml-auto" : ""} ${noteClassName ?? ""}`} style={{ padding: "var(--pad, 8px 12px)" }} data-testid="post-card-note">{link.note}</span>
      ) : null}
      {footer}
    </span>
  );
}
