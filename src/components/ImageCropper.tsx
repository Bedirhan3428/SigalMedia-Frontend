"use client";

import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { X, Check, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedFile: File, previewUrl: string) => void;
  onCancel: () => void;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<{ file: File; url: string } | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  const rotRad = (rotation * Math.PI) / 180;

  // Döndürülmüş görselin kaplama boyutları
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement("canvas");
  const croppedCtx = croppedCanvas.getContext("2d");

  if (!croppedCtx) {
    return null;
  }

  // Kırpılan görsel boyutu (512x512'ye ölçeklenebilir veya orijinal piksel)
  const targetSize = 512;
  croppedCanvas.width = targetSize;
  croppedCanvas.height = targetSize;

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetSize,
    targetSize
  );

  return new Promise((resolve) => {
    croppedCanvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], `avatar_${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        const url = URL.createObjectURL(blob);
        resolve({ file, url });
      },
      "image/jpeg",
      0.85
    );
  });
}

export default function ImageCropper({
  imageSrc,
  onCropComplete,
  onCancel,
}: ImageCropperProps) {
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = (newCrop: { x: number; y: number }) => {
    setCrop(newCrop);
  };

  const onZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  const onCropCompleteCallback = useCallback(
    (_croppedArea: Area, currentCroppedAreaPixels: Area) => {
      setCroppedAreaPixels(currentCroppedAreaPixels);
    },
    []
  );

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;

    try {
      setIsProcessing(true);
      const result = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation
      );
      if (result) {
        onCropComplete(result.file, result.url);
      }
    } catch (e) {
      console.error("Kırpma hatası:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none animate-in fade-in duration-150">
      {/* Üst Bar */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md pt-safe z-10">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="text-sm font-semibold text-zinc-400 hover:text-white p-2 -ml-2 rounded-xl transition-colors btn-press-subtle flex items-center gap-1.5"
        >
          <X className="w-5 h-5" />
          <span>İptal</span>
        </button>

        <h2 className="text-sm font-bold text-white">Fotoğrafı Kırp</h2>

        <button
          type="button"
          onClick={handleApplyCrop}
          disabled={isProcessing}
          className="text-sm font-bold text-emerald-400 hover:text-emerald-300 p-2 -mr-2 rounded-xl transition-colors btn-press-subtle flex items-center gap-1 disabled:opacity-50"
        >
          <Check className="w-5 h-5" />
          <span>Bitti</span>
        </button>
      </header>

      {/* react-easy-crop Kırpma Alanı */}
      <div className="relative flex-1 w-full h-full bg-black overflow-hidden">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onRotationChange={setRotation}
          onCropComplete={onCropCompleteCallback}
        />
      </div>

      {/* Alt Kontrol Çubuğu */}
      <footer className="p-4 bg-zinc-950/95 border-t border-zinc-900 flex flex-col gap-3 pb-[calc(1.2rem+env(safe-area-inset-bottom,0px))] z-10">
        <div className="max-w-xs mx-auto w-full flex items-center gap-4">
          <ZoomOut className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
          />
          <ZoomIn className="w-4 h-4 text-zinc-500 shrink-0" />

          <button
            type="button"
            onClick={handleRotate}
            title="Döndür"
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-colors btn-press-subtle ml-2"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
