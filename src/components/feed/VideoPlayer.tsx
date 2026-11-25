"use client";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { VideoPost } from "@/lib/feed/types";
import { fmtDur } from "@/lib/feed/format";
import { Art } from "./Art";
import { Icon } from "./glyphs";
import { PostPill } from "./BadgeIcon";
import { useDoubleTapLike } from "./likeTap";
import { claimActive, releaseActive, setMuted, useMuted } from "./videoSession";

interface PlaybackOpts {
  id: string;
  real: boolean;
  /** Görünürlük en az `PLAY_AT` olunca kendiliğinden oynat; altına düşünce duraklat. */
  autoplay: boolean;
  parked: boolean;
}

/** Bu orandan fazla görünen video oynar (autoplay). */
const PLAY_AT = 0.6;

/**
 * Ortak oynatma çekirdeği: oynat/duraklat durumu, tek etkin video kuralı, ekrandan çıkınca/sekme gizlenince duraklatma,
 * uygulama genelindeki ses tercihi, ilerleme ve yükleniyor durumu. Akış (VideoBody) ve Reels (ReelCard) bunu kullanır.
 */
export function useVideoPlayback({ id, real, autoplay, parked }: PlaybackOpts) {
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [prog, setProg] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const muted = useMuted();
  const inView = useRef(false);
  const resumeOnShow = useRef(false);

  const set = useCallback((v: boolean) => { playingRef.current = v; setPlaying(v); }, []);

  const pause = useCallback(() => {
    set(false);
    setWaiting(false);
    vid.current?.pause();
    releaseActive(id);
  }, [id, set]);

  const play = useCallback(() => {
    claimActive(id, pause);
    set(true);
    const v = vid.current;
    if (!v) return;
    if (v.readyState < 3) setWaiting(true);
    const fail = () => { set(false); setWaiting(false); releaseActive(id); };
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return; // yükleme sırasında duraklatıldı
        // Sesli otomatik oynatma engellendiyse sessize alıp bir kez daha dene.
        if (!v.muted) {
          setMuted(true);
          v.muted = true;
          const q = v.play();
          if (q && typeof q.catch === "function") q.catch(fail);
        } else fail();
      });
    }
  }, [id, pause, set]);

  const toggle = useCallback(() => (playingRef.current ? pause() : play()), [pause, play]);

  // Ses tercihi tüm videolarda ortaktır (React'in muted özelliği güvenilir olmadığından doğrudan yazılır).
  useEffect(() => { if (vid.current) vid.current.muted = muted; }, [muted, real, parked]);

  // Görünürlük: autoplay'de %60'tan fazla görününce oynar, altına düşünce durur; aksi halde yalnızca ekran dışında duraklar.
  useEffect(() => {
    const el = wrap.current;
    if (!el || parked || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      if (autoplay) {
        const vis = e.isIntersecting && e.intersectionRatio >= PLAY_AT;
        if (vis && !inView.current) { inView.current = true; play(); }
        else if (!vis && inView.current) { inView.current = false; resumeOnShow.current = false; pause(); }
      } else if (!e.isIntersecting) pause();
    }, { threshold: autoplay ? [0, 0.25, PLAY_AT, 0.8, 1] : 0.35 });
    io.observe(el);
    return () => { io.disconnect(); inView.current = false; };
  }, [autoplay, parked, play, pause]);

  // Sayfa önbellekte gizlenince (Next rota önbelleği effect'leri temizler) ya da bileşen kaldırılınca video çalmaya devam etmesin.
  useEffect(() => {
    const v = vid.current;
    return () => {
      v?.pause();
      set(false);
      inView.current = false;
      releaseActive(id);
    };
  }, [id, real, parked, set]);

  // Sekme gizlenince duraklat; geri gelince (hâlâ görünür ve otomatik oynatma açıksa) devam et.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (playingRef.current) { resumeOnShow.current = autoplay; pause(); }
      } else if (resumeOnShow.current && inView.current) { resumeOnShow.current = false; play(); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [autoplay, pause, play]);

  // Park edilince (ekran dışı uzak öğe) video kaldırılır; durum sıfırlanır.
  useEffect(() => {
    if (parked) return;
    return () => { set(false); setWaiting(false); setProg(0); releaseActive(id); };
  }, [parked, id, set]);

  useEffect(() => () => releaseActive(id), [id]);

  const videoEvents = {
    onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => { const v = e.currentTarget; if (v.duration) setProg((v.currentTime / v.duration) * 100); },
    onWaiting: () => { if (playingRef.current) setWaiting(true); },
    onPlaying: () => setWaiting(false),
    onCanPlay: () => setWaiting(false),
  };

  return { wrap, vid, playing, playingRef, muted, prog, waiting, play, pause, toggle, videoEvents, setMuted };
}

