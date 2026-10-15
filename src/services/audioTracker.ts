import { doc, getDoc, setDoc, updateDoc, increment, Firestore } from 'firebase/firestore';
import { resolveActiveChunk, buildSongHeatmap } from '../utils/audioChunkMath';

const SHUTTLE_THRESHOLD = 5; // TAM 5. KULLANIMDA R2'YE ŞUTLA!

// 1. Şarkı seçildiğinde ısı haritasını ve patlayan yeri getir (Kesintisiz Çalma İçin Hata Güvenli)
export async function getSongHeatmapAndHotspot(db: Firestore, videoId: string, totalDuration: number) {
  try {
    const docRef = doc(db, 'audio_heatmap', videoId);
    const snap = await getDoc(docRef);
    const data = snap.exists() ? snap.data() : null;

    return buildSongHeatmap(totalDuration, data?.chunks);
  } catch (err) {
    console.warn('[audioTracker] Firestore heatmap read skipped gracefully:', err);
    return buildSongHeatmap(totalDuration);
  }
}

// 2. Gönderi paylaşılırken sayacı artır veya 5. kullanımda R2'ye şutla
export async function processSongShareAndGetUrl(
  db: Firestore,
  song: { id: string; title: string; artist: string; duration: number },
  selectedStartSec: number
): Promise<{
  audioUrl: string;
  chunkKey: string;
  start: number;
  end: number;
  isShuttled: boolean;
}> {
  const chunk = resolveActiveChunk(selectedStartSec, song.duration);
  const docRef = doc(db, 'audio_heatmap', song.id);

  try {
    const snap = await getDoc(docRef);

    const data = snap.exists() ? snap.data() : null;
    const existingChunk = data?.chunks?.[chunk.chunkKey];

    // DURUM 1: Zaten R2'ye şutlanmış! Firestore'a hiç yazma yapma (0 Maliyet), direkt R2 CDN linkini dön.
    if (existingChunk?.shuttled === true && existingChunk?.cdnUrl) {
      return {
        audioUrl: existingChunk.cdnUrl,
        chunkKey: chunk.chunkKey,
        start: chunk.start,
        end: chunk.end,
        isShuttled: true,
      };
    }

    const nextHits = (existingChunk?.hits || 0) + 1;

    // DURUM 2: 1., 2., 3. veya 4. kullanım -> Sadece Firestore sayacını +1 artır
    if (nextHits < SHUTTLE_THRESHOLD) {
      await setDoc(
        docRef,
        {
          videoId: song.id,
          title: song.title,
          artist: song.artist,
          totalDuration: song.duration,
          chunks: {
            [chunk.chunkKey]: {
              start: chunk.start,
              duration: chunk.duration,
              hits: increment(1),
              shuttled: false,
              cdnUrl: null,
            },
          },
        },
        { merge: true }
      );

      return {
        audioUrl: `/api/music/stream?id=${song.id}#t=${chunk.start},${chunk.end}`,
        chunkKey: chunk.chunkKey,
        start: chunk.start,
        end: chunk.end,
        isShuttled: false,
      };
    }
  } catch (firestoreErr) {
    console.warn('[audioTracker] Firestore share tracking skipped gracefully:', firestoreErr);
  }

  // DURUM 3: TAM 5. KULLANIM! Ses Servisine "R2'ye şutla!" emri ver
  try {
    const res = await fetch('/api/music/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: song.id,
        chunkKey: chunk.chunkKey,
        startTime: chunk.start,
        duration: chunk.duration,
      }),
    });

    const commitData = await res.json();

    if (commitData.success && commitData.audioUrl) {
      await updateDoc(docRef, {
        popularChunkKey: chunk.chunkKey,
        [`chunks.${chunk.chunkKey}.hits`]: SHUTTLE_THRESHOLD,
        [`chunks.${chunk.chunkKey}.shuttled`]: true,
        [`chunks.${chunk.chunkKey}.cdnUrl`]: commitData.audioUrl,
        [`chunks.${chunk.chunkKey}.shuttledAt`]: Date.now(),
      });

      return {
        audioUrl: commitData.audioUrl,
        chunkKey: chunk.chunkKey,
        start: chunk.start,
        end: chunk.end,
        isShuttled: true,
      };
    }
  } catch (err: unknown) {
    console.error('[SigalMedia] 5. kullanımda R2 şutlama hatası:', err);
  }

  // Fallback
  return {
    audioUrl: `/api/music/stream?id=${song.id}#t=${chunk.start},${chunk.end}`,
    chunkKey: chunk.chunkKey,
    start: chunk.start,
    end: chunk.end,
    isShuttled: false,
  };
}
