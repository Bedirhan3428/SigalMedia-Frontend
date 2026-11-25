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

export type DemuxedCodecFamily = 'avc' | 'hevc' | 'vp9' | 'av1';

export interface DemuxedVideoTrack {
  codec: string;
  /** [WP-16] Kodek ailesi: avc1/avc3, hvc1/hev1, vp09, av01 */
  codecFamily?: DemuxedCodecFamily;
  codedWidth: number;
  codedHeight: number;
  width: number;
  height: number;
  /** avcC / hvcC / av1C içeriği (VideoDecoderConfig.description). VP9 için yok. */
  description?: Uint8Array;
  durationSec: number;
  fps: number;
  samples: DemuxedSample[];
  /** tkhd matrisinden okunan görüntüleme açısı (0 | 90 | 180 | 270) */
  rotation: number;
  /** Edit list (elst) kaynaklı PTS kayması: presentationUs = ptsUs - ptsOffsetUs */
  ptsOffsetUs: number;
  /** [WP-16] mdhd timescale (µs zamanlarından birimleri geri hesaplamak için) */
  timescale?: number;
  /** [WP-16] Örnek girdisindeki colr (nclx) etiketi, varsa */
  colorSpace?: VideoColorSpaceInit;
}

/** [WP-16] AAC ses izi (remux kısa yolunda yeniden kodlamadan kopyalanır) */
export interface DemuxedAudioTrack {
  /** ör. mp4a.40.2 */
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  /** AudioSpecificConfig (esds DecoderSpecificInfo) */
  description: Uint8Array;
  timescale: number;
  durationSec: number;
  samples: DemuxedSample[];
  /** elst kaynaklı kayma (AAC priming): presentationUs = ptsUs - ptsOffsetUs */
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

interface TrakInfo {
  timescale: number;
  durationUnits: number;
  trackW: number;
  trackH: number;
  rotation: number;
  ptsOffsetUs: number;
  sampleEntry: BoxRef;
  stts: BoxRef;
  stsc: BoxRef;
  stsz: BoxRef;
  stco?: BoxRef;
  co64?: BoxRef;
  ctts?: BoxRef;
  stss?: BoxRef;
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

  // [WP-16] Ortak trak ayrıştırma (görüntü + ses), HEVC / VP9 / AV1 görüntü ve AAC ses desteği
  private static readMoov(buffer: ArrayBuffer): {
    view: DataView;
    traks: BoxRef[];
    movieTimescale: number;
  } | null {
    const view = new DataView(buffer);
    const topBoxes = this.parseBoxes(view, 0, buffer.byteLength);

    // Fragmented MP4 (moof) varsa standart stbl tablosu boş olacağından fallback'e devret
    if (topBoxes.some((b) => b.type === 'moof')) return null;

    const moov = topBoxes.find((b) => b.type === 'moov');
    if (!moov) return null;

    const moovChildren = this.parseBoxes(view, moov.contentOffset, moov.offset + moov.size);
    let movieTimescale = 1000;
    const mvhd = moovChildren.find((b) => b.type === 'mvhd');
    if (mvhd && mvhd.contentSize >= 24) {
      const mvhdVer = view.getUint8(mvhd.contentOffset);
      const ts = view.getUint32(mvhd.contentOffset + (mvhdVer === 1 ? 20 : 12), false);
      if (ts > 0) movieTimescale = ts;
    }
    return { view, traks: moovChildren.filter((b) => b.type === 'trak'), movieTimescale };
  }

