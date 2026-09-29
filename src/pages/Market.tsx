import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loadDetail, loadHistory, useMarket, type DMarket, type Detail, type Range } from '../data/market'
import { usdCompact } from '../format'
import { CaretDown, Check, HyperliquidMark, Info, LinkSimple, ListPlus, PolymarketMark, ShareFat, Star } from '../icons'
import { href, marketHref, replace } from '../router'
import { brandColor, Coin, toast, useClearLogo } from '../components/primitives'
import { AnimatedNumber, ProbChart, SERIES_COLORS, type Series } from '../components/ProbChart'

const RANGES: Range[] = ['1H', '6H', '1D', '1W', '1M', 'All']
const pct0 = (n: number) => `${Math.round(n * 100)}%`
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`
const cents = (n: number) => `${(n * 100).toFixed(1)}¢`

/* Brand glow: dominant hue of the market artwork (falls back per venue/coin). */
const COIN_COLOR: Record<string, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF', HYPE: '#98FBE5' }
function useBrandColor(d?: Detail) {
  const fallback = d?.underlying ? COIN_COLOR[d.underlying] ?? '#A7F932' : '#F7931A'
  const src = d?.image ?? (d?.underlying ? `https://app.hyperliquid.xyz/coins/${d.underlying}.svg` : undefined)
  const [c, setC] = useState<string | null>(null)
  useEffect(() => {
    setC(null)
    if (!src) return
    let live = true
    brandColor(src).then((v) => live && setC(v))
    return () => { live = false }
  }, [src])
  return c ?? fallback
}

