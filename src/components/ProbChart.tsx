import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Pt, Range } from '../data/market'

/* ───────────── Animated number: eases toward each new value (ease-out, 450ms), interruptible ───────────── */
export function useTween(target: number, ms = 450) {
  const [v, setV] = useState(target)
  const from = useRef(target), start = useRef(0), raf = useRef(0), cur = useRef(target)
  useEffect(() => {
    if (!isFinite(cur.current) || !isFinite(target) || matchMedia('(prefers-reduced-motion: reduce)').matches) { cur.current = target; setV(target); return }
    from.current = cur.current; start.current = performance.now()
    cancelAnimationFrame(raf.current)
    const step = (t: number) => {
      const k = Math.min(1, (t - start.current) / ms), e = 1 - Math.pow(1 - k, 3)
      cur.current = from.current + (target - from.current) * e
      setV(cur.current)
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms])
  return v
}

export function AnimatedNumber({ value, format, className = '' }: { value: number; format: (n: number) => string; className?: string }) {
  const v = useTween(value)
  const prev = useRef(value)
  const [dir, setDir] = useState<{ d: 'up' | 'down'; n: number } | null>(null)
  useEffect(() => {
    // Flash only on a visible change, not on sub-display jitter.
    if (format(value) !== format(prev.current)) setDir((x) => ({ d: value > prev.current ? 'up' : 'down', n: (x?.n ?? 0) + 1 }))
    prev.current = value
  }, [value])
  return <span key={dir?.n ?? 0} className={`num ${dir ? `flash-${dir.d}` : ''} ${className}`}>{format(v)}</span>
}

/* ───────────── Chart ───────────── */
export const SERIES_COLORS = ['#0093FD', '#AD46FF', '#FB2C36', '#FF6900']
export type Series = { id: string; label: string; color: string; points: Pt[]; live: number }

const H = 194, TOP = 7, BOT = 187, AXIS_W = 40
const fmtTime = (t: number, r: Range) =>
  r === '1H' || r === '6H' || r === '1D'
    ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Polymarket-style stepped probability lines, live tails, hover crosshair. */
export function ProbChart({ series, range, loading, focus, now }: { series: Series[]; range: Range; loading: boolean; focus?: string; now: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(952)
  const [hover, setHover] = useState<number | null>(null)
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    wrap.current && ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  // Tween each series' live tail so the line glides to each new tick.
  const tw = [0, 1, 2, 3].map((i) => useTween(series[i]?.live ?? NaN, 600)) // fixed hook count
  const tails = series.map((s, i) => (isFinite(tw[i]) ? tw[i] : s.live))

  const plotW = Math.max(100, W - AXIS_W - 8)
  const all = series.flatMap((s) => s.points)
  const t0 = all.length ? Math.min(...all.map((p) => p.t)) : now - 864e5
  const t1 = now
  const vals = [...all.map((p) => p.p), ...tails]
  const lo0 = vals.length ? Math.min(...vals) : 0.2, hi0 = vals.length ? Math.max(...vals) : 1
  // 5 grid lines on "nice" steps (design: 100/80/60/40/20)
  const step = [0.025, 0.05, 0.1, 0.2, 0.25].find((c) => c * 4 >= hi0 - lo0 + 0.03) ?? 0.25
  let hi = Math.min(1, Math.ceil((hi0 + 0.01) / step) * step)
  let lo = hi - step * 4
  if (lo < 0) { lo = 0; hi = step * 4 }
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * plotW
  const y = (p: number) => TOP + (1 - (p - lo) / (hi - lo)) * (BOT - TOP)

  const paths = useMemo(() => series.map((s, i) => {
    const pts = [...s.points.filter((p) => p.t < t1), { t: t1, p: tails[i] }]
    let d = ''
    pts.forEach((p, k) => {
      const X = x(p.t).toFixed(1), Y = y(p.p).toFixed(1)
      d += k === 0 ? `M${X} ${Y}` : `H${X}V${Y}`
    })
    return d
  }), [series, tails.join(), W, lo, hi, t0, t1])

  const grid = [0, 1, 2, 3, 4].map((k) => hi - k * step)
  const nx = W < 600 ? 4 : 7
  const xticks = Array.from({ length: nx }, (_, k) => t0 + ((t1 - t0) * k) / (nx - 1))

  // Hover lookup
  const hv = hover == null ? null : (() => {
    const t = t0 + (hover / plotW) * (t1 - t0)
    return {
      t, rows: series.map((s, i) => {
        const pts = s.points
        let p = tails[i]
        if (t < t1 - 1000 && pts.length) {
          let a = 0, b = pts.length - 1
          while (a < b) { const m = (a + b + 1) >> 1; if (pts[m].t <= t) a = m; else b = m - 1 }
          p = pts[a].t <= t ? pts[a].p : pts[0].p
        }
        return { ...s, p }
      }),
    }
  })()

  return (
    <div className="chart" ref={wrap}>
      <svg width={W} height={H} className="chart__svg" role="img" aria-label="Probability history"
        onPointerMove={(e) => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); const px = e.clientX - r.left; setHover(px >= 0 && px <= plotW ? px : null) }}
        onPointerLeave={() => setHover(null)}>
        {grid.map((g, k) => (
          <g key={k}>
            <line x1={0} x2={plotW} y1={TOP + k * ((BOT - TOP) / 4)} y2={TOP + k * ((BOT - TOP) / 4)} stroke="#404040" strokeWidth={0.5} strokeDasharray="4 4" />
            <text x={W} y={TOP + k * ((BOT - TOP) / 4) + 4} textAnchor="end" className="chart__axis">{+(g * 100).toFixed(1)}%</text>
          </g>
        ))}
        {!loading && series.map((s, i) => (
          <path key={`${s.id}-${range}`} d={paths[i]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            className="chart__line" style={{ opacity: focus && focus !== s.id ? 0.25 : 1 }} />
        ))}
        {!loading && series.map((s, i) => (
          <g key={s.id} transform={`translate(${plotW},${y(tails[i])})`} style={{ opacity: focus && focus !== s.id ? 0.25 : 1 }} className="chart__tail">
            <circle r={7} fill={s.color} className="chart__ping" />
            <circle r={3.5} fill={s.color} strokeWidth={1.5} style={{ stroke: 'var(--page)' }} />
          </g>
        ))}
        {hv && (
          <g pointerEvents="none">
            <line x1={hover!} x2={hover!} y1={TOP} y2={BOT} stroke="#737373" strokeWidth={1} strokeDasharray="2 3" />
            {hv.rows.map((r) => <circle key={r.id} cx={hover!} cy={y(r.p)} r={4} fill={r.color} strokeWidth={2} style={{ stroke: 'var(--page)' }} />)}
          </g>
        )}
        {loading && <rect x={0} y={TOP} width={plotW} height={BOT - TOP} className="chart__shimmer" />}
      </svg>
      {hv && (
        <div className="chart__tip" style={{ left: hover! > plotW - 200 ? hover! - 196 : hover! + 12 }}>
          <div className="t-12m muted">{new Date(hv.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
          {[...hv.rows].sort((a, b) => b.p - a.p).map((r) => (
            <div key={r.id} className="chart__tip-row t-12r">
              <i style={{ background: r.color }} /><span>{r.label}</span><b className="num">{(r.p * 100).toFixed(1)}%</b>
            </div>
          ))}
        </div>
      )}
      <div className="chart__x" style={{ width: plotW }}>
        {xticks.map((t, k) => <span key={k} className="t-12m">{fmtTime(t, range)}</span>)}
      </div>
    </div>
  )
}