  private static parseTrak(
    view: DataView,
    trak: BoxRef,
    movieTimescale: number,
    wantHandler: 'vide' | 'soun'
  ): TrakInfo | null {
    const trakEnd = trak.offset + trak.size;
    const tkhd = this.findBox(view, trak.contentOffset, trakEnd, 'tkhd');
    const mdia = this.findBox(view, trak.contentOffset, trakEnd, 'mdia');
    if (!mdia) return null;

    const mdiaEnd = mdia.offset + mdia.size;
    const hdlr = this.findBox(view, mdia.contentOffset, mdiaEnd, 'hdlr');
    if (!hdlr || hdlr.contentSize < 12) return null;
    if (this.readFourCC(view, hdlr.contentOffset + 8) !== wantHandler) return null;

    // mdhd -> timescale & duration
    const mdhd = this.findBox(view, mdia.contentOffset, mdiaEnd, 'mdhd');
    if (!mdhd || mdhd.contentSize < 20) return null;
    const mdhdVersion = view.getUint8(mdhd.contentOffset);
    let timescale = 1000;
    let durationUnits = 0;
    if (mdhdVersion === 1) {
      if (mdhd.contentSize < 32) return null;
      timescale = view.getUint32(mdhd.contentOffset + 20, false);
      const high = view.getUint32(mdhd.contentOffset + 24, false);
      const low = view.getUint32(mdhd.contentOffset + 28, false);
      durationUnits = high * 4294967296 + low;
    } else {
      timescale = view.getUint32(mdhd.contentOffset + 12, false);
      durationUnits = view.getUint32(mdhd.contentOffset + 16, false);
    }
    if (timescale <= 0) timescale = 1000;

    // tkhd -> width & height & rotation
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
    if (!minf) return null;
    const stbl = this.findBox(view, minf.contentOffset, minf.offset + minf.size, 'stbl');
    if (!stbl) return null;

    const stblBoxes = this.parseBoxes(view, stbl.contentOffset, stbl.offset + stbl.size);
    const pick = (t: string) => stblBoxes.find((b) => b.type === t);
    const stsd = pick('stsd');
    const stts = pick('stts');
    const stsc = pick('stsc');
    const stsz = pick('stsz');
    const stco = pick('stco');
    const co64 = pick('co64');
    if (!stsd || !stts || !stsc || !stsz || (!stco && !co64)) return null;

    if (stsd.contentSize < 16) return null;
    const sampleEntries = this.parseBoxes(view, stsd.contentOffset + 8, stsd.offset + stsd.size);
    if (sampleEntries.length === 0) return null;

    return {
      timescale,
      durationUnits,
      trackW,
      trackH,
      rotation,
      ptsOffsetUs: Math.round(
        (ptsOffsetUnits * 1_000_000) / timescale -
          (emptyEditMovieUnits * 1_000_000) / movieTimescale
      ),
      sampleEntry: sampleEntries[0],
      stts,
      stsc,
      stsz,
      stco,
      co64,
      ctts: pick('ctts'),
      stss: pick('stss'),
    };
  }

  /** stsz/stco/stsc/stts/ctts/stss tablolarından örnek listesini üretir */
  private static readSamples(
    view: DataView,
    buffer: ArrayBuffer,
    info: TrakInfo,
    maxSamples: number
  ): { samples: DemuxedSample[]; totalDtsUnits: number } | null {
    const { stsz, stco, co64, stsc, stts, ctts, stss, timescale } = info;

    // 1. stsz (Sample Sizes)
    const sampleSizeFixed = view.getUint32(stsz.contentOffset + 4, false);
    const sampleCount = view.getUint32(stsz.contentOffset + 8, false);
    if (sampleCount <= 0 || sampleCount > maxSamples) return null;

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

    // 2. stco / co64 (Chunk Offsets)
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
      return null;
    }

    // 3. stsc (Sample-to-Chunk) -> her sample için dosya içi byte offset
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

    // 4. stts (Decoding Time-to-Sample)
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

    // 5. ctts (Composition Time Offset - B-Frame PTS düzeltmesi)
    const sampleCttsUnits = new Int32Array(sampleCount);
    if (ctts && ctts.contentSize >= 8) {
      const cttsVer = view.getUint8(ctts.contentOffset);
      const cttsEntryCount = view.getUint32(ctts.contentOffset + 4, false);
      let cIdx2 = 0;
      let cttsPtr = ctts.contentOffset + 8;
      for (let i = 0; i < cttsEntryCount && cIdx2 < sampleCount; i++) {
        const count = view.getUint32(cttsPtr, false);
        const offsetVal =
          cttsVer === 1 ? view.getInt32(cttsPtr + 4, false) : view.getUint32(cttsPtr + 4, false);
        cttsPtr += 8;
        for (let c = 0; c < count && cIdx2 < sampleCount; c++) {
          sampleCttsUnits[cIdx2] = offsetVal;
          cIdx2++;
        }
      }
    }

    // 6. stss (Sync Sample / Keyframes); stss yoksa tüm kareler keyframe kabul edilir
    const keyframes = new Set<number>();
    const allKey = !(stss && stss.contentSize >= 8);
    if (!allKey && stss) {
      const syncCount = view.getUint32(stss.contentOffset + 4, false);
      let stssPtr = stss.contentOffset + 8;
      for (let i = 0; i < syncCount; i++) {
        keyframes.add(view.getUint32(stssPtr, false) - 1);
        stssPtr += 4;
      }
    }

