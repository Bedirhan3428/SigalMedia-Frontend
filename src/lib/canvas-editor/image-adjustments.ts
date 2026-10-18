// [START] CREATED BY Bedirhan
import {
  DEFAULT_POST_ADJUSTMENTS,
  PostAdjustmentState,
  PostStudioFilterId,
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
}

export const REELS_EFFECT_PRESETS: ReelsEffectConfig[] = [
  { id: 'none', name: 'Yok' },
  { id: 'glitch', name: 'Glitch' },
  { id: 'zoom_pulse', name: 'Zoom' },
  { id: 'flash', name: 'Flash' },
  { id: 'rgb_shift', name: 'RGB Kayma' },
  { id: 'vhs_grain', name: 'VHS Gren' },
];

export class ImageAdjustmentsEngine {
  private static grainCanvas: HTMLCanvasElement | null = null;

  private static getGrainCanvas(): HTMLCanvasElement | null {
    if (this.grainCanvas) return this.grainCanvas;
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(128, 128);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
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

  public static buildCssFilter(adj: PostAdjustmentState): string {
    const parts: string[] = [];

    const b = Math.max(0.2, 1 + adj.brightness / 150);
    const c = Math.max(0.2, 1 + adj.contrast / 130 + adj.sharpness / 350);
    const s = Math.max(0, 1 + adj.saturation / 100);

    if (Math.abs(b - 1) > 0.005) parts.push(`brightness(${b.toFixed(3)})`);
    if (Math.abs(c - 1) > 0.005) parts.push(`contrast(${c.toFixed(3)})`);
    if (Math.abs(s - 1) > 0.005) parts.push(`saturate(${s.toFixed(3)})`);

    if (adj.warmth > 0) {
      const sepiaAmt = (adj.warmth / 100) * 0.28;
      parts.push(`sepia(${sepiaAmt.toFixed(3)})`);
    } else if (adj.warmth < 0) {
      const hueShift = (adj.warmth / 100) * 18;
      parts.push(`hue-rotate(${hueShift.toFixed(1)}deg)`);
    }

    const studioPreset = POST_STUDIO_FILTERS.find((f) => f.id === adj.filterPreset);
    if (studioPreset && studioPreset.cssFilter !== 'none') {
      parts.push(studioPreset.cssFilter);
    }

    return parts.length > 0 ? parts.join(' ') : 'none';
  }

  public static renderAdjustedMedia(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    box: Rect,
    adjustments?: PostAdjustmentState | null,
    reelsEffect: ReelsEffectId = 'none',
    timeSec = 0
  ): void {
    const adj = adjustments || DEFAULT_POST_ADJUSTMENTS;
    const baseFilter = this.buildCssFilter(adj);

    ctx.save();
    if (baseFilter !== 'none') {
      ctx.filter = baseFilter;
    }

    // Reels Dinamik Hareket Efektleri (Zoom Pulse)
    if (reelsEffect === 'zoom_pulse') {
      const pulse = 1 + Math.sin(timeSec * Math.PI * 3.5) * 0.035;
      ctx.scale(pulse, pulse);
    }

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

    // 2. Sıcaklık (Warmth / Temperature) Renk Katmanı
    if (Math.abs(adj.warmth) > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = (Math.abs(adj.warmth) / 100) * 0.28;
      ctx.fillStyle = adj.warmth > 0 ? '#ff8a1e' : '#2589ff';
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.restore();
    }

    // 3. Keskinlik (Sharpness) Mikro Kontrast Katmanı
    if (adj.sharpness > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = (adj.sharpness / 100) * 0.22;
      ctx.filter = 'contrast(1.45) grayscale(1)';
      ctx.drawImage(source, box.x, box.y, box.width, box.height);
      ctx.restore();
    }

    // 4. Yumuşak Odak (Bokeh Glow)
    if (adj.bokehGlow > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = (adj.bokehGlow / 100) * 0.35;
      ctx.filter = `blur(${Math.max(2, (adj.bokehGlow / 100) * 14).toFixed(1)}px) brightness(1.1)`;
      ctx.drawImage(source, box.x, box.y, box.width, box.height);
      ctx.restore();
    }

    // 5. Işık Sızıntısı (Light Leak)
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

    // 6. Vinyet (Kenar Karartma)
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

    // 7. Film Greni (Grain) veya VHS Gren
    const effectiveGrain = reelsEffect === 'vhs_grain' ? Math.max(adj.grain, 45) : adj.grain;
    if (effectiveGrain > 2) {
      const gCanvas = this.getGrainCanvas();
      if (gCanvas) {
        const pattern = ctx.createPattern(gCanvas, 'repeat');
        if (pattern) {
          ctx.save();
          ctx.globalCompositeOperation = 'overlay';
          ctx.globalAlpha = (effectiveGrain / 100) * 0.22;
          ctx.fillStyle = pattern;
          ctx.fillRect(box.x, box.y, box.width, box.height);
          ctx.restore();
        }
      }
    }

    // 8. Reels Efektleri: Glitch / RGB Shift / Flash
    if (reelsEffect === 'rgb_shift' || reelsEffect === 'glitch') {
      const offset = reelsEffect === 'glitch'
        ? Math.sin(timeSec * 28) * 10
        : 6;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28;
      ctx.drawImage(source, box.x - offset, box.y, box.width, box.height);
      ctx.drawImage(source, box.x + offset, box.y, box.width, box.height);
      ctx.restore();
    } else if (reelsEffect === 'flash') {
      const flashAlpha = Math.max(0, Math.sin(timeSec * Math.PI * 4)) * 0.35;
      if (flashAlpha > 0.02) {
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha.toFixed(3)})`;
        ctx.fillRect(box.x, box.y, box.width, box.height);
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
// [END] CREATED BY Bedirhan
