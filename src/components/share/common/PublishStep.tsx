"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Images, Loader2 } from "lucide-react";
import type { CanvasEngine } from "@/lib/canvas-editor";
import { PublishScreen } from "./PublishScreen";

/** Cover choice handed to the share handler. */
export interface PublishCover {
  /** Post: index of the photo that becomes media[0]. */
  slot: number;
  /** Reels: poster time in ms on the timeline (null for photos). */
  ms: number | null;
}

export interface PublishStepProps {
  mode: "reels" | "post";
  /** Returns the live editor engine (read once when the screen opens). */
  getEngine: () => CanvasEngine | null;
  /** Post: the photos in editor order. */
  slots: { file: File }[];
  /** Post: slot currently loaded in the engine. */
  activeSlot: number;
  /** Post canvas width / height. */
  aspect: number;
  caption: string;
  onCaptionChange: (c: string) => void;
  /** Reply banner text, e.g. "@x'e yanıt". */
  subtitle?: string;
  busy: boolean;
  busyProgress?: number;
  onBack: () => void;
  onShare: (caption: string, cover: PublishCover) => void | Promise<unknown>;
}

const STRIP_FRAMES = 8;
const HANDLE_W = 44;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Publish screen for Post and Reels: preview, cover picker (Kapak), caption + hashtags. */
export function PublishStep(props: PublishStepProps) {
  const [engine] = useState(props.getEngine);
  if (!engine) return null;
  return <PublishStepInner {...props} engine={engine} />;
}

