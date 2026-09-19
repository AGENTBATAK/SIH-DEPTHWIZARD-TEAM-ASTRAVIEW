import { AlertTriangle, CheckCircle2, Globe2 } from 'lucide-react'
import type { Scene } from '../../types'
import { Panel, PanelHeader, Tag } from '../ui/Primitives'
import { InlineValue, Metric } from '../ui/Metric'
import { fmtBytes, fmtLat, fmtLon } from '../../lib/format'
import { ENGINE_LABEL, ENGINE_NOTE } from '../../services/depth'

/**
 * Scene metadata panel.
 *
 * Split deliberately: what the file said about itself, then what DepthWizard
 * did with it. The georeferencing verdict gets its own block because it is the
 * single fact that determines whether the elevation numbers below it mean
 * anything in metres.
 */
export function FileMetadata({ scene }: { scene: Scene }) {
  const { image, geo, depth, dsm } = scene
  const georeferenced = geo.georeferenced && Boolean(geo.crs)
  const isDemo = scene.source === 'demo'

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------------ file */}
      <Panel className="p-0">
        <PanelHeader
          title="SOURCE FILE"
          right={<Tag>{image.format.toUpperCase()}</Tag>}
        />
        <div className="space-y-4 p-4">
          <div>
            <div className="dw-label mb-1.5">FILENAME</div>
            <div className="dw-value truncate text-sm text-ink" title={image.filename}>
              {image.filename}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="dw-label mb-1.5">DIMENSIONS</div>
              <div className="dw-value text-sm text-ink">
                <InlineValue value={image.width} decimals={0} unit="" />
                <span className="mx-1 text-ink-faint">×</span>
                <InlineValue value={image.height} decimals={0} unit="" />
              </div>
            </div>
            <div>
              <div className="dw-label mb-1.5">FILE SIZE</div>
              <div className="dw-value text-sm text-ink">
                {image.size.value > 0 ? fmtBytes(image.size.value) : '—'}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* --------------------------------------------------- georeferencing */}
      <Panel className="p-0">
        <PanelHeader
          title="GEOREFERENCE"
          right={
            georeferenced ? (
              <Tag tone="cyan">
                <CheckCircle2 className="size-2.5" />
                DETECTED
              </Tag>
            ) : (
              <Tag tone="amber">
                <AlertTriangle className="size-2.5" />
                NOT USED
              </Tag>
            )
          }
        />
        <div className="space-y-4 p-4">
          {georeferenced ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="dw-label mb-1.5">CRS</div>
                  <div className="dw-value text-sm text-cyan-core">
                    <InlineValue value={geo.crs!} />
                  </div>
                </div>
                {geo.pixelSize && (
                  <div>
                    <div className="dw-label mb-1.5">PIXEL SIZE</div>
                    <div className="dw-value text-sm text-ink">
                      <InlineValue value={geo.pixelSize} decimals={2} />
                    </div>
                  </div>
                )}
              </div>

              {geo.bounds && (
                <div>
                  <div className="dw-label mb-1.5">BOUNDS</div>
                  <div className="dw-value space-y-1 text-[11px] leading-relaxed text-ink-dim">
                    <div>
                      NW {fmtLat(geo.bounds.value[3])} · {fmtLon(geo.bounds.value[0])}
                    </div>
                    <div>
                      SE {fmtLat(geo.bounds.value[1])} · {fmtLon(geo.bounds.value[2])}
                    </div>
                  </div>
                </div>
              )}

              {geo.bands && (
                <div>
                  <div className="dw-label mb-1.5">BANDS</div>
                  <div className="dw-value text-sm text-ink">
                    <InlineValue value={geo.bands} decimals={0} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="border-l border-amber-warn/50 pl-3">
              <p className="text-[12px] leading-relaxed text-ink-dim">
                Georeferencing is not used in this presentation prototype.
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-amber-warn">
                This is synthetic terrain, not reconstructed image geometry. Heights and geographic placement are illustrative, not measurements.
              </p>
            </div>
          )}

          {geo.extra && geo.extra.length > 0 && (
            <div className="border-t border-line pt-3">
              <dl className="space-y-2">
                {geo.extra.map((row) => (
                  <div key={row.key} className="flex items-baseline justify-between gap-3">
                    <dt className="dw-label">{row.key}</dt>
                    <dd className="dw-value max-w-[60%] truncate text-[11px] text-ink-dim">
                      <InlineValue value={row.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </Panel>

      {/* ------------------------------------------------------- processing */}
      <Panel className="p-0">
        <PanelHeader
          title="PRESENTATION DATA"
          right={
            isDemo ? (
              <Tag tone="teal">
                <Globe2 className="size-2.5" />
                DEMO DATA
              </Tag>
            ) : (
              <Tag tone="amber">SYNTHETIC</Tag>
            )
          }
        />
        <div className="space-y-5 p-4">
          <div>
            <div className="dw-label mb-1.5">TERRAIN SOURCE</div>
            <div className="dw-value text-[11px] leading-relaxed text-ink">
              {ENGINE_LABEL[depth.engine]}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              {ENGINE_NOTE[depth.engine]}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Metric label="Generation time" value={depth.elapsedMs} decimals={0} size="sm" />
            <Metric
              label="Illustrative range"
              value={dsm.calibration.scale}
              decimals={1}
              size="sm"
            />
          </div>

          <div>
            <div className="dw-label mb-1.5">SOURCE NOTE</div>
            <div className="dw-value text-[11px] text-ink-dim">
              {dsm.calibration.sourceLabel}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
            <Metric label="Min" value={dsm.min} decimals={0} size="sm" />
            <Metric label="Mean" value={dsm.mean} decimals={0} size="sm" />
            <Metric label="Max" value={dsm.max} decimals={0} size="sm" />
          </div>
        </div>
      </Panel>
    </div>
  )
}
