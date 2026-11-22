// [START] WP-15 GPU export compositor
import type { MediaGpuDrawParams } from '../../layers/MediaLayer';

/**
 * WebGL2 export kompozitörü (OffscreenCanvas).
 * - Çözülen VideoFrame doğrudan doku olarak çizilir (tkhd dönüşü UV'de, 2D döndürme tuvali yok).
 * - Dönüşüm, kırpma, köşe yuvarlama, opaklık ve CSS filtre fonksiyonları (brightness, contrast, saturate,
 *   sepia, grayscale, hue-rotate; yoğunluk MediaLayer'da harmanlanmış değerlerle) fragment shader'da.
 * - Statik overlay (metin/sticker önbelleği) ve ambient arka plan doku olarak bir kez yüklenir, sürüm değişince yenilenir.
 * - 'direct' modda kare tuvalden sıfır kopya VideoFrame olarak encoder'a gider; 'pack' modda RGB -> I420
 *   BT.709 limited dönüşümü GPU'da yapılır ve PBO + fence ile asenkron okunur (getImageData ve JS dönüşümü yok).
 */
export type GlOutputMode = 'direct' | 'pack';

const VS = `#version 300 es
in vec2 a_pos;
uniform mat3 u_xform;   // yerel birim kare -> tuval pikseli
uniform vec2 u_canvas;  // tuval boyutu (px)
uniform float u_flipY;  // 1: varsayılan framebuffer (üst satır üstte)
out vec2 v_uv;
out vec2 v_px;
void main() {
  vec3 p = u_xform * vec3(a_pos, 1.0);
  v_px = p.xy;
  v_uv = a_pos + 0.5;
  vec2 ndc = vec2(p.x / u_canvas.x * 2.0 - 1.0, 1.0 - p.y / u_canvas.y * 2.0);
  ndc.y *= u_flipY;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FS_MEDIA = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec2 v_px;
uniform sampler2D u_tex;
uniform int u_rot;          // 0, 90, 180, 270 (tkhd)
uniform vec2 u_size;        // yerel kare boyutu (ölçek öncesi px)
uniform vec2 u_margin;      // kenar yumuşatma için genişletilen pay (uv biriminde)
uniform float u_radius;     // köşe yarıçapı (yerel px)
uniform float u_pxScale;    // yerel px -> tuval px
uniform vec4 u_crop;        // x0, y0, x1, y1 (tuval px); kırpma yoksa çok geniş
uniform float u_alpha;
uniform float u_premulSrc;  // 1: kaynak dokusu premultiplied (overlay)
uniform int u_mode;         // 0 medya, 1 tam ekran doku (arka plan / overlay / 2D kare)
uniform float u_bright, u_contrast, u_saturate, u_sepia, u_gray, u_hue;
out vec4 o;

vec3 satM(vec3 c, float s) {
  mat3 m = mat3(
    0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
    0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
    0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s);
  return clamp(m * c, 0.0, 1.0);
}
vec3 sepiaM(vec3 c, float a) {
  float g = 1.0 - a;
  mat3 m = mat3(
    0.393 + 0.607 * g, 0.349 - 0.349 * g, 0.272 - 0.272 * g,
    0.769 - 0.769 * g, 0.686 + 0.314 * g, 0.534 - 0.534 * g,
    0.189 - 0.189 * g, 0.168 - 0.168 * g, 0.131 + 0.869 * g);
  return clamp(m * c, 0.0, 1.0);
}
vec3 grayM(vec3 c, float a) {
  float g = 1.0 - a;
  mat3 m = mat3(
    0.2126 + 0.7874 * g, 0.2126 - 0.2126 * g, 0.2126 - 0.2126 * g,
    0.7152 - 0.7152 * g, 0.7152 + 0.2848 * g, 0.7152 - 0.7152 * g,
    0.0722 - 0.0722 * g, 0.0722 - 0.0722 * g, 0.0722 + 0.9278 * g);
  return clamp(m * c, 0.0, 1.0);
}
vec3 hueM(vec3 c, float deg) {
  float r = radians(deg);
  float cs = cos(r), sn = sin(r);
  mat3 m = mat3(
    0.213 + cs * 0.787 - sn * 0.213, 0.213 - cs * 0.213 + sn * 0.143, 0.213 - cs * 0.213 - sn * 0.787,
    0.715 - cs * 0.715 - sn * 0.715, 0.715 + cs * 0.285 + sn * 0.140, 0.715 - cs * 0.715 + sn * 0.715,
    0.072 - cs * 0.072 + sn * 0.928, 0.072 - cs * 0.072 - sn * 0.283, 0.072 + cs * 0.928 + sn * 0.072);
  return clamp(m * c, 0.0, 1.0);
}

void main() {
  if (u_mode == 1) {
    vec4 t = texture(u_tex, v_uv);
    o = u_premulSrc > 0.5 ? t * u_alpha : vec4(t.rgb * t.a * u_alpha, t.a * u_alpha);
    return;
  }
  // genişletilmiş kareden gerçek kare uv'sine
  vec2 uv = (v_uv - u_margin) / (1.0 - 2.0 * u_margin);
  // yuvarlatılmış dikdörtgen SDF (yerel px), kenar yumuşatma tuval pikselinde
  vec2 half_ = u_size * 0.5;
  vec2 p = (uv - 0.5) * u_size;
  float r = min(u_radius, min(half_.x, half_.y));
  vec2 q = abs(p) - (half_ - vec2(r));
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float cov = clamp(0.5 - d * u_pxScale, 0.0, 1.0);
  // kırpma (tuval eksenli)
  vec2 cx = clamp(vec2(v_px.x - u_crop.x, u_crop.z - v_px.x) + 0.5, 0.0, 1.0);
  vec2 cy = clamp(vec2(v_px.y - u_crop.y, u_crop.w - v_px.y) + 0.5, 0.0, 1.0);
  cov *= min(cx.x, cx.y) * min(cy.x, cy.y);
  if (cov <= 0.0) discard;
  vec2 st = clamp(uv, 0.0, 1.0);
  vec2 raw = u_rot == 90 ? vec2(st.y, 1.0 - st.x)
           : u_rot == 180 ? vec2(1.0 - st.x, 1.0 - st.y)
           : u_rot == 270 ? vec2(1.0 - st.y, st.x)
           : st;
  vec3 c = texture(u_tex, raw).rgb;
  // CSS filtre sırası: getFilterString() ile aynı (brightness, contrast, saturate, sepia, grayscale, hue-rotate)
  if (u_bright != 1.0) c = clamp(c * u_bright, 0.0, 1.0);
  if (u_contrast != 1.0) c = clamp((c - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  if (u_saturate != 1.0) c = satM(c, u_saturate);
  if (u_sepia > 0.0) c = sepiaM(c, u_sepia);
  if (u_gray > 0.0) c = grayM(c, u_gray);
  if (u_hue != 0.0) c = hueM(c, u_hue);
  float a = cov * u_alpha;
  o = vec4(c * a, a);
}`;

