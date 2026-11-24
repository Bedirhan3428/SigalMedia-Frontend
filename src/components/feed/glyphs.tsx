import { memo } from "react";

/** Tek ince çizgi SVG seti (taslaktaki sembol kümesi). FeedList bir kez render eder. */
export const GlyphSprite = memo(function GlyphSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="fd-g-pen" viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></symbol>
        <symbol id="fd-g-flame" viewBox="0 0 24 24"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z" /></symbol>
        <symbol id="fd-g-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.600-7 10-7 10z" /></symbol>
        <symbol id="fd-g-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.600 0l3-3a4 4 0 0 0-5.600-5.600l-1 1" /><path d="M14 10a4 4 0 0 0-5.600 0l-3 3a4 4 0 0 0 5.600 5.600l1-1" /></symbol>
        <symbol id="fd-g-trend" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></symbol>
        <symbol id="fd-g-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="fd-g-crown" viewBox="0 0 24 24"><path d="M4 18L3 8l5 4 4-7 4 7 5-4-1 10z" /></symbol>
        <symbol id="fd-g-bolt" viewBox="0 0 24 24"><path d="M13 2L5 14h6l-1 8 8-12h-6z" /></symbol>
        <symbol id="fd-g-vote" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></symbol>
        <symbol id="fd-i-reply" viewBox="0 0 24 24"><path d="M20 5v6a4 4 0 0 1-4 4H5" /><path d="M9 11l-4 4 4 4" /></symbol>
        <symbol id="fd-i-heart" viewBox="0 0 24 24"><path d="M12 20.6l-1.3-1.2C6.1 15.2 3.2 12.6 3.2 9.4 3.2 6.8 5.2 4.8 7.8 4.8c1.6 0 3.2.8 4.2 2 1-1.2 2.6-2 4.2-2 2.6 0 4.6 2 4.6 4.6 0 3.2-2.9 5.8-7.5 10z" /></symbol>
        <symbol id="fd-i-chat" viewBox="0 0 24 24"><path d="M20.6 11.6a8.4 8.4 0 0 1-12.2 7.5L3.6 20.4l1.4-4.5a8.4 8.4 0 1 1 15.6-4.3z" /></symbol>
        <symbol id="fd-i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></symbol>
        <symbol id="fd-i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></symbol>
        <symbol id="fd-i-send" viewBox="0 0 24 24"><path d="M21 3L3 10.500l7 3 3 7z" /><path d="M21 3L10 13.500" /></symbol>
        <symbol id="fd-i-bookmark" viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z" /></symbol>
        <symbol id="fd-i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></symbol>
        <symbol id="fd-i-check" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></symbol>
        <symbol id="fd-i-img" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M3 18l6-5 4 3 3-2 5 4" /></symbol>
        <symbol id="fd-i-vid" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 11l5-3v8l-5-3" /></symbol>
        <symbol id="fd-i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></symbol>
        <symbol id="fd-i-pause" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></symbol>
        <symbol id="fd-i-vol" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6" /></symbol>
        <symbol id="fd-i-mute" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9l5 6M21 9l-5 6" /></symbol>
      </defs>
    </svg>
  );
});

/** İkon: `id` örn. "i-heart" ya da "g-link". */
export function Icon({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg className={`fd-i ${className}`} aria-hidden="true" focusable="false">
      <use href={`#fd-${id}`} />
    </svg>
  );
}
