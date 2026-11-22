"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { AlignCenter, AlignLeft, AlignRight, X } from "lucide-react";
import { EditorPortal } from "./EditorPortal";
import { EDITOR_Z } from "./layers";
import { useBackLayer } from "./hooks/useEditorBackStack";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";
import { useVisualViewport, useVisualViewportFrameStyle } from "./hooks/useVisualViewport";
import {
  DEFAULT_TEXT_EDITOR_VALUE,
  TEXT_BG_PRESETS,
  TEXT_COLORS,
  TEXT_FONT_BY_ID,
  TEXT_FONT_OPTIONS,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  type TextAlign,
  type TextEditorValue,
} from "./textPresets";

/** Props of {@link TextEditorOverlay}. */
export interface TextEditorOverlayProps {
  /** Shows the overlay. Each time it opens, editing starts from `value`. */
  open: boolean;
  /** Initial state (read when the overlay opens). Missing fields fall back to defaults. */
  value: Partial<TextEditorValue>;
  /**
   * "Bitti", tap outside the text, or Back gesture (see `backAction`). Receives the final value.
   * If `text.trim()` is empty the caller should remove the layer.
   */
  onDone: (value: TextEditorValue) => void;
  /** X button (and Back when `backAction="cancel"`). The caller restores the previous state. */
  onCancel: () => void;
  /** Optional live updates on every change (e.g. to mirror on the canvas while typing). */
  onChange?: (value: TextEditorValue) => void;
  /**
   * CSS px per canvas px for the preview font size. Default: fits a 9:16 1080-wide canvas in
   * the viewport (`min(vw, vh * 9/16) / 1080`). Pass the real canvas display scale if known.
   */
  previewScale?: number;
  /** What the Back gesture does: `"done"` (default, keeps the text) or `"cancel"`. */
  backAction?: "done" | "cancel";
  /** Textarea placeholder (default "Yazmaya başlayın…"). */
  placeholder?: string;
}

const ALIGN_ORDER: TextAlign[] = ["center", "left", "right"];
const ALIGN_LABEL: Record<TextAlign, string> = {
  center: "Ortala",
  left: "Sola hizala",
  right: "Sağa hizala",
};

