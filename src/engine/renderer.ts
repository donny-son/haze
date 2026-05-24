// WebGL2 renderer. One fullscreen fragment shader composites all three
// layers (bloom + mesh + noise) plus grain. Anchors and palette colors are
// uploaded as uniform arrays so animation only re-binds uniforms — the
// shader recompiles only when paletteSize changes.

import type { Anchor } from './composition';
import type { PaletteEntry } from './palette';

export interface RenderParams {
  width: number;
  height: number;
  weights: { bloom: number; mesh: number; noise: number };
  softness: number; // 0..1
  grain: number; // 0..1
  seed: number;
  time: number; // seconds, drives ambient breath + noise drift
}

const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

function fragSource(anchorCount: number): string {
  const N = Math.max(1, anchorCount);
  return /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_bloom;
uniform vec3 u_anchorLab[${N}];
uniform vec2 u_anchorPos[${N}];
uniform float u_weights[${N}];
// 0 = glow (Shepard-blended into the mesh), 1 = spike (additive sparkle).
uniform int u_anchorKind[${N}];
uniform float u_wBloom;
uniform float u_wMesh;
uniform float u_wNoise;
uniform float u_softness;
uniform float u_grain;
uniform float u_seed;
uniform float u_time;
uniform vec2 u_resolution;

// --- OKLab <-> sRGB --------------------------------------------------------
vec3 linearToSrgb(vec3 c) {
  bvec3 cutoff = lessThanEqual(c, vec3(0.0031308));
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  vec3 lo = 12.92 * c;
  return mix(hi, lo, vec3(cutoff));
}
vec3 srgbToLinear(vec3 c) {
  bvec3 cutoff = lessThanEqual(c, vec3(0.04045));
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  vec3 lo = c / 12.92;
  return mix(hi, lo, vec3(cutoff));
}
vec3 oklabToRgb(vec3 lab) {
  float L = lab.x, a = lab.y, b = lab.z;
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  vec3 lms = vec3(l_*l_*l_, m_*m_*m_, s_*s_*s_);
  vec3 rgb = vec3(
     4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z
  );
  return linearToSrgb(clamp(rgb, 0.0, 1.0));
}
vec3 rgbToOklab(vec3 rgb) {
  vec3 lin = srgbToLinear(clamp(rgb, 0.0, 1.0));
  float l = 0.4122214708 * lin.x + 0.5363325363 * lin.y + 0.0514459929 * lin.z;
  float m = 0.2119034982 * lin.x + 0.6806995451 * lin.y + 0.1073969566 * lin.z;
  float s = 0.0883024619 * lin.x + 0.2817188376 * lin.y + 0.6299787005 * lin.z;
  vec3 lms = vec3(
    sign(l) * pow(abs(l), 1.0/3.0),
    sign(m) * pow(abs(m), 1.0/3.0),
    sign(s) * pow(abs(s), 1.0/3.0)
  );
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z
  );
}

