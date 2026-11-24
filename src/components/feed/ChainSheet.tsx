"use client";
import { useCallback, useEffect, useState } from "react";
import { feedService } from "@/lib/feed/feedService";
import type { ChainSort, Post } from "@/lib/feed/types";
import { timeAgo } from "@/lib/feed/format";
import { Art } from "./Art";
import { Icon } from "./glyphs";
import { PostPill } from "./BadgeIcon";
import { Sheet } from "./Sheet";
import { Who } from "./UserParts";
import { useFeedVersion } from "./hooks";

function Thumb({ p }: { p: Post }) {
  if (p.type === "poll") {
    return (
      <div className="fd-th" style={{ background: "var(--ac-soft)", display: "grid", placeItems: "center", color: "var(--ac)", aspectRatio: "16/6" }}>
        <Icon id="g-vote" />
      </div>
    );
  }
  return <div className="fd-th">{p.mediaUrl && p.type === "photo" ? <img src={p.mediaUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Art k={p.art} />}</div>;
}

function Item({ p, root, onReply }: { p: Post; root?: boolean; onReply: (p: Post, el: HTMLElement) => void }) {
  const d = p.replyTo?.depth ?? 0;
  const text = p.type === "poll" ? p.question : p.caption;
  return (
    <div className={`fd-ci${root ? " fd-root-item" : ` fd-d${Math.min(d, 2)}`}`} data-depth={d} data-chain-item={p.id}>
      <div className="fd-col">
        <div className="fd-ch" style={{ padding: 0 }}>
          <Who userId={p.authorId} time={root ? undefined : timeAgo(p.createdAt)} avatar={root ? 40 : 32} />
          {root ? <PostPill id="zincir" /> : null}
        </div>
        {text ? <p className="fd-t">{text}</p> : null}
        <Thumb p={p} />
        <div className="fd-m">
          <span>{p.likeCount} beğeni</span>
          <span>{root ? `${p.replyCount} yanıt` : `Derinlik ${d}`}</span>
          {!root ? (
            <button type="button" className="fd-ab fd-rep" style={{ minHeight: 44, padding: "0 6px", marginTop: -12 }} aria-label={`@${feedService.getUser(p.authorId).username} yanıtına yanıt ver`} onClick={(e) => onReply(p, e.currentTarget)}>
              <Icon id="i-reply" className="" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ChainSheet({ rootId, onClose, onReply, opener }: { rootId: string; onClose: () => void; onReply: (p: Post, el: HTMLElement | null) => void; opener?: HTMLElement | null }) {
  const [sort, setSort] = useState<ChainSort>("popular");
  const [data, setData] = useState<{ root: Post; replies: Post[] } | null>(null);
  const [err, setErr] = useState(false);
  const version = useFeedVersion();

  const load = useCallback(() => {
    feedService.getChain(rootId, sort).then(setData).catch(() => setErr(true));
  }, [rootId, sort]);
  useEffect(() => { load(); }, [load, version]);

  return (
    <Sheet titleId="fd-chT" title="Yanıt zinciri" onClose={onClose} height="86%" opener={opener}>
      <div className="fd-tabs" role="tablist" aria-label="Sıralama">
        <button type="button" className="fd-tab" role="tab" id="fd-tabPop" aria-selected={sort === "popular"} onClick={() => setSort("popular")}>Popüler</button>
        <button type="button" className="fd-tab" role="tab" id="fd-tabNew" aria-selected={sort === "new"} onClick={() => setSort("new")}>Yeni</button>
      </div>
      <div className="fd-sb">
        <div className="fd-chain" role="tabpanel" aria-labelledby={sort === "popular" ? "fd-tabPop" : "fd-tabNew"}>
          {err ? <p className="fd-empty">Zincir yüklenemedi.</p> : null}
          {data ? (
            <>
              <Item p={data.root} root onReply={() => {}} />
              {data.replies.map((r) => <Item key={r.id} p={r} onReply={(p, el) => onReply(p, el)} />)}
              {data.replies.length === 0 ? <p className="fd-empty">Henüz yanıt yok. İlk yanıtı sen ver.</p> : null}
            </>
          ) : !err ? <p className="fd-empty">Yükleniyor…</p> : null}
        </div>
        {data ? (
          <button type="button" className="fd-cta" onClick={(e) => onReply(data.root, e.currentTarget)}>↪ Zincire yanıt ver</button>
        ) : null}
      </div>
    </Sheet>
  );
}
