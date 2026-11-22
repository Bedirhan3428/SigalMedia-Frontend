// [START] WP-15 zero-copy colour self-test
/**
 * Tuval (RGB) VideoFrame'ini encoder'a doğrudan vermek (sıfır kopya) yalnızca encoder RGB -> YUV dönüşümünü
 * BT.709 limited-range yapıyorsa doğrudur (Chrome donanım encoder yolu böyle; yazılım yolu tam aralık/JPEG yapar).
 * Bu test aynı encoder yapılandırmasıyla beyaz/kırmızı bir kare kodlar, geri çözer ve Y değerlerine bakar:
 * beyaz ~235 ve kırmızı ~63 ise BT.709 limited. Sonuç yapılandırma başına önbelleklenir (ilk export ~50-150 ms).
 */
const cache = new Map<string, Promise<boolean>>();

export function probeZeroCopyBt709(config: VideoEncoderConfig): Promise<boolean> {
  const key = `${config.codec}|${config.width}x${config.height}|${config.hardwareAcceleration}`;
  let p = cache.get(key);
  if (!p) {
    p = run(config).catch(() => false);
    cache.set(key, p);
  }
  return p;
}

async function run(config: VideoEncoderConfig): Promise<boolean> {
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoDecoder === 'undefined') return false;
  const W = config.width, H = config.height;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(W / 2, 0, W / 2, H);

  let chunk: EncodedVideoChunk | null = null;
  let decCfg: VideoDecoderConfig | undefined;
  const enc = new VideoEncoder({
    output: (c, meta) => {
      if (!chunk) chunk = c;
      if (meta?.decoderConfig) decCfg = meta.decoderConfig;
    },
    error: () => {},
  });
  try {
    enc.configure({ ...config, avc: { format: 'avc' } });
    const f = new VideoFrame(canvas, { timestamp: 0, duration: 33333 });
    enc.encode(f, { keyFrame: true });
    f.close();
    await enc.flush();
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
  const encoded = chunk as EncodedVideoChunk | null;
  if (!encoded || !decCfg) return false;

  let out: VideoFrame | null = null;
  const dec = new VideoDecoder({
    output: (fr) => {
      if (out) fr.close();
      else out = fr;
    },
    error: () => {},
  });
  try {
    dec.configure({ ...decCfg, hardwareAcceleration: 'no-preference' });
    dec.decode(encoded);
    await dec.flush();
  } finally {
    if (dec.state !== 'closed') dec.close();
  }
  const frame = out as VideoFrame | null;
  if (!frame) return false;
  try {
    const fmt = frame.format;
    if (fmt !== 'I420' && fmt !== 'NV12' && fmt !== 'I420A') return false;
    const buf = new Uint8Array(frame.allocationSize());
    const layout = await frame.copyTo(buf);
    const y0 = layout[0];
    const row = Math.floor(H / 2) * y0.stride + y0.offset;
    const white = buf[row + Math.floor(W / 4)];
    const red = buf[row + Math.floor((3 * W) / 4)];
    return white >= 230 && white <= 240 && red >= 58 && red <= 68;
  } finally {
    frame.close();
  }
}
// [END] WP-15 zero-copy colour self-test
