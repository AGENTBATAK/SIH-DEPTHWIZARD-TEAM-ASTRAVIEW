/**
 * The descent curve.
 *
 * Everything the prologue does is a pure function of one number: `d`, the
 * scroll progress through the prologue section, 0 in orbit and 1 the moment the
 * camera settles into the hero's orbit. Keeping it pure and in one file means
 * the choreography can be reasoned about — and corrected — without touching a
 * shader or a component.
 *
 * The sequence has three phases, and the middle one is the whole point:
 *
 *   APPROACH   the globe grows from a distant sphere to filling the frame,
 *              while the camera swings from an oblique view to looking
 *              straight down
 *   HANDOFF    the descent passes through cloud. Under that cover, the globe
 *              fades out and the terrain's own RGB plate fades in — flat, and
 *              seen face-on, so it reads as the satellite image it is
 *   RELIEF     the cloud clears, the terrain rises out of that flat image, and
 *              the camera tilts back to the hero's oblique view
 *
 * Two things were wrong with the first version. It cross-faded a sphere into an
 * obliquely-viewed plane — a dissolve between two unrelated shapes, with
 * nothing to hide the cut — and it asked a whole-Earth texture to stay sharp
 * down to a 4 km footprint, which is a 10,000x zoom no plate survives.
 *
 * Going through nadir fixes the first: the two images are then both top-down,
 * so the only thing that visibly changes is flat becoming three-dimensional,
 * which happens to be the product's entire claim. Going through cloud fixes the
 * second, and costs one gradient. Both are what actually happens on a descent.
 */

/**
 * Where the descent starts: geostationary altitude.
 *
 * Not an arbitrary "space" number. INSAT — the constellation India actually
 * flies for disaster monitoring — sits here, and the globe's angular size at
 * d = 0 is tuned to match what Earth subtends from this distance. The readout
 * and the picture therefore agree, which matters more here than in most places:
 * a project whose entire argument is that it never overstates a figure cannot
 * open on a number that contradicts its own frame.
 */
export const ALT_TOP = 35_786_000

/** The demo scene's real footprint, from `lib/terrain.ts` DEFAULTS. */
export const SCENE_CENTER: [number, number] = [77.4126, 23.2599]
export const SCENE_EXTENT_M = 4096

/* ------------------------------------------------------------ phase gates */

/** Camera reaches nadir and the imagery swaps here. */
const NADIR = 0.62

/**
 * End of the nadir hold, and the start of the tilt into the hero view.
 *
 * Sits just before `rise` begins, so the camera is already beginning to turn as
 * the ground starts to lift and the two read as one move rather than two.
 */
const TILT_START = 0.78

