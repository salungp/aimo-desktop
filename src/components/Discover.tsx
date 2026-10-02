import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { biggestMoves, change, detailKey, loadDetail, loadHistory, newListings, pick, useMarket, type Asset, type Outcome, type Pt } from '../data/market'
import { displayName, displaySym } from '../data/names'
import { usdCompact } from '../format'
import { CaretLeftLine, CaretRightLine, Lightning } from '../icons'
import { href, marketHref } from '../router'
import { brandColor, ChangeBadge, Coin, PriceText, useClearLogo } from './primitives'

/* Discover (Figma 962:62825): featured market carousel + right rail. */

const hl = (a: Asset) => `https://app.hyperliquid.xyz/trade/${a.coin}`
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function MorePill({ href: to, external, children = 'See more' }: { href: string; external?: boolean; children?: ReactNode }) {
  return (
    <a className="more-pill t-12m" href={to} {...(external ? { target: '_blank', rel: 'noopener' } : {})}>
      {children}<CaretRightLine />
    </a>
  )
}

/* ───────────── Featured market (Figma 975:64855 "Option 2") ───────────── */
const RANGE = '1D' as const
const LINE = ['#2b7fff', '#ad46ff', '#ff6900']
const TICKS = [1, 0.8, 0.6, 0.4, 0.2, 0]
const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const pct1 = (p: number) => `${(p * 100).toFixed(1)}%`

type Line = { id: string; label: string; p: number; color: string; points: Pt[] }

/** Fixed 0–100% scale, stepped lines, end dots — the design's "Probability Trends" plot. */
function TrendChart({ lines, loading }: { lines: Line[]; loading: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 570, h: 214 })
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const plotW = Math.max(60, box.w - 40) // 8px gap + 32px label column
  const top = 7, bot = box.h - 7 // grid lines sit on the label rows' centre (12px × 1.2)
  const now = Date.now()
  const all = lines.flatMap((l) => l.points)
  const t0 = all.length ? Math.min(...all.map((p) => p.t)) : now - 864e5
  const x = (t: number) => ((t - t0) / Math.max(1, now - t0)) * plotW
  const y = (p: number) => top + (1 - Math.min(1, Math.max(0, p))) * (bot - top)
  const paths = useMemo(() => lines.map((l) => {
    const pts = [...l.points.filter((p) => p.t < now), { t: now, p: l.p }]
    return pts.map((p, k) => (k ? `H${x(p.t).toFixed(1)}V${y(p.p).toFixed(1)}` : `M${x(p.t).toFixed(1)} ${y(p.p).toFixed(1)}`)).join('')
  }), [lines, box.w, box.h, t0])
  const ticks = Array.from({ length: 7 }, (_, k) => t0 + ((now - t0) * k) / 6)

  return (
    <>
      <div className="feat-chart" ref={wrap} aria-hidden>
        <svg width={box.w} height={box.h}>
          {TICKS.map((v) => (
            <g key={v}>
              <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="#404040" strokeWidth={0.5} strokeDasharray="4 4" />
              <text x={box.w} y={y(v) + 4} textAnchor="end" className="feat-chart__axis">{v * 100}%</text>
            </g>
          ))}
          {loading
            ? <rect x={0} y={top} width={plotW} height={bot - top} className="chart__shimmer" />
            : lines.map((l, i) => (
                <g key={l.id}>
                  <path d={paths[i]} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="chart__line" />
                  <circle cx={plotW} cy={y(l.p)} r={4} fill={l.color} stroke={l.color} strokeOpacity={0.3} strokeWidth={4} />
                </g>
              ))}
        </svg>
      </div>
      <div className="feat-time num" aria-hidden>{ticks.map((t, k) => <span key={k}>{hhmm(t)}</span>)}</div>
    </>
  )
}

