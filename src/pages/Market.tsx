import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { bookKey, loadBook, loadDetail, loadHistory, useMarket, type Book, type DMarket, type Detail, type Level, type Range } from '../data/market'
import { usdCompact } from '../format'
import { CaretDown, Check, CheckCircle, Chevron, HyperliquidMark, Info, LinkSimple, ListPlus, PolymarketMark, ShareFat, Star, XCircle } from '../icons'
import { href, marketHref, replace } from '../router'
import { brandColor, Coin, toast, useClearLogo } from '../components/primitives'
import { AnimatedNumber, ProbChart, SERIES_COLORS, type Series } from '../components/ProbChart'
import { AppCta } from '../components/OutcomeAside'

const RANGES: Range[] = ['1H', '6H', '1D', '1W', '1M', 'All']
// Never round a live long-shot to a certainty: clamp the ends like Polymarket does.
const pct0 = (n: number) => (n > 0 && n < 0.005 ? '<1%' : n < 1 && n > 0.995 ? '>99%' : `${Math.round(n * 100)}%`)
const pct1 = (n: number) => (n > 0 && n < 0.0005 ? '<0.1%' : n < 1 && n > 0.9995 ? '>99.9%' : `${(n * 100).toFixed(1)}%`)

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

/* Close a popover on outside press or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return ref
}

/* Book sides for the chosen outcome: No is the Yes book inverted (No bid = 1 − Yes ask). */
function sideBook(b: Book | undefined, side: 'yes' | 'no') {
  if (!b) return { bids: [] as Level[], asks: [] as Level[], last: undefined as number | undefined }
  if (side === 'yes') return { bids: b.bids, asks: b.asks, last: b.last }
  const inv = (l: Level) => ({ p: +(1 - l.p).toFixed(4), s: l.s })
  return { bids: b.asks.map(inv), asks: b.bids.map(inv), last: b.last != null ? 1 - b.last : undefined }
}
/** Walk the book with a dollar amount → shares filled; any unfilled remainder prices at the last level (or the quote). */
function fill(levels: Level[], amount: number, quote: number) {
  let left = amount, shares = 0
  for (const l of levels) {
    if (left <= 0) break
    const take = Math.min(left, l.p * l.s)
    shares += take / l.p; left -= take
  }
  if (left > 0) shares += left / (levels[levels.length - 1]?.p ?? quote)
  return shares
}