/* --------------------------------------------------------------- easing */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Smoothstep over an arbitrary span, clamped outside it. */
export function ramp(x: number, a: number, b: number): number {
  if (b === a) return x < a ? 0 : 1
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Slightly eased scroll progress. The descent should settle rather than stop
 * dead, but the easing stays gentle — a scrubbed animation that lags the
 * scrollbar too much feels broken rather than smooth.
 */
const easeDescent = (d: number) => {
  const t = clamp01(d)
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/* --------------------------------------------------------------- camera */

export interface DescentCamera {
  position: [number, number, number]
  target: [number, number, number]
}

/**
 * The hero's orbit at elapsed time zero.
 *
 * The descent ends exactly here, so the two rigs coincide at the handover and
 * the switch is invisible. If you change the hero's orbit, change this with it.
 */
export const HERO_CAMERA: DescentCamera = {
  position: [0, 0.44, 1.02],
  target: [-0.22, 0.045, 0],
}

/** Camera vertical field of view, radians. Must match the stage canvas. */
const FOV = (38 * Math.PI) / 180
const HALF_FOV_TAN = Math.tan(FOV / 2)

/**
 * Height of the nadir hold, chosen from the viewport's aspect ratio.
 *
 * The terrain is a 1x1 plane. Looking straight down from height h, the camera
 * sees `2*h*tan(fov/2)` of ground vertically and that times the aspect ratio
 * horizontally. If that exceeds 1 the plate's own edges are in frame, and the
 * cloud clears to reveal a square tile floating in a black void instead of
 * ground — which is precisely as unconvincing as it sounds. The first version
 * of this held at 0.95, which overshoots on anything wider than 4:3.
 *
 * So: as high as possible, because height is sharpness — the RGB plate is
 * 1024² and every unit of extra altitude packs more of its texels into the same
 * pixels — but never so high that an edge shows.
 *
 * The 0.82 is not the 4% margin it looks like. The camera is tilted a few
 * degrees off vertical (see NADIR_Z_RATIO), so the far half of the frame looks at
 * ground that is further away and therefore sees it wider — about 10% wider at
 * the top edge. A margin computed for a perfectly vertical camera puts the far
 * corners just past the plate, which shows up as a dark wedge in the top
 * corners rather than as anything obviously geometric. This accounts for it.
 */
export function nadirHeightFor(aspect: number): number {
  return Math.min(0.7, 0.82 / (2 * HALF_FOV_TAN * Math.max(1, aspect)))
}

/**
 * Nadir: directly over the scene, looking down.
 *
 * The small z offset is deliberate. With the camera exactly above its target
 * the view direction is parallel to the world up vector, `lookAt` has no unique
 * solution, and the camera rolls unpredictably as it crosses the singularity.
 * A few degrees off vertical costs nothing visually and avoids it entirely.
 *
 * Expressed as a ratio of the camera's height rather than as a fixed distance,
 * so the tilt is the same few degrees whatever the aspect ratio. A constant
 * offset does not survive a wide viewport: the hold height drops to keep the
 * plate overfilling the frame, the same offset then subtends a much steeper
 * angle — 11° at 2560px against 8° at 1440px — and the extra perspective widens
 * the far side past the plate's edge. Holding the angle fixed keeps the margin
 * in `nadirHeightFor` valid everywhere instead of only at the aspect it was
 * tuned against.
 */
const NADIR_Z_RATIO = 0.12
const DEFAULT_ASPECT = 16 / 9

const nadirCamera = (aspect: number): DescentCamera => {
  const y = nadirHeightFor(aspect)
  return { position: [0, y, y * NADIR_Z_RATIO], target: [0, 0, 0] }
}

export function descentCameraAt(d: number, aspect = DEFAULT_ASPECT): DescentCamera {
  const t = clamp01(d)
  const nadir = nadirCamera(aspect)
  const [, nadirY, nadirZ] = nadir.position

  if (t <= NADIR) {
    // Approach: swing from an oblique view of the distant globe to straight
    // down over the scene.
    const k = easeDescent(t / NADIR)
    return {
      position: [0, lerp(0.2, nadirY, k), lerp(2.4, nadirZ, k)],
      target: [0, 0, 0],
    }
  }

  if (t <= TILT_START) {
    // Hold. The camera is still while the cloud clears and the flat plate is
    // read as an image — this is the beat the relief is a change *from*.
    //
    // The hold is not just pacing. Moving the camera here swings the view off
    // the plate's centre and brings its far corner into frame as a dark wedge,
    // because a 1x1 plane only overfills the viewport from directly above it.
    // Nothing may move until there is relief to justify the new angle.
    return nadir
  }

  // Relief: tilt back off nadir into the hero's oblique view, synchronised with
  // the terrain rising. The plate's edges do come into view here, but by now
  // they are the edges of a three-dimensional landform rather than of a
  // suspiciously flat rectangle — which is what the hero shows anyway.
  const k = easeDescent((t - TILT_START) / (1 - TILT_START))
  return {
    position: [
      lerp(0, HERO_CAMERA.position[0], k),
      lerp(nadirY, HERO_CAMERA.position[1], k),
      lerp(nadirZ, HERO_CAMERA.position[2], k),
    ],
    target: [
      lerp(0, HERO_CAMERA.target[0], k),
      lerp(0, HERO_CAMERA.target[1], k),
      0,
    ],
  }
}

/* ------------------------------------------------------------- altitude */

/**
 * Metres above the scene.
 *
 * Piecewise, and the second half is not an animation curve at all: once the
 * camera is over the scene, altitude is literally its height in world units
 * times the scene's 4096 m extent. The readout stops being a number chosen to
 * look right and becomes a measurement of where the camera is — which is the
 * only version of it this project has any business showing.
 *
 * Above nadir there is no scene to be above yet, so that stretch interpolates
 * logarithmically: equal scroll buys equal *ratio* of altitude, the way an
 * actual approach feels, rather than equal metres.
 */
export function altitudeAt(d: number, aspect = DEFAULT_ASPECT): number {
  const t = clamp01(d)

  // Over the scene, altitude is not interpolated at all — it is the camera's
  // own height in world units times the scene's extent. During the hold it is
  // therefore constant, because the camera genuinely is not moving.
  if (t > NADIR) return descentCameraAt(t, aspect).position[1] * SCENE_EXTENT_M

  const k = easeDescent(t / NADIR)
  const nadirAltitude = nadirHeightFor(aspect) * SCENE_EXTENT_M
  return Math.exp(lerp(Math.log(ALT_TOP), Math.log(nadirAltitude), k))
}

/** Altitude formatted the way an instrument would show it. */
export function formatAltitude(metres: number): string {
  if (metres >= 10_000) return `${(metres / 1000).toFixed(0)} km`
  if (metres >= 1_000) return `${(metres / 1000).toFixed(2)} km`
  if (metres >= 10) return `${metres.toFixed(0)} m`
  return `${metres.toFixed(1)} m`
}

/* ------------------------------------------------------------ the stage */

export interface DescentState {
  /** Sphere radius in world units. Grows as the camera closes on the surface. */
  earthRadius: number
  /** Globe centre, world units. */
  earthCenter: [number, number, number]
  /**
   * 0 = globe sits ahead of the camera; 1 = globe sits directly below, with the
   * target coordinate on top of it and the terrain plane tangent to its surface.
   */
  nadir: number
  earthOpacity: number
  /** Atmospheric rim intensity — ignites on entry, gone before the handoff. */
  atmosphere: number
  cloudOpacity: number
  starOpacity: number
  /**
   * Full-frame cloud wash, 0..1.
   *
   * This is what actually makes the handoff work. A whole-Earth plate cannot
   * resolve a 4 km footprint — that is a 10,000x zoom, and no texture survives
   * it — so cross-fading the globe directly into the terrain means cross-fading
   * a blurred image into a sharp one, which is exactly the kind of seam the eye
   * is good at catching. Descending through cloud covers the swap completely,
   * costs one gradient, and is the thing that physically happens when you come
   * down through an atmosphere.
   */
  haze: number
  /** Terrain surface opacity. */
  terrainOpacity: number
  /** Drives the terrain shader's `uRise` assembly. */
  rise: number
  /** Longitude spin applied to the globe, radians. */
  spin: number
  altitude: number
}

export function descentStateAt(d: number, aspect = DEFAULT_ASPECT): DescentState {
  const t = clamp01(d)
  const k = easeDescent(t)

  // How far the globe has swung from "ahead of the camera" to "underfoot".
  // It has to complete before the imagery swap, or the two surfaces are not
  // parallel at the moment they cross-fade and the seam becomes visible.
  const nadir = ramp(t, 0.16, NADIR)

  const radius = lerp(0.6, 5.4, k)
  // Distance is only meaningful while the globe is still ahead; once it is
  // underfoot its centre is one radius below the surface, by definition.
  const ahead = lerp(1.55, 1.1, k)

  return {
    earthRadius: radius,
    earthCenter: [0, -radius * nadir, -ahead * (1 - nadir)],
    nadir,

    // Holds full until the terrain plate is completely opaque over it. Fading
    // the globe first would show the void through a half-formed surface.
    earthOpacity: 1 - ramp(t, 0.58, 0.68),

    // Ignites through entry, then clears before nadir: at nadir we are notionally
    // inside the atmosphere, so a limb glow would be looking at it from outside.
    atmosphere: Math.min(ramp(t, 0.14, 0.4), 1 - ramp(t, 0.5, 0.62)),
    cloudOpacity: (1 - ramp(t, 0.46, 0.6)) * ramp(t, 0.04, 0.2),

    // Stars wash out as the atmosphere thickens, exactly as they do on entry.
    starOpacity: 1 - ramp(t, 0.26, 0.54),

    // Rises to cover the frame, holds through the swap, then clears to reveal
    // the terrain. Both fades below happen underneath it.
    haze: Math.min(ramp(t, 0.5, 0.62), 1 - ramp(t, 0.66, 0.76)),

    // The plate arrives inside the cloud, where there is nothing to see it
    // arrive against.
    terrainOpacity: ramp(t, 0.56, 0.66),

    // Relief comes last, on its own, once the globe is gone. This is the only
    // thing that visibly changes at the handoff — and it is the product's claim.
    // Held back until the cloud has fully cleared, so the flat satellite plate
    // is on screen by itself for a moment first. Without that beat there is
    // nothing for the relief to be a change *from*.
    rise: ramp(t, 0.8, 0.99),

    spin: lerp(-0.62, 0, k),
    altitude: altitudeAt(t, aspect),
  }
}

/* ---------------------------------------------------------------- beats */

export interface Beat {
  id: string
  text: string
  /** Fully visible between `in` and `out`; fades over `fade` either side. */
  in: number
  out: number
}

/**
 * Three lines, each held then released. They are the project's argument in
 * order: what orbital sensing gives you, what disaster response actually needs,
 * and what DepthWizard claims — stated with the same care as the README.
 *
 * The third lands with the relief, so the claim and the thing it describes
 * arrive together.
 */
export const BEATS: Beat[] = [
  { id: 'flat', text: 'Orbital sensors see the world flat.', in: 0.04, out: 0.28 },
  {
    id: 'need',
    text: 'Elevation is what disaster response actually needs.',
    in: 0.34, out: 0.58,
  },
  {
    id: 'claim',
    text: 'One image. Anchored to reference. Measured in metres.',
    in: 0.74, out: 0.97,
  },
]

const FADE = 0.05

/** Opacity for a beat at progress `d`. */
export function beatOpacityAt(beat: Beat, d: number): number {
  return Math.min(ramp(d, beat.in, beat.in + FADE), 1 - ramp(d, beat.out - FADE, beat.out))
}