function FeatureSlide({ o, active }: { o: Outcome; active: boolean }) {
  const s = useMarket()
  const key = detailKey(o)
  const d = s.details[key]
  useEffect(() => { if (active) loadDetail(o.source === 'hyperliquid' ? 'hl' : 'pm', o.id) }, [active, o.id])
  useEffect(() => { if (active && d?.status === 'ready') loadHistory(key, RANGE) }, [active, d?.status, key])
  const markets = d?.markets.filter((m) => !m.closed) ?? o.rows.map((r, k) => ({ id: String(k), label: r.label, p: r.p, volume: o.volume / Math.max(1, o.rows.length), closed: false }))
  const shown = markets.slice(0, 3)
  const total = d?.markets.length || o.count || markets.length
  const hist = d?.history[RANGE]
  const lines: Line[] = shown.map((m, k) => ({ id: m.id, label: m.label, p: m.p, color: LINE[k], points: hist?.[m.id] ?? [] }))
  const [thumb, clear] = useClearLogo<HTMLSpanElement>()
  const [glow, setGlow] = useState<string | null>(null)
  useEffect(() => { let on = true; if (o.image) brandColor(o.image).then((c) => on && setGlow(c)); return () => { on = false } }, [o.image])

  return (
    <article className="feat" style={glow ? { ['--glow' as any]: glow } : undefined} aria-label={o.title}>
      <span className="feat__glow" aria-hidden />
      <div className="feat__left">
        <a className="feat__head" href={marketHref(o)}>
          <span ref={thumb} className={`feat__logo${clear ? ' is-clear' : ''}`}>{o.image ? <img src={o.image} alt="" /> : null}</span>
          <span className="feat__title">
            <span className="feat__name">{o.title}</span>
            <span className="feat__crumb t-12r">
              <span>{o.category}</span>
              {d?.sub && <><i /><span>{d.sub}</span></>}
            </span>
          </span>
        </a>
        <p className="feat__label">Markets</p>
        {shown.map((m) => (
          <div className="feat-mk" key={m.id}>
            <div className="feat-mk__row t-12m">
              <span className="feat-mk__name">{m.label}</span>
              <span className="feat-mk__vol t-12r">{usdCompact(m.volume)} Vol</span>
            </div>
            <div className="feat-mk__btns">
              <a className="bin bin--yes" href={marketHref(o, { m: m.id })} aria-label={`Buy Yes on ${m.label} at ${pct1(m.p)}`}>Yes<span className="num">{pct1(m.p)}</span></a>
              <a className="bin bin--no" href={marketHref(o, { m: m.id, side: 'no' })} aria-label={`Buy No on ${m.label} at ${pct1(1 - m.p)}`}>No<span className="num">{pct1(1 - m.p)}</span></a>
            </div>
          </div>
        ))}
        {total > 3 && <span className="feat__fade" aria-hidden />}
        <div className="feat__foot t-12r">
          <span>{total} Markets</span>
          <a className="feat__more t-12m" href={marketHref(o)}>Explore more<CaretRightLine /></a>
        </div>
      </div>
      <div className="feat__right">
        <div className="feat__trend">
          <p className="feat__label">Probability Trends</p>
          <div className="feat-legend t-12r">
            {lines.map((l) => (
              <span key={l.id}><i style={{ background: l.color }} /><span className="feat-legend__l">{l.label}</span><b className="num">{pct1(l.p)}</b></span>
            ))}
          </div>
        </div>
        <TrendChart lines={lines} loading={d?.histStatus[RANGE] !== 'ready'} />
      </div>
    </article>
  )
}

export function FeaturedMarkets() {
  const s = useMarket()
  const items = useMemo(() => s.outcomes.filter((o) => o.kind === 'multi' && o.rows.length >= 2).slice(0, 6), [s.outcomes])
  const n = items.length
  const track = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const onScroll = () => {
    const t = track.current
    if (t) setIdx(Math.min(n - 1, Math.round(t.scrollLeft / t.clientWidth)))
  }
  const goTo = (k: number) => {
    const t = track.current
    if (!t || !n) return
    const i = (k + n) % n
    t.scrollTo({ left: i * t.clientWidth, behavior: reduced() ? 'auto' : 'smooth' })
  }
  // Autoplay every 6 s, wrapping. Pauses on hover/focus, hidden tab, or reduced motion; any move restarts the countdown.
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || n < 2 || reduced()) return
    const t = setInterval(() => { if (!document.hidden) goTo(idx + 1) }, 6000)
    return () => clearInterval(t)
  }, [paused, n, idx])

  const prev = items[(idx - 1 + n) % n], next = items[(idx + 1) % n]
  return (
    <section className="featured" aria-roledescription="carousel" aria-label="Featured markets"
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) setPaused(true) }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false) }}>
      <div className="featured__track" ref={track} onScroll={onScroll}>
        {n
          ? items.map((o, i) => <FeatureSlide key={o.id} o={o} active={Math.abs(i - idx) <= 1} />)
          : <div className="feat feat--sk"><span className="sk" style={{ width: 260, height: 18 }} /><span className="sk" style={{ width: 180, height: 12 }} /></div>}
      </div>
      <div className="featured__bar">
        <div className="featured__dots" role="tablist" aria-label="Choose slide">
          {items.map((o, k) => (
            <button key={o.id} role="tab" aria-selected={k === idx} aria-label={`Slide ${k + 1} of ${n}: ${o.title}`} onClick={() => goTo(k)}><i /></button>
          ))}
        </div>
        {n > 1 && (
          <div className="featured__nav">
            <button className="nav-pill t-12m" onClick={() => goTo(idx - 1)} aria-label={`Previous: ${prev.title}`}><CaretLeftLine />{prev.category}</button>
            <button className="nav-pill t-12m" onClick={() => goTo(idx + 1)} aria-label={`Next: ${next.title}`}>{next.category}<CaretRightLine /></button>
          </div>
        )}
      </div>
    </section>
  )
}

