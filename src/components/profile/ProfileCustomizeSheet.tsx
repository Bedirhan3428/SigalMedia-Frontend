"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import "./profile.css";
import ProfileBanner from "./ProfileBanner";
import { useBackLayer } from "@/lib/chat/useBackLayer";
import { searchTracks, type SoundTrack } from "@/services/soundService";
import { PROFILE_BANNERS, FALLBACK_BANNER, bannerName, type ProfileBannerId } from "@/lib/profile/profileBanners";
import { PROFILE_THEMES, type ProfileThemeId } from "@/lib/profile/profileThemes";
import type { ProfileSong, ProfileStyle } from "@/lib/profile/profileStyleStore";

function toSong(t: SoundTrack): ProfileSong {
  return {
    trackId: Number(t.id),
    title: t.title.slice(0, 120),
    artist: t.artist.slice(0, 120),
    artworkUrl: t.thumbnail || "",
    previewUrl: t.streamUrl,
  };
}

function SheetBody({
  initial,
  onClose,
  onSave,
}: {
  initial: ProfileStyle;
  onClose: () => void;
  onSave: (style: ProfileStyle) => Promise<void>;
}) {
  const [theme, setTheme] = useState<ProfileThemeId>(initial.theme);
  const [banner, setBanner] = useState<ProfileBannerId | null>(initial.banner);
  const [song, setSong] = useState<ProfileSong | null>(initial.song);
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<SoundTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Geri katmanı bir tık sonra bağlanır (StrictMode çift efektinde sahte popstate kapanışını önler)
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 0);
    return () => clearTimeout(t);
  }, []);
  useBackLayer(armed, () => {
    if (!saving) onClose();
  });

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Gövde kaydırmasını kilitle, Escape ile kapat, Tab odağını sheet içinde tut
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!saving) onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>("button:not(:disabled),input,[tabindex]:not([tabindex='-1'])");
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [saving, onClose]);

  // iTunes araması (250 ms bekleme, önceki isteği iptal et)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    const term = q.trim();
    if (term.length === 1) return;
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      const ac = new AbortController();
      abortRef.current = ac;
      const r = await searchTracks(term, 12, ac.signal);
      if (!ac.signal.aborted) {
        setTracks(r);
        setSearching(false);
      }
    }, term ? 250 : 0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [q]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave({ v: 1, theme, banner, song });
    } catch {
      setError("Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      setSaving(false);
    }
  };

  const shownBanner = banner ?? (theme === "sade" ? null : FALLBACK_BANNER);

  return createPortal(
    <div className="pf-sheet-root">
      <div className="pf-sheet-scrim" onClick={() => !saving && onClose()} />
      <div className="pf-sheet" ref={panelRef} role="dialog" aria-modal="true" aria-label="Profili Özelleştir">
        <div className="pf-grab" aria-hidden="true" />
        <div className="pf-sh-hd">
          <button ref={closeRef} type="button" className="pf-mini" onClick={onClose} disabled={saving} aria-label="Kapat">
            <X size={18} />
          </button>
          <h3>Profili Özelleştir</h3>
          <button type="button" className="pf-mini pf-prim" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" aria-label="Kaydediliyor" /> : "Kaydet"}
          </button>
        </div>

        <section aria-label="Tema">
          <div className="pf-sec-t"><span>Tema</span></div>
          <div className="pf-themes">
            {PROFILE_THEMES.map((t) => (
              <button key={t.id} type="button" className="pf-opt" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
                <span className={`pf-tprev pf-tp-${t.id}`} aria-hidden="true"><i className="a" /><i className="b" /></span>
                <span>{t.name}</span>
                <span style={{ opacity: 0.8 }}>{t.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Banner">
          <div className="pf-sec-t">
            <span>Banner</span>
            <span className="pf-tag">{shownBanner ? bannerName(shownBanner) : "Yok"}</span>
          </div>
          <div className="pf-bgrid">
            {theme === "sade" && (
              <button type="button" className="pf-opt" aria-pressed={banner === null} onClick={() => setBanner(null)}>
                <span className="pf-tprev pf-tp-none" aria-hidden="true" style={{ background: "#09090b", border: "1px dashed #3f3f46" }} />
                <span>Yok</span>
              </button>
            )}
            {PROFILE_BANNERS.map((b) => {
              return (
                <button key={b.id} type="button" className="pf-opt" aria-pressed={shownBanner === b.id} onClick={() => setBanner(b.id)}>
                  <ProfileBanner id={b.id} still={shownBanner !== b.id} />
                  <span>{b.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Profil şarkısı">
          <div className="pf-sec-t">
            <span>Profil şarkısı</span>
            <button type="button" className="pf-mini" onClick={() => setSong(null)} disabled={!song}>Kaldır</button>
          </div>
          {song && (
            <div className="pf-cur">
              <div className="pf-rart">{song.artworkUrl && <img src={song.artworkUrl} alt="" />}</div>
              <div className="pf-rtx"><b>{song.title}</b><span>{song.artist}</span></div>
            </div>
          )}
          <label htmlFor="pf-q" className="pf-lbl">Şarkı veya sanatçı ara</label>
          <input id="pf-q" className="pf-srch" type="search" placeholder="Örn. Teneffüs" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="pf-res" aria-busy={searching}>
            {tracks.map((t) => (
              <li key={t.id}>
                <button type="button" className="pf-rs" aria-pressed={song?.trackId === Number(t.id)} onClick={() => setSong(toSong(t))}>
                  <span className="pf-rart">{t.thumbnail && <img src={t.thumbnail.replace("600x600", "100x100")} alt="" loading="lazy" />}</span>
                  <span className="pf-rtx"><b>{t.title}</b><span>{t.artist}</span></span>
                  <span className="pf-ck" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg></span>
                </button>
              </li>
            ))}
            {!searching && tracks.length === 0 && <li className="pf-empty">Sonuç bulunamadı. Başka bir şarkı veya sanatçı dene.</li>}
            {searching && <li className="pf-empty">Aranıyor…</li>}
          </ul>
          <p className="pf-srcn">Sonuçlar iTunes&apos;tan gelir, 30 sn önizleme.</p>
        </section>

        <p className="pf-err" role="alert">{error}</p>
      </div>
    </div>,
    document.body
  );
}

export default function ProfileCustomizeSheet(props: {
  open: boolean;
  initial: ProfileStyle;
  onClose: () => void;
  onSave: (style: ProfileStyle) => Promise<void>;
}) {
  if (!props.open || typeof document === "undefined") return null;
  return <SheetBody initial={props.initial} onClose={props.onClose} onSave={props.onSave} />;
}
