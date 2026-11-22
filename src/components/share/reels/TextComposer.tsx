"use client";

import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Check } from "lucide-react";
import { CanvasEngine, TextLayer } from "@/lib/canvas-editor";
import {
  TEXT_BG_PRESETS,
  TEXT_COLORS,
  TEXT_FONT_BY_ID,
  TEXT_FONT_OPTIONS,
  useBackLayer,
  useVisualViewport,
  type TextAlign,
  type TextBackgroundPreset,
  type TextFontPreset,
} from "../common";

interface TextComposerProps {
  engine: CanvasEngine;
  /** Düzenlenecek metin katmanı; yoksa ilk harfte yeni katman açılır. */
  layerId: string | null;
  /** Kapanışta çağrılır (boş metin = katman silinmiş). */
  onClose: () => void;
}

type ComposerPanel = "keys" | "font" | "color";

const DEFAULT_KEYBOARD_HEIGHT = 280;
const ALIGN_ORDER: TextAlign[] = ["left", "center", "right"];

interface ComposerState {
  text: string;
  font: TextFontPreset;
  bg: TextBackgroundPreset;
  color: string;
  align: TextAlign;
}

function readInitial(engine: CanvasEngine, layerId: string | null): ComposerState {
  const layer = layerId ? engine.getLayerById(layerId) : null;
  if (layer instanceof TextLayer) {
    return {
      text: layer.style.text === "Yazı Ekleyin" ? "" : layer.style.text,
      font: layer.fontPreset,
      bg: layer.bgPreset,
      color: layer.style.color || "#FFFFFF",
      align: layer.style.textAlign || "center",
    };
  }
  return { text: "", font: "modern", bg: "none", color: "#FFFFFF", align: "center" };
}

/**
 * Reels metin düzenleyici: klavyenin hemen üstünde küçük girdi + A / renk / hizalama düğmeleri.
 * A veya renge basınca klavye kapanır, aynı yerde klavye yüksekliğinde panel açılır.
 * Düzenleyiciyi (ve geçmişi) unmount etmez; yalnızca kendi katmanını yönetir.
 */
