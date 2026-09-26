const nf = (min: number, max = min) => new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })
const cache = new Map<number, Intl.NumberFormat>()
const f = (d: number) => { let x = cache.get(d); if (!x) cache.set(d, (x = nf(d))); return x }

/** Mirrors the Figma copy: $120,667 · $240.38 · $2.47 · $0.0612 · $0.000012 */
export function price(p: number, style: 'compact' | 'table' | 'ticker' = 'compact') {
  if (!isFinite(p)) return '—'
  let d: number
  if (p >= 1000) d = style === 'compact' ? 0 : 2
  else if (p >= 10) d = 2
  else if (p >= 1) d = style === 'table' ? 4 : 2
  else d = Math.min(8, Math.max(4, Math.ceil(-Math.log10(p)) + 1))
  return '$' + f(d).format(p)
}

export function pct(x: number) {
  const v = x * 100
  const s = Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)
  return (v >= 0 ? '+' : '') + s + '%'
}

export function usdCompact(v: number) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

export const prob = (p: number) => Math.round(p * 100) + '%'
