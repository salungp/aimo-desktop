import { memo, useSyncExternalStore } from 'react'
import type { Outcome } from '../data/market'
import { categorySlug } from '../data/market'
import { prob, usdCompact } from '../format'
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
// Figma 1046:25166 — versus team accents and ladder row accents (row 1 lime, row 2 blue).
const TEAM = ['#ffffff', '#00ffff']
const LADDER = ['#a7f932', '#2b7fff']
const abbr = (s: string) => {
  const w = s.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] ?? '').slice(0, 4)).slice(0, 4).toUpperCase()
}
// Dates and thresholds ("by Dec 31", "↑ 90,000") read as a ladder: bars + one price pill per row.
const LADDER_RE = /^([^\w\s]\s*)?[\d$<>]|^(by|before|after|on|in)\s|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i
const isLadder = (o: Outcome) => o.rows.every((r) => LADDER_RE.test(r.label.trim()))
const short = (s: string) => (s.length <= 6 ? s.toUpperCase() : abbr(s))
const when = (t?: number) => {
  if (!t) return null
  const d = new Date(t), days = Math.round((t - Date.now()) / 864e5)
  const rel = days > 1 ? `In ${days} days` : days === 1 ? 'Tomorrow' : days === 0 ? 'Today' : 'Ended'
  return { rel, abs: d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
}
const cents = (p: number) => `${Math.round(p * 100)}¢`
const open = (o: Outcome, i: number, side: 'yes' | 'no') => { location.hash = marketHref(o, { m: o.rows[i]?.token ?? String(i), side }) }

function YesNo({ o, i, label, p, wide }: { o: Outcome; i: number; label: string; p: number; wide?: boolean }) {
  return (
    <>
      <button className={`yn yn--yes${wide ? ' yn--wide' : ''}`} onClick={() => open(o, i, 'yes')} aria-label={`Buy Yes on ${label} at ${cents(p)}`}>
        <span className="yn__l">{wide ? `Yes ${cents(p)}` : 'Yes'}</span>{!wide && <span className="yn__p num">{cents(p)}</span>}
      </button>
      <button className={`yn yn--no${wide ? ' yn--wide' : ''}`} onClick={() => open(o, i, 'no')} aria-label={`Buy No on ${label} at ${cents(1 - p)}`}>
        <span className="yn__l">{wide ? `No ${cents(1 - p)}` : 'No'}</span>{!wide && <span className="yn__p num">{cents(1 - p)}</span>}
      </button>
    </>
  )
}

export const OutcomeCard = memo(function OutcomeCard({ o, page, focused, style }: { o: Outcome; page?: boolean; focused?: boolean; style?: React.CSSProperties; tick?: number }) {
  const t = useNow(o.source === 'hyperliquid' && !!o.expiry)
  const slug = categorySlug(o.category)
  const [thumb, clear] = useClearLogo<HTMLAnchorElement>()
  return (
    <article className={`out-card${page ? ' out-card--page' : ''}${focused ? ' is-focused' : ''}`} id={`o-${o.id}`} style={style}>
      {o.kind === 'versus' ? (
        <div className="out-card__head out-card__head--vs">
          <span className="out-crumb t-12m">{o.category}</span>
          <a className="out-title" href={marketHref(o)} title={o.title}>{o.title}</a>
        </div>
      ) : (
      <div className="out-card__head">
        <a ref={thumb} className={`out-thumb${clear ? ' is-clear' : ''}`} href={marketHref(o)} tabIndex={-1} aria-hidden>
          {o.underlying ? <Coin coin={o.underlying} size={40} /> : o.image ? <img src={o.image} alt="" loading="lazy" /> : <span className="t-14m muted">{abbr(o.title).slice(0, 2)}</span>}
        </a>
        <a className="out-title" href={marketHref(o)} title={o.title}>{o.title}</a>
      </div>
      )}

      {o.kind === 'multi' && !isLadder(o) && (
        <div className="out-body">
          {o.rows.slice(0, 2).map((r, i) => (
            <div className="out-row" key={r.label}>
              <span className="out-row__label t-14r" title={r.label}>{r.label}</span>
              <span className="out-row__right">
                <span className="t-14r num">{prob(r.p)}</span>
                <YesNo o={o} i={i} label={r.label} p={r.p} />
              </span>
            </div>
          ))}
        </div>
      )}

      {o.kind === 'multi' && isLadder(o) && (
        <div className="out-body">
          {o.rows.slice(0, 2).map((r, i) => (
            <div className="lad-row" key={r.label}>
              <span className="lad-row__info">
                <span className="out-row__label t-14r" title={r.label}>{r.label}</span>
                <span className="bar"><i style={{ flexGrow: r.p, background: LADDER[i] }} /><i style={{ flexGrow: 1 - r.p }} /></span>
              </span>
              <button className="pill-p num" style={{ ['--c' as any]: LADDER[i] }} onClick={() => open(o, i, 'yes')} aria-label={`Buy Yes on ${r.label} at ${cents(r.p)}`}>
                {prob(r.p)}
              </button>
            </div>
          ))}
        </div>
      )}

      {o.kind === 'versus' && (
        <div className="out-body vs-body">
          <div className="vs-match">
            {o.rows.slice(0, 2).map((r, i) => (
              <span className="vs-side" key={r.label} style={{ order: i * 2 }}>
                <span className="vs-logo" style={{ color: TEAM[i], background: `${TEAM[i]}14` }} aria-hidden>{abbr(r.label).slice(0, 1)}</span>
                <span className="vs-abbr t-14m" title={r.label}>{short(r.label)}</span>
              </span>
            ))}
            <span className="vs-mid" style={{ order: 1 }}>
              {(() => {
                const w = when(o.expiry)
                return w && w.rel !== 'Ended'
                  ? <span className="vs-when t-12m"><span>{o.source === 'hyperliquid' && o.expiry ? left(o.expiry - t) : w.rel}</span><span>{w.abs}</span></span>
                  : <span className="vs-when t-12m"><span className="live-dot">Live</span></span>
              })()}
              <span className="bar bar--split"><i style={{ flexGrow: o.rows[0].p, background: TEAM[0] }} /><i style={{ flexGrow: o.rows[1]?.p ?? 1 - o.rows[0].p, background: TEAM[1] }} /></span>
            </span>
          </div>
          <div className="vs-cta">
            {o.rows.slice(0, 2).map((r, i) => (
              <button key={r.label} className="pill-p num" style={{ ['--c' as any]: `${TEAM[i]}80`, order: i * 2 }} onClick={() => open(o, i, 'yes')} aria-label={`Buy ${r.label} at ${cents(r.p)}`}>
                {prob(r.p)}
              </button>
            ))}
            <span className="vs-vol t-12m" style={{ order: 1 }}>Vol {usdCompact(o.volume)}</span>
          </div>
        </div>
      )}

      {o.kind === 'binary' && (
        <div className="out-body out-body--binary">
          <div className="bin-bar">
            <span className="bar" style={{ flex: 1 }}><i style={{ flexGrow: o.rows[0].p, background: 'var(--lime)' }} /><i style={{ flexGrow: 1 - o.rows[0].p }} /></span>
            <span className="t-12r num" style={{ width: 30, textAlign: 'right', color: 'var(--neutral-400)' }}>{prob(o.rows[0].p)}</span>
          </div>
          <div className="bin-cta"><YesNo o={o} i={0} label={o.title} p={o.rows[0].p} wide /></div>
        </div>
      )}

      {o.kind !== 'versus' && (
        <div className="out-foot t-12r">
          <span className="out-foot__cat">
            {slug ? <a href={href.outcome(slug)} className="cat-link">{o.category}</a> : <span>{o.category}</span>}
            {o.volume > 0 && <><i aria-hidden /><span className="num">Vol {usdCompact(o.volume)}</span></>}
          </span>
          <span className="num">
            {o.source === 'hyperliquid' && o.expiry ? left(o.expiry - t) : o.count && o.count > 1 ? `${o.count} Markets` : null}
          </span>
        </div>
      )}
    </article>
  )
})