function PublishStepInner(props: PublishStepProps & { engine: CanvasEngine }) {
  const { mode, engine, caption, onCaptionChange, subtitle, busy, busyProgress, onBack, onShare } = props;
  const isReels = mode === "reels";

  // ---------- Post ----------
  const { slots, activeSlot, aspect } = props;
  const slotFiles = useMemo(() => slots.map((s) => s.file), [slots]);
  const [coverSlot, setCoverSlot] = useState(0);
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isReels) return;
    const urls = slotFiles.map((f) => URL.createObjectURL(f));
    let dead = false;
    queueMicrotask(() => {
      if (!dead) setFileUrls(urls);
    });
    return () => {
      dead = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [isReels, slotFiles]);

  useEffect(() => {
    if (isReels) return;
    let dead = false;
    let url: string | null = null;
    engine
      .exportImage({ mimeType: "image/jpeg", quality: 0.8 })
      .then((blob) => {
        if (dead) return;
        url = URL.createObjectURL(blob);
        setActiveUrl(url);
      })
      .catch(() => {});
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [engine, isReels]);

  const srcOf = (i: number) => (i === activeSlot && activeUrl ? activeUrl : fileUrls[i]);

  // ---------- Reels ----------
  const [duration] = useState(() => engine.getVideoState().duration);
  const [frac, setFrac] = useState(() => {
    const st = engine.getVideoState();
    return st.duration > 0 ? clamp01(st.currentTime / st.duration) : 0;
  });
  const origTime = useRef(engine.getVideoState().currentTime);
  const [frames, setFrames] = useState<string[]>([]);
  const [framesReady, setFramesReady] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Şerit kareleri: motor zaman çizelgesinde sırayla gezilir (düzenlemeler ve çok klip yansır)
  useEffect(() => {
    if (!isReels) return;
    let dead = false;
    const made: string[] = [];
    (async () => {
      try {
        if (engine.getVideoState().isPlaying) await engine.toggleVideoPlay();
        for (let i = 0; i < STRIP_FRAMES && !dead; i++) {
          await engine.seekVideo(((i + 0.5) / STRIP_FRAMES) * duration);
          const b = await engine.exportImage({ mimeType: "image/jpeg", quality: 0.55, width: 72, height: 128 });
          if (dead) return;
          made.push(URL.createObjectURL(b));
          setFrames([...made]);
        }
      } catch {
        /* şerit isteğe bağlı */
      }
      if (!dead) setFramesReady(true);
    })();
    return () => {
      dead = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [engine, isReels, duration]);

  // Önizleme: seçili kapak karesi
  useEffect(() => {
    if (!isReels || !framesReady) return;
    let dead = false;
    let url: string | null = null;
    const t = setTimeout(async () => {
      try {
        await engine.seekVideo(frac * duration);
        const b = await engine.exportImage({ mimeType: "image/jpeg", quality: 0.8, width: 360, height: 640 });
        if (dead) return;
        url = URL.createObjectURL(b);
        setPosterUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch {
        /* önizleme yoksa kutu boş kalır */
      }
    }, 90);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [engine, isReels, framesReady, frac, duration]);

  useEffect(
    () => () => {
      if (!isReels) return;
      void engine.seekVideo(origTime.current).catch(() => {});
    },
    [engine, isReels],
  );

  const fracFromPointer = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const r = stripRef.current?.getBoundingClientRect();
    if (!r) return null;
    return clamp01((e.clientX - r.left - HANDLE_W / 2) / Math.max(1, r.width - HANDLE_W));
  }, []);
  const onStripDown = (e: PointerEvent<HTMLDivElement>) => {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fracFromPointer(e);
    if (f !== null) setFrac(f);
  };
  const onStripMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const f = fracFromPointer(e);
    if (f !== null) setFrac(f);
  };
  const onStripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") setFrac((f) => clamp01(f - step));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") setFrac((f) => clamp01(f + step));
    else if (e.key === "Home") setFrac(0);
    else if (e.key === "End") setFrac(1);
    else return;
    e.preventDefault();
  };

  const seconds = frac * duration;
  const multi = !isReels && slotFiles.length > 1;

  const preview = isReels ? (
    posterUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img data-testid="publish-preview" src={posterUrl} alt="Kapak önizlemesi" className="w-full h-full object-cover" />
    ) : (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/60" />
      </div>
    )
  ) : (
    <div className="relative w-full h-full">
      {srcOf(coverSlot) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img data-testid="publish-preview" src={srcOf(coverSlot)} alt="Gönderi önizlemesi" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-white/60" />
        </div>
      )}
      {multi && (
        <span
          data-testid="publish-count"
          className="absolute top-2 right-2 h-6 px-2 rounded-full bg-black/60 backdrop-blur text-[11px] font-semibold flex items-center gap-1"
        >
          <Images className="w-3.5 h-3.5" aria-hidden="true" />
          {slotFiles.length}
        </span>
      )}
    </div>
  );

  const coverPicker = isReels ? (
    <div className="flex flex-col gap-1.5">
      <div
        ref={stripRef}
        role="slider"
        tabIndex={0}
        aria-label="Kapak karesi"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(seconds * 10) / 10}
        aria-valuetext={`${seconds.toFixed(1)} saniye`}
        data-testid="cover-strip"
        onPointerDown={onStripDown}
        onPointerMove={onStripMove}
        onKeyDown={onStripKey}
        className="relative h-16 rounded-xl overflow-hidden bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-ac,#38d5c8)]"
      >
        <div className="absolute inset-0 flex">
          {Array.from({ length: STRIP_FRAMES }, (_, i) => (
            <div key={i} className="flex-1 h-full bg-black/30 overflow-hidden">
              {frames[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frames[i]} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
              )}
            </div>
          ))}
        </div>
        <div
          data-testid="cover-handle"
          aria-hidden="true"
          className="absolute top-0 bottom-0 rounded-lg border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5)] pointer-events-none"
          style={{ width: HANDLE_W, left: `calc((100% - ${HANDLE_W}px) * ${frac})` }}
        />
      </div>
      <span className="text-[12px] text-[var(--ed-tx3,#8a94a3)] tabular-nums">Kapak karesi: {seconds.toFixed(1)} sn</span>
    </div>
  ) : multi ? (
    <div role="group" aria-label="Kapak fotoğrafı" className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-1" data-testid="cover-row">
      {slotFiles.map((f, i) => (
        <button
          key={`${f.name}-${i}`}
          type="button"
          data-testid="cover-thumb"
          aria-pressed={coverSlot === i}
          aria-label={`${i + 1}. fotoğrafı kapak yap`}
          disabled={busy}
          onClick={() => setCoverSlot(i)}
          className={`relative w-16 h-20 shrink-0 rounded-lg overflow-hidden border-2 active:scale-95 transition-transform disabled:opacity-50 ${
            coverSlot === i ? "border-[var(--ed-ac,#38d5c8)]" : "border-transparent"
          }`}
        >
          {srcOf(i) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={srcOf(i)} alt="" draggable={false} className="w-full h-full object-cover" />
          )}
          {coverSlot === i && (
            <span className="absolute inset-x-0 bottom-0 bg-[var(--ed-ac,#38d5c8)] text-black text-[10px] font-bold text-center py-0.5">
              Kapak
            </span>
          )}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <PublishScreen
      open
      title={isReels ? "Yeni Reels" : "Yeni gönderi"}
      subtitle={subtitle}
      preview={preview}
      previewAspect={isReels ? 9 / 16 : aspect}
      coverPicker={coverPicker}
      caption={caption}
      onCaptionChange={onCaptionChange}
      busy={busy}
      busyProgress={busyProgress}
      onBack={onBack}
      onShare={(c) => onShare(c, { slot: coverSlot, ms: isReels ? Math.round(seconds * 1000) : null })}
    />
  );
}