interface Props {
  post: VideoPost;
  variant?: "feed" | "reel";
  autoplay?: boolean;
  /** Reels: ekrandan uzak öğede video öğesi kurulmaz (bellek). */
  parked?: boolean;
  preload?: "none" | "metadata" | "auto";
  children?: ReactNode;
}

export const VideoPlayer = memo(function VideoPlayer({ post, variant = "feed", autoplay = false, parked = false, preload = "metadata", children }: Props) {
  const reel = variant === "reel";
  const [failed, setFailed] = useState(false);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const real = !!post.mediaUrl && !failed;
  const { wrap, vid, playing, playingRef, muted, prog, waiting, play, pause, toggle, videoEvents } = useVideoPlayback({ id: post.id, real, autoplay, parked });

  // Tek dokunma oynat/duraklat; çift dokunmada ilk dokunuşun etkisi geri alınır (beğeni oynatmayı değiştirmez).
  const preTap = useRef<{ playing: boolean; at: number } | null>(null);
  const suppress = useRef(false);
  const dt = useDoubleTapLike(post, {
    allowButton: ".fd-vplay",
    onDouble: () => {
      suppress.current = true;
      setTimeout(() => { suppress.current = false; }, 600);
      const p = preTap.current;
      if (p && Date.now() - p.at < 500 && playingRef.current !== p.playing) (p.playing ? play() : pause());
    },
  });
  const onTap = () => {
    if (suppress.current) { suppress.current = false; return; }
    preTap.current = { playing: playingRef.current, at: Date.now() };
    toggle();
  };

  const dur = post.durationSec;
  const cls = reel ? "fd-rvid" : `fd-media fd-dt${playing ? " fd-playing" : ""}`;
  const showVideo = real && !parked;

  return (
    <div ref={wrap} className={`${cls}${reel && playing ? " fd-playing" : ""}`} data-vid={post.id} data-fit={reel ? fit : undefined} {...dt.bind}>
      {reel && post.posterUrl ? <img className="fd-rbg" src={post.posterUrl} alt="" aria-hidden="true" decoding="async" referrerPolicy="no-referrer" /> : null}
      {showVideo ? (
        <video
          ref={vid}
          src={post.mediaUrl}
          poster={post.posterUrl}
          muted={muted}
          loop
          playsInline
          preload={preload}
          aria-hidden="true"
          {...videoEvents}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (reel && v.videoWidth && v.videoHeight) setFit(v.videoWidth / v.videoHeight > 0.8 ? "contain" : "cover");
          }}
          onError={() => setFailed(true)}
        />
      ) : reel ? (
        post.posterUrl ? null : <Art k={post.art} />
      ) : (
        <Art k={post.art} />
      )}
      {!reel ? <div className="fd-pills">{post.postBadges.map((b) => <PostPill key={b} id={b} />)}</div> : null}
      {parked ? null : (
        <button type="button" className="fd-vplay" aria-pressed={playing} aria-label={playing ? "Videoyu duraklat" : "Videoyu oynat"} onClick={onTap}>
          <span><Icon id={playing ? "i-pause" : "i-play"} /></span>
        </button>
      )}
      {waiting && !parked ? <span className="fd-vspin" data-testid="fd-vspin" role="status" aria-label="Video yükleniyor" /> : null}
      {real && !parked ? (
        <button type="button" className={`fd-mute${reel ? " fd-rmute" : ""}`} aria-pressed={muted} aria-label={muted ? "Sesi aç" : "Sesi kapat"} onClick={() => setMuted(!muted)}>
          <Icon id={muted ? "i-mute" : "i-vol"} />
        </button>
      ) : null}
      {!reel && dur > 0 ? <span className="fd-vdur">{fmtDur(dur)}</span> : null}
      {parked ? null : (
        <div className={`fd-prog ${real ? "fd-real" : "fd-sim"}`} aria-hidden="true" style={real ? ({ "--p": `${prog}%` } as CSSProperties) : ({ "--dur": `${Math.max(3, dur)}s` } as CSSProperties)}>
          <i />
        </div>
      )}
      {dt.heartNode}
      {children}
    </div>
  );
});
