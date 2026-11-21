// WP-09: motorun mevcut undo anlık görüntüsünü (engine.snapshot / engine.restore) JSON'a çevirir.
// Katman nesneleri ve medya elemanları JSON'a girmez: katmanlar tür+durum, medya ise blob anahtarı olarak yazılır.

import {
  CanvasEngine,
  MusicStickerLayer,
  OverlayImageLayer,
  TextLayer,
  type BaseLayer,
  type EditorMedia,
  type EngineSnapshot,
  type LayerStateSnapshot,
  type StoryAudioMeta,
  type VideoTrackClip,
} from "@/lib/canvas-editor";
import type { DraftMode } from "./DraftStore";

export interface DraftLayerRec {
  kind: "text" | "image" | "music";
  id: string;
  state: LayerStateSnapshot;
  mediaKey?: string;
}
export type DraftClipRec = Omit<VideoTrackClip, "media" | "thumbnails" | "thumbnailUrl"> & { mediaKey: string };

export interface DraftState {
  version: 1;
  mode: DraftMode;
  postAspect: EngineSnapshot["postAspect"];
  media: EngineSnapshot["media"];
  clips: DraftClipRec[];
  layers: DraftLayerRec[];
  filterIndex: number;
  music: StoryAudioMeta | null;
  musicKey?: string;
  selectedLayerId: string | null;
  timelineTime: number;
  musicVolume: number;
}

export interface CapturedBlob {
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}
export interface CapturedDraft {
  state: DraftState;
  blobs: Map<string, CapturedBlob>;
}

// Aynı Blob nesnesi her kayıtta aynı anahtarı alır: değişmeyen medya yeniden yazılmaz.
const blobKeys = new WeakMap<Blob, string>();
const musicKeys = new Map<string, string>();
function keyFor(blob: Blob): string {
  let k = blobKeys.get(blob);
  if (!k) {
    k = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    blobKeys.set(blob, k);
  }
  return k;
}
/** Geri yüklenen dosyanın anahtarını koru (tekrar yazılmasın). */
export function adoptBlobKey(blob: Blob, key: string) {
  blobKeys.set(blob, key);
}

function extOf(type: string): string {
  const t = type.split("/")[1] || "bin";
  return t.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "");
}
function describe(blob: Blob, key: string): CapturedBlob {
  const f = blob as File;
  return {
    blob,
    name: f.name || `${key}.${extOf(blob.type)}`,
    type: blob.type,
    lastModified: f.lastModified || Date.now(),
  };
}

export async function captureDraft(
  engine: CanvasEngine,
  mode: DraftMode,
  extras: { musicVolume: number }
): Promise<CapturedDraft> {
  const snap = engine.snapshot();
  const blobs = new Map<string, CapturedBlob>();
  const addMedia = (m: EditorMedia | undefined | null): string | undefined => {
    if (!m || !(m.source instanceof Blob)) return undefined;
    const k = keyFor(m.source);
    if (!blobs.has(k)) blobs.set(k, describe(m.source, k));
    return k;
  };

  const clips: DraftClipRec[] = [];
  for (const c of snap.clips) {
    const mediaKey = addMedia(c.media);
    if (!mediaKey) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { media, thumbnails, thumbnailUrl, ...rest } = c;
    clips.push({ ...rest, mediaKey });
  }

  const layers: DraftLayerRec[] = [];
  for (const { layer, state } of snap.layers) {
    if (layer instanceof TextLayer) {
      layers.push({ kind: "text", id: layer.id, state });
    } else if (layer instanceof OverlayImageLayer) {
      const mediaKey = addMedia(engine.getOverlayLayerMedia(layer as BaseLayer));
      if (mediaKey) layers.push({ kind: "image", id: layer.id, state, mediaKey });
    } else if (layer instanceof MusicStickerLayer) {
      layers.push({ kind: "music", id: layer.id, state });
    }
  }

  // Cihaz müziği: blob URL'si oturumla ölür, dosyayı da sakla
  let musicKey: string | undefined;
  if (snap.music?.source === "device" && snap.music.streamUrl.startsWith("blob:")) {
    try {
      const url = snap.music.streamUrl;
      const blob = await (await fetch(url)).blob();
      let k = musicKeys.get(url);
      if (!k) {
        k = keyFor(blob);
        musicKeys.set(url, k);
      }
      blobKeys.set(blob, k);
      blobs.set(k, describe(blob, k));
      musicKey = k;
    } catch {}
  }

  return {
    state: {
      version: 1,
      mode,
      postAspect: snap.postAspect,
      media: snap.media,
      clips,
      layers,
      filterIndex: snap.filterIndex,
      music: snap.music,
      musicKey,
      selectedLayerId: snap.selectedLayerId,
      timelineTime: snap.timelineTime,
      musicVolume: extras.musicVolume,
    },
    blobs,
  };
}

