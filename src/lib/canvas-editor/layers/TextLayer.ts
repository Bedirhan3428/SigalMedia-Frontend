import { BaseLayer } from './BaseLayer';
import { Rect, TextStyle, FontPreset, TextBgPreset } from '../types';

export { type FontPreset, type TextBgPreset };

export const FONT_PRESET_CONFIGS: Record<FontPreset, {
  name: string;
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | '600' | '700' | '800';
  fontStyle: 'normal' | 'italic';
  shadowColor?: string;
  shadowBlur?: number;
}> = {
  modern: {
    name: 'Modern',
    fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: '800',
    fontStyle: 'normal',
    shadowColor: 'transparent',
    shadowBlur: 0,
  },
  classic: {
    name: 'Klasik',
    fontFamily: "'Playfair Display', Didot, 'Cinzel', Georgia, serif",
    fontWeight: '700',
    fontStyle: 'italic',
    shadowColor: 'transparent',
    shadowBlur: 0,
  },
  neon: {
    name: 'Neon',
    fontFamily: "'Caveat', 'Outfit', cursive, sans-serif",
    fontWeight: '700',
    fontStyle: 'normal',
    shadowColor: '#10b981',
    shadowBlur: 24,
  },
  typewriter: {
    name: 'Daktilo',
    fontFamily: "'Space Mono', 'SF Mono', 'Courier New', monospace",
    fontWeight: '700',
    fontStyle: 'normal',
    shadowColor: 'transparent',
    shadowBlur: 0,
  },
  heavy: {
    name: 'Güçlü',
    fontFamily: "'Bebas Neue', 'Impact', sans-serif",
    fontWeight: '700',
    fontStyle: 'normal',
    shadowColor: 'transparent',
    shadowBlur: 0,
  },
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  text: 'Yazı Ekleyin',
  fontSize: 52,
  fontFamily: "'Outfit', 'Google Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  color: '#ffffff',
  fontWeight: '800',
  fontStyle: 'normal',
  textAlign: 'center',
  backgroundColor: '#000000',
  backgroundPadding: 16,
  borderRadius: 12,
  strokeColor: 'transparent',
  strokeWidth: 0,
  shadowColor: 'transparent',
  shadowBlur: 0,
};

export class TextLayer extends BaseLayer {
  public override type = 'text';
  public style: TextStyle;
  public fontPreset: FontPreset = 'modern';
  public bgPreset: TextBgPreset = 'solid';

  constructor(options?: {
    id?: string;
    style?: Partial<TextStyle>;
    fontPreset?: FontPreset;
    bgPreset?: TextBgPreset;
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
  }) {
    super({
      id: options?.id,
      transform: {
        x: options?.x ?? 0.5,
        y: options?.y ?? 0.5,
        scale: options?.scale ?? 1.0,
        rotation: options?.rotation ?? 0
      }
    });

    this.style = {
      ...DEFAULT_TEXT_STYLE,
      ...(options?.style || {})
    };

    if (options?.fontPreset) {
      this.setFontPreset(options.fontPreset);
    }
    if (options?.bgPreset) {
      this.setBgPreset(options.bgPreset);
    }
  }

  public setStyle(newStyle: Partial<TextStyle>) {
    this.style = { ...this.style, ...newStyle };
  }

  public setText(text: string) {
    this.style.text = text;
  }