// Klavye açıkken buton dokunuşu textarea odağını almasın
const keepFocus = {
  onPointerDown: (e: SyntheticEvent) => e.preventDefault(),
  onMouseDown: (e: SyntheticEvent) => e.preventDefault(),
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Instagram-style full-screen text editor at `--z-modal`.
 *
 * - `visualViewport` aware: the frame shrinks to the visible area, so the font/colour rows
 *   sit right above the on-screen keyboard (C6).
 * - Textarea has `user-select: text` and lives in a portal, outside any `select-none` /
 *   `touch-none` ancestor (C7).
 * - Controls: alignment, background style (none / solid / semi / neon), font chips,
 *   18 colours, vertical size slider. Toolbar taps don't steal focus from the textarea.
 * - Closable by X (cancel), "Bitti", tap outside, Back gesture and Escape.
 */
export function TextEditorOverlay(props: TextEditorOverlayProps) {
  if (!props.open) return null;
  return <TextEditorPanel {...props} />;
}

function TextEditorPanel({
  value: initial,
  onDone,
  onCancel,
  onChange,
  previewScale,
  backAction = "done",
  placeholder = "Yazmaya başlayın…",
}: TextEditorOverlayProps) {
  const [value, setValue] = useState<TextEditorValue>(() => ({
    ...DEFAULT_TEXT_EDITOR_VALUE,
    ...initial,
  }));
  const valueRef = useRef(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLSpanElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);

  const vv = useVisualViewport();
  const frameStyle = useVisualViewportFrameStyle();
  useBodyScrollLock(true);

  const update = (patch: Partial<TextEditorValue>) => {
    const next = { ...valueRef.current, ...patch };
    valueRef.current = next;
    setValue(next);
    onChange?.(next);
  };
  const finish = () => onDone(valueRef.current);

  useBackLayer(true, () => {
    if (backAction === "cancel") onCancel();
    else onDone(valueRef.current);
  });

  // Açılışta odakla, imleci sona taşı (dokunma olayı içinde: iOS klavyeyi açar)
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    const len = ta.value.length;
    try {
      ta.setSelectionRange(len, len);
    } catch {
      /* yoksay */
    }
  }, []);

  const viewportW = vv?.width ?? 390;
  const viewportH = vv ? vv.height + vv.keyboardInset + vv.offsetTop : 844;
  const scale = previewScale ?? Math.min(viewportW, (viewportH * 9) / 16) / 1080;
  const previewPx = clamp(value.fontSize * scale, 14, 84);

  const font = TEXT_FONT_BY_ID[value.fontPreset] ?? TEXT_FONT_BY_ID.modern;
  const isNeon = value.fontPreset === "neon" || value.bgPreset === "neon";
  const background =
    value.bgPreset === "solid"
      ? "#000000"
      : value.bgPreset === "translucent"
        ? "rgba(0, 0, 0, 0.55)"
        : "transparent";
  const textShadow = isNeon
    ? `0 0 10px ${value.color}, 0 0 22px ${value.color}`
    : value.bgPreset === "none"
      ? "0 2px 8px rgba(0, 0, 0, 0.65)"
      : "none";

  const textStyle: CSSProperties = {
    fontFamily: font.fontFamily,
    fontWeight: font.fontWeight,
    fontStyle: font.fontStyle,
    fontSize: previewPx,
    lineHeight: 1.25,
    padding: "0.28em 0.5em",
    borderRadius: "0.35em",
    textAlign: value.align,
  };

  // İçeriğe göre genişlik/yükseklik (gizli ayna ile ölçülür)
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    const area = areaRef.current;
    if (!ta || !mirror || !area) return;
    mirror.textContent = `${value.text || placeholder}​`;
    const maxW = Math.max(80, area.clientWidth - 112);
    ta.style.width = `${Math.max(48, Math.min(maxW, Math.ceil(mirror.offsetWidth) + 2))}px`;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, area.clientHeight - 16)}px`;
  }, [value.text, value.fontPreset, previewPx, placeholder, viewportW, viewportH]);

  const AlignIcon =
    value.align === "left" ? AlignLeft : value.align === "right" ? AlignRight : AlignCenter;
  const bgIndex = Math.max(
    0,
    TEXT_BG_PRESETS.findIndex((b) => b.id === value.bgPreset)
  );
  const bgLabel = TEXT_BG_PRESETS[bgIndex]?.label ?? "Arka plan";

  const cycleAlign = () => {
    const i = ALIGN_ORDER.indexOf(value.align);
    update({ align: ALIGN_ORDER[(i + 1) % ALIGN_ORDER.length] });
  };
  const cycleBg = () => {
    update({ bgPreset: TEXT_BG_PRESETS[(bgIndex + 1) % TEXT_BG_PRESETS.length].id });
  };

  return (
    <EditorPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Metin düzenle"
        className="fixed inset-0 flex flex-col text-white px-safe editor-anim-fade-in"
        style={{ zIndex: EDITOR_Z.modal, touchAction: "manipulation", ...frameStyle }}
      >
        <div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        {/* Üst çubuk */}
        <div className="relative shrink-0 pt-safe">
          <div className="h-14 px-2 flex items-center gap-1">
            <button
              type="button"
              onClick={onCancel}
              aria-label="İptal"
              className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 active:bg-white/10 transition-transform"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <button
                type="button"
                {...keepFocus}
                onClick={cycleAlign}
                aria-label={ALIGN_LABEL[value.align]}
                className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 active:bg-white/10 transition-transform"
              >
                <AlignIcon className="w-6 h-6" />
              </button>
              <button
                type="button"
                {...keepFocus}
                onClick={cycleBg}
                aria-label={bgLabel}
                className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              >
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] font-black border-2 ${
                    value.bgPreset === "solid"
                      ? "bg-white text-black border-white"
                      : value.bgPreset === "translucent"
                        ? "bg-white/35 text-white border-white/70"
                        : value.bgPreset === "neon"
                          ? "bg-transparent border-white text-white"
                          : "bg-transparent border-white/80 text-white"
                  }`}
                  style={
                    value.bgPreset === "neon"
                      ? { textShadow: `0 0 8px ${value.color}`, boxShadow: `0 0 10px ${value.color}` }
                      : undefined
                  }
                >
                  A
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={finish}
              className="h-11 px-5 rounded-full bg-white text-black font-bold text-sm active:scale-95 transition-transform"
            >
              Bitti
            </button>
          </div>
        </div>

        {/* Metin alanı; boşluğa dokunmak bitirir */}
        <div
          ref={areaRef}
          className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) finish();
          }}
        >
          <SizeSlider value={value.fontSize} onChange={(fontSize) => update({ fontSize })} />
          <span
            ref={mirrorRef}
            aria-hidden="true"
            className="absolute -left-[9999px] top-0 invisible whitespace-pre pointer-events-none"
            style={textStyle}
          />
          <textarea
            ref={textareaRef}
            value={value.text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder={placeholder}
            rows={1}
            aria-label="Metin"
            autoCapitalize="sentences"
            autoComplete="off"
            spellCheck={false}
            className="relative block resize-none border-0 outline-none overflow-y-auto no-scrollbar placeholder:text-white/45 select-text"
            style={{
              ...textStyle,
              color: value.color,
              backgroundColor: background,
              textShadow,
              caretColor: value.color === "#000000" && value.bgPreset === "solid" ? "#fff" : value.color,
              WebkitUserSelect: "text",
              userSelect: "text",
              touchAction: "manipulation",
            }}
          />
        </div>

        {/* Alt kontroller: klavyenin hemen üstünde */}
        <div
          className="relative shrink-0 flex flex-col gap-1 pt-1"
          style={{ paddingBottom: vv?.keyboardOpen ? 6 : "calc(var(--sab) + 8px)" }}
        >
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-1">
            {TEXT_FONT_OPTIONS.map((f) => {
              const active = f.id === value.fontPreset;
              return (
                <button
                  key={f.id}
                  type="button"
                  {...keepFocus}
                  onClick={() => update({ fontPreset: f.id })}
                  aria-pressed={active}
                  className={`shrink-0 h-11 px-4 rounded-full text-[15px] border transition-colors active:scale-95 ${
                    active
                      ? "bg-white text-black border-white"
                      : "bg-black/35 text-white border-white/25"
                  }`}
                >
                  {/* Etiket sabit fontla (okunur); font önizlemesi ayrı "Aa" örneğinde */}
                  <span
                    aria-hidden="true"
                    className="mr-2 text-[18px] leading-none opacity-80"
                    style={{ fontFamily: f.fontFamily, fontWeight: f.fontWeight, fontStyle: f.fontStyle }}
                  >
                    Aa
                  </span>
                  <span className="font-semibold">{f.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex overflow-x-auto no-scrollbar px-1.5">
            {TEXT_COLORS.map((c) => {
              const active = c.toUpperCase() === value.color.toUpperCase();
              return (
                <button
                  key={c}
                  type="button"
                  {...keepFocus}
                  onClick={() => update({ color: c })}
                  aria-label={`Renk ${c}`}
                  aria-pressed={active}
                  className="shrink-0 w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <span
                    className={`block rounded-full border-2 transition-transform ${
                      active ? "w-8 h-8 border-white" : "w-7 h-7 border-white/60"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </EditorPortal>
  );
}

/** Dikey yazı boyutu kaydırıcısı (Instagram gibi sol kenarda, üst = büyük). */
function SizeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<number | null>(null);
  const pct = clamp((value - TEXT_SIZE_MIN) / (TEXT_SIZE_MAX - TEXT_SIZE_MIN), 0, 1);

  const setFromY = (clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const r = track.getBoundingClientRect();
    const p = 1 - clamp((clientY - r.top) / Math.max(1, r.height), 0, 1);
    const next = Math.round(TEXT_SIZE_MIN + p * (TEXT_SIZE_MAX - TEXT_SIZE_MIN));
    if (next !== value) onChange(next);
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* yoksay */
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 12 : 4;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.min(TEXT_SIZE_MAX, value + step));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(TEXT_SIZE_MIN, value - step));
    }
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Yazı boyutu"
      aria-orientation="vertical"
      aria-valuemin={TEXT_SIZE_MIN}
      aria-valuemax={TEXT_SIZE_MAX}
      aria-valuenow={value}
      className="absolute left-1 top-1/2 -translate-y-1/2 w-11 h-[min(240px,72%)] py-3 z-10 select-none outline-none"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        pointerRef.current = e.pointerId;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* yoksay */
        }
        setFromY(e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointerRef.current === e.pointerId) setFromY(e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
    >
      <div ref={trackRef} className="relative h-full w-full">
        <div
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 inset-y-0 w-3 bg-white/40"
          style={{ clipPath: "polygon(0 0, 100% 0, 62% 100%, 38% 100%)" }}
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.5)]"
          style={{ top: `${(1 - pct) * 100}%` }}
        />
      </div>
    </div>
  );
}
