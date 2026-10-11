export interface ExportImageOptions {
  mimeType?: 'image/webp' | 'image/png' | 'image/jpeg';
  quality?: number;
  width?: number;
  height?: number;
}

export class ImageExporter {
  public static async exportToBlob(
    canvas: HTMLCanvasElement,
    renderCleanFn: (targetCtx: CanvasRenderingContext2D, width: number, height: number) => void,
    options?: ExportImageOptions
  ): Promise<Blob> {
    const mimeType = options?.mimeType || 'image/jpeg';
    const quality = options?.quality ?? 0.92;

    const exportW = options?.width || canvas.width;
    const exportH = options?.height || canvas.height;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create export canvas context');

    renderCleanFn(ctx, exportW, exportH);

    return new Promise((resolve, reject) => {
      exportCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to generate image blob'));
        },
        mimeType,
        quality
      );
    });
  }

  public static downloadBlob(blob: Blob, filename = 'sigalmedia_tasarim.jpg') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10000);
  }
}