// RGB (sRGB) -> I420 BT.709 limited. Çıkış RGBA8 dokusu (W/4 x H*3/2): her piksel 4 ardışık bayt.
// Bayt düzeni VideoFrame I420 ile aynı: Y (W*H), U (W/2*H/2), V (W/2*H/2). JS dönüşümüyle aynı katsayılar.
const FS_PACK = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;   // kompozisyon dokusu (satır 0 = görüntünün alt satırı)
uniform int u_w;
uniform int u_h;
out vec4 o;
vec3 px(int x, int y) { return floor(texelFetch(u_src, ivec2(x, u_h - 1 - y), 0).rgb * 255.0 + 0.5); }
float byteAt(int b) {
  int ySize = u_w * u_h;
  int cw = u_w / 2;
  int cSize = cw * (u_h / 2);
  if (b < ySize) {
    vec3 c = px(b % u_w, b / u_w);
    return floor((47.0 * c.r + 157.0 * c.g + 16.0 * c.b + 128.0) / 256.0) + 16.0;
  }
  int ci = b - ySize;
  bool isV = ci >= cSize;
  if (isV) ci -= cSize;
  int x = (ci % cw) * 2;
  int y = (ci / cw) * 2;
  vec3 s = px(x, y) + px(x + 1, y) + px(x, y + 1) + px(x + 1, y + 1);
  if (!isV) return floor((-26.0 * s.r - 86.0 * s.g + 112.0 * s.b + 512.0) / 1024.0) + 128.0;
  return floor((112.0 * s.r - 102.0 * s.g - 10.0 * s.b + 512.0) / 1024.0) + 128.0;
}
void main() {
  int col = int(gl_FragCoord.x);
  int row = int(gl_FragCoord.y);
  int b = (row * (u_w / 4) + col) * 4;
  o = vec4(byteAt(b), byteAt(b + 1), byteAt(b + 2), byteAt(b + 3)) / 255.0;
}`;

const FS_PACK_VS = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos * 2.0, 0.0, 1.0); }`;

