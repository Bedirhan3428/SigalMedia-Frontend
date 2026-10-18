// [START] CREATED BY Bedirhan
// [MODIFIED BY Bedirhan]
import {
  DEFAULT_POST_ADJUSTMENTS,
  PostAdjustmentState,
  PostStudioFilterId,
  ReelsEffectClip,
  ReelsEffectId,
  Rect,
} from './types';

export interface PostStudioFilterConfig {
  id: PostStudioFilterId;
  name: string;
  cssFilter: string;
  tintColor?: string;
  tintOpacity?: number;
  blendMode?: GlobalCompositeOperation;
}

export const POST_STUDIO_FILTERS: PostStudioFilterConfig[] = [
  {
    id: 'none',
    name: 'Orijinal',
    cssFilter: 'none',
  },
  {
    id: 'cinematic',
    name: 'Sinematik',
    cssFilter: 'contrast(1.18) saturate(1.12) brightness(0.96)',
    tintColor: '#0c2d3a',
    tintOpacity: 0.16,
    blendMode: 'overlay',
  },
  {
    id: 'vintage_90s',
    name: 'Vintage 90s',
    cssFilter: 'sepia(0.32) contrast(0.92) brightness(1.04) saturate(0.88)',
    tintColor: '#3b2814',
    tintOpacity: 0.14,
    blendMode: 'screen',
  },
  {
    id: 'cold_nordic',
    name: 'Soğuk Nordic',
    cssFilter: 'saturate(0.78) contrast(1.1) brightness(1.02) hue-rotate(8deg)',
    tintColor: '#102a45',
    tintOpacity: 0.18,
    blendMode: 'soft-light',
  },
  {
    id: 'warm_portrait',
    name: 'Sıcak Portre',
    cssFilter: 'sepia(0.16) saturate(1.22) contrast(1.06) brightness(1.03)',
    tintColor: '#4a2511',
    tintOpacity: 0.14,
    blendMode: 'soft-light',
  },
  {
    id: 'mono_contrast',
    name: 'Mono Kontrast',
    cssFilter: 'grayscale(1) contrast(1.38) brightness(0.96)',
  },
  {
    id: 'fade_film',
    name: 'Soluk Film',
    cssFilter: 'contrast(0.82) brightness(1.08) saturate(0.85)',
    tintColor: '#23202a',
    tintOpacity: 0.18,
    blendMode: 'lighten',
  },
];

export interface ReelsEffectConfig {
  id: ReelsEffectId;
  name: string;
  color: string;
}

export const REELS_EFFECT_PRESETS: ReelsEffectConfig[] = [
  { id: 'none', name: 'Yok', color: '#71717a' },
  { id: 'glitch', name: 'Glitch', color: '#ec4899' },
  { id: 'zoom_pulse', name: 'Zoom Darbe', color: '#8b5cf6' },
  { id: 'flash', name: 'Flaş Vuruş', color: '#f59e0b' },
  { id: 'shake', name: 'Sarsıntı', color: '#10b981' },
  { id: 'rgb_shift', name: 'RGB Kayma', color: '#06b6d4' },
  { id: 'cyber_neon', name: 'Cyber Neon', color: '#d946ef' },
  { id: 'cinema_warm', name: 'Sinema', color: '#f97316' },
  { id: 'vhs_grain', name: 'VHS Gren', color: '#a855f7' },
];

// [MODIFIED BY Bedirhan]
export class ImageAdjustmentsEngine {
  private static grainCanvas: HTMLCanvasElement | null = null;

  /**
   * Önceden üretilmiş (pre-rendered) tek bir offscreen noise canvas döndürür.
   * getImageData / putImageData CPU piksel döngüsü kullanmadan GPU 2D primitifleriyle bir kez üretilir ve önbelleğe alınır.
   */
  public static getGrainCanvas(): HTMLCanvasElement | null {
    if (this.grainCanvas) return this.grainCanvas;
    if (typeof document === 'undefined') return null;

    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Nötr %50 gri taban (overlay modunda nötr görünmez taban)
    ctx.fillStyle = 'rgb(128,128,128)';
    ctx.fillRect(0, 0, size, size);

    // Tek seferlik deterministik film greni dokusu
    let seed = 1337;
    const nextRand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 1800; i++) {
      const x = (nextRand() * size) | 0;
      const y = (nextRand() * size) | 0;
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < 1800; i++) {
      const x = (nextRand() * size) | 0;
      const y = (nextRand() * size) | 0;
      ctx.fillRect(x, y, 1, 1);
    }

