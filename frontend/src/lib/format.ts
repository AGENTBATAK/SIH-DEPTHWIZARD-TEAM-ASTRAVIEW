/** Presentation helpers. Kept out of components so number formatting stays uniform. */

export function fmt(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '--'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function fmtInt(value: number): string {
  if (!Number.isFinite(value)) return '--'
  return Math.round(value).toLocaleString('en-US')
}

export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '--'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

/** Signed degrees to a padded compass-style bearing, e.g. 042. */
export function fmtBearing(deg: number): string {
  const d = ((deg % 360) + 360) % 360
  return String(Math.round(d)).padStart(3, '0')
}

/** Decimal degrees with a hemisphere suffix. */
export function fmtLat(lat: number, decimals = 4): string {
  return `${Math.abs(lat).toFixed(decimals)}° ${lat >= 0 ? 'N' : 'S'}`
}

export function fmtLon(lon: number, decimals = 4): string {
  return `${Math.abs(lon).toFixed(decimals)}° ${lon >= 0 ? 'E' : 'W'}`
}

/** Milliseconds to the hh:mm:ss.ss readout used in the hero telemetry. */
export function fmtElapsed(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}
