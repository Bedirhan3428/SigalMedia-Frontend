/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  PUBLIC API (frozen after WP1)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Phase 2 UI packages may use ONLY what is listed here. Anything else that is
 *  technically `public` (render internals, export hooks, layer internals) is for
 *  the engine and the exporters (WP2) and may change.
 *
 *  ── LIFECYCLE / SESSION ────────────────────────────────────────────────────
 *  new CanvasEngine({ canvas, mode?: ShareMode = 'story', postAspect?: PostAspect = '4:5', fitMode? })
 *      One engine per editor session. Mode is fixed once media is loaded (B7):
 *      to change mode, destroy() and create a new engine (new session).
 *      The engine sets canvas.style.objectFit = 'contain' if unset; the UI only sizes
 *      the canvas with CSS (aspect-ratio = getLogicalSize()). Pointer mapping honours
 *      the letterbox.
 *  destroy(): void                 Idempotent. Frees rAF loops, timers, visibility +
 *                                  pointer listeners, ALL media (base, clips, overlays)
 *                                  and their blob URLs. Call on session reset / route hide.
 *  isDestroyed(): boolean
 *  setMode(mode) / setShareMode(mode): boolean   false (no-op + console.warn) after media load.
 *  getMode() / getShareMode(): ShareMode
 *  isModeLocked(): boolean
 *  getLogicalSize(): { width, height }   Story/Reels 1080×1920; Post per aspect (see below).
 *  getWidth() / getHeight(): number
 *
 *  ── MEDIA ──────────────────────────────────────────────────────────────────
 *  loadMedia(source: File | Blob | string, forcedType?): Promise<EditorMedia>
 *      Images are downscaled to ≤4096 px long side / ≤16 M px (createImageBitmap resize
 *      when supported, offscreen-canvas fallback). Videos time out after 15 s.
 *      Rejects with MediaLoadError { code: 'timeout' | 'unsupported' | 'decode', mediaType }
 *      (current media is kept, editor stays usable), or a DOMException 'AbortError'
 *      when the engine was destroyed / a newer loadMedia superseded this one.
 *      Post rejects videos with MediaLoadError('unsupported').
 *      Starts playback for videos and Reels photos. Locks the mode.
 *  isMediaLoadError(err): err is MediaLoadError
 *  getMedia(): EditorMedia | null
 *  purgeUnusedMedia(): void        Frees clip media no longer used by any clip (the engine
 *                                  keeps the 3 most recent for undo). Call when undo history is cleared.
 *
 *  ── PLAYBACK & SOUND (Story video, Reels) ──────────────────────────────────
 *  playVideo(): Promise<void>      Resumes from the current position. During an export it is
 *                                  deferred until setExportingVideo(false).
 *  pauseVideo(): void              Explicit pause (no auto-resume on visibility).
 *  isPlaying(): boolean
 *  toggleVideoPlay(): Promise<boolean>   Returns the new playing state.
 *  seekVideo(t: number): Promise<void>   Timeline seconds; last target wins (seek queue).
 *  getCurrentTime(): number
 *  getVideoState(): VideoState
 *  setMuted(muted: boolean): void / isMuted(): boolean / toggleMute(): boolean (new muted state)
 *      Story: base video. Reels: active clip. Call from a click/tap handler.
 *  needsUserGestureForSound(): boolean   true = autoplay with sound was refused, video plays
 *                                  muted; show a small unmute button that calls toggleMute()
 *                                  (or unlockSound()). The user's mute preference is NOT changed (B5).
 *  unlockSound(): Promise<boolean> Must be called synchronously inside a user gesture.
 *      Visibility: when the page is hidden the engine pauses; if it was playing and nobody called
 *      pauseVideo(), it resumes when the page is visible again.
 *
 *  ── OVERLAYS (all modes) ───────────────────────────────────────────────────
 *  addText(text?, style?: Partial<TextStyle>, x?, y?): TextLayer
 *  updateText(layerId, { text?, style?, fontPreset?, bgPreset? }): TextLayer | null
 *  addOverlayImage(source, x?, y?): Promise<OverlayImageLayer>   (MediaLoadError on failure)
 *  removeLayer(layerId): void      Removing the music sticker also clears the music.
 *  getOverlayLayers(): BaseLayer[] / getLayerById(id): BaseLayer | null
 *  getSelectedLayer() / selectLayerById(id | null): BaseLayer | null
 *  bringToFront(layer) / reorderOverlayLayer(layerId, 'up' | 'down')
 *  requestRender(): void           After mutating a layer object directly (e.g. TextLayer.setStyle).
 *  Layer classes for instanceof / presets: BaseLayer, TextLayer (setText, setStyle, setFontPreset,
 *  setBgPreset, cycleFontPreset, cycleBgPreset), OverlayImageLayer (cycleShapeMode),
 *  MusicStickerLayer, FONT_PRESET_CONFIGS, DEFAULT_TEXT_STYLE.
 *
 *  ── STORY ──────────────────────────────────────────────────────────────────
 *  Logical size 1080×1920. Base media: free placement with TWO fingers (pan/pinch/rotate);
 *  one-finger horizontal swipe on the photo changes the filter ('filter-swipe').
 *  cycleFilter('prev' | 'next'): string / setFilterByIndex(i): string
 *  getCurrentFilterIndex() / getCurrentFilterName() / getCurrentFilterPreset(); FILTER_PRESETS
 *  setFitMode('contain' | 'cover') / resetMediaTransform()
 *  setMusic(meta | null): void     Adds/updates the music sticker (keeps its position) or removes it.
 *  getMusic(): StoryAudioMeta | null
 *  addMusicSticker(meta, x?, y?): MusicStickerLayer | null   (legacy; prefer setMusic)
 *  removeMusicSticker(): boolean   Removes sticker AND music (B6).
 *  getMusicSticker(): MusicStickerLayer | null
 *  Trash: listen to 'drag-move' / 'drag-end'; delete only if info.deletable and the layer
 *  centre (info.clientX/Y) is over the trash. Pinch gestures and taps are never deletable (C2).
 *
 *  ── REELS ──────────────────────────────────────────────────────────────────
 *  Logical size 1080×1920. MAX_VIDEO_SEC (60) caps the timeline; the engine refuses or clamps
 *  edits that would exceed it (B8). Base media: one-finger pan + pinch; photo clips are
 *  cover-clamped and not rotatable by gesture; video clips may rotate. No filter swipe.
 *  The music sticker is never placed on the canvas (setMusic only stores the meta).
 *  getVideoClips(): VideoTrackClip[] / setVideoClips(clips)
 *  getTotalTimelineDuration(): number / getRemainingTimelineCapacity(): number
 *  getActiveClipAtTime(t)
 *  appendVideoClip(source): Promise<VideoTrackClip | null>   null when no capacity (≥0.5 s) is left;
 *                                  clamps the new clip to the remaining capacity.
 *  splitActiveClipAt(t?, clipId?) / removeClip(id): boolean / duplicateClip(id) (null if over cap)
 *  reorderClips(from, to)
 *  updateClipTrim(id, sourceStart, sourceEnd)   clamped to the clip's OWN media duration (B9) + cap
 *  updateClipSpeed(id, rate)       0.25–3; raised if the result would exceed the cap
 *  updateClipVolume(id, volume, muted?)
 *  updateClipTransform(id, partial?, fitMode?) / resetClipTransform(id)
 *  updateClipCropRect(id, rect) / setCropOverlayOpen(open)
 *  applyClipTransformToMediaLayer(clip): boolean
 *  setTrim(start, end) / setSpeed(rate) / setVolume(volume, muted?)   (active clip)
 *  getOverlayTrackItems(): OverlayTrackItem[] / updateOverlayTrackTiming(layerId, start, end)
 *  splitOverlayLayerAt(layerId, t?) / duplicateOverlayLayer(layerId)
 *  setReelsEffect(id) / getReelsEffect() / setEffectClips(clips) / getEffectClips()
 *  setFilterByIndex(i) (no swipe in Reels)
 *
 *  ── POST ───────────────────────────────────────────────────────────────────
 *  setPostAspect('1:1' | '4:5' | '3:4' | '4:3'): void   default '4:5'; emits 'resize' + 'change'.
 *      Sizes (POST_ASPECT_SIZES): 1:1 1440×1440, 4:5 1152×1440, 3:4 1080×1440, 4:3 1440×1080.
 *  getPostAspect(): PostAspect
 *  Base photo: one-finger pan + pinch, always covers the frame (scale ≥ cover, no black gaps),
 *  rotation only via rotateMedia90().
 *  rotateMedia90(deg = 90) / flipMediaHorizontal() / flipMediaVertical() / resetMediaGeometry()
 *  setMediaTransform(partial) / getMediaTransform()   (clamped to cover)
 *  CanvasEngine.clampTransformToCover(transform, media, fitMode, w, h): LayerTransform  (pure helper)
 *  setPostAdjustments(partial) / resetPostAdjustments() / getPostAdjustments()
 *  exportImage(options?): Promise<Blob>   at the logical size (WebP by default)
 *
 *  ── UNDO / REDO (history hook lives in the UI) ─────────────────────────────
 *  snapshot(): EngineSnapshot      Opaque, in-memory. Overlays (incl. later-deleted ones), base
 *                                  media transform/adjustments/effects, clips, timings, filter,
 *                                  music, selection.
 *  restore(snapshot): boolean      false if mode or base media changed since the snapshot.
 *                                  Emits 'change' itself (ignore it in the history hook while restoring).
 *      Suggested hook: keep `committed = engine.snapshot()`; on every 'change' push `committed`
 *      to the undo stack and take a new one. Gestures produce exactly one 'change' at the end.
 *
 *  ── EVENTS: engine.on(event, fn) returns an unsubscribe fn; engine.off(event, fn) ─────
 *  'change'          []                      Structural / committed change: layers added/removed/
 *                                            reordered, clip list or clip data changed, a setting
 *                                            applied, or a gesture FINISHED. Never fires per pointermove.
 *  'transform'       [layer: BaseLayer|null] During a gesture, rAF-throttled (≤1 per frame) (D1).
 *  'select'          [layer: BaseLayer|null]
 *  'double-tap'      [layer?: BaseLayer]     undefined = empty canvas (open the text editor).
 *  'single-tap'      [layer: BaseLayer]      Tap on an already-selected overlay.
 *  'filter-swipe'    [direction: 'prev'|'next', filterName: string]   Story only (B13).
 *  'drag-move'       [info: DragInfo]        rAF-throttled. { layer, clientX, clientY (layer centre,
 *                                            NaN when not deletable), isDragging, deletable }.
 *  'drag-end'        [info: DragInfo]        Once per gesture end.
 *  'snap-guide'      [snap: SnapGuideState]
 *  'video-time'      [state: VideoState]     Play/pause/seek/clip-structure changes (not per frame).
 *  'video-progress'  [currentTime: number]   Per frame while playing, and after seeks.
 *  'sound-blocked'   [blocked: boolean]      See needsUserGestureForSound().
 *  'resize'          [{ width, height }]     Logical size changed (Post aspect).
 *  'music-change'    [music: StoryAudioMeta | null]
 *  'render'          []                      After each scheduled render (rarely needed).
 *
 *  ── CONSTANTS & TYPES ──────────────────────────────────────────────────────
 *  MAX_VIDEO_SEC = 60, VERTICAL_LOGICAL_SIZE, POST_ASPECT_SIZES, DEFAULT_POST_ASPECT,
 *  MAX_IMAGE_DECODE_PX = 4096, MEDIA_LOAD_TIMEOUT_MS = 15000,
 *  ShareMode, PostAspect, MediaLoadErrorCode, MediaLoadError, DragInfo, EngineSnapshot,
 *  VideoState, VideoTrackClip, OverlayTrackItem, StoryAudioMeta, MusicSegment, TextStyle,
 *  FontPreset, TextBgPreset, LayerTransform, FitMode, PostAdjustmentState,
 *  DEFAULT_POST_ADJUSTMENTS, ReelsEffectId, ReelsEffectClip, FILTER_PRESETS, FilterPreset.
 *  Utilities: generateVideoThumbnails, generatePhotoThumbnails, captureFramePreview,
 *  getMusicFadeGain, getMusicTimelineRange.
 *
 *  ── EXPORTER HOOKS (WP2 only, not for UI) ──────────────────────────────────
 *  setExportingVideo(on), isExporting(), getMediaLayer(), syncTemporalVisibility(t),
 *  drawBaseMedia(ctx, w, h, t, frame?), drawCachedOverlays(ctx, w, h, t), renderClean(ctx, w, h),
 *  renderAtTime(t), renderFrameAt(ctx, t, w?, h?), isPureStaticExport(), getLogicalSize().
 *
 *  ── DEPRECATED (kept for the pre-Phase-2 UI; do not use in new code) ───────
 *  updateCanvasResolution(w?, h?)  Ignored in Story/Reels; in Post a matching aspect maps to
 *                                  setPostAspect(). Logical size is never viewport/media-derived.
 *  loadMedia(src, type, autoResizeCanvas)  3rd argument ignored.
 *  EngineOptions.width / height    ignored.
 *  emit('change') from UI code      use updateText()/requestRender() instead.
 *  render()                         use requestRender().
 * ═══════════════════════════════════════════════════════════════════════════
 */
export * from './types';
export * from './Engine';
export * from './MediaSource';
export * from './layers/BaseLayer';
export * from './layers/MediaLayer';
export * from './layers/TextLayer';
export * from './layers/OverlayImageLayer';
export * from './layers/MusicStickerLayer';
export * from './interaction/InteractionManager';
export * from './exporter/ImageExporter';
// [START] CREATED BY Bedirhan
export * from './exporter/FastDemuxer';
export * from './exporter/VideoExporter';
export * from './exporter/MediaRecorderFallback';
export * from './utils/videoThumbs';
export * from './utils/musicFade';
export * from './utils/framePreview';
export * from './image-adjustments';
// [END] CREATED BY Bedirhan
