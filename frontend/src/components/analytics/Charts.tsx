import { useMemo } from 'react'
import { sampleRamp } from '../../lib/colormaps'
import { fmt } from '../../lib/format'
import { cn } from '../../lib/utils'

/**
 * Charts.
 *
 * Hand-rolled SVG rather than a charting library: these are four small, fixed
 * chart types with very specific styling requirements, and a general-purpose
 * library would cost more bundle than the entire terrain engine to draw a
 * histogram. Every chart shares one axis treatment so they read as one
 * instrument panel.
 */

const PAD = { top: 10, right: 8, bottom: 20, left: 34 }

function Axis({
  width,
  height,
  yTicks,
  xLabels,
}: {
  width: number
  height: number
  yTicks: Array<{ y: number; label: string }>
  xLabels: Array<{ x: number; label: string }>
}) {
  return (
    <g>
      {yTicks.map((t) => (
        <g key={t.label}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={t.y}
            y2={t.y}
            stroke="currentColor"
            strokeWidth={1}
            className="text-line"
            strokeDasharray="2 4"
          />
          <text
            x={PAD.left - 6}
            y={t.y + 3}
            textAnchor="end"
            className="fill-current font-mono text-[8px] text-ink-faint"
          >
            {t.label}
          </text>
        </g>
      ))}
      {xLabels.map((t) => (
        <text
          key={t.label}
          x={t.x}
          y={height - 6}
          textAnchor="middle"
          className="fill-current font-mono text-[8px] text-ink-faint"
        >
          {t.label}
        </text>
      ))}
    </g>
  )
}

/* ------------------------------------------------------------- histogram */

export function HistogramChart({
  bins,
  min,
  max,
  unit = 'm',
  ramp = 'hypsometric',
  height = 150,
  diverging = false,
  className,
}: {
  bins: number[]
  min: number
  max: number
  unit?: string
  ramp?: Parameters<typeof sampleRamp>[0]
  height?: number
  diverging?: boolean
  className?: string
}) {
  const width = 320
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const peak = Math.max(...bins, 1)
  const barW = plotW / bins.length

  const yTicks = [0, 0.5, 1].map((f) => ({
    y: PAD.top + plotH * (1 - f),
    label: f === 0 ? '0' : `${Math.round(peak * f).toLocaleString()}`,
  }))

  const xLabels = [
    { x: PAD.left, label: fmt(min, 0) },
    { x: PAD.left + plotW / 2, label: fmt((min + max) / 2, 0) },
    { x: PAD.left + plotW, label: `${fmt(max, 0)}${unit}` },
  ]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      role="img"
      aria-label="Distribution histogram"
    >
      <Axis width={width} height={height} yTicks={yTicks} xLabels={xLabels} />
      {bins.map((count, i) => {
        const h = (count / peak) * plotH
        const t = i / (bins.length - 1)
        const [r, g, b] = sampleRamp(ramp, diverging ? Math.abs(t - 0.5) * 2 : t)
        return (
          <rect
            key={i}
            x={PAD.left + i * barW}
            y={PAD.top + plotH - h}
            width={Math.max(barW - 1, 1)}
            height={h}
            fill={`rgb(${r * 255} ${g * 255} ${b * 255})`}
            opacity={0.85}
          />
        )
      })}
      {diverging && (
        <line
          x1={PAD.left + plotW / 2}
          x2={PAD.left + plotW / 2}
          y1={PAD.top}
          y2={PAD.top + plotH}
          stroke="#2fe3ff"
          strokeWidth={1}
          opacity={0.6}
        />
      )}
    </svg>
  )
}

/* ----------------------------------------------------------- line profile */

