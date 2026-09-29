import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { detailKey, loadDetail, loadHistory, useMarket, type Outcome, type Pt } from '../data/market'
import { CaretRight, HyperliquidMark, PolymarketMark } from '../icons'
import { marketHref } from '../router'
import { SERIES_COLORS } from './ProbChart'
import { useClearLogo } from './primitives'

/* Trending prediction carousel (Figma 793:11804): multi-outcome events with a live 1W probability chart. */

const RANGE = '1W' as const
const GLOWS = ['#ff8a1f', '#2b7fff', '#ad46ff', '#a7f932', '#fb2c36', '#00c950']
const CH = 120 // plot height

type Line = { id: string; label: string; color: string; p: number; points: Pt[] }

/** Stepped probability lines with right-edge % scale — compact sibling of ProbChart. */
function MiniChart({ lines, loading }: { lines: Line[]; loading: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(548)
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    wrap.current && ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])
  const plotW = Math.max(80, W - 40)
  const all = lines.flatMap((l) => l.points)
  const now = Date.now()
  const t0 = all.length ? Math.min(...all.map((p) => p.t)) : now - 7 * 864e5
  const vals = [...all.map((p) => p.p), ...lines.map((l) => l.p)]
  const lo0 = vals.length ? Math.min(...vals) : 0.4, hi0 = vals.length ? Math.max(...vals) : 1
  // 4 grid lines on "nice" steps (design: 100/80/60/40)
  const step = [0.05, 0.1, 0.2, 0.25, 0.3].find((s) => s * 3 >= hi0 - lo0 + 0.02) ?? 1 / 3
  let hi = Math.min(1, Math.ceil((hi0 + 0.005) / step) * step), lo = hi - step * 3
  if (lo < 0) { lo = 0; hi = step * 3 }
  const x = (t: number) => ((t - t0) / Math.max(1, now - t0)) * plotW
  const y = (p: number) => 4 + (1 - (p - lo) / (hi - lo)) * (CH - 8)
  const paths = useMemo(() => lines.map((l) => {
    const pts = [...l.points.filter((p) => p.t < now), { t: now, p: l.p }]
    return pts.map((p, k) => (k ? `H${x(p.t).toFixed(1)}V${y(p.p).toFixed(1)}` : `M${x(p.t).toFixed(1)} ${y(p.p).toFixed(1)}`)).join('')
  }), [lines, W, lo, hi, t0])

  return (
    <div className="tp-chart" ref={wrap} aria-hidden>
      <svg width={W} height={CH + 15}>
        {[0, 1, 2, 3].map((k) => {
          const gy = 4 + (k * (CH - 8)) / 3
          return (
            <g key={k}>
              <line x1={0} x2={plotW} y1={gy} y2={gy} stroke="#404040" strokeWidth={0.5} strokeDasharray="4 4" />
              <text x={W} y={gy + 4} textAnchor="end" className="tp-chart__axis">{+((hi - k * step) * 100).toFixed(1)}%</text>
            </g>
          )
        })}
        {!loading && lines.map((l, i) => (
          <path key={l.id} d={paths[i]} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="chart__line" />
        ))}
        {loading && <rect x={0} y={4} width={plotW} height={CH - 8} className="chart__shimmer" />}
      </svg>
    </div>
  )
}