/* ───────────── Right rail (Figma 962:63313) ───────────── */
function RailSection({ id, title, more, external, children }: { id: string; title: string; more: string; external?: boolean; children: ReactNode }) {
  return (
    <section className="rl" aria-labelledby={id}>
      <div className="rl__head">
        <h2 id={id} className="t-16m">{title}</h2>
        <MorePill href={more} external={external} />
      </div>
      <ol className="rl__list">{children}</ol>
    </section>
  )
}

type Badge = 'lev' | 'new' | null
function AssetItem({ a, rank, badge }: { a: Asset; rank: number; badge: Badge }) {
  return (
    <li>
      <a className="rl-row" href={hl(a)} target="_blank" rel="noopener">
        <span className="rl-row__n num">{rank}</span>
        <Coin coin={a.coin} size={32} />
        <span className="rl-row__txt">
          <span className="rl-row__name">{displayName(a.coin)}</span>
          <span className="rl-row__sub t-12m">
            {displaySym(a.coin)}
            {badge === 'lev' && <span className="tag tag--lev"><Lightning width={10} height={10} />{a.maxLev}x</span>}
            {badge === 'new' && <span className="tag tag--new">New</span>}
          </span>
        </span>
        <span className="rl-row__val">
          <PriceText value={a.price} className="t-14m" />
          <ChangeBadge value={change(a)} />
        </span>
      </a>
    </li>
  )
}

function OutcomeItem({ o, rank }: { o: Outcome; rank: number }) {
  const [thumb, clear] = useClearLogo<HTMLSpanElement>()
  const p = o.rows[0]?.p ?? 0
  return (
    <li className="rl-row rl-row--out">
      <span className="rl-row__n num">{rank}</span>
      <span ref={thumb} className={`rl-thumb${clear ? ' is-clear' : ''}`}>{o.image ? <img src={o.image} alt="" loading="lazy" /> : null}</span>
      <a className="rl-row__q" href={marketHref(o)}>{o.title}</a>
      <a className="rl-yes t-12m" href={marketHref(o, { side: 'yes' })} aria-label={`Buy Yes on ${o.title}`}>Yes</a>
      <span className="rl-p t-12m num" aria-label={`Yes at ${Math.round(p * 100)}%`}>{Math.round(p * 100)}%</span>
    </li>
  )
}

const skel = (k: number) => <li key={k} className="rl-row"><span className="sk" style={{ width: '100%', height: 32 }} /></li>
const assets = (list: Asset[], badge: Badge) => (list.length ? list.map((a, i) => <AssetItem key={a.coin} a={a} rank={i + 1} badge={badge} />) : [0, 1, 2].map(skel))

export function DiscoverRail() {
  const s = useMarket()
  const hot = [...s.outcomes].sort((a, b) => (b.vol24 ?? b.volume) - (a.vol24 ?? a.volume)).slice(0, 3)
  return (
    <aside className="rail" aria-label="Market overview">
      <RailSection id="rl-hl" title="Market Highlights" more="https://app.hyperliquid.xyz/trade" external>{assets(pick(s, ['BTC', 'ETH', 'SOL']), 'lev')}</RailSection>
      <RailSection id="rl-new" title="New listings on Aimo" more="https://app.hyperliquid.xyz/trade" external>{assets(newListings(s), 'new')}</RailSection>
      <RailSection id="rl-hot" title="Trending Now" more={href.outcome()}>
        {hot.length ? hot.map((o, i) => <OutcomeItem key={o.id} o={o} rank={i + 1} />) : [0, 1, 2].map(skel)}
      </RailSection>
      <RailSection id="rl-move" title="Biggest Move" more="https://app.hyperliquid.xyz/trade" external>{assets(biggestMoves(s), null)}</RailSection>
    </aside>
  )
}
