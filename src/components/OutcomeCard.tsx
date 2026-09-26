import { memo, useSyncExternalStore } from 'react'
import type { Outcome } from '../data/market'
import { categorySlug } from '../data/market'
import { prob, usdCompact } from '../format'
import { HyperliquidMark, PolymarketMark } from '../icons'
import { href, marketHref } from '../router'
import { Coin, useClearLogo } from './primitives'

/* 1 s shared clock for expiry countdowns (one interval for the whole app). */
let now = Date.now()
const clk = new Set<() => void>()
setInterval(() => { now = Date.now(); clk.forEach((f) => f()) }, 1000)
const useNow = (on: boolean) => useSyncExternalStore((f) => { if (!on) return () => {}; clk.add(f); return () => clk.delete(f) }, () => (on ? now : 0))

const left = (ms: number) => {
  if (ms <= 0) return 'Settling'
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `Ends in ${d}d ${h}h`
  if (h > 0) return `Ends in ${h}h ${m}m`
  return `Ends in ${m}:${String(s % 60).padStart(2, '0')}`
}
const TEAM = ['#a7f932', '#ad46ff']
const abbr = (s: string) => {
  const w = s.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] ?? '').slice(0, 4)).slice(0, 4).toUpperCase()
}
const cents = (p: number) => `${Math.round(p * 100)}¢`
const venue = (o: Outcome) => (o.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket')
const open = (o: Outcome, i: number, side: 'yes' | 'no') => { location.hash = marketHref(o, { m: o.rows[i]?.token ?? String(i), side }) }

function YesNo({ o, i, label, p, wide }: { o: Outcome; i: number; label: string; p: number; wide?: boolean }) {
  return (
    <>
      <button className={`yn yn--yes${wide ? ' yn--wide' : ''}`} onClick={() => open(o, i, 'yes')} aria-label={`Buy Yes on ${label} at ${cents(p)}`}>
        <span className="yn__l">Yes</span><span className="yn__p num">{wide ? `Yes ${cents(p)}` : cents(p)}</span>
      </button>
      <button className={`yn yn--no${wide ? ' yn--wide' : ''}`} onClick={() => open(o, i, 'no')} aria-label={`Buy No on ${label} at ${cents(1 - p)}`}>
        <span className="yn__l">No</span><span className="yn__p num">{wide ? `No ${cents(1 - p)}` : cents(1 - p)}</span>
      </button>
    </>
  )
}

export const OutcomeCard = memo(function OutcomeCard({ o, page, focused, style }: { o: Outcome; page?: boolean; focused?: boolean; style?: React.CSSProperties; tick?: number }) {
  const t = useNow(o.source === 'hyperliquid' && !!o.expiry)
  const slug = categorySlug(o.category)
  const Mark = o.source === 'hyperliquid' ? HyperliquidMark : PolymarketMark
  const [thumb, clear] = useClearLogo<HTMLAnchorElement>()
  return (
    <article className={`out-card${page ? ' out-card--page' : ''}${focused ? ' is-focused' : ''}`} id={`o-${o.id}`} style={style}>
      <div className="out-card__head">
        <a ref={thumb} className={`out-thumb${clear ? ' is-clear' : ''}`} href={marketHref(o)} tabIndex={-1} aria-hidden>
          {o.underlying ? <Coin coin={o.underlying} size={40} /> : o.image ? <img src={o.image} alt="" loading="lazy" /> : <span className="t-14m muted">{abbr(o.title).slice(0, 2)}</span>}
        </a>
        <a className="out-title t-14m" href={marketHref(o)} title={o.title}>{o.title}</a>
      </div>

      <div className={`out-body${o.kind === 'binary' ? ' out-body--binary' : ''}`}>
        {o.kind === 'multi' &&
          o.rows.map((r, i) => (
            <div className="out-row" key={r.label}>
              <span className="out-row__label t-14r">{r.label}</span>
              <span className="out-row__right">
                <span className="t-14r num">{prob(r.p)}</span>
                <YesNo o={o} i={i} label={r.label} p={r.p} />
              </span>
            </div>
          ))}

        {o.kind === 'versus' &&
          o.rows.map((r, i) => (
            <div className="vs-row" key={r.label}>
              <span className="vs-team">
                <span className="vs-logo" style={{ color: TEAM[i], background: `${TEAM[i]}1f` }}>{abbr(r.label).slice(0, 1)}</span>
                <span className="vs-info">
                  <span className="vs-line t-14m"><span>{r.label}</span><span className="muted num">{(1 / Math.max(r.p, 0.01)).toFixed(2)}x</span></span>
                  <span className="bar"><i style={{ flexGrow: r.p, background: TEAM[i] }} /><i style={{ flexGrow: 1 - r.p }} /></span>
                </span>
              </span>
              <button className="vs-btn" onClick={() => open(o, i, 'yes')} aria-label={`Buy ${r.label} at ${cents(r.p)}`}>
                <span style={{ color: 'var(--neutral-400)' }}>{abbr(r.label)}</span><span className="num">{cents(r.p)}</span>
              </button>
            </div>
          ))}

        {o.kind === 'binary' && (
          <>
            <div className="bin-bar">
              <span className="bar" style={{ flex: 1 }}><i style={{ flexGrow: o.rows[0].p, background: 'var(--lime)' }} /><i style={{ flexGrow: 1 - o.rows[0].p }} /></span>
              <span className="t-12r num" style={{ width: 30, textAlign: 'right', color: 'var(--neutral-400)' }}>{prob(o.rows[0].p)}</span>
            </div>
            <div className="bin-cta"><YesNo o={o} i={0} label={o.title} p={o.rows[0].p} wide /></div>
          </>
        )}
      </div>

      <div className="out-foot">
        <span className="out-foot__cat t-12m">
          {page && <Mark width={14} height={14} aria-label={venue(o)} />}
          {slug ? <a href={href.outcome(slug)} className="cat-link">{o.category}</a> : o.category}
        </span>
        <span className="vol num">{o.source === 'hyperliquid' && o.expiry ? left(o.expiry - t) : `Vol ${usdCompact(o.volume)}`}</span>
      </div>
    </article>
  )
})
