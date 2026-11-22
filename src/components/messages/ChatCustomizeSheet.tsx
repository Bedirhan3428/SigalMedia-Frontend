"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { CHAT_PHOTOS } from "@/lib/chat/chatPhotos";
import {
  CHAT_THEMES,
  QUICK_EMOJIS,
  getTheme,
  sentMinRatio,
  settingsToVars,
  type BgPattern,
  type BgType,
  type BubbleShape,
  type ChatSettings,
  type TextSize,
} from "@/lib/chat/chatThemes";
import { downscalePhoto } from "@/lib/chat/chatSettingsStore";
import { ChatBackground } from "./ChatBackground";

const fmt = (n: number) => n.toFixed(1).replace(".", ",");

const SEG =
  "min-h-12 px-4 rounded-xl border text-sm inline-flex items-center gap-2 transition-colors";
const segCls = (on: boolean) =>
  `${SEG} ${
    on
      ? "border-[#38D5C8] bg-[#38D5C8]/15 text-white ring-1 ring-[#38D5C8]"
      : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
  }`;

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="py-4 border-b border-zinc-800 last:border-b-0 flex flex-col gap-3">
      <h3 className="font-mono text-[11px] tracking-[0.1em] uppercase text-zinc-400">{label}</h3>
      {children}
    </section>
  );
}

