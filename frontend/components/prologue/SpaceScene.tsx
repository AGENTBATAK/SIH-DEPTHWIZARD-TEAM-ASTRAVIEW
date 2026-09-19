import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { SCENE_CENTER, type DescentState } from './descent'

/**
 * The space half of the prologue.
 *
 * Scale here is theatrical, not physical: the globe grows and closes rather
 * than the camera crossing 408 km. The alternative — a truthful scale — needs a
 * second camera frustum, because a 6371 km sphere and a 4 km terrain cannot
 * share one depth buffer, and it buys nothing an audience can see. This way the
 * stage camera keeps the hero's existing 0.01/24 near and far planes, so
 * terrain depth precision is untouched by the prologue existing at all.
 *
 * The Earth plate is NASA Blue Marble (public domain) and is labelled as
 * reference imagery on screen. It is not DepthWizard's output, and nothing in
 * the interface may let it read as such.
 */

/**
 * NASA Blue Marble Next Generation, public domain.
 *
 * The colour map is 8192x4096, downsampled from NASA's 21600x10800 original.
 * That is ~134 MB of VRAM with mipmaps, which is affordable on the hardware this
 * is demoed on and buys real sharpness in the window where the globe fills the
 * frame and the cloud pass has not yet taken over — the most-looked-at part of
 * the descent. Powers of two, so mipmapping is exact.
 *
 * The cloud plate stays at its native 2048x1024. NASA publishes no larger
 * combined cloud image, so resampling it up would ship a bigger file containing
 * exactly the same detail.
 */
const EARTH_COLOR = '/textures/earth-color.webp'
const EARTH_CLOUDS = '/textures/earth-clouds.webp'

/* ------------------------------------------------------------- starfield */

/** Deterministic PRNG, so the sky is identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Stars, as a point cloud on an inverted sphere.
 *
 * Brightness is cubed rather than uniform: a real sky is a few bright stars and
 * a great many faint ones. Sampling magnitude uniformly produces an even mist
 * that reads as render noise instead of a sky.
 */
function Starfield({ opacity }: { opacity: React.RefObject<number> }) {
  const matRef = useRef<THREE.PointsMaterial>(null)
  const pointsRef = useRef<THREE.Points>(null)

  const geometry = useMemo(() => {
    const rand = mulberry32(26175)
    const count = 2600
    const radius = 21
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      // Uniform on the sphere. Naive lat/lon sampling clumps at the poles.
      const u = rand() * 2 - 1
      const theta = rand() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      positions[i * 3] = radius * r * Math.cos(theta)
      positions[i * 3 + 1] = radius * u
      positions[i * 3 + 2] = radius * r * Math.sin(theta)

      const mag = Math.pow(rand(), 3.1)
      const warm = 0.82 + 0.18 * rand()
      colors[i * 3] = warm * (0.7 + 0.3 * mag)
      colors[i * 3 + 1] = warm * (0.77 + 0.23 * mag)
      colors[i * 3 + 2] = 0.88 + 0.12 * mag
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [])

  const sprite = useMemo(() => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.NoColorSpace
    return tex
  }, [])

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.opacity = opacity.current
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.004
  })

  useEffect(
    () => () => {
      geometry.dispose()
      sprite.dispose()
    },
    [geometry, sprite],
  )

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={matRef}
        size={0.075}
        map={sprite}
        vertexColors
        transparent
        opacity={1}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/* ----------------------------------------------------------------- globe */

const GLOBE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const GLOBE_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec3  uSunDir;
  uniform float uOpacity;
  uniform float uAtmo;
  uniform vec3  uAtmoColor;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 albedo = texture2D(uMap, vUv).rgb;
    vec3 n = normalize(vNormalW);

    // Wrapped lambert. A hard terminator on a sphere this size reads as a
    // lighting bug; real limb darkening spreads the transition over degrees.
    float ndl = dot(n, normalize(uSunDir));
    float day = pow(clamp((ndl + 0.22) / 1.22, 0.0, 1.0), 0.85);

    // The night side keeps a trace of albedo, so the unlit limb stays a planet
    // rather than becoming a black hole in the middle of the frame.
    vec3 lit = albedo * (0.055 + 1.02 * day);

    // Atmospheric limb: strongest where the view grazes the surface.
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 2.6);
    lit += uAtmoColor * fres * (0.30 + 0.85 * uAtmo) * (0.30 + 0.70 * day);

    gl_FragColor = vec4(lit, uOpacity);
  }
`

const GLOW_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/** Back-faced shell: the atmosphere seen from outside it. */
const GLOW_FRAG = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uSunDir;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    // Drawn on back faces, so the rim is where the normal turns away from us.
    float rim = pow(clamp(dot(viewDir, -n), 0.0, 1.0), 3.4);
    float day = clamp(dot(-n, normalize(uSunDir)) + 0.35, 0.0, 1.0);
    gl_FragColor = vec4(uColor, rim * uOpacity * (0.2 + 0.8 * day));
  }
`

/**
 * Rotation that brings a geographic coordinate under the camera.
 *
 * three.js `SphereGeometry` places texture u = 0.25 on +Z, and an
 * equirectangular plate maps longitude -180..180 onto u 0..1. Solving for the
 * spin that lands the target longitude on +Z gives `pi/2 - 2*pi*u`. Latitude is
 * then a tilt about X by the latitude itself, applied by the parent group so it
 * composes after the spin rather than before it.
 */
