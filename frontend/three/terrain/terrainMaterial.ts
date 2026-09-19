import * as THREE from 'three'
import { rampToLUT, type RampName } from '../../lib/colormaps'

/**
 * The terrain shader.
 *
 * Displacement happens in the vertex shader from a float height texture rather
 * than by rewriting geometry on the CPU. That is what makes the exaggeration
 * slider instant at 256×256 and what lets the scroll-driven "assembly" sequence
 * animate 65k vertices without touching a single buffer per frame.
 *
 * Normals are recomputed per-vertex from neighbouring texels, so lighting stays
 * correct at any exaggeration — a common shortcut is to keep the flat-plane
 * normals, which makes an exaggerated terrain look inexplicably matte.
 */

export interface TerrainUniforms {
  uHeightTex: { value: THREE.DataTexture | null }
  uRgbTex: { value: THREE.Texture | null }
  uLut: { value: THREE.DataTexture | null }
  uHeightRange: { value: THREE.Vector2 }
  /** World units per metre. Keeps exaggeration = 1 physically truthful. */
  uYScale: { value: number }
  uExaggeration: { value: number }
  uRise: { value: number }
  /**
   * How much `uRise` also controls opacity.
   *
   * 1 = the surface fades in as it assembles, which is what the hero's boot
   * sequence wants. 0 = the surface is fully opaque at any rise, including 0,
   * so a completely flat terrain still renders as a solid plate.
   *
   * That distinction is load-bearing for the descent. Alpha used to be
   * `uOpacity * vRise` unconditionally, which made "show the flat satellite
   * image, then lift it into relief" impossible to express — at rise 0 the
   * surface was invisible, so the cloud cleared onto an empty frame and the
   * terrain only appeared as it rose.
   */
  uRiseFade: { value: number }
  uTexel: { value: number }
  uTextureMix: { value: number }
  uContour: { value: number }
  uContourInterval: { value: number }
  uGrid: { value: number }
  uGridDivisions: { value: number }
  uTime: { value: number }
  uCursor: { value: THREE.Vector2 }
  uCursorStrength: { value: number }
  uSunDir: { value: THREE.Vector3 }
  uFogColor: { value: THREE.Color }
  uFogNear: { value: number }
  uFogFar: { value: number }
  uOpacity: { value: number }
  uWireMode: { value: number }
  uScanline: { value: number }
  [key: string]: THREE.IUniform
}