// --- 2D simplex noise ------------------------------------------------------
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
              + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_uv;

  // Mesh layer: Shepard inverse-distance interpolation in OKLab.
  // Aspect-correct so glows are round, not stretched.
  float aspect = u_resolution.x / u_resolution.y;
  vec2 puv = vec2(uv.x * aspect, uv.y);

  float falloff = mix(2.8, 1.6, clamp(u_softness, 0.0, 1.0));
  vec3 meshLab = vec3(0.0);
  float wsum = 0.0;
  vec3 spikeRgb = vec3(0.0);
  for (int i = 0; i < ${N}; i++) {
    vec2 ap = u_anchorPos[i];
    vec2 paa = vec2(ap.x * aspect, ap.y);
    if (u_anchorKind[i] == 1) {
      // Spike: two thin perpendicular beams + a bright core, additive.
      vec2 d = puv - paa;
      float beamSigma2 = 0.000022;          // ~thickness 0.005 in puv units
      float hBeam = exp(-d.y * d.y / beamSigma2);
      float vBeam = exp(-d.x * d.x / beamSigma2);
      float dist2 = dot(d, d);
      float reach = exp(-dist2 / 0.025);    // beams fade out past a radius
      float core = exp(-dist2 / 0.0035);    // tight hot center
      float intensity = (max(hBeam, vBeam) * reach + core * 1.8) * u_weights[i];
      spikeRgb += oklabToRgb(u_anchorLab[i]) * intensity;
    } else {
      // Glow: Shepard inverse-distance weighting into the mesh.
      float d = distance(puv, paa);
      float w = u_weights[i] / pow(d + 0.001, falloff);
      meshLab += u_anchorLab[i] * w;
      wsum += w;
    }
  }
  vec3 meshRgb;
  if (wsum > 1e-3) {
    meshLab /= wsum;
    meshRgb = oklabToRgb(meshLab);
  } else {
    // All anchors are spikes — leave the mesh slot dark so bloom/noise can
    // still show through without saturated junk from div-by-tiny.
    meshLab = vec3(0.0);
    meshRgb = vec3(0.0);
  }

  // Bloom layer.
  vec3 bloomRgb = texture(u_bloom, uv).rgb;
  // Mix bloom with mesh by extra blur if softness is high — re-sample
  // a slightly offset bloom and average.
  float blurAmt = mix(0.0, 0.02, u_softness);
  bloomRgb = (
    bloomRgb +
    texture(u_bloom, uv + vec2(blurAmt, 0.0)).rgb +
    texture(u_bloom, uv - vec2(blurAmt, 0.0)).rgb +
    texture(u_bloom, uv + vec2(0.0, blurAmt)).rgb +
    texture(u_bloom, uv - vec2(0.0, blurAmt)).rgb
  ) / 5.0;

  // Noise layer: modulate hue + lightness in OKLab.
  vec2 nuv = uv * 2.2 + vec2(u_seed * 0.13, u_seed * 0.27);
  float n1 = snoise(nuv + u_time * 0.05);
  float n2 = snoise(nuv * 1.7 - u_time * 0.04);
  // Build a noise color: a slight hue rotation around the mesh color.
  vec3 noiseLab = meshLab;
  float angle = n1 * 0.35;
  float ca = cos(angle); float sa = sin(angle);
  noiseLab.yz = mat2(ca, -sa, sa, ca) * noiseLab.yz;
  noiseLab.x += n2 * 0.05;
  vec3 noiseRgb = oklabToRgb(noiseLab);

  // Composite. Weights are blend strengths; we normalize so the picture
  // never goes black if all sliders are low.
  float ws = u_wBloom + u_wMesh + u_wNoise;
  ws = max(ws, 1e-3);
  vec3 composite =
    (bloomRgb * u_wBloom + meshRgb * u_wMesh + noiseRgb * u_wNoise) / ws;

  // Spikes are added on top, scaled by the mesh slider since they're
  // conceptually part of the anchored-mesh layer (just a different shape).
  // HDR-bright core values will clamp at the end, producing the neon
  // burn-out look at the tips.
  composite += spikeRgb * u_wMesh;

  // Grain.
  float g = (hash(gl_FragCoord.xy + vec2(u_seed * 41.0, u_time * 53.0)) - 0.5);
  composite += vec3(g) * u_grain * 0.08;

  fragColor = vec4(clamp(composite, 0.0, 1.0), 1.0);
}
`;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private bloomTex: WebGLTexture;
  private compiledCount = 0;

  constructor(public readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.bloomTex = gl.createTexture()!;
    this.initBuffers();
    this.compile(8);
  }

  private initBuffers() {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private compile(anchorCount: number) {
    const gl = this.gl;
    if (this.prog) gl.deleteProgram(this.prog);
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource(anchorCount));
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.prog = p;
    this.compiledCount = anchorCount;
  }

  setBloom(image: ImageData) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      image.width,
      image.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image.data,
    );
  }

  render(
    palette: PaletteEntry[],
    anchors: Anchor[],
    params: RenderParams,
  ) {
    const gl = this.gl;
    const n = palette.length;
    if (n !== this.compiledCount) this.compile(n);
    if (!this.prog) return;

    if (
      this.canvas.width !== params.width ||
      this.canvas.height !== params.height
    ) {
      this.canvas.width = params.width;
      this.canvas.height = params.height;
    }

    gl.viewport(0, 0, params.width, params.height);
    gl.useProgram(this.prog);

    const labs = new Float32Array(n * 3);
    const positions = new Float32Array(n * 2);
    const weights = new Float32Array(n);
    const kinds = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      labs[i * 3] = palette[i].oklab[0];
      labs[i * 3 + 1] = palette[i].oklab[1];
      labs[i * 3 + 2] = palette[i].oklab[2];
      positions[i * 2] = anchors[i]?.x ?? 0.5;
      positions[i * 2 + 1] = anchors[i]?.y ?? 0.5;
      weights[i] = Math.max(0.05, palette[i].weight);
      kinds[i] = palette[i].kind === 'spike' ? 1 : 0;
    }

    const u = (name: string) => gl.getUniformLocation(this.prog!, name);
    gl.uniform3fv(u('u_anchorLab'), labs);
    gl.uniform2fv(u('u_anchorPos'), positions);
    gl.uniform1fv(u('u_weights'), weights);
    gl.uniform1iv(u('u_anchorKind'), kinds);
    gl.uniform1f(u('u_wBloom'), params.weights.bloom);
    gl.uniform1f(u('u_wMesh'), params.weights.mesh);
    gl.uniform1f(u('u_wNoise'), params.weights.noise);
    gl.uniform1f(u('u_softness'), params.softness);
    gl.uniform1f(u('u_grain'), params.grain);
    gl.uniform1f(u('u_seed'), params.seed);
    gl.uniform1f(u('u_time'), params.time);
    gl.uniform2f(u('u_resolution'), params.width, params.height);
    gl.uniform1i(u('u_bloom'), 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile error: ' + log);
  }
  return sh;
}
