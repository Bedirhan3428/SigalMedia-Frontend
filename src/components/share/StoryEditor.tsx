// [START] CREATED BY Bedirhan
"use client";

import { CaseSensitive, Sticker, Music, AtSign } from "lucide-react";
import { StoryAudioMeta } from "@/lib/canvas-editor";

export interface StoryEditorProps {
  activeDrawer: string;
  selectedMusic: StoryAudioMeta | null;
  onOpenTextEditor: () => void;
  onOpenStickerSheet: () => void;
  onOpenMusicPicker: () => void;
  onOpenTagSheet: () => void;
}

export default function StoryEditor({
  activeDrawer,
  selectedMusic,
  onOpenTextEditor,
  onOpenStickerSheet,
  onOpenMusicPicker,
  onOpenTagSheet,
}: StoryEditorProps) {
  return (
    <div className="fixed right-4 top-6 flex flex-col gap-3.5 z-40 pointer-events-auto animate-in fade-in duration-200">
      {/* #1: Metin Aracı (Aa) */}
      <button
        type="button"
        onClick={onOpenTextEditor}
        className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-black/70 active:scale-90 transition-all shadow-xl flex items-center justify-center"
      >
        <CaseSensitive className="w-5 h-5" />
      </button>

      {/* #2: Çıkartmalar & Fotoğraf Ekle (Sticker) */}
      <button
        type="button"
        onClick={onOpenStickerSheet}
        className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
          activeDrawer === "sticker_sheet"
            ? "bg-white text-black border-white"
            : "bg-black/50 border-white/15 text-white hover:bg-black/70"
        }`}
      >
        <Sticker className="w-5 h-5 text-emerald-400" />
      </button>

      {/* #3: Müzik Aracı (Music) */}
      <button
        type="button"
        onClick={onOpenMusicPicker}
        className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
          selectedMusic
            ? "bg-pink-500 text-white border-pink-400 shadow-lg shadow-pink-500/30"
            : "bg-black/50 border-white/15 text-white hover:bg-black/70"
        }`}
      >
        <Music className={`w-5 h-5 ${selectedMusic ? "text-white" : "text-pink-400"}`} />
      </button>

      {/* #4: @Etiketleme Aracı (AtSign) */}
      <button
        type="button"
        onClick={onOpenTagSheet}
        className={`w-10 h-10 rounded-full backdrop-blur-md border transition-all shadow-xl flex items-center justify-center active:scale-90 ${
          activeDrawer === "tag"
            ? "bg-white text-black border-white"
            : "bg-black/50 border-white/15 text-white hover:bg-black/70"
        }`}
      >
        <AtSign className="w-5 h-5 text-cyan-400" />
      </button>
    </div>
  );
}
// [END] CREATED BY Bedirhan