interface PendingRead {
  pbo: WebGLBuffer;
  fence: WebGLSync;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

export class GlCompositor {
  public readonly canvas: OffscreenCanvas;
  public readonly mode: GlOutputMode;
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: WebGLProgram;
  private readonly u: Uniforms;
  private readonly vao: WebGLVertexArrayObject;
  private readonly mediaTex: WebGLTexture;
  private readonly auxTex: WebGLTexture; // arka plan / 2D yedek kare
  private readonly overlayTex: WebGLTexture;
  private overlayKey: { canvas: HTMLCanvasElement | null; version: number } = { canvas: null, version: -1 };
  private bgKey: unknown = null;
  private staticSrc: unknown = null; // foto kaynağı: aynıysa yeniden yükleme yok
  // pack modu
  private composeFbo: WebGLFramebuffer | null = null;
  private composeTex: WebGLTexture | null = null;
  private packFbo: WebGLFramebuffer | null = null;
  private packProg: WebGLProgram | null = null;
  private packU: Uniforms = {};
  private freePbos: WebGLBuffer[] = [];
  private pending: PendingRead[] = [];
  private readonly packBytes: number;

  private constructor(
    public readonly width: number,
    public readonly height: number,
    mode: GlOutputMode,
    canvas: OffscreenCanvas,
    gl: WebGL2RenderingContext
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.mode = mode;
    this.packBytes = (width * height * 3) >> 1;
    this.prog = link(gl, VS, FS_MEDIA);
    this.u = uniforms(gl, this.prog, [
      'u_xform', 'u_canvas', 'u_flipY', 'u_tex', 'u_rot', 'u_size', 'u_margin', 'u_radius', 'u_pxScale',
      'u_crop', 'u_alpha', 'u_premulSrc', 'u_mode', 'u_bright', 'u_contrast', 'u_saturate', 'u_sepia', 'u_gray', 'u_hue',
    ]);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('webgl2 buffers');
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.mediaTex = makeTex(gl);
    this.auxTex = makeTex(gl);
    this.overlayTex = makeTex(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (mode === 'pack') {
      this.composeTex = makeTex(gl);
      gl.bindTexture(gl.TEXTURE_2D, this.composeTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      this.composeFbo = fbo(gl, this.composeTex);
      const packTex = makeTex(gl);
      gl.bindTexture(gl.TEXTURE_2D, packTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width / 4, (height * 3) / 2);
      this.packFbo = fbo(gl, packTex);
      this.packProg = link(gl, FS_PACK_VS, FS_PACK);
      this.packU = uniforms(gl, this.packProg, ['u_src', 'u_w', 'u_h']);
    }
  }

  /** WebGL2 yoksa veya boyut desteklenmiyorsa null (çağıran Canvas 2D yoluna düşer). */
  public static create(width: number, height: number, mode: GlOutputMode): GlCompositor | null {
    if (typeof OffscreenCanvas === 'undefined') return null;
    if (mode === 'pack' && (width % 4 !== 0 || height % 2 !== 0)) return null;
    try {
      const canvas = new OffscreenCanvas(width, height);
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        // yazılım WebGL'de (SwiftShader) GPU yolu Canvas 2D'den yavaş: o durumda bağlam verilmez, 2D yoluna düşülür
        failIfMajorPerformanceCaveat: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) return null;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return null;
      }
      return new GlCompositor(width, height, mode, canvas, gl);
    } catch {
      return null;
    }
  }

