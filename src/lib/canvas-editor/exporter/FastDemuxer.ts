// [START] CREATED BY Bedirhan & Ali
/**
 * FastDemuxer.ts
 * Sıfır bağımlılıklı (Zero-Dependency), ultra hızlı ISO-BMFF (MP4 / MOV) paket sökücü (Demuxer).
 * Kaynak videoyu GOP (I-Frame -> P/B-Frame) sırasını bozmadan okuyarak
 * WebCodecs VideoDecoder için sıralı EncodedVideoChunk akışı üretir.
 */

export interface DemuxedSample {
  offset: number;
  size: number;
  dtsUs: number;
  ptsUs: number;
  timestampUs: number;
  durationUs: number;
  isKeyframe: boolean;
  data: Uint8Array;
}

export interface DemuxedVideoTrack {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  width: number;
  height: number;
  description: Uint8Array;
  durationSec: number;
  fps: number;
  samples: DemuxedSample[];
  /** tkhd matrisinden okunan görüntüleme açısı (0 | 90 | 180 | 270) */
  rotation: number;
  /** Edit list (elst) kaynaklı PTS kayması: presentationUs = ptsUs - ptsOffsetUs */
  ptsOffsetUs: number;
}

interface BoxRef {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  contentOffset: number;
  contentSize: number;
}

export class FastDemuxer {
  private static readFourCC(view: DataView, offset: number): string {
    return String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
  }

  private static parseBoxes(
    view: DataView,
    startOffset: number,
    endOffset: number
  ): BoxRef[] {
    const boxes: BoxRef[] = [];
    let offset = startOffset;

    while (offset + 8 <= endOffset) {
      let size = view.getUint32(offset, false);
      const type = this.readFourCC(view, offset + 4);
      let headerSize = 8;

      if (size === 1) {
        if (offset + 16 > endOffset) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        size = high * 4294967296 + low;
        headerSize = 16;
      } else if (size === 0) {
        size = endOffset - offset;
      }

      if (size < headerSize || offset + size > endOffset) {
        break;
      }

      boxes.push({
        type,
        offset,
        size,
        headerSize,
        contentOffset: offset + headerSize,
        contentSize: size - headerSize,
      });

      offset += size;
    }

    return boxes;
  }

  private static findBox(
    view: DataView,
    startOffset: number,
    endOffset: number,
    type: string
  ): BoxRef | null {
    const boxes = this.parseBoxes(view, startOffset, endOffset);
    return boxes.find((b) => b.type === type) || null;
  }

  private static toHexByte(n: number): string {
    return n.toString(16).padStart(2, '0');
  }

