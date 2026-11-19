"use client";
/* Menü öğeleri render sırasında kurulur; tıklama işleyicileri ref okur (olay anında). */
/* eslint-disable react-hooks/refs */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AtSign,
  Check,
  ChevronLeft,
  Clapperboard,
  Copy,
  Crop,
  Droplet,
  FlipHorizontal2,
  FlipVertical2,
  Gauge,
  Layers,
  Music,
  Pencil,
  RefreshCw,
  Rewind,
  RotateCcw,
  RotateCw,
  Scissors,
  Smartphone,
  Smile,
  Snowflake,
  SlidersHorizontal,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  Palette,
} from "lucide-react";
import {
  AudioLoadError,
  CanvasEngine,
  FILTER_PRESETS,
  MediaLoadError,
  REELS_EFFECT_PRESETS,
  ReelsEffectClip,
  ReelsEffectId,
  StoryAudioMeta,
  VideoTrackClip,
  captureFramePreview,
  isReverseClipError,
  isReverseSupported,
  type ClipAnimationKind,
  type PostAdjustmentState,
} from "@/lib/canvas-editor";
import { EMOJI_CATEGORIES, Sheet, useBackLayer, useEditorToast } from "../common";
import MusicSettingsPanel from "../MusicSettingsPanel";
import type { NLESelectedType } from "./TimelineOverlayTracks";
import { REELS_STICKERS, stickerPreviewUrl, stickerToPngBlob } from "./stickers";

/** Ana menü, Düzenle alt menüsü ve araç paneli aynı sabit yükseklikte durur (onLayout ölçümü sabit kalır). */
export const REELS_MENU_HEIGHT = 136;
/** Ana menü ve Düzenle menüsü: tek satır, yatay kaydırılır */
export const REELS_MENU_ROW_HEIGHT = 76;

type ToolKey =
  | "sound"
  | "effects"
  | "stickers"
  | "filters"
  | "adjust"
  | "speed"
  | "animation"
  | "clipVolume"
  | "rotate"
  | "retouch"
  | "opacity"
  | "reverse"
  | "photoCrop";

interface ActiveTool {
  key: ToolKey;
  /** "clip": seçili klibe uygulanır (klip değişince kapanır); "global": tüm videoya / yeni katmanlara. */
  scope: "clip" | "global";
  /** Aracın açıldığı andaki seçili video klibi. */
  clipId: string | null;
}

type Selection = { id: string; type: Exclude<NLESelectedType, null> };

export interface ReelsMenuProps {
  engine: CanvasEngine;
  selection: Selection | null;
  clip: VideoTrackClip | null;
  clipCount: number;
  canSplit: boolean;
  busy: boolean;
  selectedMusic: StoryAudioMeta | null;
  musicVolume: number;
  activeFilterIndex: number;
  selectedEffectClip: ReelsEffectClip | null;
  /** Zaman çizelgesindeki "efekt ekle" kısayolu: her artışta efekt paneli açılır. */
  quickEffectSeq: number;
  photo: { scale: number; patch: (fn: (t: { x: number; y: number; scale: number; rotation: number }) => { x: number; y: number; scale: number; rotation: number }) => void; cycleShape: () => void } | null;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCrop: () => void;
  onSelectClipAtPlayhead: () => void;
  onSelectVideoClip: (id: string) => void;
  onOpenText: (layerId: string | null) => void;
  onOpenMusicPicker: (intent?: "replace" | "trim") => void;
  onChangeMusicVolume: (v: number) => void;
  onChangeMusicMeta: (m: StoryAudioMeta | null) => void;
  onSelectFilterIndex: (i: number) => void;
  onPickEffect: (id: ReelsEffectId) => void;
  onEffectIntensity: (v: number) => void;
  onAddMention?: () => void;
  onActiveToolChange: (key: string | null) => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}

const ICON = "w-5 h-5";

// ───────────────────────── küçük yapı taşları ─────────────────────────

function MenuButton({ item }: { item: MenuItem }) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      disabled={item.disabled}
      aria-label={item.label}
      className="flex flex-col items-center justify-center gap-1 h-16 min-w-[72px] rounded-2xl disabled:opacity-35 active:scale-95 transition-transform"
    >
      <span
        className={`w-12 h-9 rounded-xl flex items-center justify-center ${
          item.danger
            ? "bg-red-500/15 text-red-400"
            : item.active
              ? "bg-white text-black"
              : "bg-[#1c1c1e] text-white"
        }`}
      >
        {item.icon}
      </span>
      <span className={`text-[11px] font-medium leading-none ${item.danger ? "text-red-300" : "text-zinc-200"}`}>
        {item.label}
      </span>
    </button>
  );
}

function ToolPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 bg-black flex items-stretch gap-2 px-3 py-1.5">
      <div className="flex flex-col items-center gap-1 shrink-0 w-12">
        <button
          type="button"
          aria-label="Tamam"
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center active:scale-90 transition-transform"
        >
          <Check className="w-5 h-5 stroke-[2.5]" />
        </button>
        <span className="text-[10px] font-semibold text-zinc-400 text-center leading-tight">{title}</span>
      </div>
      <div className="flex-1 min-w-0 h-full overflow-y-auto no-scrollbar flex flex-col justify-center">{children}</div>
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  const pct = ((v - min) / (max - min)) * 100;
  return (
    <label className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] text-zinc-400 w-[60px] shrink-0 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={v}
        aria-label={label}
        style={{ ["--range-pct" as string]: `${pct}%` }}
        onChange={(e) => {
          const n = Number(e.target.value);
          setV(n);
          onChange(n);
        }}
        className="editor-range flex-1 min-w-0"
      />
      <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-white">
        {v}
        {suffix}
      </span>
    </label>
  );
}

function Chip({
  active,
  onClick,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`h-11 px-3.5 rounded-xl text-xs font-semibold shrink-0 border flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 ${
        active ? "bg-amber-400 text-black border-amber-400" : "bg-[#1c1c1e] text-zinc-100 border-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Tile({
  src,
  label,
  active,
  w,
  h,
  cssFilter,
  tint,
  onClick,
}: {
  src: string | null;
  label: string;
  active: boolean;
  w: number;
  h: number;
  cssFilter?: string;
  tint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      style={{ width: w }}
      className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform"
    >
      <span
        style={{
          width: w,
          height: h,
          background: src ? undefined : `radial-gradient(circle at 30% 30%, ${tint || "#3f3f46"}, #111827)`,
        }}
        className={`relative rounded-xl overflow-hidden border-2 block ${active ? "border-white" : "border-transparent"}`}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ filter: cssFilter && cssFilter !== "none" ? cssFilter : undefined }}
            className="w-full h-full object-cover"
          />
        )}
        {tint && src && <span className="absolute inset-0" style={{ background: tint, opacity: 0.32 }} />}
      </span>
      <span className={`text-[10px] leading-none truncate max-w-full ${active ? "text-white font-semibold" : "text-zinc-400"}`}>
        {label}
      </span>
    </button>
  );
}

// ───────────────────────── araç panelleri ─────────────────────────

const ADJUST_FIELDS: { key: keyof PostAdjustmentState; label: string; min: number }[] = [
  { key: "brightness", label: "Parlaklık", min: -100 },
  { key: "contrast", label: "Kontrast", min: -100 },
  { key: "saturation", label: "Doygunluk", min: -100 },
  { key: "warmth", label: "Sıcaklık", min: -100 },
  { key: "vignette", label: "Vinyet", min: 0 },
  { key: "sharpness", label: "Keskinlik", min: 0 },
];

function AdjustPanel({
  initial,
  onChange,
  onReset,
}: {
  initial: Partial<PostAdjustmentState>;
  onChange: (key: keyof PostAdjustmentState, v: number) => void;
  onReset: () => void;
}) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <div key={resetKey} className="grid grid-cols-2 gap-x-3 gap-y-0.5 items-center">
      {ADJUST_FIELDS.map((f) => (
        <RangeRow
          key={f.key}
          label={f.label}
          min={f.min}
          max={100}
          value={Math.round(Number(initial[f.key] ?? 0))}
          onChange={(v) => onChange(f.key, v)}
        />
      ))}
      <button
        type="button"
        onClick={() => {
          onReset();
          setResetKey((k) => k + 1);
        }}
        className="col-span-2 h-7 -mt-1 text-[11px] font-semibold text-zinc-400 active:text-white"
      >
        Sıfırla
      </button>
    </div>
  );
}

