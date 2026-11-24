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

function Item({ p, root }: { p: Post; root?: boolean }) {
  const text = p.type === "poll" ? p.question : p.caption;
  return (
    <div className={`fd-ci${root ? " fd-root-item" : " fd-rp"}`} data-depth={root ? 0 : 1} data-chain-item={p.id}>
      {root ? null : (
        <svg className="fd-bc" viewBox="0 0 24 44" width="24" height="44" aria-hidden="true">
          <path d="M0.65 12 Q0.65 24 14 24 H21" />
          <path d="M16 19 L22 24 L16 29" />
        </svg>
      )}
      <div className="fd-col">
        <div className="fd-ch" style={{ padding: 0 }}>
          <Who userId={p.authorId} time={root ? undefined : timeAgo(p.createdAt)} avatar={root ? 40 : 32} />
          {root ? <PostPill id="zincir" /> : null}
        </div>
        {text ? <p className="fd-t">{text}</p> : null}
        <Thumb p={p} />
        <div className="fd-m">
          <span>{p.likeCount} beğeni</span>
          {root ? <span>{p.replyCount} yanıt</span> : null}
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
              <Item p={data.root} root />
              <div className="fd-rail fd-rail-flat" data-testid="fd-chain-rail">
                {data.replies.map((r) => <Item key={r.id} p={r} />)}
              </div>
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