/* ───────────── Trade ticket (Figma 805:36079) ───────────── */
function Ticket({ d, m, side, onSide, book }: { d: Detail; m?: DMarket; side: 'yes' | 'no'; onSide: (s: 'yes' | 'no') => void; book?: Book }) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [type, setType] = useState<'Market' | 'Limit'>('Market')
  const [menu, setMenu] = useState(false)
  const [amt, setAmt] = useState('')
  const [done, setDone] = useState(false)
  const [shake, setShake] = useState(0)
  const [limit, setLimit] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const tabs = useRef<HTMLDivElement>(null)
  const menuRef = useDismiss(menu, () => setMenu(false))
  const [ind, setInd] = useState({ x: 0, w: 0 })
  useLayoutEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth })
  }, [mode])
  useEffect(() => { setLimit(null) }, [m?.id, side])

  const yes = m?.p ?? 0.5
  const quote = side === 'yes' ? yes : 1 - yes
  const price = type === 'Limit' ? limit ?? quote : quote
  const amount = Number(amt) || 0
  const sb = sideBook(book, side)
  // Market orders walk the live book (buy lifts asks, sell hits bids); limit orders fill at the limit.
  const shares = !amount ? 0 : type === 'Limit' ? amount / price : fill(mode === 'buy' ? sb.asks : sb.bids, amount, price)
  const avg = shares ? amount / shares : price
  const fees = 0 // venues charge no taker fee on these markets; Aimo adds none
  const save = type === 'Limit' && mode === 'buy' && price < quote ? shares * (quote - price) : 0
  const label = d.markets.length > 1 && m ? m.label : d.title
  const venue = d.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket'

  const submit = () => {
    if (!amount) { setShake((n) => n + 1); input.current?.focus(); return }
    setDone(true)
    toast(`${mode === 'buy' ? 'Bought' : 'Sold'} ${shares.toFixed(2)} ${side === 'yes' ? 'Yes' : 'No'} · ${label} @ ${pct1(avg)} — prototype`)
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
        <div className="menu-wrap" ref={menuRef}>
          <button className="ticket__type t-12r" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            {type}<CaretDown style={{ color: '#a1a1a1', transform: menu ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--ease-out)' }} />
          </button>
          {menu && (
            <div className="menu" role="menu">
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
            <span style={{ color: side === 'yes' ? 'var(--green)' : 'var(--red-500)', flexShrink: 0 }}>{side === 'yes' ? 'Yes' : 'No'}</span>
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
          <span className="kv__l">
            <span className="t-14m">Amount</span>
            <span className="t-12r sub">$0.00 available</span>
          </span>
          <span className="amount__field">
            <span className="amount__cur" data-empty={!amount || undefined}>$</span>
            {/* Mirror span sizes the input to its exact glyph width (ch units drift with proportional fonts). */}
            <span className="amount__size">
              <span aria-hidden className="amount__mirror">{amt || '0'}</span>
              <input ref={input} size={1} inputMode="decimal" placeholder="0" value={amt} aria-label="Amount in USD"
                onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 9))} />
            </span>
          </span>
        </label>

        {type === 'Limit' && (
          <div className="kv"><span className="t-14m">Limit price</span>
            <span className="stepper">
              <button onClick={() => setLimit(Math.max(0.01, +(price - 0.01).toFixed(2)))} aria-label="Decrease limit price">−</button>
              <span className="num t-14m">{pct1(price)}</span>
              <button onClick={() => setLimit(Math.min(0.99, +(price + 0.01).toFixed(2)))} aria-label="Increase limit price">+</button>
            </span>
          </div>
        )}

        <div className="venue-box">
          <span className="venue-box__l">
            {d.source === 'hyperliquid' ? <HyperliquidMark /> : <PolymarketMark />}
            <span className="kv__l"><span className="t-14m">{venue}</span><span className="t-12r sub num">${fees.toFixed(2)} Fees</span></span>
          </span>
          <span className="kv__l" style={{ alignItems: 'flex-end' }}>
            <span className="t-14m num">${(amount + fees).toFixed(2)}</span>
            <span className="t-12r sub num">{pct1(avg)} Avg Price</span>
          </span>
        </div>

        {save > 0.004 && (
          <div className="kv t-14m"><span>You save</span><span className="num" style={{ color: 'var(--green)' }}>${save.toFixed(2)}</span></div>
        )}

        <div className="kv">
          <span className="kv__l">
            <span className="t-14m">{mode === 'buy' ? 'To Win' : 'You receive'}</span>
            <span className="t-12r sub num">Avg Price {pct1(avg)}</span>
          </span>
          <AnimatedNumber value={mode === 'buy' ? shares : shares * avg} format={(n) => `$${n.toFixed(2)}`} className="ticket__win" />
        </div>
      </div>

      <div className="ticket__cta">
        <button className="btn-lime cta" onClick={submit} data-done={done || undefined}>
          <span className="cta__l">{mode === 'buy' ? 'Buy' : 'Sell'} {side === 'yes' ? 'Yes' : 'No'}</span>
          <span className="cta__ok"><Check /> Order placed</span>
        </button>
        <span className="t-12r ticket__fee" data-tip="Aimo charges no fee on outcome shares">
          <Info /> Zero Share Fees
        </span>
      </div>
    </aside>
  )
}

/* ───────────── Expanded market: order book / graph / about (Figma 805:50137) ───────────── */
const fmtN = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const BOOK_DEPTH = 4
type Panel = 'yes' | 'no' | 'graph' | 'about'

