// [START] CREATED BY Bedirhan
"use client";

import { useState } from "react";
import {
  SlidersHorizontal,
  Crop,
  Sparkles,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  CircleChevronRight,
  Loader2,
} from "lucide-react";
import { RiColorFilterAiLine } from "react-icons/ri";
import {
  POST_STUDIO_FILTERS,
  PostAdjustmentState,
  PostStudioFilterId,
} from "@/lib/canvas-editor";
import PreviewThumb from "./PreviewThumb";

export interface PostPhotoEditorProps {
  adjustments: PostAdjustmentState;
  getPreviewFrame?: () => string | null;
  isPublishing: boolean;
  onChangeAdjustments: (partial: Partial<PostAdjustmentState>) => void;
  onResetAdjustments: () => void;
  onRotate90: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onResetGeometry: () => void;
  onPublish: () => void;
}

type StudioTab = "adjust" | "filters" | "geometry" | "effects";

type AdjustKey =
  | "brightness"
  | "contrast"
  | "saturation"
  | "warmth"
  | "vignette"
  | "sharpness";

type EffectKey = "grain" | "lightLeak" | "bokehGlow";

const ADJUST_CONTROLS: Array<{
  key: AdjustKey;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "brightness", label: "Parlaklık", min: -100, max: 100 },
  { key: "contrast", label: "Kontrast", min: -100, max: 100 },
  { key: "saturation", label: "Doygunluk", min: -100, max: 100 },
  { key: "warmth", label: "Sıcaklık", min: -100, max: 100 },
  { key: "vignette", label: "Vinyet", min: 0, max: 100 },
  { key: "sharpness", label: "Keskinlik", min: 0, max: 100 },
];

const EFFECT_CONTROLS: Array<{
  key: EffectKey;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "grain", label: "Film Greni", min: 0, max: 100 },
  { key: "lightLeak", label: "Işık Sızıntısı", min: 0, max: 100 },
  { key: "bokehGlow", label: "Yumuşak Odak", min: 0, max: 100 },
];