export function ProfileChart({
  values,
  reference,
  min,
  max,
  height = 170,
  marker,
  className,
}: {
  values: number[]
  /** Optional second series, drawn as the anchor surface. */
  reference?: number[]
  min: number
  max: number
  height?: number
  /** 0..1 position of the cursor along the transect. */
  marker?: number | null
  className?: string
}) {
  const width = 480
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const toPath = (series: number[]) => {
    const span = max - min || 1
    return series
      .map((v, i) => {
        const x = PAD.left + (i / (series.length - 1)) * plotW
        const y = PAD.top + plotH * (1 - (v - min) / span)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }

  const area = useMemo(() => {
    const path = toPath(values)
    return `${path} L${PAD.left + plotW} ${PAD.top + plotH} L${PAD.left} ${PAD.top + plotH} Z`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, min, max])

  const yTicks = [0, 0.5, 1].map((f) => ({
    y: PAD.top + plotH * (1 - f),
    label: `${fmt(min + (max - min) * f, 0)}`,
  }))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      role="img"
      aria-label="Elevation profile along the selected transect"
    >
      <defs>
        <linearGradient id="dw-profile-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2fe3ff" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#2fe3ff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <Axis
        width={width}
        height={height}
        yTicks={yTicks}
        xLabels={[
          { x: PAD.left, label: 'A' },
          { x: PAD.left + plotW, label: 'B' },
        ]}
      />

      <path d={area} fill="url(#dw-profile-fill)" />

      {reference && (
        <path
          d={toPath(reference)}
          fill="none"
          stroke="#17b3a3"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.75}
        />
      )}

      <path d={toPath(values)} fill="none" stroke="#2fe3ff" strokeWidth={1.5} />

      {marker != null && marker >= 0 && (
        <line
          x1={PAD.left + marker * plotW}
          x2={PAD.left + marker * plotW}
          y1={PAD.top}
          y2={PAD.top + plotH}
          stroke="#f0a63c"
          strokeWidth={1}
          opacity={0.8}
        />
      )}
    </svg>
  )
}

/* ---------------------------------------------------------- scatter / fit */

/**
 * Relative depth against reference elevation, with the fitted line drawn
 * through it. This is the single clearest picture of what calibration does:
 * the cloud is the relationship, the line is the scale and offset solved for.
 */
export function CalibrationScatter({
  points,
  scale,
  offset,
  height = 200,
  className,
}: {
  points: Array<[number, number]>
  scale: number
  offset: number
  height?: number
  className?: string
}) {
  const width = 320
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom

  const yRange = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const [, y] of points) {
      if (y < lo) lo = y
      if (y > hi) hi = y
    }
    const pad = (hi - lo) * 0.08 || 1
    return [lo - pad, hi + pad] as const
  }, [points])

  const px = (x: number) => PAD.left + x * plotW
  const py = (y: number) =>
    PAD.top + plotH * (1 - (y - yRange[0]) / (yRange[1] - yRange[0] || 1))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      role="img"
      aria-label="Relative depth plotted against reference elevation with the fitted line"
    >
      <Axis
        width={width}
        height={height}
        yTicks={[0, 0.5, 1].map((f) => ({
          y: PAD.top + plotH * (1 - f),
          label: fmt(yRange[0] + (yRange[1] - yRange[0]) * f, 0),
        }))}
        xLabels={[
          { x: PAD.left, label: '0.0' },
          { x: PAD.left + plotW / 2, label: '0.5' },
          { x: PAD.left + plotW, label: '1.0' },
        ]}
      />

      {points.map(([x, y], i) => (
        <circle key={i} cx={px(x)} cy={py(y)} r={1.1} fill="#4c86f0" opacity={0.4} />
      ))}

      <line
        x1={px(0)}
        y1={py(offset)}
        x2={px(1)}
        y2={py(scale + offset)}
        stroke="#2fe3ff"
        strokeWidth={1.6}
      />

      <text
        x={width - PAD.right}
        y={PAD.top + 10}
        textAnchor="end"
        className="fill-current font-mono text-[8px] text-cyan-core"
      >
        y = {fmt(scale, 1)}x {offset >= 0 ? '+' : '−'} {fmt(Math.abs(offset), 1)}
      </text>
    </svg>
  )
}
