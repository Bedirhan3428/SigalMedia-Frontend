// [START] CREATED BY Bedirhan
"use client";

import { useState } from "react";
import { X, Scissors, Gauge, Volume2, VolumeX, Music } from "lucide-react";
import { VideoState } from "@/lib/canvas-editor";
import VideoTimeline from "./VideoTimeline";

export interface VideoToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  videoState: VideoState;
  thumbnails: string[];
  hasMusic: boolean;
  musicVolume: number;
  onChangeTrim: (start: number, end: number) => void;
  onChangeSpeed: (rate: number) => void;
  onChangeVolume: (volume: number, muted?: boolean) => void;
  onChangeMusicVolume: (volume: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type TabKey = "trim" | "speed" | "volume";

export default function VideoToolsDrawer({
  isOpen,
  onClose,
  videoState,
  thumbnails,
  hasMusic,
  musicVolume,
  onChangeTrim,
  onChangeSpeed,
  onChangeVolume,
  onChangeMusicVolume,
  onSeek,
  onTogglePlay,
}: VideoToolsDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("trim");

  if (!isOpen) return null;

  const effectiveVolume = videoState.muted ? 0 : Math.round(videoState.volume * 100);
  const effectiveMusicVolume = Math.round(musicVolume * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl backdrop-blur-2xl bg-neutral-900/95 border-t border-white/10 p-5 pb-8 flex flex-col animate-in slide-in-from-bottom duration-200 shadow-2xl select-none">
      <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("trim")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "trim"
                ? "bg-white text-black shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Kırp</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("speed")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "speed"
                ? "bg-white text-black shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Hız</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("volume")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "volume"
                ? "bg-white text-black shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Ses</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {activeTab === "trim" && (
        <div className="py-1">
          <VideoTimeline
            duration={videoState.duration}
            trimStart={videoState.trimStart}
            trimEnd={videoState.trimEnd}
            currentTime={videoState.currentTime}
            isPlaying={videoState.isPlaying}
            thumbnails={thumbnails}
            onChangeTrim={onChangeTrim}
            onSeek={onSeek}
            onTogglePlay={onTogglePlay}
          />
        </div>
      )}

      {activeTab === "speed" && (
        <div className="grid grid-cols-6 gap-2 py-2">
          {SPEED_OPTIONS.map((rate) => {
            const active = Math.abs(videoState.playbackRate - rate) < 0.01;
            return (
              <button
                key={rate}
                type="button"
                onClick={() => onChangeSpeed(rate)}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                  active
                    ? "bg-emerald-500 text-black border-emerald-400 shadow-lg shadow-emerald-500/20"
                    : "bg-white/5 text-white border-white/10 hover:bg-white/10"
                }`}
              >
                {rate}x
              </button>
            );
          })}
        </div>
      )}

      {activeTab === "volume" && (
        <div className="flex flex-col gap-4 py-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onChangeVolume(
                  videoState.muted && videoState.volume === 0 ? 1 : videoState.volume,
                  !videoState.muted
                )
              }
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white shrink-0 transition-all active:scale-90"
            >
              {videoState.muted || effectiveVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>

            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-zinc-300">Video Sesi</span>
                <span className="text-white tabular-nums">{effectiveVolume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={effectiveVolume}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  onChangeVolume(val, val === 0);
                }}
                className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
            </div>
          </div>

          {hasMusic && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-pink-500/15 flex items-center justify-center text-pink-400 shrink-0">
                <Music className="w-4 h-4" />
              </div>

              <div className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-zinc-300">Müzik Sesi</span>
                  <span className="text-white tabular-nums">{effectiveMusicVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={effectiveMusicVolume}
                  onChange={(e) => onChangeMusicVolume(Number(e.target.value) / 100)}
                  className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-pink-400"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// [END] CREATED BY Bedirhan