function FiltersPanel({
  engine,
  activeIndex,
  inheritable,
  onPick,
}: {
  engine: CanvasEngine;
  activeIndex: number | null;
  /** Klip kapsamında: "Genel" (null) karesi eklenir. */
  inheritable: boolean;
  onPick: (index: number | null) => void;
}) {
  // Panel açılırken geçerli kare bir kez yakalanır; her kareye CSS filtresi uygulanır
  const [frame] = useState(() => captureFramePreview(engine.getMedia()?.element, 72, 96));
  return (
    <div className="flex items-start gap-2 overflow-x-auto no-scrollbar h-full py-0.5">
      {inheritable && (
        <Tile src={frame} label="Genel" active={activeIndex === null} w={72} h={96} onClick={() => onPick(null)} />
      )}
      {FILTER_PRESETS.map((p, i) => (
        <Tile
          key={p.id}
          src={frame}
          label={p.name}
          active={activeIndex === i}
          w={72}
          h={96}
          cssFilter={p.cssFilter}
          onClick={() => onPick(i)}
        />
      ))}
    </div>
  );
}

function EffectsPanel({
  engine,
  selectedEffectClip,
  busy,
  onPick,
  onIntensity,
}: {
  engine: CanvasEngine;
  selectedEffectClip: ReelsEffectClip | null;
  busy: boolean;
  onPick: (id: ReelsEffectId) => void;
  onIntensity: (v: number) => void;
}) {
  const [frame] = useState(() => captureFramePreview(engine.getMedia()?.element, 80, 80));
  return (
    <div className="flex flex-col gap-1.5 justify-center h-full">
      <div className={`flex items-start gap-2 overflow-x-auto no-scrollbar ${busy ? "pointer-events-none opacity-70" : ""}`}>
        {REELS_EFFECT_PRESETS.map((eff) => (
          <Tile
            key={eff.id}
            src={frame}
            label={eff.name}
            active={selectedEffectClip?.effect === eff.id}
            w={64}
            h={64}
            tint={eff.color}
            onClick={() => onPick(eff.id)}
          />
        ))}
      </div>
      {selectedEffectClip && (
        <RangeRow
          key={selectedEffectClip.id}
          label="Yoğunluk"
          min={15}
          max={100}
          suffix="%"
          value={selectedEffectClip.intensity ?? 80}
          onChange={onIntensity}
        />
      )}
    </div>
  );
}

