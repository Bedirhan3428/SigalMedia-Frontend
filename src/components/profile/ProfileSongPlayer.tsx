"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./profile.css";
import type { ProfileSong } from "@/lib/profile/profileStyleStore";
import { claimProfileAudio, releaseProfileAudio } from "@/lib/profile/profileAudio";

const PREVIEW_SEC = 30;
const fmt = (s: number) => `0:${String(Math.floor(s)).padStart(2, "0")}`;

/**
 * Profil şarkısı oynatıcısı. Çalma yalnızca dokunuşla başlar; tek <audio>, aynı anda tek oynatıcı,
 * 30 sn önizleme bitince durur, sayfadan ayrılınca/sekme gizlenince duraklar.
 */
export default function ProfileSongPlayer({
  song,
  isOwner = false,
  onAdd,
}: {
  song: ProfileSong | null;
  isOwner?: boolean;
  onAdd?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const reset = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      try {
        a.currentTime = 0;
      } catch {}
    }
    setPlaying(false);
    setLoading(false);
    setElapsed(0);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
    setLoading(false);
  }, []);

  // Şarkı değişince / bileşen kalkınca sesi bırak
  const trackId = song?.trackId;
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
        audioRef.current = null;
      }
      releaseProfileAudio(pause);
    };
  }, [trackId, pause]);

  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") pause();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pause);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pause);
    };
  }, [pause]);

  if (!song) {
    if (!isOwner) return null;
    return (
      <button type="button" className="pf-addsong" onClick={onAdd}>
        + Profil şarkısı ekle
      </button>
    );
  }

  const toggle = () => {
    if (playing || loading) {
      pause();
      return;
    }
    setFailed(false);
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "none";
      a.src = song.previewUrl;
      a.addEventListener("timeupdate", () => {
        setElapsed(a.currentTime);
        if (a.currentTime >= PREVIEW_SEC) reset();
      });
      a.addEventListener("ended", reset);
      a.addEventListener("pause", () => setPlaying(false));
      a.addEventListener("playing", () => {
        setLoading(false);
        setPlaying(true);
      });
      a.addEventListener("error", () => {
        setLoading(false);
        setPlaying(false);
        setFailed(true);
      });
      audioRef.current = a;
    }
    claimProfileAudio(pause);
    setLoading(true);
    audioRef.current.play().catch(() => {
      setLoading(false);
      setPlaying(false);
      setFailed(true);
    });
  };

  const p = Math.min(1, elapsed / PREVIEW_SEC);
  return (
    <div className={`pf-song ${playing ? "pf-playing" : ""}`} data-song>
      <div className="pf-art" style={song.artworkUrl ? { background: `center/cover url("${song.artworkUrl}")` } : { background: "#27272a" }} />
      <div className="pf-si">
        <b>
          <span className="pf-tt" style={{ position: "static", overflow: "hidden", textOverflow: "ellipsis" }}>{song.title}</span>
          <span className="pf-eq" aria-hidden="true"><i /><i /><i /></span>
        </b>
        <span className="pf-ar">{song.artist}</span>
        <div className="pf-pg" role="progressbar" aria-label="Önizleme ilerlemesi" aria-valuemin={0} aria-valuemax={30} aria-valuenow={Math.floor(elapsed)}>
          <i style={{ width: `${p * 100}%` }} />
        </div>
        <span className="pf-hint">
          {failed ? "Önizleme çalınamadı" : `${isOwner ? "" : "Çalmak için dokun · "}30 sn önizleme`}
        </span>
      </div>
      <span className="pf-tm">{fmt(elapsed)}</span>
      <button type="button" className="pf-pp" onClick={toggle} aria-label={playing || loading ? "Duraklat" : "Çal"} aria-pressed={playing}>
        {playing || loading ? (
          <svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></svg>
        )}
      </button>
    </div>
  );
}