function Thumb({ d, size }: { d: Detail; size: number }) {
  const [ref, clear] = useClearLogo<HTMLSpanElement>()
  return (
    <span ref={ref} className={`mk-thumb${clear ? ' is-clear' : ''}`} style={{ width: size, height: size, borderRadius: clear ? 0 : size > 44 ? 12 : 10 }}>
      {d.underlying ? <Coin coin={d.underlying} size={size} /> : d.image ? <img src={d.image} alt="" /> : null}
    </span>
  )
}
const Venue = ({ d }: { d: Detail }) => (
  <span className="venue">{d.source === 'hyperliquid' ? <HyperliquidMark /> : <PolymarketMark />}{d.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket'}</span>
)

/* ───────────── Trade ticket ───────────── */
function Ticket({ d, m, side, onSide }: { d: Detail; m?: DMarket; side: 'yes' | 'no'; onSide: (s: 'yes' | 'no') => void }) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [type, setType] = useState<'Market' | 'Limit'>('Market')
  const [menu, setMenu] = useState(false)
  const [amt, setAmt] = useState('')
  const [done, setDone] = useState(false)
  const [shake, setShake] = useState(0)
  const [limit, setLimit] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const tabs = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState({ x: 0, w: 0 })
  useLayoutEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth })
  }, [mode])
  useEffect(() => { setLimit(null) }, [m?.id, side])

  const yes = m?.p ?? 0.5
  const price = limit ?? (side === 'yes' ? yes : 1 - yes)
  const amount = Number(amt) || 0
  const shares = price > 0 ? amount / price : 0
  const win = shares - amount
  const label = d.markets.length > 1 && m ? m.label : d.title

  const submit = () => {
    if (!amount) { setShake((n) => n + 1); input.current?.focus(); return }
    setDone(true)
    toast(`${mode === 'buy' ? 'Bought' : 'Sold'} ${shares.toFixed(2)} ${side === 'yes' ? 'Yes' : 'No'} · ${label} @ ${cents(price)} — prototype`)
    setTimeout(() => { setDone(false); setAmt('') }, 1400)
  }

  return (
    <aside className="ticket" aria-label="Trade">
      <div className="ticket__head">
        <div className="ticket__tabs" ref={tabs} role="tablist">
          {(['buy', 'sell'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={mode === t} className="ticket__tab" onClick={() => setMode(t)}>{t === 'buy' ? 'Buy' : 'Sell'}</button>
          ))}
          <span className="ticket__ind" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />
        </div>
        <div className="menu-wrap">
          <button className="ticket__type t-12r" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            {type}<CaretDown style={{ color: '#a1a1a1', transform: menu ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
          </button>
          {menu && (
            <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
              {(['Market', 'Limit'] as const).map((t) => (
                <button key={t} role="menuitemradio" aria-checked={type === t} className="menu__item t-12m" onClick={() => { setType(t); setMenu(false) }}>
                  {t}{type === t && <Check />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ticket__market">
        <Thumb d={d} size={40} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="crumb t-12m">{d.category}{d.sub && <><i />{d.sub}</>}</span>
          <span className="ticket__title t-14m">
            <span className="ellip">{label}</span><i className="dot" />
            <span style={{ color: side === 'yes' ? 'var(--green)' : 'var(--red-500)' }}>{side === 'yes' ? 'Yes' : 'No'}</span>
          </span>
        </div>
      </div>

      <div className="ticket__sides">
        <button className="side side--yes" aria-pressed={side === 'yes'} onClick={() => onSide('yes')}>
          Yes <AnimatedNumber value={yes} format={pct1} />
        </button>
        <button className="side side--no" aria-pressed={side === 'no'} onClick={() => onSide('no')}>
          No <AnimatedNumber value={1 - yes} format={pct1} />
        </button>
      </div>

      <div className="ticket__body">
        <label className="amount" key={shake} data-shake={shake || undefined}>
          <span className="t-14m">Amount</span>
          <span className="amount__field">
            <span className="amount__cur" data-empty={!amount || undefined}>$</span>
            <input ref={input} inputMode="decimal" placeholder="0" value={amt} aria-label="Amount in USD"
              onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 9))}
              style={{ width: `${Math.max(1, amt.length || 1)}ch` }} />
          </span>
        </label>

        {type === 'Limit' && (
          <div className="kv"><span className="t-14m">Limit price</span>
            <span className="stepper">
              <button onClick={() => setLimit(Math.max(0.01, +(price - 0.01).toFixed(2)))} aria-label="Decrease">−</button>
              <span className="num t-14m">{cents(price)}</span>
              <button onClick={() => setLimit(Math.min(0.99, +(price + 0.01).toFixed(2)))} aria-label="Increase">+</button>
            </span>
          </div>
        )}

        <div className={`summary${amount ? ' is-open' : ''}`} aria-hidden={!amount}>
          <div>
            <div className="kv t-12r"><span className="muted">Avg price</span><AnimatedNumber value={price} format={cents} /></div>
            <div className="kv t-12r"><span className="muted">Shares</span><span className="num">{shares.toFixed(2)}</span></div>
            <div className="kv t-12r"><span className="muted">{mode === 'buy' ? 'Potential return' : 'You receive'}</span>
              <span className="num" style={{ color: 'var(--green)' }}>{mode === 'buy' ? `$${shares.toFixed(2)} (+${amount ? ((win / amount) * 100).toFixed(0) : 0}%)` : `$${amount.toFixed(2)}`}</span></div>
          </div>
        </div>

        <div className="kv" style={{ alignItems: 'flex-start' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="t-14m">Venue</span>
            <span className="t-12r" style={{ color: 'var(--neutral-400)' }}>Venue fees apply</span>
          </span>
          <Venue d={d} />
        </div>

        <div className="chips">
          {[1, 10, 50, 100].map((v) => (
            <button key={v} className="chip" onClick={() => setAmt(String(+(amount + v).toFixed(2)))}>+${v}</button>
          ))}
        </div>
      </div>

      <div className="ticket__cta">
        <button className="btn-lime cta" onClick={submit} data-done={done || undefined}>
          <span className="cta__l">{mode === 'buy' ? 'Buy' : 'Sell'} {side === 'yes' ? 'Yes' : 'No'}</span>
          <span className="cta__ok"><Check /> Order placed</span>
        </button>
        <span className="t-12r" style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--neutral-400)' }} data-tip="Aimo charges no fee on outcome trades">
          <Info style={{ color: 'var(--neutral-500)' }} /> 0% Aimo fees
        </span>
      </div>
    </aside>
  )
}

/* ───────────── Page ───────────── */
const FAV = 'aimo:favMarkets'
export function MarketPage({ source, id, m: mParam, side }: { source: 'pm' | 'hl'; id: string; m?: string; side: 'yes' | 'no' }) {
  const s = useMarket()
  const key = `${source}:${id}`
  const d = s.details[key]
  const [range, setRange] = useState<Range>(source === 'hl' ? '1H' : '1W')
  const [hoverRow, setHoverRow] = useState<string>()
  const [showResolved, setShowResolved] = useState(false)
  const [picker, setPicker] = useState(false)
  const [plotted, setPlotted] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [fav, setFav] = useState(() => { try { return (JSON.parse(localStorage.getItem(FAV) || '[]') as string[]).includes(key) } catch { return false } })
  const glow = useBrandColor(d)

  useEffect(() => { loadDetail(source, id) }, [key])
  useEffect(() => { if (d?.status === 'ready') loadHistory(key, range) }, [key, range, d?.status])
  useEffect(() => { setPlotted(null); setShowResolved(false); setRange(source === 'hl' ? '1H' : '1W') }, [key])

  // Tick clock so live tails advance in time even without trades.
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const active = d?.markets.filter((x) => !x.closed) ?? []
  const resolved = d?.markets.filter((x) => x.closed) ?? []
  const selected = active.find((x) => x.id === mParam || x.token === mParam) ?? active[0]
  const setSel = (mk: DMarket, sd: 'yes' | 'no') => replace(marketHref({ source: source === 'hl' ? 'hyperliquid' : 'polymarket', id }, { m: mk.id, side: sd }))

  const plotIds = plotted ?? active.slice(0, 4).map((x) => x.id)
  const hist = d?.history[range]
  const series: Series[] = useMemo(() => plotIds
    .map((pid) => active.find((x) => x.id === pid))
    .filter(Boolean)
    .map((mk, i) => ({ id: mk!.id, label: mk!.label, color: SERIES_COLORS[i], points: hist?.[mk!.id] ?? [], live: mk!.p })),
  [plotIds.join(), hist, s.tick])

  if (!d || (d.status === 'loading' && !d.markets.length)) {
    return <main className="main mk"><div className="mk-grid"><div className="mk-left"><div className="sk" style={{ height: 52, width: 360 }} /><div className="sk" style={{ height: 260, marginTop: 36 }} /></div><div className="ticket sk" style={{ height: 446 }} /></div></main>
  }
  if (d.status === 'error') {
    return <main className="main mk"><div className="empty"><p className="t-16m" style={{ margin: 0 }}>This market couldn't be loaded</p><a className="see-more t-12m" href={href.outcome()}>Back to Outcome</a></div></main>
  }

  const legend = series
  const endLabel = d.endDate ? new Date(d.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined
  const share = async () => {
    const url = location.href
    if (navigator.share) { try { await navigator.share({ title: d.title, url }) } catch {} } else copy()
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href) } catch {}
    setCopied(true); toast('Link copied'); setTimeout(() => setCopied(false), 1400)
  }
  const toggleFav = () => {
    setFav((v) => {
      const n = !v
      try { const list: string[] = JSON.parse(localStorage.getItem(FAV) || '[]'); localStorage.setItem(FAV, JSON.stringify(n ? [...list, key] : list.filter((x) => x !== key))) } catch {}
      toast(n ? 'Added to watchlist' : 'Removed from watchlist')
      return n
    })
  }

  return (
    <main className="main mk">
      <span className="mk-glow" style={{ background: `linear-gradient(180deg, ${glow}, ${glow})` }} />
      <div className="mk-grid">
        <div className="mk-left">
          {/* Header */}
          <header className="mk-head">
            <div className="mk-head__top">
              <div className="mk-head__id">
                <Thumb d={d} size={52} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="crumb t-14m"><a href={href.outcome()} className="cat-link">{d.category}</a>{d.sub && <><i />{d.sub}</>}</span>
                  <h1 className="mk-title">{d.title}</h1>
                </div>
              </div>
              <div className="mk-actions">
                <button className="sq-btn" aria-label="Share" data-tip="Share" onClick={share}><ShareFat /></button>
                <button className="sq-btn" aria-label="Copy link" data-tip="Copy link" onClick={copy}>{copied ? <Check style={{ color: 'var(--lime)' }} /> : <LinkSimple />}</button>
                <button className="sq-btn" aria-label="Watchlist" aria-pressed={fav} data-tip="Watchlist" onClick={toggleFav}><Star width={16} height={16} /></button>
              </div>
            </div>
            <div className="mk-legend">
              <div className="mk-legend__items">
                {legend.map((x) => (
                  <button key={x.id} className="lg t-12r" onMouseEnter={() => setHoverRow(x.id)} onMouseLeave={() => setHoverRow(undefined)}
                    onClick={() => { const mk = active.find((a) => a.id === x.id); mk && setSel(mk, side) }}>
                    <i style={{ background: x.color }} /><span className="muted ellip">{x.label}</span>
                    <AnimatedNumber value={x.live} format={pct1} className="t-12m" />
                  </button>
                ))}
              </div>
              <Venue d={d} />
            </div>
          </header>

          {/* Chart */}
          <section className="mk-chart" aria-label="Chart">
            <ProbChart series={series} range={range} loading={d.histStatus[range] !== 'ready'} focus={hoverRow} now={now} />
          </section>

          {/* Market list */}
          <section className="mk-list">
            <div className="mk-bar">
              <div style={{ display: 'flex', gap: 12 }}>
                {d.volume > 0 && <span className="t-12m">{usdCompact(d.volume)} Vol</span>}
                {endLabel && <span className="t-12r" style={{ color: 'var(--neutral-400)' }}>{endLabel}</span>}
              </div>
              <div className="ranges" role="radiogroup" aria-label="Chart range">
                {RANGES.map((r) => (
                  <button key={r} role="radio" aria-checked={range === r} className="range t-12r" onClick={() => setRange(r)}>{r}</button>
                ))}
                <div className="menu-wrap">
                  <button className="range" aria-label="Choose lines" aria-expanded={picker} data-tip="Choose lines" onClick={() => setPicker((v) => !v)}><ListPlus /></button>
                  {picker && (
                    <div className="menu menu--wide" role="menu" onMouseLeave={() => setPicker(false)}>
                      <div className="t-12m muted" style={{ padding: '6px 8px' }}>Plot up to 4</div>
                      {active.map((mk) => {
                        const on = plotIds.includes(mk.id)
                        return (
                          <button key={mk.id} role="menuitemcheckbox" aria-checked={on} className="menu__item t-12m"
                            onClick={() => setPlotted(on ? plotIds.filter((p) => p !== mk.id) : [...plotIds, mk.id].slice(-4))}>
                            <span className="ellip">{mk.label}</span>{on && <Check />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {active.map((mk) => {
              const sel = selected?.id === mk.id
              return (
                <div key={mk.id} className={`mk-row${sel ? ' is-sel' : ''}`} onMouseEnter={() => setHoverRow(mk.id)} onMouseLeave={() => setHoverRow(undefined)}
                  onClick={() => setSel(mk, side)}>
                  <div className="mk-row__l">
                    <span className="t-16m ellip">{mk.label}</span>
                    {mk.volume > 0 && <span className="t-12r" style={{ color: 'var(--neutral-400)' }}>{usdCompact(mk.volume)} Vol</span>}
                  </div>
                  <AnimatedNumber value={mk.p} format={pct0} className="mk-row__p" />
                  <div className="mk-row__r">
                    <button className="bb bb--yes" aria-pressed={sel && side === 'yes'} onClick={(e) => { e.stopPropagation(); setSel(mk, 'yes') }}>
                      Yes <AnimatedNumber value={mk.p} format={cents} />
                    </button>
                    <button className="bb bb--no" aria-pressed={sel && side === 'no'} onClick={(e) => { e.stopPropagation(); setSel(mk, 'no') }}>
                      No <AnimatedNumber value={1 - mk.p} format={cents} />
                    </button>
                  </div>
                </div>
              )
            })}
            {resolved.length > 0 && (
              <>
                <button className="mk-resolved t-16m" aria-expanded={showResolved} onClick={() => setShowResolved((v) => !v)}>
                  {showResolved ? 'Hide Resolved' : 'View Resolved'} <span className="muted t-12r">{resolved.length}</span>
                </button>
                <div className={`collapse${showResolved ? ' is-open' : ''}`}>
                  <div>
                    {resolved.map((mk) => (
                      <div key={mk.id} className="mk-row is-resolved">
                        <div className="mk-row__l"><span className="t-16m ellip">{mk.label}</span><span className="t-12r muted">{usdCompact(mk.volume)} Vol</span></div>
                        <span className="t-14m" style={{ color: mk.p > 0.5 ? 'var(--green)' : 'var(--neutral-400)' }}>{mk.p > 0.5 ? 'Resolved Yes' : 'Resolved No'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Rules */}
          <section className="mk-rules">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="t-20s" style={{ margin: 0 }}>Rules</h2>
              <span className="src-pill" style={{ pointerEvents: 'none' }}>{d.source === 'hyperliquid' ? <HyperliquidMark /> : <PolymarketMark />}<span>{d.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket'}</span></span>
            </div>
            {d.rules.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
            <a className="see-more t-12m" href={d.url} target="_blank" rel="noopener" style={{ alignSelf: 'flex-start' }}>Open on {d.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket'}</a>
          </section>
        </div>

        {selected && <Ticket d={d} m={selected} side={side} onSide={(sd) => setSel(selected, sd)} />}
      </div>
    </main>
  )
}
