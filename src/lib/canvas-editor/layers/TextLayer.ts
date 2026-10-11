import { BaseLayer } from './BaseLayer';
import { Rect, TextStyle } from '../types';

export type FontPreset = 'modern' | 'neon' | 'typewriter' | 'classic' | 'heavy';
export type TextBgPreset = 'dark' | 'white' | 'color' | 'none';

export const FONT_PRESET_CONFIGS: Record<FontPreset, {
  name: string;
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | '600' | '800';
  fontStyle: 'normal' | 'italic';
  shadowColor?: string;
  shadowBlur?: number;
}> = {
  modern: {
    name: 'Modern',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontWeight: 'bold',
    fontStyle: 'normal',
    shadowColor: 'rgba(0, 0, 0, 0.6)',
    shadowBlur: 8,
  },
  neon: {
    name: 'Neon',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontWeight: '800',
    fontStyle: 'normal',
    shadowColor: '#10b981',
    shadowBlur: 20,
  },
  typewriter: {
    name: 'Daktilo',
    fontFamily: '"Courier New", Courier, monospace',
    fontWeight: 'bold',
    fontStyle: 'normal',
    shadowColor: 'transparent',
    shadowBlur: 0,
  },
  classic: {
    name: 'Klasik',
    fontFamily: 'Georgia, Cambria, serif',
    fontWeight: 'bold',
    fontStyle: 'italic',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowBlur: 6,
  },
  heavy: {
    name: 'Kalın',
    fontFamily: '"Arial Black", Impact, sans-serif',
    fontWeight: '800',
    fontStyle: 'normal',
    shadowColor: 'rgba(0, 0, 0, 0.8)',
    shadowBlur: 10,
  },
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  text: 'Yazı Ekleyin',
  fontSize: 48,
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  color: '#ffffff',
  fontWeight: 'bold',
  fontStyle: 'normal',
  textAlign: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  backgroundPadding: 18,
  borderRadius: 16,
  strokeColor: 'transparent',
  strokeWidth: 0,
  shadowColor: 'rgba(0, 0, 0, 0.6)',
  shadowBlur: 8,
};

export class TextLayer extends BaseLayer {
  public override type = 'text';
  public style: TextStyle;
  public fontPreset: FontPreset = 'modern';
  public bgPreset: TextBgPreset = 'dark';

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

  public setFontPreset(preset: FontPreset) {
    this.fontPreset = preset;
    const cfg = FONT_PRESET_CONFIGS[preset];
    this.style.fontFamily = cfg.fontFamily;
    this.style.fontWeight = cfg.fontWeight;
    this.style.fontStyle = cfg.fontStyle;
    this.style.shadowBlur = cfg.shadowBlur ?? 0;
    this.style.shadowColor = preset === 'neon' ? (this.style.color || '#10b981') : (cfg.shadowColor ?? 'transparent');
  }

  public cycleFontPreset(): FontPreset {
    const list: FontPreset[] = ['modern', 'neon', 'typewriter', 'classic', 'heavy'];
    const idx = list.indexOf(this.fontPreset);
    const next = list[(idx + 1) % list.length];
    this.setFontPreset(next);
    return next;
  }

  public setBgPreset(preset: TextBgPreset) {
    this.bgPreset = preset;
    if (preset === 'none') {
      this.style.backgroundColor = 'transparent';
    } else if (preset === 'dark') {
      this.style.backgroundColor = 'rgba(0, 0, 0, 0.72)';
    } else if (preset === 'white') {
      this.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
      if (this.style.color === '#ffffff') this.style.color = '#09090b';
    } else if (preset === 'color') {
      this.style.backgroundColor = this.style.color || '#10b981';
      this.style.color = '#ffffff';
    }
  }

  public cycleBgPreset(): TextBgPreset {
    const list: TextBgPreset[] = ['dark', 'white', 'none'];
    const idx = list.indexOf(this.bgPreset);
    const next = list[(idx + 1) % list.length];
    this.setBgPreset(next);
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

    const padding = this.style.backgroundColor && this.style.backgroundColor !== 'transparent'
      ? (this.style.backgroundPadding ?? 18)
      : 8;
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
    const padding = this.style.backgroundColor && this.style.backgroundColor !== 'transparent'
      ? (this.style.backgroundPadding ?? 18)
      : 8;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate((this.transform.rotation * Math.PI) / 180);
    ctx.scale(this.transform.scale, this.transform.scale);

    // 1. Instagram Story tarzı arka plan kutusu / hapı
    if (this.style.backgroundColor && this.style.backgroundColor !== 'transparent') {
      ctx.fillStyle = this.style.backgroundColor;
      const radius = this.style.borderRadius ?? 16;

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

    if (this.style.shadowColor && this.style.shadowBlur && this.style.shadowBlur > 0) {
      ctx.shadowColor = this.style.shadowColor;
      ctx.shadowBlur = this.style.shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
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

      // Stroke
      if (this.style.strokeColor && this.style.strokeWidth && this.style.strokeWidth > 0) {
        ctx.strokeStyle = this.style.strokeColor;
        ctx.lineWidth = this.style.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, lineX, lineY);
      }

      // Fill
      ctx.fillStyle = this.style.color;
      ctx.fillText(line, lineX, lineY);
    });

    ctx.restore();
  }
}