export function ChatCustomizeSheet({
  draft,
  onChange,
  customPhoto,
  onCustomPhoto,
  realName,
  onSave,
  onReset,
  onClose,
}: {
  draft: ChatSettings;
  onChange: (next: ChatSettings) => void;
  customPhoto: string | null;
  onCustomPhoto: (dataUrl: string) => void;
  realName: string;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [msg, setMsg] = useState("");
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (m: string) => {
    setMsg(m);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(""), 2600);
  };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const f = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (msgTimer.current) clearTimeout(msgTimer.current);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<ChatSettings>) => onChange({ ...draft, ...patch });
  const setBg = (patch: Partial<ChatSettings["bg"]>) => onChange({ ...draft, bg: { ...draft.bg, ...patch } });
  const theme = getTheme(draft.theme);
  const min = sentMinRatio(theme);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const url = await downscalePhoto(file);
    if (!url) {
      say("Fotoğraf çok büyük ya da okunamadı.");
      return;
    }
    onCustomPhoto(url);
    setBg({ photo: "custom", type: "photo" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end" data-testid="chat-sheet-root">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-sheet-title"
        tabIndex={-1}
        className="relative w-full max-w-lg lg:max-w-[420px] max-h-[90dvh] lg:max-h-none lg:h-full overflow-y-auto overscroll-contain bg-zinc-950 text-zinc-100 border border-zinc-800 rounded-t-[18px] lg:rounded-none lg:border-y-0 lg:border-r-0 mx-auto lg:mx-0 px-4 pb-6 outline-none"
      >
        <div className="sticky top-0 z-10 bg-zinc-950 pt-2">
          <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-2 lg:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-zinc-800">
            <h2 id="chat-sheet-title" className="text-[15px] font-semibold">
              Sohbeti özelleştir
            </h2>
            <div className="flex items-center gap-2">
              <span
                data-testid="sheet-ratio"
                className={`font-mono text-[11px] ${min >= 4.5 ? "text-emerald-400" : "text-red-400"}`}
              >
                {fmt(min)}:1 {min >= 4.5 ? "AA" : "AA değil"}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Kapat"
                className="w-11 h-11 -mr-2 grid place-items-center rounded-xl text-zinc-300 hover:bg-zinc-800"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Canlı önizleme */}
        <div
          data-testid="sheet-preview"
          style={settingsToVars(draft)}
          className="chat-root relative isolate overflow-hidden rounded-2xl mt-3 border border-zinc-800 h-36"
        >
          <ChatBackground settings={draft} customPhoto={customPhoto} />
          <div className="relative z-10 h-full flex flex-col justify-end px-3 py-2.5" style={{ gap: "var(--gap)" }}>
            <div className="flex">
              <div
                className="chat-recv max-w-[78%] leading-[1.35]"
                style={{
                  fontSize: "var(--fs)",
                  padding: "var(--pad)",
                  borderRadius: "var(--r)",
                  borderBottomLeftRadius: "var(--rt)",
                }}
              >
                Akşam kahveye çıkıyor muyuz? ☕
              </div>
            </div>
            <div className="flex justify-end">
              <div
                className="chat-sent max-w-[78%] leading-[1.35]"
                style={{
                  fontSize: "var(--fs)",
                  padding: "var(--pad)",
                  borderRadius: "var(--r)",
                  borderBottomRightRadius: "var(--rt)",
                }}
              >
                Çıkıyoruz!
              </div>
            </div>
          </div>
        </div>

        <Group label="Renk teması">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5" role="group" aria-label="Renk teması">
            {CHAT_THEMES.map((t) => {
              const m = sentMinRatio(t);
              const on = draft.theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-theme-id={t.id}
                  aria-pressed={on}
                  onClick={() => set({ theme: t.id })}
                  className={`text-left rounded-xl border p-2 flex flex-col gap-1.5 min-h-12 ${
                    on ? "border-[#38D5C8] ring-1 ring-[#38D5C8] bg-[#38D5C8]/15" : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className="h-[34px] rounded-[9px] flex items-center px-2 text-[11px] font-semibold"
                    style={{ background: `linear-gradient(135deg,${t.a},${t.b})`, color: t.t }}
                  >
                    Aa
                  </span>
                  <b className="text-[13px] font-semibold">{t.name}</b>
                  <small className={`font-mono text-[10.5px] ${m >= 4.5 ? "text-zinc-400" : "text-red-400"}`}>
                    {fmt(m)}:1 {m >= 4.5 ? "AA" : "AA değil"}
                  </small>
                </button>
              );
            })}
          </div>
          <p className="text-[12.5px] text-zinc-400">
            Etiketteki oran, balon metninin gradyanın en zayıf noktasındaki kontrastıdır (AA = 4,5 ve üstü).
          </p>
        </Group>

        <Group label="Sohbet arka planı">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Arka plan türü">
            {(
              [
                ["solid", "Düz"],
                ["gradient", "Gradyan"],
                ["pattern", "Desen"],
                ["photo", "Fotoğraf"],
              ] as [BgType, string][]
            ).map(([v, l]) => (
              <button key={v} type="button" data-bg-type={v} aria-pressed={draft.bg.type === v} className={segCls(draft.bg.type === v)} onClick={() => setBg({ type: v })}>
                {l}
              </button>
            ))}
          </div>
          {draft.bg.type === "pattern" && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Desen">
              {(
                [
                  ["dots", "Noktalar"],
                  ["lines", "Çizgiler"],
                  ["grid", "Izgara"],
                ] as [BgPattern, string][]
              ).map(([v, l]) => (
                <button key={v} type="button" data-pattern={v} aria-pressed={draft.bg.pattern === v} className={segCls(draft.bg.pattern === v)} onClick={() => setBg({ pattern: v })}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {draft.bg.type === "photo" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2.5 items-center">
                {CHAT_PHOTOS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={draft.bg.photo === p.id}
                    aria-label={`Fotoğraf: ${p.name}`}
                    onClick={() => setBg({ photo: p.id })}
                    className={`w-14 h-14 rounded-xl border border-zinc-700 bg-cover bg-center ${
                      draft.bg.photo === p.id ? "outline outline-2 outline-offset-2 outline-[#38D5C8]" : ""
                    }`}
                    style={{ backgroundImage: p.css }}
                  />
                ))}
                {customPhoto && (
                  <button
                    type="button"
                    aria-pressed={draft.bg.photo === "custom"}
                    aria-label="Seçtiğiniz fotoğraf"
                    onClick={() => setBg({ photo: "custom" })}
                    className={`w-14 h-14 rounded-xl border border-zinc-700 bg-cover bg-center ${
                      draft.bg.photo === "custom" ? "outline outline-2 outline-offset-2 outline-[#38D5C8]" : ""
                    }`}
                    style={{ backgroundImage: `url("${customPhoto}")` }}
                  />
                )}
              </div>
              <label className="relative overflow-hidden inline-flex items-center justify-center w-max min-h-12 px-5 rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-medium cursor-pointer hover:bg-zinc-800 focus-within:outline focus-within:outline-2 focus-within:outline-[#38D5C8]">
                Galeriden seç
                <input
                  type="file"
                  accept="image/*"
                  data-testid="sheet-file"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
          <div className="flex flex-col">
            <label htmlFor="chat-blur" className="text-[13px] text-zinc-300 flex justify-between">
              <span>Bulanıklık</span>
              <span>{draft.bg.blur} px</span>
            </label>
            <input id="chat-blur" type="range" min={0} max={20} value={draft.bg.blur} onChange={(e) => setBg({ blur: +e.target.value })} className="w-full h-11 accent-[#38D5C8] bg-transparent" />
          </div>
          <div className="flex flex-col">
            <label htmlFor="chat-dim" className="text-[13px] text-zinc-300 flex justify-between">
              <span>Karartma</span>
              <span>{draft.bg.dim}%</span>
            </label>
            <input id="chat-dim" type="range" min={0} max={80} value={draft.bg.dim} onChange={(e) => setBg({ dim: +e.target.value })} className="w-full h-11 accent-[#38D5C8] bg-transparent" />
          </div>
        </Group>

        <Group label="Balon biçimi">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Balon biçimi">
            {(
              [
                ["round", "Yuvarlak", "14px"],
                ["soft", "Yumuşak", "12px 12px 12px 3px"],
                ["sharp", "Keskin", "4px"],
              ] as [BubbleShape, string, string][]
            ).map(([v, l, r]) => (
              <button key={v} type="button" data-bubble={v} aria-pressed={draft.bubble === v} className={segCls(draft.bubble === v)} onClick={() => set({ bubble: v })}>
                <span className="block w-[30px] h-5 bg-zinc-400" style={{ borderRadius: r }} />
                {l}
              </button>
            ))}
          </div>
        </Group>

        <Group label="Metin boyutu">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Metin boyutu">
            {(
              [
                ["S", "Küçük", 13],
                ["M", "Orta", 16],
                ["L", "Büyük", 19],
              ] as [TextSize, string, number][]
            ).map(([v, l, px]) => (
              <button key={v} type="button" data-size={v} aria-pressed={draft.textSize === v} className={segCls(draft.textSize === v)} onClick={() => set({ textSize: v })}>
                <span style={{ fontSize: px }}>Aa</span>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 min-h-12">
            <span className="text-sm">Sıkı görünüm</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.compact}
              aria-label="Sıkı görünüm"
              data-testid="sheet-compact"
              onClick={() => set({ compact: !draft.compact })}
              className={`relative w-[52px] h-[30px] rounded-full border border-zinc-600 transition-colors ${draft.compact ? "bg-[#38D5C8]" : "bg-zinc-800"}`}
            >
              <span
                className={`absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full transition-transform ${
                  draft.compact ? "translate-x-[22px] bg-[#04201E]" : "bg-zinc-300"
                }`}
              />
            </button>
          </div>
        </Group>

        <Group label="Hızlı tepki">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2" role="group" aria-label="Hızlı tepki emojisi">
            {QUICK_EMOJIS.map((x) => (
              <button
                key={x}
                type="button"
                data-emoji={x}
                aria-pressed={draft.quickReaction === x}
                aria-label={`Hızlı tepki ${x}`}
                onClick={() => set({ quickReaction: x })}
                className={`h-[52px] text-2xl rounded-xl border ${
                  draft.quickReaction === x ? "border-[#38D5C8] ring-1 ring-[#38D5C8] bg-[#38D5C8]/15" : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                }`}
              >
                {x}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-zinc-400">Yazı çubuğundaki hızlı tepki düğmesi bu emojiyi mesaj olarak gönderir.</p>
        </Group>

        <Group label="Takma ad">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="chat-nick" className="text-[13px] text-zinc-300">
              {realName || "Bu kişi"} için takma ad
            </label>
            <input
              id="chat-nick"
              type="text"
              maxLength={24}
              value={draft.nickname}
              onChange={(e) => set({ nickname: e.target.value.slice(0, 24) })}
              placeholder="Örn. Kahve Ortağı"
              autoComplete="off"
              className="min-h-12 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 px-3.5 text-[16px] w-full focus:outline-none focus:border-[#38D5C8]"
            />
            <p className="text-[12.5px] text-zinc-400">Takma ad yalnızca bu cihazda görünür.</p>
          </div>
        </Group>

        <div className="flex flex-wrap gap-2.5 pt-3.5">
          <button
            type="button"
            data-testid="sheet-save"
            onClick={() => {
              onSave();
              say("Bu sohbet için kaydedildi (yalnızca bu tarayıcıda).");
            }}
            className="min-h-12 px-5 rounded-xl bg-[#38D5C8] text-[#04201E] font-semibold"
          >
            Kaydet
          </button>
          <button
            type="button"
            data-testid="sheet-reset"
            onClick={() => {
              onReset();
              say("Varsayılan ayarlara dönüldü.");
            }}
            className="min-h-12 px-5 rounded-xl border border-zinc-700 bg-zinc-900 font-medium hover:bg-zinc-800"
          >
            Varsayılana dön
          </button>
        </div>
        <div role="status" className="min-h-[18px] mt-2 text-[12.5px] text-emerald-400">
          {msg}
        </div>
      </div>
    </div>
  );
}
