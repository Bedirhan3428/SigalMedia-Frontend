"use client";

/**
 * Gönderi (Post) fotoğraf düzenleyici: yalnızca düzenleme arayüzü.
 *
 * Tuval ve motor sayfaya (app/share/page.tsx) aittir; bu bileşen tuvalin altında sabit bir
 * panel çizer ve iki adımdan oluşur:
 *   1. Kırp: en-boy oranı (1:1 / 4:5 / 3:4 / 4:3), döndür, çevir, sıfırla. Kaydırma ve
 *      sıkıştırma motorun işidir (cover clamp). Hareket sırasında üçte bir ızgarası görünür.
 *   2. Düzenle: Filtreler ve Ayarlar. Dokunup tutarak orijinalle karşılaştırma, geri/ileri al.
 *
 * Izgara hizalaması: ızgara, tuval elemanının getBoundingClientRect() kutusuna yerleştirilir.
 * Sayfa tuval kutusunu motorun mantıksal en-boy oranına göre boyutlandırdığı için bu kutu
 * tam olarak kırpma çerçevesidir. Kutu, ızgara her gösterildiğinde ve pencere/tuval
 * boyutu değiştiğinde (ResizeObserver) yeniden ölçülür.
 *
 * Sayfaya onLayout ile panelin yüksekliği (safe-area dahil) ve tuvalin en-boy oranı bildirilir.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Eye,
  FlipHorizontal2,
  FlipVertical2,
  Loader2,
  Redo2,
  RotateCcw,
  RotateCw,
  Undo2,
} from "lucide-react";
import {
  DEFAULT_POST_ADJUSTMENTS,
  POST_STUDIO_FILTERS,
  captureFramePreview,
  type CanvasEngine,
  type EngineSnapshot,
  type PostAdjustmentState,
  type PostAspect,
  type PostStudioFilterId,
} from "@/lib/canvas-editor";
import PreviewThumb from "../PreviewThumb";
import { FilterIntensitySlider } from "../common";

export interface PostEditorProps {
  engine: CanvasEngine;
  /** Sayfanın sahip olduğu tuval elemanı (ızgara hizalaması için). */
  canvas: HTMLCanvasElement | null;
  isPublishing: boolean;
  /** Sayfanın mevcut paylaşma işleyicisi. */
  onPublish: () => void;
  /** Panel yüksekliği (px) ve tuval en-boy oranı (genişlik / yükseklik). */
  onLayout: (layout: { bottom: number; ratio: number }) => void;
}

type Step = "crop" | "edit";

// E-03: sayfa metin düzenlerken PostEditor kaldırılıp yeniden bağlanır; adımı motor başına hatırla
// (yeni oturum = yeni motor = Kırp). WeakMap motor ömrünü aşmaz.
const stepByEngine = new WeakMap<object, Step>();
type EditTab = "filters" | "adjust";
type ToolKey = Exclude<keyof PostAdjustmentState, "filterPreset">;

const ASPECTS: Array<{ id: PostAspect; label: string; w: number; h: number }> = [
  { id: "1:1", label: "1:1", w: 14, h: 14 },
  { id: "4:5", label: "4:5", w: 12, h: 15 },
  { id: "3:4", label: "3:4", w: 12, h: 16 },
  { id: "4:3", label: "4:3", w: 16, h: 12 },
];

const TOOLS: Array<{ key: ToolKey; label: string; min: number; max: number }> = [
  { key: "brightness", label: "Parlaklık", min: -100, max: 100 },
  { key: "contrast", label: "Kontrast", min: -100, max: 100 },
  { key: "saturation", label: "Doygunluk", min: -100, max: 100 },
  { key: "warmth", label: "Sıcaklık", min: -100, max: 100 },
  { key: "vignette", label: "Vinyet", min: 0, max: 100 },
  { key: "sharpness", label: "Keskinlik", min: 0, max: 100 },
  { key: "grain", label: "Film Greni", min: 0, max: 100 },
  { key: "lightLeak", label: "Işık Sızıntısı", min: 0, max: 100 },
  { key: "bokehGlow", label: "Yumuşak Odak", min: 0, max: 100 },
];

const HISTORY_LIMIT = 30;
const COMMIT_DELAY_MS = 300;
const HOLD_MS = 280;
const GRID_HIDE_MS = 700;