function orientationFor([lon, lat]: [number, number]) {
  return {
    spinY: Math.PI / 2 - 2 * Math.PI * ((lon + 180) / 360),
    tiltX: (lat * Math.PI) / 180,
  }
}

const SUN_DIR = new THREE.Vector3(0.72, 0.28, 0.62).normalize()

function Globe({ stateRef }: { stateRef: React.RefObject<DescentState> }) {
  const [colorMap, cloudMap] = useLoader(THREE.TextureLoader, [EARTH_COLOR, EARTH_CLOUDS])

  const tiltRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const cloudsRef = useRef<THREE.Mesh>(null)
  const reticleRef = useRef<THREE.Group>(null)

  const { spinY, tiltX } = useMemo(() => orientationFor(SCENE_CENTER), [])

  const globeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: colorMap },
          uSunDir: { value: SUN_DIR },
          uOpacity: { value: 1 },
          uAtmo: { value: 0 },
          uAtmoColor: { value: new THREE.Color('#3aa9e8') },
        },
        vertexShader: GLOBE_VERT,
        fragmentShader: GLOBE_FRAG,
        transparent: true,
      }),
    [colorMap],
  )

  const cloudMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: cloudMap,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color('#cfe4f2'),
      }),
    [cloudMap],
  )

  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color('#4fbdf2') },
          uSunDir: { value: SUN_DIR },
        },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => {
    for (const t of [colorMap, cloudMap]) {
      t.colorSpace = THREE.NoColorSpace
      // Mipmaps and anisotropy both matter here for the same reason: at the top
      // of the descent the whole plate is squeezed into a few hundred pixels,
      // and at the bottom it is stretched across the viewport at a grazing
      // angle. Without them the globe shimmers on approach and smears on
      // arrival.
      t.generateMipmaps = true
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.magFilter = THREE.LinearFilter
      t.anisotropy = 16
      t.needsUpdate = true
    }
  }, [colorMap, cloudMap])

  useFrame((_, delta) => {
    const s = stateRef.current
    if (!s) return

    if (tiltRef.current) {
      // Latitude tilt, plus the swing that carries the target coordinate from
      // facing the camera to facing straight up. Both are rotations about X, so
      // they simply add — no extra group needed. At nadir = 1 the marked point
      // is on top of the globe, directly under a camera looking down, and the
      // terrain plane at the origin is tangent to the surface there.
      tiltRef.current.rotation.x = tiltX - (Math.PI / 2) * s.nadir
      tiltRef.current.position.set(...s.earthCenter)
      tiltRef.current.scale.setScalar(s.earthRadius)
      tiltRef.current.visible = s.earthOpacity > 0.002
    }
    if (spinRef.current) spinRef.current.rotation.y = spinY + s.spin
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.0035

    globeMat.uniforms.uOpacity.value = s.earthOpacity
    globeMat.uniforms.uAtmo.value = s.atmosphere
    cloudMat.opacity = s.cloudOpacity * 0.5
    glowMat.uniforms.uOpacity.value = s.atmosphere * s.earthOpacity

    // The lock only means anything once the target is a resolvable place, and
    // it has to be gone before the terrain plate covers the spot it marks.
    if (reticleRef.current) {
      reticleRef.current.visible =
        s.altitude < 240_000 && s.earthOpacity > 0.05 && s.terrainOpacity < 0.25
    }
  })

  useEffect(
    () => () => {
      globeMat.dispose()
      cloudMat.dispose()
      glowMat.dispose()
    },
    [globeMat, cloudMat, glowMat],
  )

  return (
    <group ref={tiltRef} position={[0, 0, -1.55]}>
      <group ref={spinRef}>
        <mesh material={globeMat}>
          <sphereGeometry args={[1, 96, 64]} />
        </mesh>
        <mesh ref={cloudsRef} material={cloudMat}>
          <sphereGeometry args={[1.006, 64, 44]} />
        </mesh>

        {/* Target lock. It sits on +Z because the spin above put the scene's
            real longitude there — this marks the actual demo footprint at
            23.2599N 77.4126E, not a decorative spot on a globe. */}
        <group ref={reticleRef} position={[0, 0, 1.004]} visible={false}>
          <mesh>
            <ringGeometry args={[0.03, 0.0335, 48]} />
            <meshBasicMaterial
              color="#2fe3ff"
              transparent
              opacity={0.9}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[0.052, 0.0535, 48]} />
            <meshBasicMaterial
              color="#2fe3ff"
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>

      {/* Atmosphere shell, slightly proud of the surface. */}
      <mesh material={glowMat}>
        <sphereGeometry args={[1.055, 64, 44]} />
      </mesh>
    </group>
  )
}

/* ----------------------------------------------------------------- entry */

export function SpaceScene({ stateRef }: { stateRef: React.RefObject<DescentState> }) {
  const starOpacity = useRef(1)

  useFrame(() => {
    starOpacity.current = stateRef.current?.starOpacity ?? 1
  })

  return (
    <>
      <Starfield opacity={starOpacity} />
      <Globe stateRef={stateRef} />
    </>
  )
}