function StickersPanel({
  engine,
  onAddMention,
}: {
  engine: CanvasEngine;
  onAddMention?: () => void;
}) {
  const toast = useEditorToast();
  const [tab, setTab] = useState<string>("stk");
  const category = EMOJI_CATEGORIES.find((c) => c.id === tab) || null;

  const addSticker = async (svg: string) => {
    try {
      const blob = await stickerToPngBlob(svg);
      await engine.addOverlayImage(blob, 0.5, 0.5);
    } catch {
      toast.error("Çıkartma eklenemedi");
    }
  };
  const addEmoji = (emoji: string) => {
    engine.addText(emoji, { fontSize: 180, color: "#ffffff" }, 0.5, 0.5);
  };

  return (
    <div className="flex flex-col gap-1 h-full min-h-0">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
        <button
          type="button"
          onClick={() => setTab("stk")}
          className={`h-8 px-3 rounded-full text-[11px] font-semibold shrink-0 ${
            tab === "stk" ? "bg-white text-black" : "bg-[#1c1c1e] text-zinc-200"
          }`}
        >
          Çıkartma
        </button>
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.label}
            onClick={() => setTab(c.id)}
            className={`h-8 min-w-9 px-2 rounded-full text-base shrink-0 ${
              tab === c.id ? "bg-white" : "bg-[#1c1c1e]"
            }`}
          >
            {c.icon}
          </button>
        ))}
        {onAddMention && (
          <button
            type="button"
            onClick={onAddMention}
            className="h-8 px-3 rounded-full text-[11px] font-semibold shrink-0 bg-purple-500/20 text-purple-300 flex items-center gap-1"
          >
            <AtSign className="w-3.5 h-3.5" />
            Bahset
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-x-auto no-scrollbar">
        <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-x-1 w-max">
          {category
            ? category.emojis.map((e, i) => (
                <button
                  key={`${e}${i}`}
                  type="button"
                  onClick={() => addEmoji(e)}
                  className="w-11 h-11 text-2xl flex items-center justify-center active:scale-90 transition-transform"
                >
                  {e}
                </button>
              ))
            : REELS_STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={s.label}
                  onClick={() => void addSticker(s.svg)}
                  className="w-11 h-11 p-0.5 active:scale-90 transition-transform"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stickerPreviewUrl(s.svg)} alt="" draggable={false} className="w-full h-full object-contain" />
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── ana bileşen ─────────────────────────

export default function ReelsMenu(props: ReelsMenuProps) {
  const {
    engine,
    selection,
    clip,
    clipCount,
    canSplit,
    busy,
    selectedMusic,
    musicVolume,
    activeFilterIndex,
    selectedEffectClip,
    photo,
    onSplit,
    onDelete,
    onDuplicate,
    onCrop,
    onSelectClipAtPlayhead,
    onSelectVideoClip,
    onOpenText,
    onOpenMusicPicker,
    onChangeMusicVolume,
    onChangeMusicMeta,
    onSelectFilterIndex,
    onPickEffect,
    onEffectIntensity,
    onAddMention,
    onActiveToolChange,
    quickEffectSeq,
  } = props;
  const toast = useEditorToast();
  const clipId = clip?.id ?? null;

  const [tool, setTool] = useState<ActiveTool | null>(null);
  const [backedOutFor, setBackedOutFor] = useState<string | null>(null);
  const [seenQuickEffect, setSeenQuickEffect] = useState(quickEffectSeq);
  if (quickEffectSeq !== seenQuickEffect) {
    setSeenQuickEffect(quickEffectSeq);
    setTool({ key: "effects", scope: "global", clipId });
  }
  const [musicSheetOpen, setMusicSheetOpen] = useState(false);
  const [reverseProgress, setReverseProgress] = useState(0);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  // Seçili klip değişince açık araç kapanır (render sırasında türetilmiş durum)
  if (
    tool &&
    tool.key !== "reverse" &&
    (tool.scope === "clip" ? tool.clipId !== clipId : clipId !== null && clipId !== tool.clipId)
  ) {
    setTool(null);
  }
  if (backedOutFor && !selection) setBackedOutFor(null);

  const activeKey = tool?.key ?? null;
  useEffect(() => {
    onActiveToolChange(activeKey);
  }, [activeKey, onActiveToolChange]);

  // Ters çevirme sürerken bileşen kapanırsa iptal et
  useEffect(() => () => reverseAbortRef.current?.abort(), []);

  const openTool = (key: ToolKey, scope: "clip" | "global" = "global") => setTool({ key, scope, clipId });
  const closeTool = () => {
    if (tool?.key === "reverse") return; // ilerleme sırasında yalnızca İptal ile kapanır
    setTool(null);
  };
  useBackLayer(tool !== null && tool.key !== "reverse", () => setTool(null));

  const editOpen = Boolean(selection) && backedOutFor !== selection?.id;

  // ── eylemler ──
  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !clip) return;
    try {
      const res = await engine.replaceClipMedia(clip.id, file);
      if (!res) toast.error("Klip değiştirilemedi");
    } catch (err) {
      toast.error(err instanceof MediaLoadError ? "Dosya desteklenmiyor" : "Klip değiştirilemedi");
    }
  };

  const handleOverlayFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await engine.addOverlayImage(file, 0.5, 0.5);
    } catch {
      toast.error("Fotoğraf eklenemedi");
    }
  };

  const handleAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const meta = await engine.setMusicFromFile(file);
      onChangeMusicMeta(meta);
      toast.success("Ses eklendi");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof AudioLoadError ? "Ses dosyası okunamadı" : "Ses eklenemedi");
    }
  };

  const handleFreeze = async () => {
    if (!clip) return;
    engine.pauseVideo();
    try {
      const res = await engine.freezeFrameAt(clip.id, engine.getCurrentTime());
      if (res) onSelectVideoClip(res.id);
      else toast.error("Kare dondurulamadı: ibre klibin içinde olmalı ve süre sınırı dolmamış olmalı");
    } catch {
      toast.error("Kare dondurulamadı");
    }
  };

  const handleReverse = async () => {
    if (!clip) return;
    if (!isReverseSupported()) {
      toast.error("Bu tarayıcı ters çevirmeyi desteklemiyor");
      return;
    }
    engine.pauseVideo();
    const ctrl = new AbortController();
    reverseAbortRef.current = ctrl;
    setReverseProgress(0);
    setTool({ key: "reverse", scope: "clip", clipId: clip.id });
    try {
      await engine.reverseClip(clip.id, (p) => setReverseProgress(p), ctrl.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // kullanıcı iptal etti
      } else if (isReverseClipError(err)) {
        toast.error(
          err.code === "unsupported"
            ? "Bu tarayıcı ters çevirmeyi desteklemiyor"
            : err.code === "not-video"
              ? "Yalnızca videolar ters çevrilebilir"
              : "Klip ters çevrilemedi"
        );
      } else {
        toast.error("Klip ters çevrilemedi");
      }
    } finally {
      reverseAbortRef.current = null;
      setTool(null);
    }
  };

  // ── menü öğeleri ──
  const mainItems: MenuItem[] = [
    {
      key: "edit",
      label: "Düzenle",
      icon: <Pencil className={ICON} />,
      active: editOpen,
      onClick: () => {
        if (selection) setBackedOutFor(null);
        else onSelectClipAtPlayhead();
      },
    },
    { key: "sound", label: "Ses", icon: <Music className={ICON} />, active: Boolean(selectedMusic), onClick: () => openTool("sound") },
    { key: "text", label: "Metin", icon: <Type className={ICON} />, onClick: () => onOpenText(null) },
    { key: "effects", label: "Efektler", icon: <Sparkles className={ICON} />, onClick: () => openTool("effects") },
    { key: "overlay", label: "Bindirme", icon: <Layers className={ICON} />, onClick: () => overlayInputRef.current?.click() },
    { key: "stickers", label: "Çıkartmalar", icon: <Sticker className={ICON} />, onClick: () => openTool("stickers") },
    { key: "filters", label: "Filtreler", icon: <Palette className={ICON} />, active: activeFilterIndex > 0, onClick: () => openTool("filters") },
    { key: "adjust", label: "Ayarla", icon: <SlidersHorizontal className={ICON} />, onClick: () => openTool("adjust") },
  ];

  const split: MenuItem = { key: "split", label: "Böl", icon: <Scissors className={ICON} />, onClick: onSplit, disabled: !canSplit || busy };
  const copy: MenuItem = { key: "copy", label: "Kopyala", icon: <Copy className={ICON} />, onClick: onDuplicate, disabled: busy };
  const del = (disabled?: boolean): MenuItem => ({
    key: "delete",
    label: "Sil",
    icon: <Trash2 className={ICON} />,
    onClick: onDelete,
    danger: true,
    disabled: busy || disabled,
  });

  let editItems: MenuItem[] = [];
  if (selection?.type === "video" && clip) {
    editItems = [
      split,
      { key: "replace", label: "Değiştir", icon: <RefreshCw className={ICON} />, onClick: () => replaceInputRef.current?.click() },
      del(clipCount <= 1),
      { key: "speed", label: "Hız", icon: <Gauge className={ICON} />, onClick: () => openTool("speed", "clip") },
      { key: "crop", label: "Kırp", icon: <Crop className={ICON} />, onClick: onCrop },
      { key: "animation", label: "Animasyon", icon: <Clapperboard className={ICON} />, onClick: () => openTool("animation", "clip") },
      { key: "effects", label: "Efektler", icon: <Sparkles className={ICON} />, onClick: () => openTool("effects") },
      { key: "clipVolume", label: "Ses", icon: <Volume2 className={ICON} />, onClick: () => openTool("clipVolume", "clip") },
      { key: "rotate", label: "Döndür", icon: <RotateCw className={ICON} />, onClick: () => openTool("rotate", "clip") },
      { key: "retouch", label: "Rötuş", icon: <Smile className={ICON} />, onClick: () => openTool("retouch", "clip") },
      { key: "filters", label: "Filtreler", icon: <Palette className={ICON} />, active: clip.filterIndex !== undefined, onClick: () => openTool("filters", "clip") },
      { key: "adjust", label: "Ayarla", icon: <SlidersHorizontal className={ICON} />, onClick: () => openTool("adjust", "clip") },
      copy,
      { key: "reverse", label: "Ters çevir", icon: <Rewind className={ICON} />, onClick: () => void handleReverse(), disabled: busy },
      { key: "freeze", label: "Dondur", icon: <Snowflake className={ICON} />, onClick: () => void handleFreeze(), disabled: busy },
      { key: "opacity", label: "Opaklık", icon: <Droplet className={ICON} />, onClick: () => openTool("opacity", "clip") },
    ];
  } else if (selection?.type === "text") {
    editItems = [
      { key: "edit-text", label: "Metin", icon: <Type className={ICON} />, onClick: () => onOpenText(selection.id) },
      split,
      copy,
      del(),
    ];
  } else if (selection?.type === "photo") {
    editItems = [
      { key: "photo-crop", label: "Kırp", icon: <Crop className={ICON} />, onClick: () => openTool("photoCrop") },
      split,
      copy,
      del(),
    ];
  } else if (selection?.type === "effect") {
    editItems = [
      { key: "effects", label: "Efektler", icon: <Sparkles className={ICON} />, onClick: () => openTool("effects") },
      split,
      copy,
      del(),
    ];
  } else if (selection?.type === "audio") {
    editItems = [
      { key: "audio-set", label: "Ses", icon: <Volume2 className={ICON} />, onClick: () => setMusicSheetOpen(true) },
      split,
      copy,
      del(),
    ];
  } else if (selection) {
    editItems = [split, copy, del()];
  }

  // ── araç panelleri ──
  const clipScope = Boolean(clip) && tool?.scope === "clip";
  let panel: ReactNode = null;
  if (tool) {
    switch (tool.key) {
      case "sound":
        panel = (
          <ToolPanel title="Ses" onClose={closeTool}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <Chip onClick={() => onOpenMusicPicker(selectedMusic ? "replace" : "trim")}>
                  <Music className="w-4 h-4" />
                  Müzik ara
                </Chip>
                <Chip onClick={() => audioInputRef.current?.click()}>
                  <Smartphone className="w-4 h-4" />
                  Cihazdan seç
                </Chip>
                {selectedMusic && (
                  <>
                    <Chip onClick={() => setMusicSheetOpen(true)}>Ayarlar</Chip>
                    <Chip onClick={() => onChangeMusicMeta(null)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                      Kaldır
                    </Chip>
                  </>
                )}
              </div>
              {selectedMusic && (
                <RangeRow
                  label="Müzik"
                  min={0}
                  max={100}
                  suffix="%"
                  value={Math.round(musicVolume * 100)}
                  onChange={(v) => onChangeMusicVolume(v / 100)}
                />
              )}
            </div>
          </ToolPanel>
        );
        break;
      case "effects":
        panel = (
          <ToolPanel title="Efektler" onClose={closeTool}>
            <EffectsPanel
              engine={engine}
              selectedEffectClip={selectedEffectClip}
              busy={busy}
              onPick={onPickEffect}
              onIntensity={onEffectIntensity}
            />
          </ToolPanel>
        );
        break;
      case "stickers":
        panel = (
          <ToolPanel title="Çıkartma" onClose={closeTool}>
            <StickersPanel engine={engine} onAddMention={onAddMention} />
          </ToolPanel>
        );
        break;
      case "filters":
        panel = (
          <ToolPanel title="Filtre" onClose={closeTool}>
            <FiltersPanel
              engine={engine}
              inheritable={clipScope}
              activeIndex={clipScope ? (clip?.filterIndex ?? null) : activeFilterIndex}
              onPick={(i) => {
                if (clipScope && clip) engine.setClipFilter(clip.id, i);
                else if (i !== null) onSelectFilterIndex(i);
              }}
            />
          </ToolPanel>
        );
        break;
      case "adjust":
        panel = (
          <ToolPanel title="Ayarla" onClose={closeTool}>
            {clipScope && clip ? (
              <AdjustPanel
                key={clip.id}
                initial={clip.adjustments ?? {}}
                onChange={(k, v) => engine.updateClipAdjustments(clip.id, { [k]: v })}
                onReset={() =>
                  engine.updateClipAdjustments(clip.id, {
                    brightness: 0,
                    contrast: 0,
                    saturation: 0,
                    warmth: 0,
                    vignette: 0,
                    sharpness: 0,
                  })
                }
              />
            ) : (
              <AdjustPanel
                initial={engine.getPostAdjustments()}
                onChange={(k, v) => engine.setPostAdjustments({ [k]: v })}
                onReset={() => engine.resetPostAdjustments()}
              />
            )}
          </ToolPanel>
        );
        break;
      case "speed":
        if (clip)
          panel = (
            <ToolPanel title="Hız" onClose={closeTool}>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {[0.25, 0.5, 1, 1.5, 2, 3].map((r) => (
                  <Chip key={r} active={Math.abs(clip.playbackRate - r) < 0.01} onClick={() => engine.updateClipSpeed(clip.id, r)}>
                    {r}x
                  </Chip>
                ))}
              </div>
            </ToolPanel>
          );
        break;
      case "animation":
        if (clip)
          panel = (
            <ToolPanel title="Animasyon" onClose={closeTool}>
              <AnimationPanel key={clip.id} engine={engine} clip={clip} />
            </ToolPanel>
          );
        break;
      case "clipVolume":
        if (clip)
          panel = (
            <ToolPanel title="Ses" onClose={closeTool}>
              <VolumePanel key={clip.id} engine={engine} clip={clip} />
            </ToolPanel>
          );
        break;
      case "rotate":
        if (clip)
          panel = (
            <ToolPanel title="Döndür" onClose={closeTool}>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <Chip onClick={() => engine.rotateClip90(clip.id)}>
                  <RotateCw className="w-4 h-4" />
                  90° Döndür
                </Chip>
                <Chip onClick={() => engine.flipClip(clip.id, "h")}>
                  <FlipHorizontal2 className="w-4 h-4" />
                  Yatay
                </Chip>
                <Chip onClick={() => engine.flipClip(clip.id, "v")}>
                  <FlipVertical2 className="w-4 h-4" />
                  Dikey
                </Chip>
              </div>
            </ToolPanel>
          );
        break;
      case "retouch":
        if (clip)
          panel = (
            <ToolPanel title="Rötuş" onClose={closeTool}>
              <RangeRow
                key={clip.id}
                label="Yumuşatma"
                min={0}
                max={100}
                suffix="%"
                value={Math.round((clip.retouch ?? 0) * 100)}
                onChange={(v) => engine.updateClipRetouch(clip.id, v / 100)}
              />
            </ToolPanel>
          );
        break;
      case "opacity":
        if (clip)
          panel = (
            <ToolPanel title="Opaklık" onClose={closeTool}>
              <RangeRow
                key={clip.id}
                label="Opaklık"
                min={0}
                max={100}
                suffix="%"
                value={Math.round((clip.opacity ?? 1) * 100)}
                onChange={(v) => engine.updateClipOpacity(clip.id, v / 100)}
              />
            </ToolPanel>
          );
        break;
      case "reverse":
        panel = (
          <ToolPanel title="Ters" onClose={() => reverseAbortRef.current?.abort()}>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-white">Klip ters çevriliyor… %{Math.round(reverseProgress * 100)}</span>
              <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full bg-amber-400 transition-[width] duration-150" style={{ width: `${Math.round(reverseProgress * 100)}%` }} />
              </div>
              <div>
                <Chip onClick={() => reverseAbortRef.current?.abort()}>İptal</Chip>
              </div>
            </div>
          </ToolPanel>
        );
        break;
      case "photoCrop":
        if (photo)
          panel = (
            <ToolPanel title="Kırp" onClose={closeTool}>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <Chip onClick={photo.cycleShape}>
                    <Crop className="w-4 h-4 text-amber-400" />
                    Şekil
                  </Chip>
                  <Chip onClick={() => photo.patch((t) => ({ ...t, rotation: (t.rotation + 90) % 360 }))}>
                    <RotateCw className="w-4 h-4" />
                    90°
                  </Chip>
                  <Chip onClick={() => photo.patch(() => ({ x: 0.5, y: 0.5, scale: 1, rotation: 0 }))}>
                    <RotateCcw className="w-4 h-4" />
                    Sıfırla
                  </Chip>
                </div>
                <RangeRow
                  key={selection?.id}
                  label="Yakınlaştır"
                  min={50}
                  max={300}
                  suffix="%"
                  value={Math.round(photo.scale * 100)}
                  onChange={(v) => photo.patch((t) => ({ ...t, scale: v / 100 }))}
                />
              </div>
            </ToolPanel>
          );
        break;
    }
  }

  return (
    <>
      <input ref={replaceInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleReplaceFile} />
      <input ref={overlayInputRef} type="file" accept="image/*" className="hidden" onChange={handleOverlayFile} />
      <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioFile} />

      {/* Menüler tek satır (yatay kaydırma); yalnızca bir araç paneli açıkken alan büyür */}
      <div
        style={{ height: panel ? REELS_MENU_HEIGHT : REELS_MENU_ROW_HEIGHT }}
        className="relative shrink-0 overflow-hidden bg-black"
      >
        {/* Ana menü */}
        <div className="absolute inset-0 overflow-x-auto no-scrollbar touch-pan-x px-1 flex items-center">
          <div className="flex items-center w-max">
            {mainItems.map((it) => (
              <MenuButton key={it.key} item={it} />
            ))}
          </div>
        </div>

        {/* Düzenle alt menüsü: ana menüyle aynı alanı kaplar */}
        {editOpen && (
          <div className="absolute inset-0 z-10 bg-black flex items-stretch">
            <button
              type="button"
              aria-label="Geri"
              onClick={() => setBackedOutFor(selection?.id ?? null)}
              className="w-11 shrink-0 flex items-center justify-center text-white bg-white/5 active:bg-white/10"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar touch-pan-x px-1 flex items-center">
              <div className="flex items-center w-max">
                {editItems.map((it) => (
                  <MenuButton key={it.key} item={it} />
                ))}
              </div>
            </div>
          </div>
        )}

        {panel}
      </div>

      <Sheet open={musicSheetOpen && Boolean(selectedMusic)} onClose={() => setMusicSheetOpen(false)} title="Ses ayarları">
        {selectedMusic && (
          <MusicSettingsPanel
            music={selectedMusic}
            volume={musicVolume}
            onChangeVolume={onChangeMusicVolume}
            onChangeMusic={(next) => onChangeMusicMeta(next)}
            onReplace={() => {
              setMusicSheetOpen(false);
              onOpenMusicPicker("replace");
            }}
            onTrim={() => {
              setMusicSheetOpen(false);
              onOpenMusicPicker("trim");
            }}
            onRemove={() => {
              setMusicSheetOpen(false);
              onChangeMusicMeta(null);
            }}
            onClose={() => setMusicSheetOpen(false)}
          />
        )}
      </Sheet>
    </>
  );
}