const VERTEX = /* glsl */ `
  uniform sampler2D uHeightTex;
  uniform vec2  uHeightRange;
  uniform float uYScale;
  uniform float uExaggeration;
  uniform float uRise;
  uniform float uTexel;

  varying vec2  vUv;
  varying float vElev;        // metres
  varying vec3  vNormalW;
  varying vec3  vPosW;
  varying float vRise;

  // The height texture stores elevation normalised to 0..1 so it can be a
  // half-float (R16F), which WebGL2 guarantees is linearly filterable. R32F is
  // only filterable with OES_texture_float_linear, which not every device has —
  // and without linear filtering the surface visibly facets.
  float hAt(vec2 uv) {
    return texture2D(uHeightTex, clamp(uv, 0.0, 1.0)).r;
  }

  void main() {
    vUv = uv;

    float range = max(1e-5, uHeightRange.y - uHeightRange.x);
    float hNorm = hAt(uv);
    float h = uHeightRange.x + hNorm * range;
    vElev = h;

    // Radially staggered assembly: the centre settles first, edges follow.
    float d = length(uv - 0.5) * 1.41421356;
    float local = clamp((uRise - d * 0.3) / 0.7, 0.0, 1.0);
    local = local * local * (3.0 - 2.0 * local);
    vRise = local;

    float scale = uYScale * uExaggeration * local * range;
    float z = hNorm * scale;

    // Central differences on the height texture -> analytic normal.
    float hL = hAt(uv - vec2(uTexel, 0.0));
    float hR = hAt(uv + vec2(uTexel, 0.0));
    float hD = hAt(uv - vec2(0.0, uTexel));
    float hU = hAt(uv + vec2(0.0, uTexel));
    // uv step of uTexel spans (uTexel * 1.0) world units on a unit-sized plane.
    vec3 nLocal = normalize(vec3(
      -(hR - hL) * scale / (2.0 * uTexel),
      -(hU - hD) * scale / (2.0 * uTexel),
      1.0
    ));

    vec3 displaced = vec3(position.xy, z);
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * nLocal);

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uRgbTex;
  uniform sampler2D uLut;
  uniform vec2  uHeightRange;
  uniform float uTextureMix;
  uniform float uContour;
  uniform float uContourInterval;
  uniform float uGrid;
  uniform float uGridDivisions;
  uniform float uTime;
  uniform vec2  uCursor;
  uniform float uCursorStrength;
  uniform vec3  uSunDir;
  uniform vec3  uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uOpacity;
  uniform float uWireMode;
  uniform float uScanline;
  uniform float uRiseFade;

  varying vec2  vUv;
  varying float vElev;
  varying vec3  vNormalW;
  varying vec3  vPosW;
  varying float vRise;

  void main() {
    float t = clamp((vElev - uHeightRange.x) / max(1e-5, uHeightRange.y - uHeightRange.x), 0.0, 1.0);

    vec3 elevationColor = texture2D(uLut, vec2(t, 0.5)).rgb;
    vec3 rgbColor = texture2D(uRgbTex, vUv).rgb;
    vec3 base = mix(elevationColor, rgbColor, uTextureMix);

    // ---- lighting
    vec3 n = normalize(vNormalW);
    float lambert = max(dot(n, normalize(uSunDir)), 0.0);
    // Sky term keeps shadowed faces readable instead of crushing to black.
    float sky = 0.5 + 0.5 * n.y;
    vec3 lit = base * (0.30 + 0.85 * lambert) + base * sky * 0.16;

    // Cool rim on silhouette edges.
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 3.0);
    lit += vec3(0.10, 0.55, 0.72) * fres * 0.24;

    // ---- contours, drawn in elevation space so spacing is metric
    if (uContour > 0.5) {
      float e = vElev / max(uContourInterval, 1e-4);
      float f = fract(e);
      float w = fwidth(e);
      float line = 1.0 - smoothstep(0.0, w * 1.4, min(f, 1.0 - f));
      // Every fifth line is an index contour, as on a real topographic sheet.
      float index = step(0.5, 1.0 - abs(fract(e / 5.0) - 0.0));
      lit = mix(lit, vec3(0.72, 0.93, 1.0), line * (0.20 + 0.16 * index));
    }

    // ---- coordinate graticule
    if (uGrid > 0.5) {
      vec2 g = vUv * uGridDivisions;
      vec2 gf = abs(fract(g) - 0.5);
      vec2 gw = fwidth(g);
      float gl = 1.0 - min(smoothstep(0.0, gw.x * 1.2, gf.x), smoothstep(0.0, gw.y * 1.2, gf.y));
      lit = mix(lit, vec3(0.18, 0.72, 0.92), gl * 0.16);
    }

    // ---- cursor reticle
    if (uCursorStrength > 0.01) {
      float d = distance(vUv, uCursor);
      float ring = smoothstep(0.014, 0.011, abs(d - 0.022));
      float glow = smoothstep(0.06, 0.0, d) * 0.25;
      lit += vec3(0.25, 0.88, 1.0) * (ring * 0.55 + glow) * uCursorStrength;
    }

    // ---- slow scan sweep, kept faint
    if (uScanline > 0.01) {
      float sweep = fract(uTime * 0.08);
      float band = smoothstep(0.012, 0.0, abs(vUv.y - sweep));
      lit += vec3(0.16, 0.72, 0.95) * band * 0.18 * uScanline;
    }

    // Rise drives opacity only when asked to. See uRiseFade.
    float riseAlpha = mix(1.0, vRise, uRiseFade);

    // ---- wireframe overlay pass
    if (uWireMode > 0.5) {
      float glowT = 0.35 + 0.65 * t;
      gl_FragColor = vec4(vec3(0.16, 0.68, 0.88) * glowT, 0.30 * uOpacity * riseAlpha);
      return;
    }

    // ---- fog
    float depth = length(vPosW - cameraPosition);
    float fogF = smoothstep(uFogNear, uFogFar, depth);
    lit = mix(lit, uFogColor, fogF * 0.92);

    // Terrain fades in with the assembly rather than popping — unless the
    // caller is driving opacity itself, as the descent does.
    gl_FragColor = vec4(lit, uOpacity * riseAlpha);
  }
`

/* ------------------------------------------------------------- factories */

/** IEEE 754 binary32 -> binary16, for R16F texture upload. */
function toHalf(value: number): number {
  const f = new Float32Array(1)
  const i = new Int32Array(f.buffer)
  f[0] = value
  const x = i[0]
  const sign = (x >> 16) & 0x8000
  let exponent = ((x >> 23) & 0xff) - 127 + 15
  const mantissa = x & 0x7fffff

  if (exponent <= 0) return sign // underflow -> signed zero
  if (exponent >= 0x1f) return sign | 0x7c00 // overflow -> signed infinity
  return sign | (exponent << 10) | (mantissa >> 13)
}

/**
 * Upload a height field as a normalised half-float texture.
 *
 * Normalising to 0..1 first is what makes 16 bits enough: over a 200 m scene the
 * quantisation step is well under a centimetre, and R16F is filterable on every
 * WebGL2 device, unlike R32F.
 */