function BookTable({ d, book, side }: { d: Detail; book?: Book; side: 'yes' | 'no' }) {
  const { bids, asks, last } = sideBook(book, side)
  const a = asks.slice(0, BOOK_DEPTH), b = bids.slice(0, BOOK_DEPTH)
  const cum = (xs: Level[]) => xs.reduce<number[]>((acc, l) => [...acc, (acc[acc.length - 1] ?? 0) + l.s], [])
  const ca = cum(a), cb = cum(b), max = Math.max(ca[ca.length - 1] ?? 0, cb[cb.length - 1] ?? 0, 1)
  const Mark = d.source === 'hyperliquid' ? HyperliquidMark : PolymarketMark
  const row = (l: Level, c: number, kind: 'ask' | 'bid', badge: boolean) => (
    <div className={`ob-row ob-row--${kind}`} key={`${kind}-${l.p}`}>
      <span className="ob-cell ob-cell--price">
        <i className="ob-fill" style={{ width: `${(c / max) * 100}%` }} />
        {badge && <span className="ob-badge">{kind === 'ask' ? 'Ask' : 'Bids'}</span>}
        <span className="ob-price num">{pct1(l.p)}<Mark width={20} height={20} /></span>
      </span>
      <span className="ob-cell num">{fmtN(l.s)}</span>
      <span className="ob-cell num">${fmtN(l.p * l.s)}</span>
    </div>
  )
  if (book?.status !== 'ready' && !a.length && !b.length) {
    return <div className="ob-empty">{book?.status === 'error' ? "Order book couldn't be loaded." : <span className="sk" style={{ width: '100%', height: 120 }} />}</div>
  }
  if (!a.length && !b.length) return <div className="ob-empty">No resting orders on {d.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket'} yet.</div>
  const spread = a[0] && b[0] ? a[0].p - b[0].p : undefined
  return (
    <div className="ob" role="table" aria-label={`Order book · ${side === 'yes' ? 'Yes' : 'No'}`}>
      <div className="ob-row ob-head t-12m" role="row"><span className="ob-cell">PRICE</span><span className="ob-cell">CONTRACTS</span><span className="ob-cell">TOTAL</span></div>
      {[...a].reverse().map((l, i, arr) => row(l, ca[arr.length - 1 - i], 'ask', i === arr.length - 1))}
      <div className="ob-mid t-12m">
        <span className="ob-mid__in">
          <span>Last: {last != null ? pct1(last) : '—'}</span>
          <span>Spread: {spread != null ? pct1(spread) : '—'}</span>
        </span>
      </div>
      {b.map((l, i) => row(l, cb[i], 'bid', i === 0))}
    </div>
  )
}

function MarketPanel({ d, mk, dkey, side, onSide, range, now }: { d: Detail; mk: DMarket; dkey: string; side: 'yes' | 'no'; onSide: (s: 'yes' | 'no') => void; range: Range; now: number }) {
  const s = useMarket()
  const [panel, setPanel] = useState<Panel>(side)
  useEffect(() => { setPanel((p) => (p === 'yes' || p === 'no' ? side : p)) }, [side])
  const book = s.books[bookKey(dkey, mk.id)]
  const trading = panel === 'yes' || panel === 'no'
  useEffect(() => {
    if (!trading) return
    loadBook(dkey, mk.id)
    const t = setInterval(() => { if (!document.hidden) loadBook(dkey, mk.id) }, 5000)
    return () => clearInterval(t)
  }, [trading, dkey, mk.id])
  const tabs = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState({ x: 0, w: 0 })
  useLayoutEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth })
  }, [panel])
  const pick = (p: Panel) => { setPanel(p); if (p === 'yes' || p === 'no') onSide(p) }
  const series: Series[] = [{ id: mk.id, label: mk.label, color: SERIES_COLORS[0], points: d.history[range]?.[mk.id] ?? [], live: mk.p }]
  const end = d.endDate ? new Date(d.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  return (
    <div className="mk-panel" onClick={(e) => e.stopPropagation()}>
      <div className="mk-panel__tabs" role="tablist" ref={tabs}>
        {([['yes', 'Trade Yes'], ['no', 'Trade No'], ['graph', 'Graph'], ['about', 'About']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={panel === k} className="mk-panel__tab t-14m" onClick={() => pick(k)}>{l}</button>
        ))}
        <span className="mk-panel__ind" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />
      </div>
      {trading && <BookTable d={d} book={book} side={panel as 'yes' | 'no'} />}
      {panel === 'graph' && (
        <div className="mk-panel__graph">
          <ProbChart series={series} range={range} loading={d.histStatus[range] !== 'ready'} now={now} />
        </div>
      )}
      {panel === 'about' && (
        <dl className="mk-about t-14r">
          <div><dt>Market</dt><dd>{mk.label}</dd></div>
          <div><dt>Yes / No</dt><dd className="num">{pct1(mk.p)} / {pct1(1 - mk.p)}</dd></div>
          <div><dt>Volume</dt><dd className="num">{mk.volume > 0 ? usdCompact(mk.volume) : '—'}</dd></div>
          <div><dt>Ends</dt><dd>{end}</dd></div>
          <div><dt>Venue</dt><dd><Venue d={d} /></dd></div>
        </dl>
      )}
    </div>
  )
}