export default function TextComposer({ engine, layerId, onClose }: TextComposerProps) {
  const vv = useVisualViewport();
  const [state, setState] = useState<ComposerState>(() => readInitial(engine, layerId));
  const [panel, setPanel] = useState<ComposerPanel>("keys");
  const [kbHeight, setKbHeight] = useState(DEFAULT_KEYBOARD_HEIGHT);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const layerIdRef = useRef<string | null>(layerId);
  const closedRef = useRef(false);

  // Son klavye yüksekliğini hatırla (render sırasında türetilmiş durum)
  if (vv && vv.keyboardInset > 120 && Math.abs(vv.keyboardInset - kbHeight) > 2) {
    setKbHeight(Math.round(vv.keyboardInset));
  }

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  const push = (next: ComposerState) => {
    setState(next);
    let id = layerIdRef.current;
    if (!id) {
      if (!next.text.trim()) return;
      const created = engine.addText(
        next.text,
        { fontSize: 90, color: next.color, textAlign: next.align },
        0.5,
        0.45
      );
      id = created.id;
      layerIdRef.current = id;
    }
    engine.updateText(id, {
      text: next.text,
      fontPreset: next.font,
      bgPreset: next.bg,
      style: { color: next.color, textAlign: next.align },
    });
  };

  const finish = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    const id = layerIdRef.current;
    if (id) {
      if (!state.text.trim()) engine.removeLayer(id);
      else engine.selectLayerById(id);
    }
    onClose();
  };

  useBackLayer(true, finish);

  const fontCfg = TEXT_FONT_BY_ID[state.font];
  const AlignIcon = state.align === "left" ? AlignLeft : state.align === "right" ? AlignRight : AlignCenter;

  const openPanel = (next: ComposerPanel) => {
    inputRef.current?.blur();
    setPanel((p) => (p === next ? "keys" : next));
    if (panel === next) inputRef.current?.focus();
  };

  const keepFocus = (e: React.PointerEvent) => e.preventDefault();

  return (
    <div
      className="fixed inset-x-0 z-[70] flex flex-col justify-end bg-black/60"
      style={{ top: vv?.offsetTop ?? 0, height: vv ? vv.height : "100dvh" }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className="px-3 pb-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={state.text}
          rows={2}
          maxLength={280}
          placeholder="Yazmaya başlayın..."
          onFocus={() => setPanel("keys")}
          onChange={(e) => push({ ...state, text: e.target.value })}
          style={{
            fontFamily: fontCfg.fontFamily,
            fontWeight: fontCfg.fontWeight,
            fontStyle: fontCfg.fontStyle,
            color: state.color,
            textAlign: state.align,
            backgroundColor:
              state.bg === "solid"
                ? "#000000"
                : state.bg === "translucent"
                  ? "rgba(0,0,0,0.55)"
                  : "rgba(255,255,255,0.08)",
            textShadow: state.bg === "neon" || state.font === "neon" ? `0 0 18px ${state.color}` : "none",
          }}
          className="flex-1 min-w-0 max-h-28 rounded-md px-3.5 py-2.5 text-lg outline-none resize-none border border-[var(--ed-line2,#3a4350)] focus:border-[var(--ed-ac,#38d5c8)] placeholder:text-[var(--ed-tx3,#5b6574)]"
        />
        <button
          type="button"
          aria-label="Tamam"
          onPointerDown={keepFocus}
          onClick={finish}
          className="w-11 h-11 shrink-0 rounded-md bg-[var(--ed-ac,#38d5c8)] text-[var(--ed-ac-tx,#04201e)] flex items-center justify-center active:scale-90 transition-transform"
        >
          <Check className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      <div className="px-3 pb-2 flex items-center gap-2">
        <button
          type="button"
          aria-label="Yazı tipi"
          aria-pressed={panel === "font"}
          onPointerDown={keepFocus}
          onClick={() => openPanel("font")}
          style={{ fontFamily: fontCfg.fontFamily, fontWeight: fontCfg.fontWeight }}
          className={`w-11 h-11 rounded-md flex items-center justify-center text-lg border active:scale-90 transition-all ${
            panel === "font" ? "bg-[var(--ed-ac-soft,rgba(56,213,200,.14))] text-[var(--ed-ac,#38d5c8)] border-[var(--ed-ac,#38d5c8)]" : "bg-[var(--ed-bg3,#232932)] text-[var(--ed-tx,#e8ecf1)] border-[var(--ed-line,#2a303a)]"
          }`}
        >
          A
        </button>
        <button
          type="button"
          aria-label="Renk"
          aria-pressed={panel === "color"}
          onPointerDown={keepFocus}
          onClick={() => openPanel("color")}
          className={`w-11 h-11 rounded-md flex items-center justify-center border active:scale-90 transition-all bg-[var(--ed-bg3,#232932)] ${
            panel === "color" ? "border-[var(--ed-ac,#38d5c8)]" : "border-[var(--ed-line,#2a303a)]"
          }`}
        >
          <span className="w-7 h-7 rounded-full border-2 border-white/80" style={{ backgroundColor: state.color }} />
        </button>
        <button
          type="button"
          aria-label="Hizalama"
          onPointerDown={keepFocus}
          onClick={() =>
            push({ ...state, align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(state.align) + 1) % ALIGN_ORDER.length] })
          }
          className="w-11 h-11 rounded-md flex items-center justify-center bg-[var(--ed-bg3,#232932)] text-[var(--ed-tx,#e8ecf1)] border border-[var(--ed-line,#2a303a)] active:scale-90 transition-all"
        >
          <AlignIcon className="w-5 h-5" />
        </button>
      </div>

      {panel !== "keys" && (
        <div
          style={{ height: kbHeight }}
          className="shrink-0 bg-[var(--ed-bg1,#12151a)] border-t border-[var(--ed-line,#2a303a)] overflow-y-auto no-scrollbar px-4 pt-4"
        >
          {panel === "font" ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                {TEXT_FONT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => push({ ...state, font: f.id })}
                    style={{ fontFamily: f.fontFamily, fontWeight: f.fontWeight, fontStyle: f.fontStyle }}
                    className={`min-h-12 rounded-md text-lg border active:scale-95 transition-all ${
                      state.font === f.id
                        ? "bg-[var(--ed-ac-soft,rgba(56,213,200,.14))] text-[var(--ed-ac,#38d5c8)] border-[var(--ed-ac,#38d5c8)]"
                        : "bg-[var(--ed-bg3,#232932)] text-[var(--ed-tx,#e8ecf1)] border-[var(--ed-line,#2a303a)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 pb-3">
                {TEXT_BG_PRESETS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => push({ ...state, bg: b.id })}
                    className={`min-h-11 rounded-md text-xs font-semibold border active:scale-95 transition-all ${
                      state.bg === b.id
                        ? "bg-[var(--ed-ac-soft,rgba(56,213,200,.14))] text-[var(--ed-ac,#38d5c8)] border-[var(--ed-ac,#38d5c8)]"
                        : "bg-[var(--ed-bg3,#232932)] text-[var(--ed-tx2,#98a2b3)] border-[var(--ed-line,#2a303a)]"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-3 justify-items-center pb-3">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => push({ ...state, color: c })}
                  style={{ backgroundColor: c }}
                  className={`w-11 h-11 rounded-full border-2 active:scale-90 transition-all ${
                    state.color.toUpperCase() === c.toUpperCase()
                      ? "border-[var(--ed-ac,#38d5c8)] ring-2 ring-[var(--ed-ac,#38d5c8)]/50"
                      : "border-[var(--ed-line2,#3a4350)]"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
