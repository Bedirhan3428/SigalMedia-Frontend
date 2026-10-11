"use client";

import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { X, Check } from "lucide-react";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedFile: File, previewUrl: string) => void;
  onCancel: () => void;
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
  pixelCrop: Area
): Promise<{ file: File; url: string } | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  // Kare profil görsel boyutu (512x512)
  const targetSize = 512;
  canvas.width = targetSize;
  canvas.height = targetSize;

  ctx.drawImage(
    image,
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
    canvas.toBlob(
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
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropCompleteCallback = useCallback(
    (_croppedArea: Area, currentCroppedAreaPixels: Area) => {
      setCroppedAreaPixels(currentCroppedAreaPixels);
    },
    []
  );

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;

    try {
      setIsProcessing(true);
      const result = await getCroppedImg(imageSrc, croppedAreaPixels);
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
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none no-select animate-in fade-in duration-150"
    >
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

      {/* react-easy-crop Kırpma Alanı (Sabit Dik Açı, Döndürme ve Alt Bar Yok) */}
      <div className="relative flex-1 w-full h-full bg-black overflow-hidden pb-safe">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={0}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropCompleteCallback}
        />
      </div>
    </div>
  );
}
