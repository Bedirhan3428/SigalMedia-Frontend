// [START] CREATED BY Bedirhan
import { StoryAudioMeta } from '../types';

/**
 * Müziğin timeline üzerindeki genel başlangıç / bitiş aralığı (segmentler varsa ilk-son segment)
 */
export function getMusicTimelineRange(
  meta: StoryAudioMeta,
  fallbackStart: number,
  fallbackEnd: number
): { start: number; end: number } {
  if (meta.segments && meta.segments.length > 0) {
    let start = Infinity;
    let end = -Infinity;
    for (const s of meta.segments) {
      if (s.timelineStart < start) start = s.timelineStart;
      if (s.timelineEnd > end) end = s.timelineEnd;
    }
    return { start, end };
  }
  const start = typeof meta.timelineStart === 'number' ? meta.timelineStart : fallbackStart;
  const end =
    typeof meta.timelineEnd === 'number' && meta.timelineEnd > start ? meta.timelineEnd : fallbackEnd;
  return { start, end };
}

/**
 * t anındaki fade çarpanı (0..1). Önizleme ve export aynı hesabı kullanır.
 */
export function getMusicFadeGain(
  meta: StoryAudioMeta,
  t: number,
  range: { start: number; end: number }
): number {
  const fadeIn = Math.max(0, meta.fadeIn || 0);
  const fadeOut = Math.max(0, meta.fadeOut || 0);
  let gain = 1;
  if (fadeIn > 0 && t < range.start + fadeIn) {
    gain = Math.min(gain, Math.max(0, (t - range.start) / fadeIn));
  }
  if (fadeOut > 0 && t > range.end - fadeOut) {
    gain = Math.min(gain, Math.max(0, (range.end - t) / fadeOut));
  }
  return gain;
}

/**
 * OfflineAudioContext GainNode'una fade zarfını uygular (segment kendi aralığında çalarken)
 */
export function applyMusicFadeToGain(
  gain: GainNode,
  meta: StoryAudioMeta,
  volume: number,
  segStart: number,
  segEnd: number,
  range: { start: number; end: number }
): void {
  const param = gain.gain;
  const hasFade = (meta.fadeIn || 0) > 0 || (meta.fadeOut || 0) > 0;
  if (!hasFade) {
    param.value = volume;
    return;
  }
  // Segment sınırları ve fade kırılma noktalarında zarfı örnekleyip doğrusal rampa kur
  const points = new Set<number>([segStart, segEnd]);
  const fadeInEnd = range.start + (meta.fadeIn || 0);
  const fadeOutStart = range.end - (meta.fadeOut || 0);
  if (fadeInEnd > segStart && fadeInEnd < segEnd) points.add(fadeInEnd);
  if (fadeOutStart > segStart && fadeOutStart < segEnd) points.add(fadeOutStart);
  const sorted = [...points].sort((a, b) => a - b);
  param.setValueAtTime(volume * getMusicFadeGain(meta, sorted[0], range), sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    param.linearRampToValueAtTime(volume * getMusicFadeGain(meta, sorted[i], range), sorted[i]);
  }
}
// [END] CREATED BY Bedirhan
