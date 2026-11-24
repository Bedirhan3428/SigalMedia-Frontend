"use client";
import { useEffect, useRef, useState } from "react";
import type { MediaDraft, Post } from "@/lib/feed/types";
import { Art } from "./Art";
import { Icon } from "./glyphs";
import { Sheet } from "./Sheet";
import { feedService } from "@/lib/feed/feedService";

type T = "photo" | "video" | "poll";

export function ParentPreview({ parent }: { parent: Post }) {
  const text = parent.type === "poll" ? parent.question : parent.caption;
  const u = feedService.getUser(parent.authorId);
  return (
    <div className="fd-pv">
      <svg className="fd-c" viewBox="0 0 22 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 V30 Q0 46 14 46 H18" />
        <path d="M13 41 L19 46 L13 51" />
      </svg>
      <span className="fd-th" style={parent.type === "poll" ? { background: "var(--ac-soft)", display: "grid", placeItems: "center", color: "var(--ac)" } : undefined}>
        {parent.type === "poll" ? <Icon id="g-vote" /> : parent.mediaUrl && parent.type === "photo" ? <img src={parent.mediaUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Art k={parent.art} />}
      </span>
      <p><b>@{u.username}&apos;e yanıt</b>{text ?? ""}</p>
    </div>
  );
}

export function ComposerSheet({ parent, onClose, onPoll, onSubmit, opener }: {
  parent: Post | null;
  onClose: () => void;
  onPoll: () => void;
  onSubmit: (d: MediaDraft) => Promise<void>;
  opener?: HTMLElement | null;
}) {
  const [type, setType] = useState<T>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const urlRef = useRef<string | null>(null);
  const setPreviewFor = (f: File | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = f ? URL.createObjectURL(f) : null;
    setPreview(urlRef.current);
    setFile(f);
  };
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const pickType = (t: T) => { setType(t); setPreviewFor(null); setDur(0); setErr(""); };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    const ok = type === "video" ? f.type.startsWith("video/") : f.type.startsWith("image/");
    if (!ok) { setErr(type === "video" ? "Lütfen bir video dosyası seç." : "Lütfen bir görsel dosyası seç."); return; }
    setErr("");
    setPreviewFor(f);
  };
  const share = async () => {
    if (type === "poll") { onPoll(); return; }
    if (!file || busy) return;
    setBusy(true);
    try {
      await onSubmit({ kind: type, media: file, caption: caption.trim() || undefined, durationSec: dur });
    } catch {
      setErr("Paylaşılamadı. Tekrar dene.");
      setBusy(false);
    }
  };
  const label = parent ? "Yanıtı paylaş" : "Paylaş";

  return (
    <Sheet titleId="fd-coT" title={parent ? "Yanıt olarak paylaş" : "Yeni gönderi"} onClose={onClose} opener={opener}>
      <div className="fd-sb">
        {parent ? <ParentPreview parent={parent} /> : null}
        <div className="fd-seg" role="group" aria-label="Gönderi türü">
          <button type="button" className="fd-sg" aria-pressed={type === "photo"} onClick={() => pickType("photo")}><Icon id="i-img" />Foto</button>
          <button type="button" className="fd-sg" aria-pressed={type === "video"} onClick={() => pickType("video")}><Icon id="i-vid" />Video</button>
          <button type="button" className="fd-sg" aria-pressed={type === "poll"} onClick={() => pickType("poll")}><Icon id="g-vote" />Anket</button>
        </div>
        {type !== "poll" ? (
          <>
            <input ref={input} type="file" hidden accept={type === "video" ? "video/*" : "image/*"} data-testid="fd-file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            {preview && file ? (
              <div className="fd-pick">
                {type === "video"
                  ? <video src={preview} muted playsInline preload="metadata" onLoadedMetadata={(e) => setDur(Math.round(e.currentTarget.duration) || 0)} aria-label="Seçilen video önizlemesi" />
                  : <img src={preview} alt="Seçilen görsel önizlemesi" />}
                <button type="button" className="fd-drop" style={{ marginTop: 8, minHeight: 44 }} onClick={() => input.current?.click()}>Değiştir · {file.name}</button>
              </div>
            ) : (
              <button type="button" className="fd-drop" onClick={() => input.current?.click()}>{type === "video" ? "Video seç" : "Foto seç"}</button>
            )}
            <textarea className="fd-field" placeholder="Bir şey yaz… (isteğe bağlı)" aria-label="Açıklama" maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <span className="fd-cnt" aria-hidden="true">{caption.length}/200</span>
          </>
        ) : null}
        {err ? <p className="fd-err" role="alert">{err}</p> : null}
        <button type="button" className="fd-cta" disabled={busy || (type !== "poll" && !file)} onClick={share}>
          {type === "poll" ? "Anketi hazırla" : busy ? "Paylaşılıyor…" : label}
        </button>
      </div>
    </Sheet>
  );
}