/** Taslaktaki ilk klibin medya dosyası (taban medya). */
export function baseMediaKeyOf(state: DraftState): string | null {
  return state.clips[0]?.mediaKey ?? null;
}

/**
 * Taban medya (loadMedia) yüklendikten sonra kalan her şeyi geri kurar: ek klipler, katmanlar,
 * müzik; sonunda motorun kendi restore() yolundan klip/medya/filtre durumunu uygular.
 */
export async function applyDraft(
  engine: CanvasEngine,
  state: DraftState,
  files: Map<string, File>
): Promise<boolean> {
  const baseKey = baseMediaKeyOf(state);
  const baseClip = engine.getVideoClips()[0];
  if (!baseKey || !baseClip?.media) return false;

  const loaded = new Map<string, { media: EditorMedia; thumbnails?: string[]; thumbnailUrl?: string }>();
  loaded.set(baseKey, { media: baseClip.media, thumbnails: baseClip.thumbnails, thumbnailUrl: baseClip.thumbnailUrl });

  // Ek klip medyaları. appendVideoClip kalan süreye bakar: her eklemeden sonra klipleri kısalt.
  const shrink = () => {
    const cur = engine.getVideoClips();
    engine.setVideoClips(cur.map((c) => ({ ...c, sourceEnd: Number((c.sourceStart + 0.5).toFixed(2)), playbackRate: 1 })));
  };
  const needed = [...new Set(state.clips.map((c) => c.mediaKey))].filter((k) => k !== baseKey);
  if (needed.length > 0) shrink();
  for (const key of needed) {
    const file = files.get(key);
    if (!file) continue;
    const clip = await engine.appendVideoClip(file);
    if (clip?.media) loaded.set(key, { media: clip.media, thumbnails: clip.thumbnails, thumbnailUrl: clip.thumbnailUrl });
    shrink();
  }

  const clips: VideoTrackClip[] = [];
  for (const rec of state.clips) {
    const l = loaded.get(rec.mediaKey);
    if (!l) continue;
    const { mediaKey, ...rest } = rec;
    void mediaKey;
    clips.push({ ...rest, media: l.media, thumbnails: l.thumbnails, thumbnailUrl: l.thumbnailUrl });
  }
  if (clips.length === 0) return false;

  // Müzik (cihaz dosyası ise yeni blob URL)
  let music = state.music;
  if (music && state.musicKey) {
    const mf = files.get(state.musicKey);
    if (mf) music = { ...music, streamUrl: URL.createObjectURL(mf) };
  }

  // Katmanlar, kayıtlı sırayla
  const snapLayers: { layer: BaseLayer; state: LayerStateSnapshot }[] = [];
  for (const rec of state.layers) {
    let layer: BaseLayer | null = null;
    if (rec.kind === "text") {
      layer = engine.addText(rec.state.style?.text || "", rec.state.style);
    } else if (rec.kind === "image") {
      const f = rec.mediaKey ? files.get(rec.mediaKey) : undefined;
      if (f) layer = await engine.addOverlayImage(f, 0.5, 0.5);
    } else if (rec.kind === "music" && music) {
      layer = engine.addMusicSticker(music, 0.5, 0.65);
    }
    if (!layer) continue;
    layer.id = rec.id;
    snapLayers.push({ layer, state: rec.state });
  }
  if (music && state.mode === "reels") engine.setMusic(music);

  const cur = engine.snapshot();
  return engine.restore({
    version: 1,
    mode: state.mode,
    postAspect: state.postAspect,
    baseMediaKey: cur.baseMediaKey,
    layers: snapLayers,
    media: state.media,
    clips,
    filterIndex: state.filterIndex,
    music,
    selectedLayerId: state.selectedLayerId,
    timelineTime: state.timelineTime,
  });
}