// ───────────────────────── klip araç panelleri (yerel durumlu) ─────────────────────────

const ANIM_KINDS: { id: ClipAnimationKind; label: string }[] = [
  { id: "none", label: "Yok" },
  { id: "fade", label: "Solma" },
  { id: "slide-up", label: "Yukarı" },
  { id: "slide-left", label: "Sola" },
  { id: "zoom-in", label: "Yakınlaş" },
];

function AnimationPanel({ engine, clip }: { engine: CanvasEngine; clip: VideoTrackClip }) {
  const [inKind, setIn] = useState<ClipAnimationKind>(clip.animation?.in ?? "none");
  const [outKind, setOut] = useState<ClipAnimationKind>(clip.animation?.out ?? "none");
  return (
    <div className="flex flex-col gap-1">
      {(
        [
          ["Giriş", inKind, setIn, "in"],
          ["Çıkış", outKind, setOut, "out"],
        ] as const
      ).map(([label, value, setter, field]) => (
        <div key={field} className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 w-9 shrink-0">{label}</span>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {ANIM_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={value === k.id}
                onClick={() => {
                  setter(k.id);
                  engine.updateClipAnimation(clip.id, { [field]: k.id });
                }}
                className={`h-8 px-3 rounded-full text-[11px] font-semibold shrink-0 ${
                  value === k.id ? "bg-amber-400 text-black" : "bg-[#1c1c1e] text-zinc-200"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <RangeRow
        label="Süre"
        min={1}
        max={20}
        suffix=""
        value={Math.round((clip.animation?.durationSec ?? 0.5) * 10)}
        onChange={(v) => engine.updateClipAnimation(clip.id, { durationSec: v / 10 })}
      />
    </div>
  );
}

function VolumePanel({ engine, clip }: { engine: CanvasEngine; clip: VideoTrackClip }) {
  const [vol, setVol] = useState(clip.muted ? 0 : Math.round(clip.volume * 100));
  const [nonce, setNonce] = useState(0);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={vol === 0 ? "Sesi aç" : "Sessize al"}
        onClick={() => {
          const next = vol > 0 ? 0 : 100;
          setVol(next);
          setNonce((n) => n + 1);
          engine.updateClipVolume(clip.id, next / 100, next === 0);
        }}
        className="w-11 h-11 rounded-xl bg-[#1c1c1e] flex items-center justify-center shrink-0"
      >
        {vol === 0 ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <RangeRow
          key={nonce}
          label="Ses"
          min={0}
          max={100}
          suffix="%"
          value={vol}
          onChange={(v) => {
            setVol(v);
            engine.updateClipVolume(clip.id, v / 100, v === 0);
          }}
        />
      </div>
    </div>
  );
}