  private target(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mode === 'pack' ? this.composeFbo : null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.u.u_canvas, this.width, this.height);
    gl.uniform1f(this.u.u_flipY, 1);
    gl.uniform1i(this.u.u_tex, 0);
    gl.activeTexture(gl.TEXTURE0);
  }

  public beginFrame(): void {
    const gl = this.gl;
    this.target();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private fullScreen(tex: WebGLTexture, premul: boolean, alpha = 1): void {
    const gl = this.gl;
    const W = this.width, H = this.height;
    gl.uniformMatrix3fv(this.u.u_xform, false, [W, 0, 0, 0, H, 0, W / 2, H / 2, 1]);
    gl.uniform1i(this.u.u_mode, 1);
    gl.uniform1f(this.u.u_premulSrc, premul ? 1 : 0);
    gl.uniform1f(this.u.u_alpha, alpha);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Klip sınırında: foto kaynağı dokusu yeniden yüklensin */
  public invalidateStatic(): void {
    this.staticSrc = null;
  }

  /** Arka plan bu anahtar için henüz yüklenmedi mi (2D'de yeniden çizim gerekli mi) */
  public needsBackground(key: unknown): boolean {
    return this.bgKey !== key;
  }

  /** Ambient arka plan (engine.renderAmbientBackground çıktısı); key değişince yeniden yüklenir. */
  public drawBackground(src: TexImageSource, key: unknown): void {
    if (this.bgKey !== key) {
      upload(this.gl, this.auxTex, src, false);
      this.bgKey = key;
    }
    this.fullScreen(this.auxTex, false);
  }

  /** Canvas 2D yedek yolunda çizilmiş tam kare (GPU -> GPU doku kopyası). */
  public drawFullFrame(src: TexImageSource): void {
    this.bgKey = null;
    upload(this.gl, this.auxTex, src, false);
    this.fullScreen(this.auxTex, false);
  }

  /** Statik overlay önbelleği (premultiplied, source-over). Yalnızca sürüm değişince yüklenir. */
  public drawOverlay(canvas: HTMLCanvasElement, version: number): void {
    if (this.overlayKey.canvas !== canvas || this.overlayKey.version !== version) {
      upload(this.gl, this.overlayTex, canvas, true);
      this.overlayKey = { canvas, version };
    }
    this.fullScreen(this.overlayTex, true);
  }

  /**
   * Taban medya. srcW/srcH: kaynağın ekran (döndürülmüş) boyutu; `isStatic` ise kaynak (foto) bir kez yüklenir.
   */
  public drawMedia(
    src: TexImageSource,
    srcW: number,
    rotation: number,
    p: MediaGpuDrawParams,
    isStatic: boolean
  ): void {
    const gl = this.gl;
    const pxScale = Math.max(1e-3, Math.min(Math.abs(p.scaleX), Math.abs(p.scaleY)));
    const screenW = p.width * Math.abs(p.scaleX);
    const mip = srcW > 0 && screenW / srcW < 0.7;
    if (!isStatic || this.staticSrc !== src) {
      upload(gl, this.mediaTex, src, false, mip);
      this.staticSrc = isStatic ? src : null;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.mediaTex);
    }
    // kenar yumuşatması için kare her yönde ~1.5 tuval pikseli genişletilir
    const mx = 1.5 / pxScale / p.width;
    const my = 1.5 / pxScale / p.height;
    const ew = p.width * (1 + 2 * mx);
    const eh = p.height * (1 + 2 * my);
    const rad = (p.rotationDeg * Math.PI) / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    // M = T(cx,cy) * R * S(sx,sy) * S(ew,eh)  (sütun-öncelikli)
    const a = c * p.scaleX * ew, b = s * p.scaleX * ew;
    const cc = -s * p.scaleY * eh, d = c * p.scaleY * eh;
    gl.uniformMatrix3fv(this.u.u_xform, false, [a, b, 0, cc, d, 0, p.cx, p.cy, 1]);
    gl.uniform1i(this.u.u_mode, 0);
    gl.uniform1i(this.u.u_rot, ((Math.round(rotation) % 360) + 360) % 360);
    gl.uniform2f(this.u.u_size, p.width, p.height);
    gl.uniform2f(this.u.u_margin, mx / (1 + 2 * mx), my / (1 + 2 * my));
    gl.uniform1f(this.u.u_radius, p.cornerRadius);
    gl.uniform1f(this.u.u_pxScale, pxScale);
    const cr = p.crop;
    if (cr) gl.uniform4f(this.u.u_crop, cr.x, cr.y, cr.x + cr.width, cr.y + cr.height);
    else gl.uniform4f(this.u.u_crop, -1e6, -1e6, 1e6, 1e6);
    gl.uniform1f(this.u.u_alpha, p.alpha);
    const f = p.filter;
    gl.uniform1f(this.u.u_bright, f.brightness);
    gl.uniform1f(this.u.u_contrast, f.contrast);
    gl.uniform1f(this.u.u_saturate, f.saturate);
    gl.uniform1f(this.u.u_sepia, f.sepia);
    gl.uniform1f(this.u.u_gray, f.grayscale);
    gl.uniform1f(this.u.u_hue, f.hueRotate);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Medya tuvali tamamen, opak ve kesintisiz kaplıyor mu (kaplıyorsa arka plan çizilmez) */
  public static coversCanvas(p: MediaGpuDrawParams, w: number, h: number): boolean {
    if (p.alpha < 0.999 || p.crop || p.cornerRadius > 0 || Math.abs(p.rotationDeg % 360) > 0.01) return false;
    const hw = (p.width * Math.abs(p.scaleX)) / 2;
    const hh = (p.height * Math.abs(p.scaleY)) / 2;
    return p.cx - hw <= 0.01 && p.cy - hh <= 0.01 && p.cx + hw >= w - 0.01 && p.cy + hh >= h - 0.01;
  }

  /** pack modu: kompozisyonu I420'ye çevirip asenkron okumayı kuyruğa alır. */
  public queuePack(): void {
    const gl = this.gl;
    if (this.mode !== 'pack' || !this.packProg) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.packFbo);
    gl.viewport(0, 0, this.width / 4, (this.height * 3) / 2);
    gl.disable(gl.BLEND);
    gl.useProgram(this.packProg);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.composeTex);
    gl.uniform1i(this.packU.u_src, 0);
    gl.uniform1i(this.packU.u_w, this.width);
    gl.uniform1i(this.packU.u_h, this.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND);
    let pbo = this.freePbos.pop();
    if (!pbo) {
      pbo = gl.createBuffer() as WebGLBuffer;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.packBytes, gl.STREAM_READ);
    } else {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    }
    gl.readPixels(0, 0, this.width / 4, (this.height * 3) / 2, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) as WebGLSync;
    gl.flush();
    this.pending.push({ pbo, fence });
  }

  public pendingCount(): number {
    return this.pending.length;
  }

  /** En eski bekleyen okumayı tamamlar (fence sinyallenene kadar olay döngüsüne bırakarak). */
  public async readOldest(out: Uint8Array, yieldFn: () => Promise<void>): Promise<void> {
    const gl = this.gl;
    const r = this.pending.shift();
    if (!r) throw new Error('no pending read');
    for (let i = 0; ; i++) {
      const st = gl.clientWaitSync(r.fence, 0, 0);
      if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED) break;
      if (st === gl.WAIT_FAILED || i > 2000) break;
      await yieldFn();
    }
    gl.deleteSync(r.fence);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out, 0, this.packBytes);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.freePbos.push(r.pbo);
  }

  public dispose(): void {
    const gl = this.gl;
    for (const r of this.pending) {
      try {
        gl.deleteSync(r.fence);
        gl.deleteBuffer(r.pbo);
      } catch {}
    }
    this.pending = [];
    for (const b of this.freePbos) gl.deleteBuffer(b);
    this.freePbos = [];
    try {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
  }
}

function makeTex(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('webgl2 texture');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function upload(gl: WebGL2RenderingContext, tex: WebGLTexture, src: TexImageSource, premul: boolean, mip = false): void {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
}

function fbo(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const f = gl.createFramebuffer();
  if (!f) throw new Error('webgl2 fbo');
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('webgl2 fbo incomplete');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('webgl2 shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  if (!p) throw new Error('webgl2 program');
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram, names: string[]): Uniforms {
  const u: Uniforms = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return u;
}
// [END] WP-15 GPU export compositor
