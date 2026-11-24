"use client";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { VideoPost } from "@/lib/feed/types";
import { fmtDur } from "@/lib/feed/format";
import { Art } from "./Art";
import { Icon } from "./glyphs";
import { PostPill } from "./BadgeIcon";

// Aynı anda yalnızca bir video oynar.
let active: { id: string; pause: () => void } | null = null;

export const VideoBody = memo(function VideoBody({ post }: { post: VideoPost }) {
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [prog, setProg] = useState(0);
  const [failed, setFailed] = useState(false);
  const real = !!post.mediaUrl && !failed;

  const pause = useCallback(() => {
    setPlaying(false);
    vid.current?.pause();
    if (active?.id === post.id) active = null;
  }, [post.id]);

  const play = useCallback(() => {
    if (active && active.id !== post.id) active.pause();
    active = { id: post.id, pause };
    setPlaying(true);
    const v = vid.current;
    if (v) {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => { setPlaying(false); if (active?.id === post.id) active = null; });
    }
  }, [pause, post.id]);

  // Ekrandan çıkınca duraklat
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { if (!es[0].isIntersecting) pause(); }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [pause]);

  useEffect(() => () => { if (active?.id === post.id) active = null; }, [post.id]);

  const dur = post.durationSec;
  return (
    <div ref={wrap} className={`fd-media${playing ? " fd-playing" : ""}`} data-vid={post.id}>
      {real ? (
        <video
          ref={vid}
          src={post.mediaUrl}
          poster={post.posterUrl}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProg((v.currentTime / v.duration) * 100); }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Art k={post.art} />
      )}
      <div className="fd-pills">{post.postBadges.map((b) => <PostPill key={b} id={b} />)}</div>
      <button
        type="button"
        className="fd-vplay"
        aria-pressed={playing}
        aria-label={playing ? "Videoyu duraklat" : "Videoyu oynat"}
        onClick={() => (playing ? pause() : play())}
      >
        <span><Icon id={playing ? "i-pause" : "i-play"} /></span>
      </button>
      {real ? (
        <button type="button" className="fd-mute" aria-pressed={muted} aria-label={muted ? "Sesi aç" : "Sesi kapat"} onClick={() => setMuted((m) => !m)}>
          <Icon id={muted ? "i-mute" : "i-vol"} />
        </button>
      ) : null}
      {dur > 0 ? <span className="fd-vdur">{fmtDur(dur)}</span> : null}
      <div className={`fd-prog ${real ? "fd-real" : "fd-sim"}`} aria-hidden="true" style={real ? ({ "--p": `${prog}%` } as React.CSSProperties) : ({ "--dur": `${Math.max(3, dur)}s` } as React.CSSProperties)}>
        <i />
      </div>
    </div>
  );
});
