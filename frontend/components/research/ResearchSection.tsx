import { ArrowUpRight } from 'lucide-react'
import { LitCard, Reveal, Section, SectionHeading, Tag } from '../ui/Primitives'

/**
 * Research wall.
 *
 * Presented as a set of dependencies with a stated reason, not a bibliography.
 * The "why it matters" line is the point — a list of links proves nothing about
 * whether the team understood what they were building on.
 */

interface Source {
  name: string
  kind: string
  href: string
  description: string
  why: string
}

const SOURCES: Source[] = [
  {
    name: 'NODE.JS HTTP SERVER',
    kind: 'BACKEND',
    href: 'https://nodejs.org/api/http.html',
    description:
      'The local backend persists preview-backed presentation scenes, generates a deterministic terrain raster, and serves the built frontend.',
    why: 'It makes uploads, saved scenes, reopening and deletion work in a self-contained presentation environment.',
  },
  {
    name: 'BROWSER FILE APIs',
    kind: 'INPUT',
    href: 'https://developer.mozilla.org/en-US/docs/Web/API/File_API',
    description:
      'Browser-native image decoding and canvas rendering used to make bounded preview images before a request reaches the local backend.',
    why: 'The original upload remains in the browser while only a preview and basic metadata are sent to local storage.',
  },
  {
    name: 'PROCEDURAL TERRAIN',
    kind: 'PRESENTATION DATA',
    href: 'https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues',
    description:
      'A preview hash selects a repeatable local height field, giving each uploaded scene a stable terrain appearance without interpreting image contents.',
    why: 'It supports a reliable, offline-friendly presentation while making no AI or GIS claim.',
  },
  {
    name: 'THREE.JS',
    kind: 'RENDERING',
    href: 'https://threejs.org/',
    description:
      'WebGL rendering library, used here through React Three Fiber with a custom vertex-displacement shader for the terrain surface.',
    why: 'Interactive WebGL terrain visualisation. GPU displacement from a float height texture is what keeps exaggeration, assembly and flythrough interactive at 65k vertices.',
  },
  {
    name: 'MAPLIBRE GL JS',
    kind: 'MAPPING',
    href: 'https://maplibre.org/maplibre-gl-js/docs/',
    description:
      'Open-source vector map renderer, forked from Mapbox GL JS before its licence change, with no mandatory token.',
    why: 'Optional mapping support for the viewer. By default the presentation uses its own local hillshade and makes no tile requests.',
  },
  {
    name: 'GEOTIFF.JS',
    kind: 'GEOSPATIAL I/O',
    href: 'https://geotiffjs.github.io/',
    description:
      'Pure-JavaScript GeoTIFF reader supporting tiled, compressed and BigTIFF files, with access to GeoKeys and model transformation tags.',
    why: 'Decodes TIFF imagery into a display preview. The presentation path does not use its georeferencing or elevation data for a GIS pipeline.',
  },
  {
    name: 'REACT THREE FIBER',
    kind: 'RENDERING',
    href: 'https://r3f.docs.pmnd.rs/',
    description:
      'React renderer for the WebGL terrain viewer and its shared interactive scene state.',
    why: 'It lets the existing explorer render the synthetic raster as an orbitable and measurable surface.',
  },
  {
    name: 'SIH26175 · ISRO',
    kind: 'PROBLEM STATEMENT',
    href: 'https://www.sih.gov.in/',
    description:
      'Smart India Hackathon 2026 problem statement under the Disaster Management theme: single-view height estimation and 3D flythrough from optical imagery.',
    why: 'The brief this system answers, and the reason the honesty constraints in the interface are treated as requirements rather than polish.',
  },
]

export function ResearchSection() {
  return (
    <Section id="research" className="relative bg-void py-28 sm:py-36 lg:py-44">
      <div className="dw-grid-fine absolute inset-0 opacity-[0.12]" />

      <div className="relative mx-auto max-w-[1680px] px-4 sm:px-10 lg:px-16">
        <SectionHeading
          index="13"
          eyebrow="RESEARCH & DEPENDENCIES"
          title={
            <>
              WHAT THIS
              <br />
              IS BUILT ON
            </>
          }
          lede="The components used by this presentation prototype and what each one is responsible for. The runtime does not include AI inference, reference DEM retrieval or GIS calibration."
        />

        <div className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {SOURCES.map((source, i) => (
            <Reveal key={source.name} delay={(i % 4) * 0.06} className="h-full">
              <LitCard
                bezel
                inner="group flex h-full flex-col p-6"
                className="h-full hover:bg-white/[0.05]"
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <Tag>{source.kind}</Tag>
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-cursor="button"
                    className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-ink-faint transition-[transform,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:translate-x-0.5 hover:text-cyan-core"
                    aria-label={`Open ${source.name} documentation in a new tab`}
                  >
                    <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
                  </a>
                </div>

                <h3 className="font-display text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink">
                  {source.name}
                </h3>

                <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
                  {source.description}
                </p>

                <div className="dw-rule my-4" />

                <div className="mt-auto">
                  <div className="dw-label mb-2 text-cyan-core">WHY IT MATTERS</div>
                  <p className="text-[12px] leading-relaxed text-ink-dim">{source.why}</p>
                </div>
              </LitCard>
            </Reveal>
          ))}
        </div>

        <p className="mt-10 max-w-3xl text-[12px] leading-relaxed text-ink-faint">
          Uploaded presentation scenes have no accuracy benchmark. Their RMSE, MAE and correlation
          fields remain unavailable rather than being estimated or invented.
        </p>
      </div>
    </Section>
  )
}