export default function PostPhotoEditor({
  adjustments,
  getPreviewFrame,
  isPublishing,
  onChangeAdjustments,
  onResetAdjustments,
  onRotate90,
  onFlipHorizontal,
  onFlipVertical,
  onResetGeometry,
  onPublish,
}: PostPhotoEditorProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("adjust");
  const [activeAdjustKey, setActiveAdjustKey] = useState<AdjustKey>("brightness");
  const [activeEffectKey, setActiveEffectKey] = useState<EffectKey>("grain");
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);

  const currentAdjustCfg =
    ADJUST_CONTROLS.find((c) => c.key === activeAdjustKey) || ADJUST_CONTROLS[0];
  const currentEffectCfg =
    EFFECT_CONTROLS.find((c) => c.key === activeEffectKey) || EFFECT_CONTROLS[0];

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-zinc-950/95 backdrop-blur-2xl border-t border-white/10 px-4 pt-3 pb-5 flex flex-col gap-3.5 pointer-events-auto select-none animate-in slide-in-from-bottom duration-200">
      {/* Aktif Sekme İçeriği */}
      {activeTab === "adjust" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-1">
            <span className="text-xs font-bold text-white w-24 shrink-0">
              {currentAdjustCfg.label}
            </span>
            <input
              type="range"
              min={currentAdjustCfg.min}
              max={currentAdjustCfg.max}
              value={adjustments[activeAdjustKey]}
              onChange={(e) =>
                onChangeAdjustments({ [activeAdjustKey]: Number(e.target.value) })
              }
              className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-xs font-bold text-cyan-400 w-10 text-right tabular-nums">
              {adjustments[activeAdjustKey]}
            </span>
            <button
              type="button"
              onClick={() => onChangeAdjustments({ [activeAdjustKey]: 0 })}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white active:scale-90 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {ADJUST_CONTROLS.map((item) => {
              const isSelected = activeAdjustKey === item.key;
              const isModified = adjustments[item.key] !== 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveAdjustKey(item.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 border transition-all active:scale-95 ${
                    isSelected
                      ? "bg-cyan-500 text-black border-cyan-400 font-bold"
                      : isModified
                      ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "filters" && (
        <div className="flex items-start gap-2 overflow-x-auto no-scrollbar py-2">
          {POST_STUDIO_FILTERS.map((f) => (
            <PreviewThumb
              key={f.id}
              src={previewFrame}
              label={f.name}
              active={adjustments.filterPreset === f.id}
              cssFilter={f.cssFilter}
              className="w-16"
              onClick={() =>
                onChangeAdjustments({ filterPreset: f.id as PostStudioFilterId })
              }
            />
          ))}
        </div>
      )}

      {activeTab === "geometry" && (
        <div className="grid grid-cols-4 gap-2 py-1">
          <button
            type="button"
            onClick={onRotate90}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white active:scale-95 transition-all"
          >
            <RotateCw className="w-4 h-4 text-cyan-400" />
            <span>90° Döndür</span>
          </button>

          <button
            type="button"
            onClick={onFlipHorizontal}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white active:scale-95 transition-all"
          >
            <FlipHorizontal2 className="w-4 h-4 text-emerald-400" />
            <span>Yatay</span>
          </button>

          <button
            type="button"
            onClick={onFlipVertical}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white active:scale-95 transition-all"
          >
            <FlipVertical2 className="w-4 h-4 text-purple-400" />
            <span>Dikey</span>
          </button>

          <button
            type="button"
            onClick={onResetGeometry}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 active:scale-95 transition-all"
          >
            <RotateCcw className="w-4 h-4 text-zinc-400" />
            <span>Sıfırla</span>
          </button>
        </div>
      )}

      {activeTab === "effects" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-1">
            <span className="text-xs font-bold text-white w-24 shrink-0">
              {currentEffectCfg.label}
            </span>
            <input
              type="range"
              min={currentEffectCfg.min}
              max={currentEffectCfg.max}
              value={adjustments[activeEffectKey]}
              onChange={(e) =>
                onChangeAdjustments({ [activeEffectKey]: Number(e.target.value) })
              }
              className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-pink-400"
            />
            <span className="text-xs font-bold text-pink-400 w-10 text-right tabular-nums">
              {adjustments[activeEffectKey]}
            </span>
            <button
              type="button"
              onClick={() => onChangeAdjustments({ [activeEffectKey]: 0 })}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white active:scale-90 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {EFFECT_CONTROLS.map((item) => {
              const isSelected = activeEffectKey === item.key;
              const isModified = adjustments[item.key] !== 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveEffectKey(item.key)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 border transition-all active:scale-95 ${
                    isSelected
                      ? "bg-pink-500 text-white border-pink-400 font-bold"
                      : isModified
                      ? "bg-pink-500/15 text-pink-300 border-pink-500/30"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Alt Stüdyo Sekme Menüsü + Sıfırla + Paylaş CTA */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("adjust")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "adjust"
                ? "bg-white text-black font-bold"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Ayar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              // Filtre küçük resimleri için tek seferlik kare
              if (getPreviewFrame) setPreviewFrame(getPreviewFrame());
              setActiveTab("filters");
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "filters"
                ? "bg-white text-black font-bold"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            <RiColorFilterAiLine className="w-3.5 h-3.5" />
            <span>Filtre</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("geometry")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "geometry"
                ? "bg-white text-black font-bold"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span>Geometri</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("effects")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "effects"
                ? "bg-white text-black font-bold"
                : "bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Efekt</span>
          </button>

          <button
            type="button"
            onClick={onResetAdjustments}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white active:scale-90 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing}
          className="flex items-center gap-1.5 pl-3.5 pr-1.5 py-1.5 rounded-full bg-white text-black font-bold text-xs shadow-xl active:scale-95 transition-all shrink-0 disabled:opacity-50"
        >
          {isPublishing ? (
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : (
            <>
              <span>Paylaş</span>
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center">
                <CircleChevronRight className="w-4 h-4" />
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
// [END] CREATED BY Bedirhan
