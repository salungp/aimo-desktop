import { memo, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { CaretDown, CaretUp, ChainBnb, ChainEth } from '../icons'
import { CHAIN, displaySym } from '../data/names'
import { pct, price as fmtPrice } from '../format'

/* Price that flashes green/red on each tick, then decays back (exchange convention). */
export function PriceText({ value, style = 'compact', className = '' }: { value: number; style?: 'compact' | 'table' | 'ticker'; className?: string }) {
  const prev = useRef(value)
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; n: number } | null>(null)
  useEffect(() => {
    if (value !== prev.current && isFinite(prev.current)) {
      const dir = value > prev.current ? 'up' : 'down'
      setFlash((f) => ({ dir, n: (f?.n ?? 0) + 1 }))
    }
    prev.current = value
  }, [value])
  return (
    <span key={flash?.n ?? 0} className={`num ${flash ? `flash-${flash.dir}` : ''} ${className}`}>
      {fmtPrice(value, style)}
    </span>
  )
}

export function ChangeBadge({ value, size = 12 }: { value: number; size?: 10 | 12 }) {
  const up = value >= 0
  return (
    <span className={`badge-chg num ${up ? 'up' : 'down'} ${size === 12 ? 't-12r' : 't-10m'}`}>
      {up ? <CaretUp /> : <CaretDown />}
      {pct(value)}
    </span>
  )
}

/* 69 × 27.43 sparkline — same geometry, stroke and fill gradient as the Figma "Chart" component. */
export const Sparkline = memo(function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const id = useId()
  const W = 71, H = 28.43, pad = 1
  if (data.length < 2) return <div className="sk" style={{ width: 69, height: 27.43 }} />
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1
  const pts = data.map((v, i) => [pad + (i / (data.length - 1)) * (W - 2 * pad), pad + (1 - (v - min) / span) * (H - 2 * pad - 5)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('')
  const color = up ? '#10B93D' : '#FB2C36'
  return (
    <svg width="69" height="27.43" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={color} stopOpacity="0.2" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W - pad} ${H}L${pad} ${H}Z`} fill={`url(#${id})`} />
      <path d={line} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
})

/* Logo pixels, sampled once per src at N×N. Polymarket's S3 sends no CORS headers, so when
   the direct read is tainted the pixels come from a CORS-enabled resize proxy (wsrv.nl);
   the displayed <img> always uses the original URL. */
const N = 24
const NO_CORS = /^https:\/\/polymarket-upload\.s3\./ // known to omit CORS headers: go straight to the proxy
function readPixels(src: string) {
  return new Promise<Uint8ClampedArray | null>((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = N
        const x = cv.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, N, N)
        res(x.getImageData(0, 0, N, N).data)
      } catch { res(null) } // CORS-tainted
    }
    img.onerror = () => res(null)
    img.src = src
  })
}
const pixelCache = new Map<string, Promise<Uint8ClampedArray | null>>()
function pixels(src: string) {
  let p = pixelCache.get(src)
  if (!p) {
    const proxy = () => readPixels(`https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${N}&h=${N}&fit=fill&output=png`)
    p = NO_CORS.test(src) ? proxy() : readPixels(src).then((d) => d ?? proxy())
    pixelCache.set(src, p)
  }
  return p
}

/* Transparency: solid artwork keeps the tile (fill + border + radius); cut-out logos
   (>10% see-through pixels on the edge ring) render bare. */
function isTransparent(src: string) {
  return pixels(src).then((px) => {
    if (!px) return /\.svg(\?|$)/i.test(src)
    let edge = 0, clear = 0
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (y && x && y < N - 1 && x < N - 1) continue
      edge++; if (px[(y * N + x) * 4 + 3] < 200) clear++
    }
    return clear / edge > 0.1
  })
}

/* Brand colour: the dominant hue of the logo. Opaque, reasonably saturated pixels vote into
   24 hue buckets (weighted by chroma, so black/white/grey never win); the
   winning bucket's average hue is returned as a vivid, glow-ready colour. Monochrome logos get a
   neutral glow; null = pixels unreadable. */
export function brandColor(src: string) {
  return pixels(src).then((px) => {
    if (!px) return null
    const B = 24, w = new Float64Array(B), hx = new Float64Array(B), hy = new Float64Array(B)
    let total = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
      total++
      if (d < 0.08 || d / mx < 0.25) continue // greys, whites, near-blacks
      const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
      const k = Math.floor(h / (360 / B)) % B, wt = d
      w[k] += wt; hx[k] += Math.cos((h * Math.PI) / 180) * wt; hy[k] += Math.sin((h * Math.PI) / 180) * wt
    }
    let best = 0
    for (let k = 1; k < B; k++) if (w[k] > w[best]) best = k
    if (!total || w[best] / total < 0.02) return 'hsl(0 0% 80%)' // monochrome
    const hue = Math.round(((Math.atan2(hy[best], hx[best]) * 180) / Math.PI + 360) % 360)
    return `hsl(${hue} 90% 55%)`
  })
}
/** Watches the <img> inside `ref` (including src swaps) and reports whether it is a transparent cut-out. */
export function useClearLogo<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [clear, setClear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const check = () => {
      const src = el.querySelector('img')?.currentSrc || el.querySelector('img')?.src
      if (!src) return setClear(false)
      isTransparent(src).then((v) => live && setClear(v))
    }
    check()
    const mo = new MutationObserver(check)
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
    return () => { live = false; mo.disconnect() }
  }, [])
  return [ref, clear] as const
}

/* Coin logo from Hyperliquid's public icon set, monogram fallback. */
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
export function Coin({ coin, size }: { coin: string; size: number }) {
  const sources = [...new Set([coin, displaySym(coin)])].map((c) => `https://app.hyperliquid.xyz/coins/${c}.svg`)
  const [i, setI] = useState(0)
  const sym = displaySym(coin)
  return (
    <span className="coin" style={{ width: size, height: size }}>
      {i < sources.length ? (
        <img src={sources[i]} alt="" width={size} height={size} loading="lazy" onError={() => setI(i + 1)} />
      ) : (
        <span className="coin__mono" style={{ fontSize: size * 0.36, background: `hsl(${hue(sym)} 80% 68%)`, width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
          {sym.slice(0, 3)}
        </span>
      )}
    </span>
  )
}

export function CoinCombo({ coin }: { coin: string }) {
  const chain = CHAIN[coin]
  return (
    <span className="logo-combo">
      <Coin coin={coin} size={40} />
      {chain && <span className="chain">{chain === 'eth' ? <ChainEth /> : <ChainBnb />}</span>}
    </span>
  )
}

/* ───────────── toast ───────────── */
type T = { id: number; text: string; leaving?: boolean }
let toasts: T[] = []
const tl = new Set<() => void>()
const tEmit = () => { toasts = [...toasts]; tl.forEach((f) => f()) }
export function toast(text: string) {
  const id = Date.now() + Math.random()
  toasts.push({ id, text })
  if (toasts.length > 3) toasts.shift()
  tEmit()
  setTimeout(() => { const t = toasts.find((x) => x.id === id); if (t) { t.leaving = true; tEmit() } }, 2600)
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== id); tEmit() }, 2800)
}
export function Toasts() {
  const list = useSyncExternalStore((f) => { tl.add(f); return () => tl.delete(f) }, () => toasts)
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast t-14m" data-leaving={t.leaving || undefined}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--lime)', flexShrink: 0 }} />
          {t.text}
        </div>
      ))}
    </div>
  )
}
