export interface MosaicSettings {
  tileSize: number;    // pixels
  glossAmount: number; // 0–1
  gap: number;         // pixels
  roundness: number;   // 0–0.5 (0=square, 0.5=circle)
}

export const DEFAULT_SETTINGS: MosaicSettings = {
  tileSize: 24,
  glossAmount: 0.65,
  gap: 2,
  roundness: 0.15,
};

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 out_color;

uniform sampler2D u_src;
uniform vec2 u_res;
uniform float u_tile;
uniform float u_gloss;
uniform float u_gap;
uniform float u_round;

void main() {
  vec2 tileUV = vec2(u_tile) / u_res;

  vec2 tileIdx = floor(v_uv / tileUV);
  vec2 local   = fract(v_uv / tileUV);

  // sample source at tile center
  vec2 center = clamp((tileIdx + 0.5) * tileUV, 0.0, 1.0);
  vec4 src = texture(u_src, center);

  // gap fraction within tile
  float gf = clamp(u_gap / max(u_tile, 1.0), 0.0, 0.49);

  // inner UV [0,1] inside the tile, excluding gap
  vec2 inner = clamp((local - gf) / max(1.0 - 2.0 * gf, 0.001), 0.0, 1.0);

  // gap mask: 0 in the gap border, 1 inside
  float gapMask = step(gf, local.x) * step(local.x, 1.0 - gf)
                * step(gf, local.y) * step(local.y, 1.0 - gf);

  // rounded-rect SDF  (r in inner-UV units)
  float r = u_round;
  vec2 p   = abs(inner - 0.5) - (0.5 - r);
  float sdf = length(max(p, 0.0)) + min(max(p.x, p.y), 0.0) - r;
  float shapeMask = (1.0 - smoothstep(-0.01, 0.01, sdf)) * gapMask;

  // bevel: edge darkening for depth
  float edge  = min(min(inner.x, 1.0 - inner.x), min(inner.y, 1.0 - inner.y));
  float bevel = smoothstep(0.0, 0.11, edge);

  // primary specular highlight — upper-left oval
  vec2 h1    = (inner - vec2(0.30, 0.27)) / vec2(0.23, 0.17);
  float s1   = exp(-dot(h1, h1) * 2.3);

  // secondary bar — top-center strip
  vec2 h2    = (inner - vec2(0.50, 0.18)) / vec2(0.38, 0.09);
  float s2   = exp(-dot(h2, h2) * 3.0) * 0.38;

  float spec = clamp((s1 + s2) * u_gloss, 0.0, 0.88);

  // base color with mild saturation lift
  vec3 col  = src.rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(lum), col, 1.12), 0.0, 1.0);

  // bevel shading
  col *= 0.52 + 0.48 * bevel;

  // soft top-light gradient
  col *= 1.0 + 0.07 * (0.5 - inner.y);

  // specular highlight
  col = mix(col, vec3(1.0), spec * bevel);

  // blend with dark gap/corner background
  col = mix(vec3(0.05), col, shapeMask);

  out_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile error');
  return s;
}

export class MosaicRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private tex: WebGLTexture;
  private uloc: Record<string, WebGLUniformLocation | null> = {};
  private ready = false;
  sourceAspect = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
    this.prog = prog;

    for (const name of ['u_src', 'u_res', 'u_tile', 'u_gloss', 'u_gap', 'u_round'])
      this.uloc[name] = gl.getUniformLocation(prog, name);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  -1,  1,
      -1,  1,  1, -1,   1,  1,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  load(source: HTMLImageElement | HTMLVideoElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (source instanceof HTMLVideoElement)
      this.sourceAspect = source.videoWidth / source.videoHeight;
    else
      this.sourceAspect = source.naturalWidth / source.naturalHeight;
    this.ready = true;
  }

  updateFrame(video: HTMLVideoElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  render(s: MosaicSettings): void {
    if (!this.ready) return;
    const gl = this.gl;
    const { tileSize, glossAmount, gap, roundness } = s;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    gl.uniform1i(this.uloc.u_src, 0);
    gl.uniform2f(this.uloc.u_res, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uloc.u_tile, tileSize);
    gl.uniform1f(this.uloc.u_gloss, glossAmount);
    gl.uniform1f(this.uloc.u_gap, gap);
    gl.uniform1f(this.uloc.u_round, roundness);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
  }
}
