// [START] CREATED BY Bedirhan
/**
 * Katman içeriğini (metin, gölge, arka plan) bir kez gizli tuvale çizip her karede
 * tek drawImage ile basmak için küçük önbellek. Önizleme ve export farklı çözünürlükte
 * çizdiğinden aynı anda iki girdi tutulur.
 */
const MAX_ENTRIES = 2;
const MAX_SIDE_PX = 4096;

export class LayerBitmapCache {
  private entries = new Map<string, HTMLCanvasElement>();

  public get(
    key: string,
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void
  ): HTMLCanvasElement | null {
    const hit = this.entries.get(key);
    if (hit) {
      // LRU: son kullanılanı sona taşı
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    if (typeof document === 'undefined') return null;
    // Fontlar yüklenirken önbelleğe alınırsa yedek fontla kalıcı çizim oluşur
    if (document.fonts && document.fonts.status === 'loading') return null;
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (w <= 0 || h <= 0 || w > MAX_SIDE_PX || h > MAX_SIDE_PX) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    draw(ctx);

    this.entries.set(key, canvas);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    return canvas;
  }

  public clear(): void {
    this.entries.clear();
  }
}
// [END] CREATED BY Bedirhan