const iconBtn =
  "min-w-10 h-10 min-[400px]:min-w-11 min-[400px]:h-11 rounded-full flex items-center justify-center text-white bg-white/10 active:scale-90 transition-transform disabled:opacity-30";

export default function PostEditor({ engine, canvas, isPublishing, onPublish, onLayout }: PostEditorProps) {
  const [step, setStepState] = useState<Step>(() => stepByEngine.get(engine) ?? "crop");
  const setStep = useCallback(
    (next: Step) => {
      stepByEngine.set(engine, next);
      setStepState(next);
    },
    [engine]
  );
  const [tab, setTab] = useState<EditTab>("filters");
  const [aspect, setAspect] = useState<PostAspect>(() => engine.getPostAspect());
  const [adj, setAdj] = useState<PostAdjustmentState>(() => engine.getPostAdjustments());
  const [tool, setTool] = useState<ToolKey>("brightness");
  const [frame, setFrame] = useState<string | null>(null);
  const [gridRect, setGridRect] = useState<DOMRect | null>(null);
  const [comparing, setComparing] = useState(false);
  const [histCount, setHistCount] = useState({ undo: 0, redo: 0 });

  const panelRef = useRef<HTMLDivElement | null>(null);
  const onLayoutRef = useRef(onLayout);
  useEffect(() => {
    onLayoutRef.current = onLayout;
  }, [onLayout]);

  // ---------- Yerleşim bildirimi (panel yüksekliği + oran) ----------
  const lastLayout = useRef({ bottom: -1, ratio: -1 });
  const reportLayout = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = engine.getLogicalSize();
    const next = { bottom: Math.round(el.offsetHeight), ratio: width / height };
    if (next.bottom === lastLayout.current.bottom && next.ratio === lastLayout.current.ratio) return;
    lastLayout.current = next;
    onLayoutRef.current(next);
  }, [engine]);

  useLayoutEffect(() => {
    reportLayout();
    const el = panelRef.current;
    const ro = el ? new ResizeObserver(reportLayout) : null;
    if (el && ro) ro.observe(el);
    const offResize = engine.on("resize", () => {
      setAspect(engine.getPostAspect());
      reportLayout();
    });
    return () => {
      ro?.disconnect();
      offResize();
      onLayoutRef.current({ bottom: 0, ratio: lastLayout.current.ratio > 0 ? lastLayout.current.ratio : 4 / 5 });
      // A-04: StrictMode yeniden bağlanmasında aynı değer "değişmedi" sayılıp bildirilmesin
      lastLayout.current = { bottom: -1, ratio: -1 };
    };
  }, [engine, reportLayout]);

  // ---------- Izgara ----------
  const gridTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showGrid = useCallback(
    (autoHide: boolean) => {
      if (!canvas) return;
      requestAnimationFrame(() => setGridRect(canvas.getBoundingClientRect()));
      if (gridTimer.current) clearTimeout(gridTimer.current);
      gridTimer.current = autoHide ? setTimeout(() => setGridRect(null), GRID_HIDE_MS) : null;
    },
    [canvas]
  );

  useEffect(() => {
    if (step !== "crop") {
      if (gridTimer.current) clearTimeout(gridTimer.current);
      queueMicrotask(() => setGridRect(null));
      return;
    }
    // Hareket sürerken göster; 'change' hareket bitince gelir
    const offT = engine.on("transform", () => showGrid(false));
    const offC = engine.on("change", () => showGrid(true));
    return () => {
      offT();
      offC();
      if (gridTimer.current) clearTimeout(gridTimer.current);
    };
  }, [engine, step, showGrid]);

  useEffect(() => {
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setGridRect((r) => (r ? canvas.getBoundingClientRect() : r));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvas]);

  // ---------- Geri / ileri al ----------
  const committed = useRef<EngineSnapshot | null>(null);
  const undoStack = useRef<EngineSnapshot[]>([]);
  const redoStack = useRef<EngineSnapshot[]>([]);
  const ignoreChange = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncHist = () =>
    setHistCount({ undo: undoStack.current.length, redo: redoStack.current.length });

  const commit = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (committed.current) {
      undoStack.current.push(committed.current);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    }
    committed.current = engine.snapshot();
    redoStack.current = [];
    syncHist();
  }, [engine]);

  useEffect(() => {
    committed.current = engine.snapshot();
    const off = engine.on("change", () => {
      if (ignoreChange.current) return;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(commit, COMMIT_DELAY_MS);
    });
    return () => {
      off();
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, [engine, commit]);

  const applySnapshot = (snap: EngineSnapshot): boolean => {
    ignoreChange.current = true;
    const ok = engine.restore(snap);
    setTimeout(() => {
      ignoreChange.current = false;
    }, 0);
    if (ok) {
      committed.current = snap;
      setAdj(engine.getPostAdjustments());
      setAspect(engine.getPostAspect());
    }
    return ok;
  };

  const undo = () => {
    if (commitTimer.current) commit();
    const prev = undoStack.current.pop();
    if (!prev) return;
    const cur = committed.current;
    if (applySnapshot(prev)) {
      if (cur) redoStack.current.push(cur);
    } else {
      undoStack.current.length = 0;
    }
    syncHist();
  };

  const redo = () => {
    if (commitTimer.current) commit();
    const next = redoStack.current.pop();
    if (!next) return;
    const cur = committed.current;
    if (applySnapshot(next)) {
      if (cur) undoStack.current.push(cur);
    } else {
      redoStack.current.length = 0;
    }
    syncHist();
  };

  // ---------- Ayarlar (rAF ile sınırlı) ----------
  const pending = useRef<Partial<PostAdjustmentState>>({});
  const rafId = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafId.current = null;
    const p = pending.current;
    pending.current = {};
    if (Object.keys(p).length) engine.setPostAdjustments(p);
  }, [engine]);

  const setAdjust = useCallback(
    (partial: Partial<PostAdjustmentState>) => {
      setAdj((a) => ({ ...a, ...partial }));
      pending.current = { ...pending.current, ...partial };
      if (rafId.current === null) rafId.current = requestAnimationFrame(flush);
    },
    [flush]
  );

  useEffect(
    () => () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    },
    []
  );

  // ---------- Orijinalle karşılaştır (basılı tut) ----------
  const savedAdj = useRef<PostAdjustmentState | null>(null);
  const startCompare = useCallback(() => {
    if (savedAdj.current) return;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      flush();
    }
    savedAdj.current = engine.getPostAdjustments();
    ignoreChange.current = true;
    engine.setPostAdjustments({ ...DEFAULT_POST_ADJUSTMENTS });
    setComparing(true);
  }, [engine, flush]);

  const endCompare = useCallback(() => {
    const saved = savedAdj.current;
    if (!saved) return;
    savedAdj.current = null;
    engine.setPostAdjustments(saved);
    setComparing(false);
    setTimeout(() => {
      ignoreChange.current = false;
    }, 0);
  }, [engine]);

  // Tuvalde basılı tutma (hareketsiz) = karşılaştır
  useEffect(() => {
    if (step !== "edit" || !canvas) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0;
    let sy = 0;
    let pointers = 0;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const down = (e: PointerEvent) => {
      pointers++;
      if (pointers > 1) {
        clear();
        return;
      }
      sx = e.clientX;
      sy = e.clientY;
      timer = setTimeout(startCompare, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear();
    };
    const up = () => {
      pointers = Math.max(0, pointers - 1);
      clear();
      if (pointers === 0) endCompare();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      clear();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      endCompare();
    };
  }, [step, canvas, startCompare, endCompare]);

  // Sekme gizlenirse / bileşen kaldırılırsa her zaman geri yükle
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) endCompare();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", endCompare);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", endCompare);
      endCompare();
    };
  }, [endCompare]);

  // ---------- Kırp eylemleri ----------
  const chooseAspect = (a: PostAspect) => {
    engine.setPostAspect(a);
    setAspect(a);
    showGrid(true);
  };
  const geometry = (fn: () => void) => {
    fn();
    showGrid(true);
  };

  const goEdit = () => {
    try {
      setFrame(captureFramePreview(engine.getMedia()?.element, 96, 128));
    } catch {
      setFrame(null);
    }
    setStep("edit");
  };

  // ---------- Slider ----------
  const cfg = TOOLS.find((t) => t.key === tool) ?? TOOLS[0];
  const value = adj[cfg.key];
  const lastTap = useRef(0);
  const onSliderPointerUp = () => {
    const now = performance.now();
    if (now - lastTap.current < 320) setAdjust({ [cfg.key]: 0 });
    lastTap.current = now;
  };
  const pct = ((value - cfg.min) / (cfg.max - cfg.min)) * 100;

  return (
    <>
      {gridRect && step === "crop" && (
        <div
          aria-hidden
          className="fixed z-30 pointer-events-none border border-white/60"
          style={{ left: gridRect.left, top: gridRect.top, width: gridRect.width, height: gridRect.height }}
        >
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
        </div>
      )}

      <div
        ref={panelRef}
        className="fixed inset-x-0 bottom-0 z-40 bg-neutral-950/95 backdrop-blur-xl border-t border-[var(--ed-line,#2a303a)] px-3 pt-2 pointer-events-auto select-none"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Üst satır: adım başlığı + birincil eylem */}
        <div className="flex items-center justify-between gap-2 h-12">
          <div className="flex items-center gap-1.5 min-w-0">
            {step === "edit" && (
              <button type="button" aria-label="Kırpmaya dön" onClick={() => setStep("crop")} className={iconBtn}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <span className="text-sm font-bold text-white whitespace-nowrap">{step === "crop" ? "Kırp" : "Düzenle"}</span>
          </div>

          <div className="flex items-center gap-1 min-[400px]:gap-1.5 shrink-0">
            {step === "edit" && (
              <>
                <button
                  type="button"
                  aria-label="Geri al"
                  disabled={histCount.undo === 0}
                  onClick={undo}
                  className={iconBtn}
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Yinele"
                  disabled={histCount.redo === 0}
                  onClick={redo}
                  className={iconBtn}
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Orijinali görmek için basılı tut"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    startCompare();
                  }}
                  onPointerUp={endCompare}
                  onPointerCancel={endCompare}
                  onLostPointerCapture={endCompare}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`${iconBtn} touch-none ${comparing ? "bg-[var(--ed-ac,#38d5c8)]" : ""}`}
                >
                  <Eye className="w-4 h-4" />
                </button>
              </>
            )}
            {step === "crop" ? (
              <button
                type="button"
                onClick={goEdit}
                className="h-11 px-5 rounded-full bg-white text-black text-sm font-bold active:scale-95 transition-transform flex items-center gap-1.5"
              >
                İleri
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onPublish}
                disabled={isPublishing}
                className="h-11 px-4 rounded-full bg-white text-black text-sm font-bold active:scale-95 transition-transform flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Paylaş"}
              </button>
            )}
          </div>
        </div>

        {/* İçerik: adım başına sabit yükseklik (sahne boyutu zıplamasın). Düzenle adımı: sekmeler 36 + yoğunluk 44 +
            filtre küçük resimleri ~96 (+boşluk) = 185px; 108px'e sığmadığı için alt kısım kırpılıp ekran dışına taşıyordu (WP-35). */}
        <div className={`${step === "edit" ? "h-[188px]" : "h-[108px]"} overflow-hidden`}>
          {step === "crop" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={aspect === a.id}
                    onClick={() => chooseAspect(a.id)}
                    className={`h-11 min-w-[68px] px-3 rounded-full shrink-0 flex items-center justify-center gap-2 text-xs font-semibold border active:scale-95 transition-all ${
                      aspect === a.id
                        ? "bg-[var(--ed-ac,#38d5c8)] text-[var(--ed-ac-tx,#04201e)] border-[var(--ed-ac,#38d5c8)]"
                        : "bg-[var(--ed-bg2,#1a1e25)] text-[var(--ed-tx,#e8ecf1)] border-[var(--ed-line,#2a303a)]"
                    }`}
                  >
                    <span
                      className="border-[1.5px] border-current rounded-[2px] shrink-0"
                      style={{ width: a.w, height: a.h }}
                    />
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button type="button" aria-label="90 derece döndür" onClick={() => geometry(() => engine.rotateMedia90())} className="h-11 rounded-xl bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] text-white flex items-center justify-center gap-1 text-[11px] font-semibold active:scale-95 transition-transform">
                  <RotateCw className="w-4 h-4 shrink-0" />
                  <span className="truncate">Döndür</span>
                </button>
                <button type="button" aria-label="Yatay çevir" onClick={() => geometry(() => engine.flipMediaHorizontal())} className="h-11 rounded-xl bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] text-white flex items-center justify-center gap-1 text-[11px] font-semibold active:scale-95 transition-transform">
                  <FlipHorizontal2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">Yatay</span>
                </button>
                <button type="button" aria-label="Dikey çevir" onClick={() => geometry(() => engine.flipMediaVertical())} className="h-11 rounded-xl bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] text-white flex items-center justify-center gap-1 text-[11px] font-semibold active:scale-95 transition-transform">
                  <FlipVertical2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">Dikey</span>
                </button>
                <button type="button" aria-label="Sıfırla" onClick={() => geometry(() => engine.resetMediaGeometry())} className="h-11 rounded-xl bg-[var(--ed-bg2,#1a1e25)] border border-[var(--ed-line,#2a303a)] text-[var(--ed-tx,#e8ecf1)] flex items-center justify-center gap-1 text-[11px] font-semibold active:scale-95 transition-transform">
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span className="truncate">Sıfırla</span>
                </button>
              </div>
            </div>
          )}

          {step === "edit" && (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-1 p-0.5 rounded-full bg-[var(--ed-bg2,#1a1e25)]">
                {(
                  [
                    ["filters", "Filtreler"],
                    ["adjust", "Ayarlar"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={tab === id}
                    onClick={() => setTab(id)}
                    className={`relative h-9 rounded-full text-xs font-bold transition-colors after:absolute after:inset-x-0 after:-inset-y-[4px] after:content-[''] ${
                      tab === id ? "bg-[var(--ed-ac,#38d5c8)] text-[var(--ed-ac-tx,#04201e)]" : "text-[var(--ed-tx,#e8ecf1)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "filters" && (
                <div className="flex flex-col gap-1">
                {adj.filterPreset !== "none" && <FilterIntensitySlider engine={engine} syncKey={adj.filterPreset} />}
                <div className="flex items-start gap-2 overflow-x-auto no-scrollbar">
                  {POST_STUDIO_FILTERS.map((f) => (
                    <PreviewThumb
                      key={f.id}
                      src={frame}
                      label={f.name}
                      active={adj.filterPreset === f.id}
                      cssFilter={f.cssFilter}
                      className="w-12 shrink-0"
                      onClick={() => setAdjust({ filterPreset: f.id as PostStudioFilterId })}
                    />
                  ))}
                </div>
                </div>
              )}

              {tab === "adjust" && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {TOOLS.map((t) => {
                      const modified = adj[t.key] !== 0;
                      const selected = t.key === tool;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setTool(t.key)}
                          className={`relative h-9 px-3 rounded-full shrink-0 after:absolute after:inset-x-0 after:-inset-y-[4px] after:content-[''] text-xs font-semibold border active:scale-95 transition-all ${
                            selected ? "bg-[var(--ed-ac,#38d5c8)] text-[var(--ed-ac-tx,#04201e)] border-[var(--ed-ac,#38d5c8)]" : "bg-[var(--ed-bg2,#1a1e25)] text-[var(--ed-tx,#e8ecf1)] border-[var(--ed-line,#2a303a)]"
                          }`}
                        >
                          {t.label}
                          {modified && (
                            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--ed-ac,#38d5c8)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 h-11">
                    <input
                      type="range"
                      aria-label={cfg.label}
                      min={cfg.min}
                      max={cfg.max}
                      step={1}
                      value={value}
                      onChange={(e) => setAdjust({ [cfg.key]: Number(e.target.value) })}
                      onPointerUp={onSliderPointerUp}
                      onDoubleClick={() => setAdjust({ [cfg.key]: 0 })}
                      className="editor-range flex-1 min-w-0"
                      style={{ ["--range-pct" as string]: `${pct}%` }}
                    />
                    <span className="w-9 text-right text-xs font-bold text-white tabular-nums shrink-0">{value}</span>
                    <button
                      type="button"
                      aria-label={`${cfg.label} sıfırla`}
                      disabled={value === 0}
                      onClick={() => setAdjust({ [cfg.key]: 0 })}
                      className="h-11 px-2 text-xs font-semibold text-[var(--ed-ac,#38d5c8)] disabled:opacity-30 shrink-0"
                    >
                      Sıfırla
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