  public setFontPreset(preset: FontPreset, onRender?: () => void) {
    this.fontPreset = preset;
    const cfg = FONT_PRESET_CONFIGS[preset];
    this.style.fontFamily = cfg.fontFamily;
    this.style.fontWeight = cfg.fontWeight;
    this.style.fontStyle = cfg.fontStyle;
    if (preset === 'neon' || this.bgPreset === 'neon') {
      this.style.shadowBlur = 24;
      this.style.shadowColor = this.style.color || '#10b981';
    } else {
      this.style.shadowBlur = cfg.shadowBlur ?? 0;
      this.style.shadowColor = cfg.shadowColor ?? 'transparent';
    }

    if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
      const primaryFont = cfg.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      document.fonts.load(`${cfg.fontWeight} 48px "${primaryFont}"`).then(() => {
        onRender?.();
      }).catch(() => {});
    }
  }

  public pulseScale = 1.0;
  private pulseAnimId: number | null = null;

  /**
   * Tıklandığında çok hafif ve zarif mikro stil animasyonu (%1.5 büyüme, 130ms)
   */
  public triggerStylePulse(onRender?: () => void) {
    if (this.pulseAnimId !== null) {
      cancelAnimationFrame(this.pulseAnimId);
      this.pulseAnimId = null;
    }
    const startTime = performance.now();
    const duration = 130; // ms
    const maxScale = 1.015; // Çok daha hafif ve küçük büyüme

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Sinüs eğrisiyle akıcı, yumuşak mikro yaylanma
      const pop = Math.sin(progress * Math.PI) * (maxScale - 1.0);
      this.pulseScale = 1.0 + pop;
      onRender?.();

      if (progress < 1) {
        this.pulseAnimId = requestAnimationFrame(animate);
      } else {
        this.pulseScale = 1.0;
        this.pulseAnimId = null;
        onRender?.();
      }
    };
    this.pulseAnimId = requestAnimationFrame(animate);
  }

  /**
   * 5 Ana Arketip Arasında Döngü:
   * Modern ➔ Klasik ➔ Neon ➔ Daktilo ➔ Güçlü
   */
  public cycleFontPreset(onRender?: () => void): FontPreset {
    const list: FontPreset[] = ['modern', 'classic', 'neon', 'typewriter', 'heavy'];
    const idx = list.indexOf(this.fontPreset);
    const next = list[(idx + 1) % list.length];
    this.setFontPreset(next, onRender);
    this.triggerStylePulse(onRender);
    return next;
  }

  /**
   * 4 Arka Plan Hapı Modu:
   * Saf Yazı (none) ➔ Tam Dolgulu Kutu (solid) ➔ Yarı Saydam Buzlu Kutu (translucent) ➔ Neon Dış Parlama (neon)
   */
  public setBgPreset(preset: TextBgPreset) {
    this.bgPreset = preset;
    if (preset === 'none') {
      this.style.backgroundColor = 'transparent';
      this.style.shadowBlur = 6;
      this.style.shadowColor = 'rgba(0, 0, 0, 0.6)';
    } else if (preset === 'solid') {
      this.style.backgroundColor = '#000000';
      this.style.shadowBlur = 0;
      this.style.shadowColor = 'transparent';
    } else if (preset === 'translucent') {
      this.style.backgroundColor = 'rgba(0, 0, 0, 0.55)';
      this.style.shadowBlur = 0;
      this.style.shadowColor = 'transparent';
    } else if (preset === 'neon') {
      this.style.backgroundColor = 'transparent';
      this.style.shadowBlur = 24;
      this.style.shadowColor = this.style.color || '#10b981';
    }
  }

  public cycleBgPreset(onRender?: () => void): TextBgPreset {
    const list: TextBgPreset[] = ['none', 'solid', 'translucent', 'neon'];
    const idx = list.indexOf(this.bgPreset);
    const next = list[(idx + 1) % list.length];
    this.setBgPreset(next);
    this.triggerStylePulse(onRender);
    return next;
  }

  private getFontString(): string {
    return `${this.style.fontStyle} ${this.style.fontWeight} ${this.style.fontSize}px ${this.style.fontFamily}`;
  }

  public override getBoundingBox(ctx: CanvasRenderingContext2D, _canvasWidth: number, _canvasHeight: number): Rect {
    ctx.save();
    ctx.font = this.getFontString();

    const lines = this.style.text.split('\n');
    let maxLineWidth = 0;
    const lineHeight = this.style.fontSize * 1.25;

    for (const line of lines) {
      const metrics = ctx.measureText(line || ' ');
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    }
    ctx.restore();

    const hasBg = this.bgPreset === 'solid' || this.bgPreset === 'translucent';
    const padding = hasBg ? (this.style.backgroundPadding ?? 18) : 8;
    const totalW = maxLineWidth + padding * 2;
    const totalH = lines.length * lineHeight + padding * 2;

    return {
      x: -totalW / 2,
      y: -totalH / 2,
      width: totalW,
      height: totalH
    };
  }

  public override render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.visible || !this.style.text) return;

    const center = this.getPixelPosition(canvasWidth, canvasHeight);
    const bounds = this.getBoundingBox(ctx, canvasWidth, canvasHeight);
    const lines = this.style.text.split('\n');
    const lineHeight = this.style.fontSize * 1.25;
    const hasBg = this.bgPreset === 'solid' || this.bgPreset === 'translucent';
    const padding = hasBg ? (this.style.backgroundPadding ?? 18) : 8;

    ctx.save();
    // 0. Story filtrelerinden kesinlikle etkilenmesin (Metin her zaman berrak ve net kalır)
    ctx.filter = 'none';

    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    const interactionScale = this.isInteracting ? 1.015 : 1.0;
    const finalScale = this.transform.scale * interactionScale * this.pulseScale;
    ctx.scale(finalScale, finalScale);

    // 1. Arka Plan Kutusu (Solid veya Translucent)
    if (hasBg && this.style.backgroundColor && this.style.backgroundColor !== 'transparent') {
      ctx.fillStyle = this.style.backgroundColor;
      const baseRadius = (this.style.borderRadius !== undefined && this.style.borderRadius !== 9999)
        ? this.style.borderRadius
        : 12;
      const scaledRadius = Math.round(baseRadius * (canvasWidth / 414));
      const maxRadius = Math.min(bounds.width / 2, bounds.height / 2);
      const radius = Math.min(maxRadius, scaledRadius);

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height, radius);
      } else {
        ctx.rect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height);
      }
      ctx.fill();
    }

    // 2. Metin Font & Stil Yapılandırması
    ctx.font = this.getFontString();
    ctx.textAlign = this.style.textAlign;
    ctx.textBaseline = 'middle';

    const isNeon = this.fontPreset === 'neon' || this.bgPreset === 'neon';
    if (isNeon) {
      ctx.shadowColor = this.style.color || '#10b981';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (this.bgPreset === 'none') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // 3. Her satırı çiz
    const startY = -bounds.height / 2 + padding + lineHeight / 2;

    lines.forEach((line, index) => {
      const lineY = startY + index * lineHeight;
      let lineX = 0;
      if (this.style.textAlign === 'left') {
        lineX = -bounds.width / 2 + padding;
      } else if (this.style.textAlign === 'right') {
        lineX = bounds.width / 2 - padding;
      }

      // Neon modunda çift baskı (parlama yoğunluğu için)
      if (isNeon) {
        ctx.save();
        ctx.shadowBlur = 32;
        ctx.fillStyle = this.style.color;
        ctx.fillText(line, lineX, lineY);
        ctx.restore();
      }

      ctx.fillStyle = this.style.color;
      ctx.fillText(line, lineX, lineY);
    });

    ctx.restore();
  }
}