export function createHeightTexture(
  heights: Float32Array,
  size: number,
  min: number,
  max: number,
): THREE.DataTexture {
  const range = max - min || 1
  const data = new Uint16Array(heights.length)
  for (let i = 0; i < heights.length; i++) {
    data[i] = toHalf((heights[i] - min) / range)
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.HalfFloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

export function createLutTexture(ramp: RampName): THREE.DataTexture {
  const tex = new THREE.DataTexture(rampToLUT(ramp), 256, 1, THREE.RGBAFormat)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

export interface TerrainMaterialOptions {
  size: number
  minElevation: number
  maxElevation: number
  extentMeters: number
  wireframe?: boolean
}

export function createTerrainMaterial(opts: TerrainMaterialOptions): THREE.ShaderMaterial {
  const uniforms: TerrainUniforms = {
    uHeightTex: { value: null },
    uRgbTex: { value: null },
    uLut: { value: null },
    uHeightRange: { value: new THREE.Vector2(opts.minElevation, opts.maxElevation) },
    uYScale: { value: 1 / opts.extentMeters },
    uExaggeration: { value: 1.6 },
    uRise: { value: 1 },
    uRiseFade: { value: 1 },
    uTexel: { value: 1 / opts.size },
    uTextureMix: { value: 0.6 },
    uContour: { value: 1 },
    uContourInterval: { value: contourIntervalFor(opts.maxElevation - opts.minElevation) },
    uGrid: { value: 1 },
    uGridDivisions: { value: 16 },
    uTime: { value: 0 },
    uCursor: { value: new THREE.Vector2(-1, -1) },
    uCursorStrength: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
    uFogColor: { value: new THREE.Color('#040507') },
    uFogNear: { value: 1.1 },
    uFogFar: { value: 3.4 },
    uOpacity: { value: 1 },
    uWireMode: { value: opts.wireframe ? 1 : 0 },
    uScanline: { value: 0 },
  }

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    wireframe: Boolean(opts.wireframe),
    depthWrite: !opts.wireframe,
    side: THREE.DoubleSide,
  })
}

/** Pick a contour interval that yields a legible number of lines for the range. */
export function contourIntervalFor(range: number): number {
  const target = 18
  const raw = Math.max(range, 1) / target
  const candidates = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500]
  return candidates.find((c) => c >= raw) ?? 1000
}

/* ------------------------------------------------------------ point cloud */

const POINT_VERTEX = /* glsl */ `
  uniform sampler2D uHeightTex;
  uniform vec2  uHeightRange;
  uniform float uYScale;
  uniform float uExaggeration;
  uniform float uMorph;      // 0 = flat image plane, 1 = settled on the surface
  uniform float uScatter;    // mid-transition explosion
  uniform float uSize;
  uniform float uTime;

  varying float vT;
  varying vec2  vUv;

  // Cheap hash for per-point scatter direction.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vUv = uv;
    float range = max(1e-5, uHeightRange.y - uHeightRange.x);
    vT = clamp(texture2D(uHeightTex, uv).r, 0.0, 1.0);

    float z = vT * uYScale * uExaggeration * range;

    vec3 pos = vec3(position.xy, mix(0.0, z, uMorph));

    // Points bloom outward at the midpoint of the transition, then converge.
    float r1 = hash(uv * 91.7);
    float r2 = hash(uv * 47.3 + 11.0);
    vec3 dir = normalize(vec3(r1 - 0.5, r2 - 0.5, 0.35));
    pos += dir * uScatter * (0.05 + 0.09 * r1);
    pos.z += sin(uTime * 0.6 + r1 * 6.283) * 0.004 * uScatter;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 / max(0.15, -mv.z));
  }
`

const POINT_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uLut;
  uniform sampler2D uRgbTex;
  uniform float uTextureMix;
  uniform float uOpacity;

  varying float vT;
  varying vec2  vUv;

  void main() {
    // Round, soft-edged point sprite.
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float alpha = smoothstep(0.25, 0.02, d);

    vec3 elevationColor = texture2D(uLut, vec2(vT, 0.5)).rgb;
    vec3 rgbColor = texture2D(uRgbTex, vUv).rgb;
    vec3 col = mix(elevationColor, rgbColor, uTextureMix);

    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`

export function createPointsMaterial(opts: {
  minElevation: number
  maxElevation: number
  extentMeters: number
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeightTex: { value: null },
      uRgbTex: { value: null },
      uLut: { value: null },
      uHeightRange: { value: new THREE.Vector2(opts.minElevation, opts.maxElevation) },
      uYScale: { value: 1 / opts.extentMeters },
      uExaggeration: { value: 1.6 },
      uMorph: { value: 0 },
      uScatter: { value: 0 },
      uSize: { value: 1.1 },
      uTime: { value: 0 },
      uTextureMix: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/** Release every GPU resource a terrain material owns. */
export function disposeMaterial(material: THREE.ShaderMaterial) {
  for (const key of Object.keys(material.uniforms)) {
    const value = material.uniforms[key]?.value
    if (value instanceof THREE.Texture) value.dispose()
  }
  material.dispose()
}
