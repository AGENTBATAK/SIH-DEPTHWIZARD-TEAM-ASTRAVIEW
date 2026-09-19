import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Play } from 'lucide-react'
import { useSceneStore } from '../../hooks/useScene'
import { TerrainSurface } from '../terrain/TerrainSurface'
import { WebGLGate } from '../terrain/WebGLGate'
import { Button } from '../ui/Button'
import { Section, useVisibility } from '../ui/Primitives'
import { useReducedMotion, scrollToSection } from '../../hooks/useSmoothScroll'
import { surfaceY } from '../../lib/raycast'
import type { TerrainData } from '../../types'

/**
 * Closing sequence.
 *
 * A continuous low-altitude pass over the same terrain the rest of the page has
 * been building up — the camera follows the surface rather than flying a fixed
 * path, so it skims ridges instead of clipping through them.
 */

const EXAGGERATION = 2.4

function FlyoverCamera({ terrain, enabled }: { terrain: TerrainData; enabled: boolean }) {
  const { camera } = useThree()
  const elapsed = useRef(0)
  const look = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    elapsed.current += enabled ? delta : 0
    const t = elapsed.current * 0.028

    // Slow figure-of-eight so the pass never repeats exactly on screen.
    const x = Math.sin(t) * 0.3
    const z = Math.cos(t * 0.6) * 0.34
    const ground = surfaceY(x, z, terrain, EXAGGERATION)
    const y = ground + 0.055

    camera.position.lerp(new THREE.Vector3(x, y, z), Math.min(1, delta * 1.6))

    // Look a short distance ahead along the path, at surface height.
    const ax = Math.sin(t + 0.5) * 0.3
    const az = Math.cos((t + 0.5) * 0.6) * 0.34
    look.lerp(
      new THREE.Vector3(ax, surfaceY(ax, az, terrain, EXAGGERATION) + 0.012, az),
      Math.min(1, delta * 1.6),
    )
    camera.lookAt(look)
  })

  return null
}

export function FinalCTA() {
  const [ref, visible] = useVisibility<HTMLDivElement>('300px')
  const scene = useSceneStore((s) => s.scene)
  const navigate = useNavigate()
  const loadDemo = useSceneStore((s) => s.loadDemo)
  const reduced = useReducedMotion()

  return (
    <Section id="cta" className="relative">
      <div ref={ref} className="relative min-h-[100dvh] w-full overflow-hidden bg-void">
        {/* ------------------------------------------------------- flyover */}
        <div className="absolute inset-0">
          {visible && scene ? (
            <WebGLGate terrain={scene.terrain}>
              <Canvas
                dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                camera={{ position: [0, 0.12, 0.34], fov: 58, near: 0.002, far: 12 }}
                events={undefined}
                style={{ pointerEvents: 'none' }}
              >
                <color attach="background" args={['#040507']} />
                <fog attach="fog" args={['#040507', 0.18, 1.05]} />
                <Suspense fallback={null}>
                  <TerrainSurface
                    terrain={scene.terrain}
                    textureUrl={scene.image.url}
                    ramp="hypsometric"
                    exaggeration={EXAGGERATION}
                    fogNear={0.16}
                    fogFar={0.95}
                    layers={{
                      texture: true,
                      elevation: true,
                      contours: true,
                      wireframe: false,
                      referenceDem: false,
                      grid: true,
                      structures: false,
                    }}
                  />
                  <FlyoverCamera terrain={scene.terrain} enabled={!reduced} />
                </Suspense>
              </Canvas>
            </WebGLGate>
          ) : (
            <div className="dw-grid-bg size-full opacity-25" />
          )}
        </div>

        {/* Vignette */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_10%,rgba(4,5,7,0.72)_62%,#040507_100%)]"
        />

        {/* --------------------------------------------------------- copy */}
        <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1680px] flex-col items-center justify-center px-4 text-center sm:px-10">
          <h2 className="font-display font-medium leading-[0.9] tracking-[-0.045em] text-ink">
            <span className="block text-[clamp(2.6rem,9vw,7.5rem)]">SEE THE TERRAIN</span>
            <span className="block bg-[linear-gradient(96deg,#e7eef7_0%,#7fe9f5_50%,#2fe3ff_100%)] bg-clip-text text-[clamp(2.6rem,9vw,7.5rem)] text-transparent">
              DIFFERENTLY.
            </span>
          </h2>

          <p className="mt-8 max-w-xl text-[clamp(0.95rem,1.4vw,1.15rem)] leading-relaxed text-ink-dim">
            One image can become more than a picture.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="primary"
              size="lg"
              trailing={<ArrowRight className="size-4" strokeWidth={1.5} />}
              onClick={() => navigate('/explorer')}
            >
              Launch 3D explorer
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={<Play className="size-4" strokeWidth={1.25} />}
              onClick={() => {
                loadDemo(Math.floor(Math.random() * 100000))
                scrollToSection('explorer')
              }}
            >
              Try a demo scene
            </Button>
          </div>

          <p className="mt-8 max-w-md text-[11.5px] leading-relaxed text-ink-faint">
            Generates a fresh procedural demo scene for the existing explorer. The presentation
            path uses synthetic terrain and does not run depth inference or GIS calibration.
          </p>
        </div>
      </div>

      {/* --------------------------------------------------------- footer */}
      <footer className="relative border-t border-line bg-void">
        <div className="mx-auto max-w-[1680px] px-4 py-24 sm:px-10 lg:px-16">
          <div className="flex flex-col items-center gap-10">
            <div className="text-center">
              <div className="font-display text-[clamp(2rem,7vw,4.5rem)] font-medium leading-none tracking-[0.06em] text-ink/90">
                DEPTHWIZARD
              </div>
              <p className="dw-label mt-5">SINGLE-VIEW HEIGHT ESTIMATION &amp; 3D FLYTHROUGH</p>
            </div>

            <div className="dw-rule w-full max-w-3xl" />

            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              <FooterItem label="EVENT" value="SIH 2026" />
              <FooterItem label="PROBLEM STATEMENT" value="SIH26175" />
              <FooterItem label="ORGANISATION" value="ISRO" accent />
              <FooterItem label="THEME" value="DISASTER MANAGEMENT" />
              <FooterItem label="CATEGORY" value="SOFTWARE" />
            </div>

            <p className="max-w-2xl text-center text-[11px] leading-relaxed text-ink-faint">
              Demo and uploaded scenes are procedurally generated and labelled as simulated. This
              presentation prototype does not claim operational accuracy or replace surveyed
              elevation products.
            </p>
          </div>
        </div>
      </footer>
    </Section>
  )
}

function FooterItem({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="text-center">
      <div className="dw-label mb-2">{label}</div>
      <div className={`dw-value text-[12px] ${accent ? 'text-cyan-core' : 'text-ink-dim'}`}>
        {value}
      </div>
    </div>
  )
}