    this.grainCanvas = canvas;
    return canvas;
  }

  public static isDefaultAdjustments(adj?: PostAdjustmentState | null): boolean {
    if (!adj) return true;
    return (
      adj.brightness === 0 &&
      adj.contrast === 0 &&
      adj.saturation === 0 &&
      adj.warmth === 0 &&
      adj.vignette === 0 &&
      adj.sharpness === 0 &&
      adj.grain === 0 &&
      adj.lightLeak === 0 &&
      adj.bokehGlow === 0 &&
      adj.filterPreset === 'none'
    );
  }

  /**
   * Parlaklık, kontrast, doygunluk ve sıcaklık (warmth) işlemlerini
   * doğrudan GPU hızlandırmalı tek bir Canvas 2D `ctx.filter` string birleştirmesiyle üretir.
   */
  public static buildCssFilter(
    adj: PostAdjustmentState,
    baseFilter = 'none',
    activeEffects: Array<{ effect: ReelsEffectId; weight: number }> = []
  ): string {
    const parts: string[] = [];
    if (baseFilter && baseFilter !== 'none') {
      parts.push(baseFilter);
    }

    const b = Math.max(0.2, 1 + adj.brightness / 150);
    const c = Math.max(0.2, 1 + adj.contrast / 130 + adj.sharpness / 260);
    const warmSatBoost = adj.warmth !== 0 ? (adj.warmth / 100) * 0.14 : 0;
    const s = Math.max(0, 1 + adj.saturation / 100 + warmSatBoost);

    if (Math.abs(b - 1) > 0.005) parts.push(`brightness(${b.toFixed(3)})`);
    if (Math.abs(c - 1) > 0.005) parts.push(`contrast(${c.toFixed(3)})`);
    if (Math.abs(s - 1) > 0.005) parts.push(`saturate(${s.toFixed(3)})`);

    // Sıcaklık (Warmth): GPU filter birleştirmesi (sepia + hue-rotate)
    if (adj.warmth > 0.5) {
      const sepiaAmt = (adj.warmth / 100) * 0.32;
      const hueDeg = -(adj.warmth / 100) * 6;
      parts.push(`sepia(${sepiaAmt.toFixed(3)}) hue-rotate(${hueDeg.toFixed(1)}deg)`);
    } else if (adj.warmth < -0.5) {
      const hueDeg = (adj.warmth / 100) * 22;
      parts.push(`hue-rotate(${hueDeg.toFixed(1)}deg)`);
    }

    if (adj.bokehGlow > 2) {
      const blurPx = ((adj.bokehGlow / 100) * 3.5).toFixed(2);
      parts.push(`blur(${blurPx}px)`);
    }

    const studioPreset = POST_STUDIO_FILTERS.find((f) => f.id === adj.filterPreset);
    if (studioPreset && studioPreset.cssFilter !== 'none') {
      parts.push(studioPreset.cssFilter);
    }

    for (let i = 0; i < activeEffects.length; i++) {
      const item = activeEffects[i];
      if (item.effect === 'cyber_neon') {
        parts.push(
          `saturate(${(1 + 0.65 * item.weight).toFixed(2)}) contrast(${(1 + 0.22 * item.weight).toFixed(2)}) hue-rotate(${Math.round(-18 * item.weight)}deg)`
        );
      } else if (item.effect === 'cinema_warm') {
        parts.push(
          `sepia(${(0.26 * item.weight).toFixed(2)}) contrast(${(1 + 0.18 * item.weight).toFixed(2)}) saturate(${(1 + 0.2 * item.weight).toFixed(2)})`
        );
      }
    }

    return parts.length > 0 ? parts.join(' ') : 'none';
  }

  public static resolveActiveEffects(
    reelsEffect: ReelsEffectId,
    effectClips: ReelsEffectClip[] | undefined,
    timeSec: number
  ): Array<{ effect: ReelsEffectId; weight: number }> {
    const active: Array<{ effect: ReelsEffectId; weight: number }> = [];
    if (effectClips && effectClips.length > 0) {
      for (let i = 0; i < effectClips.length; i++) {
        const clip = effectClips[i];
        if (
          clip.effect !== 'none' &&
          timeSec >= clip.startTime - 0.01 &&
          timeSec <= clip.endTime + 0.01
        ) {
          active.push({
            effect: clip.effect,
            weight: Math.max(0.1, Math.min(1, (clip.intensity ?? 80) / 100)),
          });
        }
      }
    } else if (reelsEffect !== 'none') {
      active.push({ effect: reelsEffect, weight: 0.85 });
    }
    return active;
  }

  public static renderAdjustedMedia(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    box: Rect,
    adjustments?: PostAdjustmentState | null,
    reelsEffect: ReelsEffectId = 'none',
    timeSec = 0,
    baseFilter = 'none',
    effectClips?: ReelsEffectClip[]
  ): void {
    const adj = adjustments || DEFAULT_POST_ADJUSTMENTS;
    const activeEffects = this.resolveActiveEffects(reelsEffect, effectClips, timeSec);
    const combinedFilter = this.buildCssFilter(adj, baseFilter, activeEffects);

    ctx.save();
    ctx.filter = combinedFilter;

    // Reels Dinamik Hareket Efektleri (Zoom Pulse & Kamera Sarsıntısı)
    for (let i = 0; i < activeEffects.length; i++) {
      const { effect, weight } = activeEffects[i];
      if (effect === 'zoom_pulse') {
        const pulse = 1 + Math.sin(timeSec * Math.PI * 4.2) * (0.055 * weight);
        ctx.scale(pulse, pulse);
      } else if (effect === 'shake') {
        const dx = Math.sin(timeSec * 46) * (14 * weight);
        const dy = Math.cos(timeSec * 39) * (10 * weight);
        ctx.translate(dx, dy);
      }
    }

    // Tek geçişli GPU hızlandırmalı ana çizim (parlaklık + kontrast + doygunluk + sıcaklık + filtre)
    ctx.drawImage(source, box.x, box.y, box.width, box.height);
    ctx.filter = 'none';

    // 1. Stüdyo Filtre Tonlaması (Tint)
    const studioPreset = POST_STUDIO_FILTERS.find((f) => f.id === adj.filterPreset);
    if (studioPreset?.tintColor && studioPreset.tintOpacity) {
      ctx.save();
      ctx.globalCompositeOperation = studioPreset.blendMode || 'overlay';
      ctx.globalAlpha = studioPreset.tintOpacity;
      ctx.fillStyle = studioPreset.tintColor;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.restore();
    }

    // 2. Işık Sızıntısı (Light Leak)
    if (adj.lightLeak > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = (adj.lightLeak / 100) * 0.55;
      const leakGrad = ctx.createLinearGradient(
        box.x,
        box.y,
        box.x + box.width * 0.75,
        box.y + box.height * 0.65
      );
      leakGrad.addColorStop(0, 'rgba(255, 94, 36, 0.85)');
      leakGrad.addColorStop(0.35, 'rgba(255, 186, 56, 0.45)');
      leakGrad.addColorStop(0.7, 'rgba(236, 72, 153, 0.15)');
      leakGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = leakGrad;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.restore();
    }

    // 3. Vignette (radialGradient)
    if (adj.vignette > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const maxR = Math.hypot(box.width, box.height) * 0.55;
      const innerR = maxR * Math.max(0.2, 0.75 - (adj.vignette / 100) * 0.35);
      const vigGrad = ctx.createRadialGradient(0, 0, innerR, 0, 0, maxR);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, `rgba(0,0,0,${((adj.vignette / 100) * 0.85).toFixed(3)})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.restore();
    }

    // 4. Grain: Önceden üretilmiş (pre-rendered) tek bir offscreen noise canvas'ı globalCompositeOperation = 'overlay' ile bas
    let vhsWeight = 0;
    for (let i = 0; i < activeEffects.length; i++) {
      if (activeEffects[i].effect === 'vhs_grain') {
        vhsWeight = Math.max(vhsWeight, activeEffects[i].weight);
      }
    }
    const effectiveGrain = vhsWeight > 0 ? Math.max(adj.grain, Math.round(65 * vhsWeight)) : adj.grain;
    if (effectiveGrain > 2) {
      const gCanvas = this.getGrainCanvas();
      if (gCanvas) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = (effectiveGrain / 100) * 0.35;
        ctx.drawImage(gCanvas, box.x, box.y, box.width, box.height);
        ctx.restore();
      }
    }

    // 5. Reels Efektleri: Glitch / RGB Shift / Flash / Cyber Neon
    for (let i = 0; i < activeEffects.length; i++) {
      const { effect, weight } = activeEffects[i];
      if (effect === 'rgb_shift' || effect === 'glitch') {
        const offset =
          effect === 'glitch'
            ? Math.sin(timeSec * 34) * (14 * weight)
            : 8 * weight;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.32 * weight;
        ctx.drawImage(source, box.x - offset, box.y, box.width, box.height);
        ctx.drawImage(source, box.x + offset, box.y, box.width, box.height);
        ctx.restore();
      } else if (effect === 'flash') {
        const flashAlpha = Math.max(0, Math.sin(timeSec * Math.PI * 5)) * (0.48 * weight);
        if (flashAlpha > 0.015) {
          ctx.save();
          ctx.fillStyle = `rgba(255,255,255,${flashAlpha.toFixed(3)})`;
          ctx.fillRect(box.x, box.y, box.width, box.height);
          ctx.restore();
        }
      } else if (effect === 'cyber_neon') {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.22 * weight;
        const neonGrad = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
        neonGrad.addColorStop(0, '#ec4899');
        neonGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.4)');
        neonGrad.addColorStop(1, '#8b5cf6');
        ctx.fillStyle = neonGrad;
        ctx.fillRect(box.x, box.y, box.width, box.height);
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
// [END] CREATED BY Bedirhan
