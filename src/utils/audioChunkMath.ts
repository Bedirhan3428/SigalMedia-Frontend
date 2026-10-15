export interface ChunkSlice {
  chunkKey: string; // "chunk_1", "chunk_4"
  index: number;    // 1, 2, 3...
  start: number;    // 0, 15, 30, 45...
  end: number;      // 15, 30, 45, 60...
  duration: number; // 15
  hits?: number;    // Firestore'dan gelen kullanım sayısı
  intensity?: number; // 0 ile 1 arası ısı yoğunluğu (UI'da renk/yükseklik için)
  isHotspot?: boolean; // "🔥 En Çok Kullanılan Kısım" mı?
}

export const CHUNK_SIZE = 15;

// 1. Şarkıyı 15 sn'lik dilimlere böl ve Firestore ısı verisiyle birleştir
export function buildSongHeatmap(
  totalDurationSec: number,
  firestoreChunks?: Record<string, { hits?: number; start?: number; duration?: number }>
): {
  slices: ChunkSlice[];
  hotspot: ChunkSlice; // Otomatik seçilecek en popüler kısım
} {
  const totalChunks = Math.ceil(totalDurationSec / CHUNK_SIZE);
  const slices: ChunkSlice[] = [];

  // En yüksek hit sayısını bul (yoğunluk hesabı için)
  let maxHits = 0;
  let bestChunkIndex = 0;

  for (let i = 0; i < totalChunks; i++) {
    const key = `chunk_${i + 1}`;
    const hits = firestoreChunks?.[key]?.hits || 0;
    if (hits > maxHits) {
      maxHits = hits;
      bestChunkIndex = i;
    }
  }

  // Eğer hiç kullanım yoksa (yeni şarkıysa), genelde nakarat şarkının %25-%30'uncu saniyesinde girer.
  // Varsayılan olarak 2. veya 3. chunk'ı (15. veya 30. sn) başlangıç önerisi yapabiliriz.
  if (maxHits === 0 && totalChunks > 2) {
    bestChunkIndex = 2; // 30. saniye
  }

  for (let i = 0; i < totalChunks; i++) {
    const chunkKey = `chunk_${i + 1}`;
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalDurationSec);
    const hits = firestoreChunks?.[chunkKey]?.hits || 0;

    slices.push({
      chunkKey,
      index: i + 1,
      start,
      end,
      duration: end - start,
      hits,
      intensity: maxHits > 0 ? hits / maxHits : 0,
      isHotspot: i === bestChunkIndex && maxHits > 0,
    });
  }

  return {
    slices,
    hotspot: slices[bestChunkIndex] || slices[0],
  };
}

// 2. Kullanıcının slider'da bıraktığı saniyenin hangi chunk'a düştüğünü bul
export function resolveActiveChunk(selectedStartSec: number, totalDurationSec: number): ChunkSlice {
  const idx = Math.floor(selectedStartSec / CHUNK_SIZE);
  const start = idx * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, totalDurationSec);

  return {
    chunkKey: `chunk_${idx + 1}`,
    index: idx + 1,
    start,
    end,
    duration: Math.max(end - start, 5),
  };
}

// 3. Seçilen 15 saniyelik dilime düşen şarkı sözlerini filtrele
export function filterLyricsForChunk(
  allLyrics: Array<{ startMs: number; endMs: number; text: string }>,
  chunkStartSec: number,
  chunkEndSec: number
) {
  const startMs = chunkStartSec * 1000;
  const endMs = chunkEndSec * 1000;

  return allLyrics.filter(
    (line) => line.endMs > startMs && line.startMs < endMs
  );
}