/* Rules text: blank-line paragraphs, bare URLs become links. */
function RulesText({ text }: { text: string }) {
  return (
    <div className="mk-rules__text">
      {text.split(/\n+/).filter(Boolean).map((para, i) => (
        <p key={i}>
          {para.split(/(https?:\/\/[^\s,)]+)/g).map((part, j) =>
            /^https?:\/\//.test(part) ? <a key={j} href={part} target="_blank" rel="noopener">{part}</a> : part)}
        </p>
      ))}
    </div>
  )
}

function RulesVenue({ d }: { d: Detail }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const name = d.source === 'hyperliquid' ? 'Hyperliquid' : 'Polymarket'
  const Mark = d.source === 'hyperliquid' ? HyperliquidMark : PolymarketMark
  const copy = async () => { try { await navigator.clipboard.writeText(d.rules) } catch {} toast('Rules copied'); setOpen(false) }
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="rules-venue" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Mark width={20} height={20} /><span>{name}</span><CaretDown className="rules-venue__caret" />
      </button>
      {open && (
        <div className="menu menu--left" role="menu">
          <div className="t-12m muted" style={{ padding: '6px 8px' }}>Resolution source</div>
          <button role="menuitemradio" aria-checked className="menu__item t-12m"><span className="menu__lead"><Mark width={16} height={16} />{name}</span><Check /></button>
          <div className="menu__sep" />
          <a role="menuitem" className="menu__item t-12m" href={d.url} target="_blank" rel="noopener" onClick={() => setOpen(false)}>View on {name}<ShareFat style={{ color: 'var(--neutral-400)' }} /></a>
          <button role="menuitem" className="menu__item t-12m" onClick={copy}>Copy rules<LinkSimple style={{ color: 'var(--neutral-400)' }} /></button>
        </div>
      )}
    </div>
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
  const pickerRef = useDismiss(picker, () => setPicker(false))
  const [expanded, setExpanded] = useState<string | null>(null) // detail panels start closed; opened by the user
  const [plotted, setPlotted] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)
  const [fav, setFav] = useState(() => { try { return (JSON.parse(localStorage.getItem(FAV) || '[]') as string[]).includes(key) } catch { return false } })
  const glow = useBrandColor(d)

  useEffect(() => { loadDetail(source, id) }, [key])
  useEffect(() => { if (d?.status === 'ready') loadHistory(key, range) }, [key, range, d?.status])
  useEffect(() => { setPlotted(null); setShowResolved(false); setExpanded(null); setRange(source === 'hl' ? '1H' : '1W') }, [key])

  // Tick clock so live tails advance in time even without trades.
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const active = d?.markets.filter((x) => !x.closed) ?? []
  const resolved = d?.markets.filter((x) => x.closed) ?? []
  const selected = active.find((x) => x.id === mParam || x.token === mParam) ?? active[0]
  const setSel = (mk: DMarket, sd: 'yes' | 'no') => replace(marketHref({ source: source === 'hl' ? 'hyperliquid' : 'polymarket', id }, { m: mk.id, side: sd }))
  const openId = expanded
  // Row press: select it and toggle its detail panel. Yes/No press: select that side and make sure the panel is open.
  const pressRow = (mk: DMarket) => { setSel(mk, side); setExpanded(openId === mk.id ? null : mk.id) }
  const pressSide = (mk: DMarket, sd: 'yes' | 'no') => { setSel(mk, sd); setExpanded(mk.id) }

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
                <div className="menu-wrap" ref={pickerRef}>
                  <button className="range" aria-label="Choose lines" aria-expanded={picker} data-tip="Choose lines" onClick={() => setPicker((v) => !v)}><ListPlus /></button>
                  {picker && (
                    <div className="menu menu--wide" role="menu">
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
              const sel = selected?.id === mk.id, open = openId === mk.id
              return (
                <div key={mk.id} className={`mk-item${open ? ' is-open' : ''}`}>
                  <div className={`mk-row${sel ? ' is-sel' : ''}`} role="button" tabIndex={0} aria-expanded={open}
                    onMouseEnter={() => setHoverRow(mk.id)} onMouseLeave={() => setHoverRow(undefined)}
                    onClick={() => pressRow(mk)}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pressRow(mk) } }}>
                    <div className="mk-row__l">
                      <span className="t-16m ellip">{mk.label}</span>
                      {mk.volume > 0 && <span className="t-12r sub">{usdCompact(mk.volume)} Vol</span>}
                    </div>
                    <AnimatedNumber value={mk.p} format={pct0} className="mk-row__p" />
                    <div className="mk-row__r">
                      <button className="bb bb--yes" aria-pressed={sel && side === 'yes'} onClick={(e) => { e.stopPropagation(); pressSide(mk, 'yes') }}>
                        Yes <AnimatedNumber value={mk.p} format={pct1} />
                      </button>
                      <button className="bb bb--no" aria-pressed={sel && side === 'no'} onClick={(e) => { e.stopPropagation(); pressSide(mk, 'no') }}>
                        No <AnimatedNumber value={1 - mk.p} format={pct1} />
                      </button>
                    </div>
                  </div>
                  <div className={`collapse${open ? ' is-open' : ''}`} aria-hidden={!open}>
                    <div>{open && <MarketPanel d={d} mk={mk} dkey={key} side={sel ? side : 'yes'} onSide={(sd) => pressSide(mk, sd)} range={range} now={now} />}</div>
                  </div>
                </div>
              )
            })}
            {resolved.length > 0 && (
              <>
                <button className="mk-resolved t-14m" aria-expanded={showResolved} onClick={() => setShowResolved((v) => !v)}>
                  {showResolved ? 'Hide Resolved' : `Show Resolved (${resolved.length})`}
                  <Chevron className="mk-resolved__chev" />
                </button>
                <div className={`collapse${showResolved ? ' is-open' : ''}`} aria-hidden={!showResolved}>
                  <div>
                    {resolved.map((mk) => {
                      const won = mk.p > 0.5
                      return (
                        <div key={mk.id} className="mk-row is-resolved">
                          <div className="mk-row__l"><span className="t-16m ellip">{mk.label}</span>{mk.volume > 0 && <span className="t-12r sub">{usdCompact(mk.volume)} Vol</span>}</div>
                          <span className={`res-badge ${won ? 'is-yes' : 'is-no'}`}>{won ? <CheckCircle /> : <XCircle />}{won ? 'Yes' : 'No'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Rules */}
          <section className="mk-rules">
            <div className="mk-rules__head">
              <h2 className="t-20s" style={{ margin: 0 }}>Rules</h2>
              <RulesVenue d={d} />
            </div>
            <RulesText text={d.rules} />
          </section>
        </div>

        <div className="mk-side">
          {selected && <Ticket d={d} m={selected} side={side} onSide={(sd) => setSel(selected, sd)} book={s.books[bookKey(key, selected.id)]} />}
          <AppCta />
        </div>
      </div>
    </main>
  )
}