function TrendCard({ o, i, active }: { o: Outcome; i: number; active: boolean }) {
  const s = useMarket()
  const key = detailKey(o)
  const d = s.details[key]
  const want = active || i < 2
  useEffect(() => { if (want) loadDetail('pm', o.id) }, [want, o.id])
  useEffect(() => { if (want && d?.status === 'ready') loadHistory(key, RANGE) }, [want, d?.status, key])
  const hist = d?.history[RANGE]
  const lines: Line[] = (d?.markets.filter((m) => !m.closed).slice(0, 4) ?? o.rows.map((r, k) => ({ id: String(k), label: r.label, p: r.p })))
    .map((m, k) => ({ id: m.id, label: m.label, p: m.p, color: SERIES_COLORS[k], points: hist?.[m.id] ?? [] }))
  const loading = d?.histStatus[RANGE] !== 'ready'
  const [thumb, clear] = useClearLogo<HTMLSpanElement>()
  const Mark = o.source === 'hyperliquid' ? HyperliquidMark : PolymarketMark
  return (
    <a className="tp-card" href={marketHref(o)} style={{ ['--glow' as any]: GLOWS[i % GLOWS.length] }} aria-label={o.title}>
      <span className="tp-card__glow" />
      <div className="tp-card__head">
        <span ref={thumb} className={`tp-thumb${clear ? ' is-clear' : ''}`}>{o.image ? <img src={o.image} alt="" loading="lazy" /> : null}</span>
        <span className="tp-card__title">
          <span className="tp-crumb t-12m">
            <span>{o.category}</span>
            {d?.sub && <><i /><span>{d.sub}</span></>}
          </span>
          <span className="tp-name">{o.title}</span>
        </span>
        <span className="tp-src"><Mark width={20} height={20} />{o.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket'}</span>
      </div>
      <div className="tp-legend t-12r">
        {lines.map((l) => (
          <span key={l.id} className="tp-legend__item">
            <i style={{ background: l.color }} />
            <span className="tp-legend__label">{l.label}</span>
            <b className="num">{(l.p * 100).toFixed(1)}%</b>
          </span>
        ))}
      </div>
      <MiniChart lines={lines} loading={loading} />
    </a>
  )
}

export function TrendingCarousel({ items }: { items: Outcome[] }) {
  const track = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const [end, setEnd] = useState(false)
  const n = items.length

  const onScroll = () => {
    const t = track.current
    if (!t) return
    const card = t.firstElementChild as HTMLElement | null
    const w = card ? card.offsetWidth + 16 : t.clientWidth
    setIdx(Math.min(n - 1, Math.round(t.scrollLeft / w)))
    setEnd(t.scrollLeft + t.clientWidth >= t.scrollWidth - 4)
  }
  useEffect(onScroll, [n])
  const goTo = (k: number) => {
    const t = track.current, el = t?.children[Math.max(0, Math.min(n - 1, k))] as HTMLElement | undefined
    if (!t || !el) return
    t.scrollTo({ left: el.offsetLeft - t.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  // Autoplay every 3 s; wraps at the end. Pauses on hover/focus, hidden tab, or reduced motion.
  // Depends on idx so any manual move restarts the countdown.
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || n < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => { if (!document.hidden) goTo(end ? 0 : idx + 1) }, 3000)
    return () => clearInterval(t)
  }, [paused, n, idx, end])

  return (
    <section className="tp" aria-roledescription="carousel" aria-labelledby="h-tp"
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) setPaused(true) }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false) }}>
      <div className="tp__head">
        <h2 id="h-tp" className="t-20s">Trending prediction</h2>
        <div className="tp__nav">
          <button className="tp__arrow" aria-label="Previous" disabled={idx === 0} onClick={() => goTo(idx - 1)}><CaretRight style={{ rotate: '180deg' }} /></button>
          <button className="tp__arrow" aria-label="Next" disabled={end} onClick={() => goTo(idx + 1)}><CaretRight /></button>
        </div>
      </div>
      <div className="tp__viewport" data-end={end || undefined}>
        <div className="tp__track" ref={track} onScroll={onScroll}>
          {n
            ? items.map((o, i) => <TrendCard key={o.id} o={o} i={i} active={Math.abs(i - idx) <= 1} />)
            : [0, 1].map((k) => <div key={k} className="tp-card tp-card--sk"><span className="sk" style={{ width: 220, height: 16 }} /><span className="sk" style={{ width: 320, height: 12 }} /></div>)}
        </div>
      </div>
      {n > 1 && (
        <div className="tp__dots" role="tablist" aria-label="Choose slide">
          {items.map((o, k) => (
            <button key={o.id} role="tab" aria-selected={k === idx} aria-label={`Slide ${k + 1} of ${n}`} onClick={() => goTo(k)}><i /></button>
          ))}
        </div>
      )}
    </section>
  )
}