  public static demux(buffer: ArrayBuffer): DemuxedVideoTrack | null {
    try {
      const view = new DataView(buffer);
      const topBoxes = this.parseBoxes(view, 0, buffer.byteLength);

      // Fragmented MP4 (moof) varsa standart stbl tablosu boş olacağından fallback'e devret
      if (topBoxes.some((b) => b.type === 'moof')) {
        return null;
      }

      const moov = topBoxes.find((b) => b.type === 'moov');
      if (!moov) return null;

      const moovChildren = this.parseBoxes(
        view,
        moov.contentOffset,
        moov.offset + moov.size
      );
      const traks = moovChildren.filter((b) => b.type === 'trak');

      let movieTimescale = 1000;
      const mvhd = moovChildren.find((b) => b.type === 'mvhd');
      if (mvhd && mvhd.contentSize >= 24) {
        const mvhdVer = view.getUint8(mvhd.contentOffset);
        const ts = view.getUint32(mvhd.contentOffset + (mvhdVer === 1 ? 20 : 12), false);
        if (ts > 0) movieTimescale = ts;
      }

      for (const trak of traks) {
        const trakEnd = trak.offset + trak.size;
        const tkhd = this.findBox(view, trak.contentOffset, trakEnd, 'tkhd');
        const mdia = this.findBox(view, trak.contentOffset, trakEnd, 'mdia');
        if (!mdia) continue;

        const mdiaEnd = mdia.offset + mdia.size;
        const hdlr = this.findBox(view, mdia.contentOffset, mdiaEnd, 'hdlr');
        if (!hdlr || hdlr.contentSize < 12) continue;

        const handlerType = this.readFourCC(view, hdlr.contentOffset + 8);
        if (handlerType !== 'vide') continue;

        // mdhd -> timescale & duration
        const mdhd = this.findBox(view, mdia.contentOffset, mdiaEnd, 'mdhd');
        if (!mdhd || mdhd.contentSize < 20) continue;
        const mdhdVersion = view.getUint8(mdhd.contentOffset);
        let timescale = 1000;
        let durationUnits = 0;
        if (mdhdVersion === 1) {
          if (mdhd.contentSize < 32) continue;
          timescale = view.getUint32(mdhd.contentOffset + 20, false);
          const high = view.getUint32(mdhd.contentOffset + 24, false);
          const low = view.getUint32(mdhd.contentOffset + 28, false);
          durationUnits = high * 4294967296 + low;
        } else {
          timescale = view.getUint32(mdhd.contentOffset + 12, false);
          durationUnits = view.getUint32(mdhd.contentOffset + 16, false);
        }
        if (timescale <= 0) timescale = 1000;

        // tkhd -> width & height
        let trackW = 0;
        let trackH = 0;
        let rotation = 0;
        if (tkhd && tkhd.contentSize >= 84) {
          const tkhdVer = view.getUint8(tkhd.contentOffset);
          const dimOffset = tkhdVer === 1 ? tkhd.contentOffset + 88 : tkhd.contentOffset + 76;
          if (dimOffset + 8 <= tkhd.offset + tkhd.size) {
            trackW = view.getUint32(dimOffset, false) >>> 16;
            trackH = view.getUint32(dimOffset + 4, false) >>> 16;
            // Dönüşüm matrisi genişlik alanından hemen önceki 36 bayttır (a, b, u, c, d, v, x, y, w)
            const m = dimOffset - 36;
            const a = view.getInt32(m, false) / 65536;
            const b = view.getInt32(m + 4, false) / 65536;
            const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
            rotation = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
          }
        }

        // edts/elst: ilk boş edit (gecikme) ve medya başlangıç kayması
        let ptsOffsetUnits = 0;
        let emptyEditMovieUnits = 0;
        const edts = this.findBox(view, trak.contentOffset, trakEnd, 'edts');
        if (edts) {
          const elst = this.findBox(view, edts.contentOffset, edts.offset + edts.size, 'elst');
          if (elst && elst.contentSize >= 8) {
            const elstVer = view.getUint8(elst.contentOffset);
            const entryCount = view.getUint32(elst.contentOffset + 4, false);
            let p = elst.contentOffset + 8;
            const entrySize = elstVer === 1 ? 20 : 12;
            for (let i = 0; i < entryCount && p + entrySize <= elst.offset + elst.size; i++) {
              let segDur: number;
              let mediaTime: number;
              if (elstVer === 1) {
                segDur = view.getUint32(p, false) * 4294967296 + view.getUint32(p + 4, false);
                const hi = view.getInt32(p + 8, false);
                mediaTime = hi * 4294967296 + view.getUint32(p + 12, false);
              } else {
                segDur = view.getUint32(p, false);
                mediaTime = view.getInt32(p + 4, false);
              }
              p += entrySize;
              if (mediaTime === -1) {
                emptyEditMovieUnits += segDur;
                continue;
              }
              ptsOffsetUnits = mediaTime;
              break;
            }
          }
        }

        const minf = this.findBox(view, mdia.contentOffset, mdiaEnd, 'minf');
        if (!minf) continue;
        const stbl = this.findBox(
          view,
          minf.contentOffset,
          minf.offset + minf.size,
          'stbl'
        );
        if (!stbl) continue;

        const stblEnd = stbl.offset + stbl.size;
        const stblBoxes = this.parseBoxes(view, stbl.contentOffset, stblEnd);

        const stsd = stblBoxes.find((b) => b.type === 'stsd');
        const stts = stblBoxes.find((b) => b.type === 'stts');
        const ctts = stblBoxes.find((b) => b.type === 'ctts');
        const stss = stblBoxes.find((b) => b.type === 'stss');
        const stsc = stblBoxes.find((b) => b.type === 'stsc');
        const stsz = stblBoxes.find((b) => b.type === 'stsz');
        const stco = stblBoxes.find((b) => b.type === 'stco');
        const co64 = stblBoxes.find((b) => b.type === 'co64');

        if (!stsd || !stts || !stsc || !stsz || (!stco && !co64)) {
          continue;
        }

        // 1. stsd içinden avc1/avc3 ve avcC (description) bilgisini oku
        if (stsd.contentSize < 16) continue;
        const entryStart = stsd.contentOffset + 8;
        const entryEnd = stsd.offset + stsd.size;
        const sampleEntries = this.parseBoxes(view, entryStart, entryEnd);
        if (sampleEntries.length === 0) continue;

        const visualEntry = sampleEntries[0];
        if (
          visualEntry.type !== 'avc1' &&
          visualEntry.type !== 'avc3'
        ) {
          // Yalnızca standart H.264 (avc1/avc3) akışlarını doğrudan demux et
          continue;
        }

        // VisualSampleEntry başlığı 78 byte'tır (width: +24, height: +26)
        if (visualEntry.contentSize < 78) continue;
        const codedWidth =
          view.getUint16(visualEntry.contentOffset + 24, false) || trackW || 720;
        const codedHeight =
          view.getUint16(visualEntry.contentOffset + 26, false) || trackH || 1280;

        const childBoxes = this.parseBoxes(
          view,
          visualEntry.contentOffset + 78,
          visualEntry.offset + visualEntry.size
        );
        const avcC = childBoxes.find((b) => b.type === 'avcC');
        if (!avcC || avcC.contentSize < 7) continue;

        const description = new Uint8Array(
          buffer,
          avcC.contentOffset,
          avcC.contentSize
        );
        const profileIdc = description[1];
        const profileCompat = description[2];
        const levelIdc = description[3];
        const codec = `avc1.${this.toHexByte(profileIdc)}${this.toHexByte(
          profileCompat
        )}${this.toHexByte(levelIdc)}`;

        // 2. stsz (Sample Sizes)
        const sampleSizeFixed = view.getUint32(stsz.contentOffset + 4, false);
        const sampleCount = view.getUint32(stsz.contentOffset + 8, false);
        if (sampleCount <= 0 || sampleCount > 100_000) continue;

        const sampleSizes = new Uint32Array(sampleCount);
        if (sampleSizeFixed !== 0) {
          sampleSizes.fill(sampleSizeFixed);
        } else {
          let p = stsz.contentOffset + 12;
          for (let i = 0; i < sampleCount; i++) {
            sampleSizes[i] = view.getUint32(p, false);
            p += 4;
          }
        }

        // 3. stco / co64 (Chunk Offsets)
        let chunkOffsets: Float64Array;
        if (stco) {
          const chunkCount = view.getUint32(stco.contentOffset + 4, false);
          chunkOffsets = new Float64Array(chunkCount);
          let p = stco.contentOffset + 8;
          for (let i = 0; i < chunkCount; i++) {
            chunkOffsets[i] = view.getUint32(p, false);
            p += 4;
          }
        } else if (co64) {
          const chunkCount = view.getUint32(co64.contentOffset + 4, false);
          chunkOffsets = new Float64Array(chunkCount);
          let p = co64.contentOffset + 8;
          for (let i = 0; i < chunkCount; i++) {
            const high = view.getUint32(p, false);
            const low = view.getUint32(p + 4, false);
            chunkOffsets[i] = high * 4294967296 + low;
            p += 8;
          }
        } else {
          continue;
        }

        // 4. stsc (Sample-to-Chunk) -> her sample için dosya içi byte offset
        const stscCount = view.getUint32(stsc.contentOffset + 4, false);
        const stscFirstChunk = new Uint32Array(stscCount);
        const stscSamplesPerChunk = new Uint32Array(stscCount);
        let stscPtr = stsc.contentOffset + 8;
        for (let i = 0; i < stscCount; i++) {
          stscFirstChunk[i] = view.getUint32(stscPtr, false);
          stscSamplesPerChunk[i] = view.getUint32(stscPtr + 4, false);
          stscPtr += 12;
        }

        const sampleOffsets = new Float64Array(sampleCount);
        let curSample = 0;
        const totalChunks = chunkOffsets.length;

        for (let cIdx = 0; cIdx < totalChunks && curSample < sampleCount; cIdx++) {
          const chunkNum1Based = cIdx + 1;
          let spc = stscSamplesPerChunk[0] || 1;
          for (let j = 0; j < stscCount; j++) {
            if (chunkNum1Based >= stscFirstChunk[j]) {
              spc = stscSamplesPerChunk[j];
            } else {
              break;
            }
          }

          let offsetInChunk = chunkOffsets[cIdx];
          for (let s = 0; s < spc && curSample < sampleCount; s++) {
            sampleOffsets[curSample] = offsetInChunk;
            offsetInChunk += sampleSizes[curSample];
            curSample++;
          }
        }

        // 5. stts (Decoding Time-to-Sample)
        const sttsEntryCount = view.getUint32(stts.contentOffset + 4, false);
        const sampleDtsUnits = new Float64Array(sampleCount);
        const sampleDurationUnits = new Uint32Array(sampleCount);
        let sIdx = 0;
        let accDts = 0;
        let sttsPtr = stts.contentOffset + 8;
        for (let i = 0; i < sttsEntryCount && sIdx < sampleCount; i++) {
          const count = view.getUint32(sttsPtr, false);
          const delta = view.getUint32(sttsPtr + 4, false);
          sttsPtr += 8;
          for (let c = 0; c < count && sIdx < sampleCount; c++) {
            sampleDtsUnits[sIdx] = accDts;
            sampleDurationUnits[sIdx] = delta;
            accDts += delta;
            sIdx++;
          }
        }

        // 6. ctts (Composition Time Offset - B-Frame PTS düzeltmesi)
        const sampleCttsUnits = new Int32Array(sampleCount);
        if (ctts && ctts.contentSize >= 8) {
          const cttsVer = view.getUint8(ctts.contentOffset);
          const cttsEntryCount = view.getUint32(ctts.contentOffset + 4, false);
          let cIdx2 = 0;
          let cttsPtr = ctts.contentOffset + 8;
          for (let i = 0; i < cttsEntryCount && cIdx2 < sampleCount; i++) {
            const count = view.getUint32(cttsPtr, false);
            const offsetVal =
              cttsVer === 1
                ? view.getInt32(cttsPtr + 4, false)
                : view.getUint32(cttsPtr + 4, false);
            cttsPtr += 8;
            for (let c = 0; c < count && cIdx2 < sampleCount; c++) {
              sampleCttsUnits[cIdx2] = offsetVal;
              cIdx2++;
            }
          }
        }

        // 7. stss (Sync Sample / Keyframes)
        const keyframes = new Set<number>();
        if (stss && stss.contentSize >= 8) {
          const syncCount = view.getUint32(stss.contentOffset + 4, false);
          let stssPtr = stss.contentOffset + 8;
          for (let i = 0; i < syncCount; i++) {
            const sampleNum1Based = view.getUint32(stssPtr, false);
            keyframes.add(sampleNum1Based - 1);
            stssPtr += 4;
          }
        } else {
          // stss yoksa tüm kareler keyframe kabul edilir
          for (let i = 0; i < sampleCount; i++) keyframes.add(i);
        }

        const samples: DemuxedSample[] = new Array(sampleCount);
        const unitToUs = 1_000_000 / timescale;

        for (let i = 0; i < sampleCount; i++) {
          const dtsUs = Math.round(sampleDtsUnits[i] * unitToUs);
          const ptsUs = Math.round(
            (sampleDtsUnits[i] + sampleCttsUnits[i]) * unitToUs
          );
          const durationUs = Math.max(
            1000,
            Math.round(sampleDurationUnits[i] * unitToUs)
          );
          const offset = sampleOffsets[i];
          const size = sampleSizes[i];
          const sampleData =
            offset + size <= buffer.byteLength
              ? new Uint8Array(buffer, offset, size)
              : new Uint8Array(0);

          samples[i] = {
            offset,
            size,
            dtsUs,
            ptsUs: Math.max(0, ptsUs),
            timestampUs: Math.max(0, ptsUs),
            durationUs,
            isKeyframe: keyframes.has(i) || i === 0,
            data: sampleData,
          };
        }

        const durationSec =
          durationUnits > 0
            ? durationUnits / timescale
            : (accDts || sampleCount) / timescale;
        const estimatedFps =
          durationSec > 0
            ? Math.min(60, Math.max(15, Math.round(sampleCount / durationSec)))
            : 30;

        return {
          codec,
          codedWidth,
          codedHeight,
          width: codedWidth,
          height: codedHeight,
          description,
          durationSec,
          fps: estimatedFps,
          samples,
          rotation,
          ptsOffsetUs: Math.round(
            (ptsOffsetUnits * 1_000_000) / timescale -
              (emptyEditMovieUnits * 1_000_000) / movieTimescale
          ),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Kırpma aralığı [sourceStartSec, sourceEndSec] için en yakın önceki I-Frame'den (Keyframe)
   * başlayan sıralı sample dilimini döndürür. Böylece VideoDecoder hiçbir GOP araması yapmaz.
   */
  public static getSamplesForRange(
    track: DemuxedVideoTrack,
    sourceStartSec: number,
    sourceEndSec: number
  ): DemuxedSample[] {
    const samples = track.samples;
    if (samples.length === 0) return [];

    const startUs = Math.max(0, Math.round(sourceStartSec * 1_000_000));
    const endUs = Math.round(sourceEndSec * 1_000_000) + 50_000;

    // 1. startUs'den önceki veya eşit son keyframe'i bul
    let keyframeIdx = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].isKeyframe && samples[i].ptsUs <= startUs) {
        keyframeIdx = i;
      }
      if (samples[i].dtsUs > startUs && samples[i].ptsUs > startUs) {
        break;
      }
    }

    // 2. Keyframe'den başlayarak endUs'ye kadar tüm paketleri GOP sırasıyla al
    const result: DemuxedSample[] = [];
    for (let i = keyframeIdx; i < samples.length; i++) {
      const s = samples[i];
      if (s.dtsUs > endUs && s.ptsUs > endUs && i > keyframeIdx + 4) {
        break;
      }
      result.push(s);
    }

    return result;
  }
}
// [END] CREATED BY Bedirhan & Ali