    const samples: DemuxedSample[] = new Array(sampleCount);
    const unitToUs = 1_000_000 / timescale;
    for (let i = 0; i < sampleCount; i++) {
      const dtsUs = Math.round(sampleDtsUnits[i] * unitToUs);
      const ptsUs = Math.round((sampleDtsUnits[i] + sampleCttsUnits[i]) * unitToUs);
      const durationUs = Math.max(1000, Math.round(sampleDurationUnits[i] * unitToUs));
      const offset = sampleOffsets[i];
      const size = sampleSizes[i];
      const sampleData =
        offset + size <= buffer.byteLength ? new Uint8Array(buffer, offset, size) : new Uint8Array(0);
      samples[i] = {
        offset,
        size,
        dtsUs,
        ptsUs: Math.max(0, ptsUs),
        timestampUs: Math.max(0, ptsUs),
        durationUs,
        isKeyframe: allKey || keyframes.has(i) || i === 0,
        data: sampleData,
      };
    }
    return { samples, totalDtsUnits: accDts };
  }

  /** ISO/IEC 23091-2 kodları -> WebCodecs VideoColorSpaceInit (bilinmeyenler atlanır) */
  private static readColr(view: DataView, children: BoxRef[]): VideoColorSpaceInit | undefined {
    const colr = children.find((b) => b.type === 'colr');
    if (!colr || colr.contentSize < 11) return undefined;
    const kind = this.readFourCC(view, colr.contentOffset);
    if (kind !== 'nclx' && kind !== 'nclc') return undefined;
    const prim = view.getUint16(colr.contentOffset + 4, false);
    const trc = view.getUint16(colr.contentOffset + 6, false);
    const mat = view.getUint16(colr.contentOffset + 8, false);
    const fullRange = kind === 'nclx' ? (view.getUint8(colr.contentOffset + 10) & 0x80) !== 0 : false;
    // HDR / geniş gamut kodları (bt2020, pq, hlg) TS lib tiplerinde yok; dizge olarak taşınır
    const P = { 1: 'bt709', 5: 'bt470bg', 6: 'smpte170m', 9: 'bt2020', 12: 'smpte432' } as unknown as Record<number, VideoColorPrimaries>;
    const T = { 1: 'bt709', 6: 'smpte170m', 8: 'linear', 13: 'iec61966-2-1', 16: 'pq', 18: 'hlg' } as unknown as Record<number, VideoTransferCharacteristics>;
    const M = { 0: 'rgb', 1: 'bt709', 5: 'bt470bg', 6: 'smpte170m', 9: 'bt2020-ncl' } as unknown as Record<number, VideoMatrixCoefficients>;
    const cs: VideoColorSpaceInit = { fullRange };
    if (P[prim]) cs.primaries = P[prim];
    if (T[trc]) cs.transfer = T[trc];
    if (M[mat]) cs.matrix = M[mat];
    return cs;
  }

  /** HEVCDecoderConfigurationRecord -> RFC 6381 kodek dizgesi, ör. hvc1.1.6.L93.B0 */
  private static hevcCodecString(prefix: string, d: Uint8Array): string | null {
    if (d.length < 13) return null;
    const profileSpace = d[1] >> 6;
    const tier = (d[1] >> 5) & 1;
    const profileIdc = d[1] & 0x1f;
    const compat = ((d[2] << 24) | (d[3] << 16) | (d[4] << 8) | d[5]) >>> 0;
    let rev = 0;
    for (let i = 0; i < 32; i++) {
      if (compat & (1 << i)) rev |= 1 << (31 - i);
    }
    const constraint: string[] = [];
    for (let i = 6; i < 12; i++) constraint.push(d[i].toString(16).toUpperCase());
    while (constraint.length > 0 && constraint[constraint.length - 1] === '0') constraint.pop();
    const space = ['', 'A', 'B', 'C'][profileSpace];
    const parts = [
      prefix,
      `${space}${profileIdc}`,
      (rev >>> 0).toString(16).toUpperCase(),
      `${tier ? 'H' : 'L'}${d[12]}`,
      ...constraint,
    ];
    return parts.join('.');
  }

