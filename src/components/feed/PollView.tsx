"use client";
import { memo, useEffect, useRef, useState } from "react";
import type { PollPost } from "@/lib/feed/types";
import { timeLeft } from "@/lib/feed/format";
import { Art } from "./Art";
import { Icon } from "./glyphs";
import { useFeedActions } from "./FeedContext";
import { useReducedMotion } from "./hooks";

const ANIM_MS = 900;

export const PollView = memo(function PollView({ post }: { post: PollPost }) {
  const { vote } = useFeedActions();
  const rm = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const voted = !!post.myVoteOptionId;
  const expired = new Date(post.endsAt).getTime() <= now;
  const show = voted || expired;
  const total = post.options.reduce((s, o) => s + o.votes, 0);
  const pcts = post.options.map((o) => (total ? Math.round((o.votes / total) * 100) : 0));

  // Animasyon durumu: k 0..1 yüzde sayacı, fillOn çubuk genişliği.
  const [fillOn, setFillOn] = useState(show);
  const [k, setK] = useState(show ? 1 : 0);
  const wasShown = useRef(show);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) { wasShown.current = false; setFillOn(false); setK(0); return; }
    if (wasShown.current) { setFillOn(true); setK(1); return; }
    wasShown.current = true;
    if (rm) { setFillOn(true); setK(1); return; }
    let raf = 0;
    let raf2 = 0;
    setFillOn(false);
    setK(0);
    raf = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setFillOn(true);
        const start = performance.now();
        const step = (ts: number) => {
          const p = Math.min(1, (ts - start) / ANIM_MS);
          setK(p);
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
    });
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(raf2); };
  }, [show, rm]);

  // Oy verince seçilen seçeneğe odak
  const prevVoted = useRef(voted);
  useEffect(() => {
    if (voted && !prevVoted.current) rootRef.current?.querySelector<HTMLElement>(".fd-opt.fd-mine")?.focus({ preventScroll: true });
    prevVoted.current = voted;
  }, [voted]);

  return (
    <div ref={rootRef} className={`fd-poll${show ? " fd-voted" : ""}`} role="group" aria-label={`Anket: ${post.question}`} data-poll={post.id}>
      <p className="fd-pq">{post.question}</p>
      <div className="fd-opts">
        {post.options.map((o, i) => {
          const mine = post.myVoteOptionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className={`fd-opt${mine ? " fd-mine" : ""}`}
              aria-disabled={show || undefined}
              aria-label={`${o.text}${show ? `, yüzde ${pcts[i]}${mine ? ", senin seçimin" : ""}` : ""}`}
              onClick={() => { if (!show) vote(post.id, o.id); }}
            >
              <span className="fd-fill" style={{ width: fillOn && show ? `${pcts[i]}%` : 0 }} />
              {o.art ? <span className="fd-sw" style={{ position: "relative", overflow: "hidden", zIndex: 1 }}><Art k={o.art} /></span> : null}
              <span className="fd-lb">{o.text}</span>
              {show ? <span className="fd-pc" data-pct={pcts[i]}>{Math.round(pcts[i] * k)}%</span> : null}
              <span className="fd-ck"><Icon id="i-check" /></span>
            </button>
          );
        })}
      </div>
      <div className="fd-pf">
        <b>{total.toLocaleString("tr-TR")} oy</b>
        <span className="fd-dot" />
        <span>{timeLeft(post.endsAt, now)}</span>
      </div>
    </div>
  );
});
