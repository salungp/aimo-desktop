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

/* Logo transparency: solid artwork keeps the tile (fill + border + radius); cut-out
   logos (transparent edges) render bare. Sampled once per src from the image's edge ring.
   Polymarket's S3 sends no CORS headers, so pixels are read via a CORS-enabled resize
   proxy (wsrv.nl) when the direct read fails; the displayed <img> still uses the original. */
const clearCache = new Map<string, Promise<boolean>>()
const N = 24
function edgeClear(src: string) {
  return new Promise<boolean | null>((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = N
        const x = cv.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, N, N)
        const px = x.getImageData(0, 0, N, N).data
        let edge = 0, clear = 0
        for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
          if (y && xx && y < N - 1 && xx < N - 1) continue
          edge++; if (px[(y * N + xx) * 4 + 3] < 200) clear++
        }
        res(clear / edge > 0.1)
      } catch { res(null) } // CORS-tainted
    }
    img.onerror = () => res(null)
    img.src = src
  })
}
function isTransparent(src: string) {
  let p = clearCache.get(src)
  if (!p) {
    p = edgeClear(src)
      .then((v) => v ?? edgeClear(`https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${N}&h=${N}&fit=fill&output=png`))
      .then((v) => v ?? /\.svg(\?|$)/i.test(src))
    clearCache.set(src, p)
  }
  return p
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