  public static demux(buffer: ArrayBuffer): DemuxedVideoTrack | null {
    try {
      const moov = this.readMoov(buffer);
      if (!moov) return null;
      const { view, traks, movieTimescale } = moov;

      for (const trak of traks) {
        const info = this.parseTrak(view, trak, movieTimescale, 'vide');
        if (!info) continue;
        const visualEntry = info.sampleEntry;
        const type = visualEntry.type;

        // VisualSampleEntry başlığı 78 byte'tır (width: +24, height: +26)
        if (visualEntry.contentSize < 78) continue;
        const codedWidth = view.getUint16(visualEntry.contentOffset + 24, false) || info.trackW || 720;
        const codedHeight = view.getUint16(visualEntry.contentOffset + 26, false) || info.trackH || 1280;
        const childBoxes = this.parseBoxes(
          view,
          visualEntry.contentOffset + 78,
          visualEntry.offset + visualEntry.size
        );
        const boxBytes = (t: string): Uint8Array | null => {
          const b = childBoxes.find((x) => x.type === t);
          return b ? new Uint8Array(buffer, b.contentOffset, b.contentSize) : null;
        };

        let codec: string | null = null;
        let codecFamily: DemuxedCodecFamily;
        let description: Uint8Array | undefined;
        if (type === 'avc1' || type === 'avc3') {
          const avcC = boxBytes('avcC');
          if (!avcC || avcC.length < 7) continue;
          description = avcC;
          codecFamily = 'avc';
          codec = `avc1.${this.toHexByte(avcC[1])}${this.toHexByte(avcC[2])}${this.toHexByte(avcC[3])}`;
        } else if (type === 'hvc1' || type === 'hev1') {
          const hvcC = boxBytes('hvcC');
          if (!hvcC) continue;
          description = hvcC;
          codecFamily = 'hevc';
          codec = this.hevcCodecString(type, hvcC);
        } else if (type === 'vp09') {
          // vpcC: FullBox (4) + profile, level, bitDepth(4)|chroma(3)|fullRange(1)
          const vpcC = boxBytes('vpcC');
          if (!vpcC || vpcC.length < 7) continue;
          codecFamily = 'vp9';
          const pad = (n: number) => n.toString().padStart(2, '0');
          codec = `vp09.${pad(vpcC[4])}.${pad(vpcC[5])}.${pad(vpcC[6] >> 4)}`;
        } else if (type === 'av01') {
          // av1C: marker|version, seq_profile(3)|seq_level_idx_0(5), tier(1)|high_bitdepth(1)|twelve_bit(1)...
          const av1C = boxBytes('av1C');
          if (!av1C || av1C.length < 4) continue;
          description = av1C;
          codecFamily = 'av1';
          const profile = av1C[1] >> 5;
          const level = av1C[1] & 0x1f;
          const tier = av1C[2] >> 7 ? 'H' : 'M';
          const highBd = (av1C[2] >> 6) & 1;
          const twelve = (av1C[2] >> 5) & 1;
          const bitDepth = highBd ? (twelve ? 12 : 10) : 8;
          codec = `av01.${profile}.${level.toString().padStart(2, '0')}${tier}.${bitDepth
            .toString()
            .padStart(2, '0')}`;
        } else {
          // Desteklenmeyen kodek: çağıran taraf seek yoluna düşer
          continue;
        }
        if (!codec) continue;

        const read = this.readSamples(view, buffer, info, 100_000);
        if (!read) continue;
        const { samples, totalDtsUnits } = read;
        const sampleCount = samples.length;

        const durationSec =
          info.durationUnits > 0
            ? info.durationUnits / info.timescale
            : (totalDtsUnits || sampleCount) / info.timescale;
        const estimatedFps =
          durationSec > 0 ? Math.min(60, Math.max(15, Math.round(sampleCount / durationSec))) : 30;

        return {
          codec,
          codecFamily,
          codedWidth,
          codedHeight,
          width: codedWidth,
          height: codedHeight,
          description,
          durationSec,
          fps: estimatedFps,
          samples,
          rotation: info.rotation,
          ptsOffsetUs: info.ptsOffsetUs,
          timescale: info.timescale,
          colorSpace: this.readColr(view, childBoxes),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /** MPEG-4 tanımlayıcı başlığı: tag + değişken uzunluklu boyut */
  private static readDescriptor(d: Uint8Array, pos: number): { tag: number; size: number; start: number } | null {
    if (pos >= d.length) return null;
    const tag = d[pos++];
    let size = 0;
    for (let i = 0; i < 4 && pos < d.length; i++) {
      const b = d[pos++];
      size = (size << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return { tag, size, start: pos };
  }

  /** esds içinden AudioSpecificConfig (DecoderSpecificInfo) ve objectTypeIndication */
  private static parseEsds(esds: Uint8Array): { oti: number; asc: Uint8Array } | null {
    // FullBox başlığı (4 byte) sonrası ES_Descriptor (0x03)
    const es = this.readDescriptor(esds, 4);
    if (!es || es.tag !== 0x03) return null;
    let p = es.start + 2; // ES_ID
    const flags = esds[p++];
    if (flags & 0x80) p += 2; // streamDependenceFlag
    if (flags & 0x40) p += 1 + esds[p]; // URL_Flag
    if (flags & 0x20) p += 2; // OCRstreamFlag
    const dc = this.readDescriptor(esds, p);
    if (!dc || dc.tag !== 0x04) return null;
    const oti = esds[dc.start];
    const dsi = this.readDescriptor(esds, dc.start + 13);
    if (!dsi || dsi.tag !== 0x05 || dsi.start + dsi.size > esds.length) return null;
    return { oti, asc: esds.subarray(dsi.start, dsi.start + dsi.size) };
  }

  /** WP-37: kapsayıcıda (codec fark etmeksizin) ses izi var mı? Remux, ses izi hiç yoksa çıktıyı sessiz bırakır. */
  public static hasAudioTrack(buffer: ArrayBuffer): boolean {
    try {
      const moov = this.readMoov(buffer);
      if (!moov) return false;
      const { view, traks } = moov;
      for (const trak of traks) {
        const mdia = this.findBox(view, trak.contentOffset, trak.offset + trak.size, 'mdia');
        if (!mdia) continue;
        const hdlr = this.findBox(view, mdia.contentOffset, mdia.offset + mdia.size, 'hdlr');
        if (hdlr && hdlr.contentSize >= 12 && this.readFourCC(view, hdlr.contentOffset + 8) === 'soun') return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * İlk AAC (mp4a) ses izini söker. Remux kısa yolu, sesi yeniden kodlamadan kopyalamak için kullanır.
   * AAC dışı ses (mp3, opus, pcm) veya okunamayan esds -> null.
   */
  public static demuxAudio(buffer: ArrayBuffer): DemuxedAudioTrack | null {
    try {
      const moov = this.readMoov(buffer);
      if (!moov) return null;
      const { view, traks, movieTimescale } = moov;
      for (const trak of traks) {
        const info = this.parseTrak(view, trak, movieTimescale, 'soun');
        if (!info) continue;
        const entry = info.sampleEntry;
        if (entry.type !== 'mp4a' || entry.contentSize < 28) continue;
        const c = entry.contentOffset;
        const qtVersion = view.getUint16(c + 8, false);
        let channels = view.getUint16(c + 16, false);
        let sampleRate = view.getUint32(c + 24, false) >>> 16;
        let childStart = c + 28;
        if (qtVersion === 1) childStart += 16;
        else if (qtVersion === 2) {
          if (entry.contentSize < 64) continue;
          sampleRate = Math.round(view.getFloat64(c + 32, false));
          channels = view.getUint32(c + 40, false);
          childStart = c + 64;
        }
        const entryEnd = entry.offset + entry.size;
        let children = this.parseBoxes(view, childStart, entryEnd);
        const wave = children.find((b) => b.type === 'wave');
        if (wave) children = children.concat(this.parseBoxes(view, wave.contentOffset, wave.offset + wave.size));
        const esdsBox = children.find((b) => b.type === 'esds');
        if (!esdsBox) continue;
        const esds = this.parseEsds(new Uint8Array(buffer, esdsBox.contentOffset, esdsBox.contentSize));
        if (!esds || esds.oti !== 0x40 || esds.asc.length < 2) continue;
        const aot = esds.asc[0] >> 3;
        if (aot === 0 || aot === 31) continue;

        const read = this.readSamples(view, buffer, info, 1_000_000);
        if (!read) continue;
        if (!sampleRate) sampleRate = info.timescale;
        if (!channels) channels = 2;
        return {
          codec: `mp4a.40.${aot}`,
          sampleRate,
          numberOfChannels: channels,
          description: esds.asc,
          timescale: info.timescale,
          durationSec:
            info.durationUnits > 0 ? info.durationUnits / info.timescale : read.totalDtsUnits / info.timescale,
          samples: read.samples,
          ptsOffsetUs: info.ptsOffsetUs,
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
