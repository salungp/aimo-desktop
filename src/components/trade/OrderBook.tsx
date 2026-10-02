import { useEffect, useMemo, useState } from 'react'
import { fmt, pxDecimals, useTrade, watchMarket, type Level, type Market } from '../../data/trade'
import { IcoCaretDown } from './icons'

/* Order book / recent trades (Figma 788:25641): 10 asks · spread · 10 bids with cumulative depth bars. */

const ROWS = 10
const tickFor = (px: number, sig: number) => 10 ** (Math.floor(Math.log10(px)) + 1 - sig)
const tickLabel = (t: number) => (t >= 1 ? String(t) : t.toFixed(Math.max(0, -Math.floor(Math.log10(t)))))

export function OrderBook({ m, onPrice }: { m: Market; onPrice: (px: number) => void }) {
  const s = useTrade()
  const [tab, setTab] = useState<'book' | 'trades'>('book')
  const [sig, setSig] = useState<number | null>(null)
  const [usd, setUsd] = useState(false)
  const [menu, setMenu] = useState<null | 'unit' | 'group'>(null)
  useEffect(() => { setSig(null) }, [m.coin])
  useEffect(() => { watchMarket(m.coin, sig) }, [m.coin, sig])
  useEffect(() => {
    if (!menu) return
    const off = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.ob-menu')) setMenu(null) }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [menu])

  const book = s.book?.coin === m.coin ? s.book : null
  const d = pxDecimals(m, m.price)
  const szD = Math.min(4, m.szDecimals)
  const groups = useMemo(() => {
    const base = 10 ** -d
    return [null, 5, 4, 3, 2].map((n) => ({ n, tick: n ? tickFor(m.price, n) : base })).filter((g, i, a) => g.tick >= base && a.findIndex((x) => x.tick === g.tick) === i)
  }, [m.coin, d, Math.floor(Math.log10(m.price))])
  const cur = groups.find((g) => g.n === sig) ?? groups[0]
  const grpD = Math.max(0, Math.min(d, -Math.floor(Math.log10(cur.tick))))

  const side = (l: Level[]) => {
    let acc = 0
    return l.slice(0, ROWS).map((x) => ({ ...x, total: (acc += usd ? x.sz * x.px : x.sz) }))
  }
  const asks = book ? side(book.asks) : []
  const bids = book ? side(book.bids) : []
  const max = Math.max(asks[asks.length - 1]?.total ?? 0, bids[bids.length - 1]?.total ?? 0) || 1
  const spread = book?.asks[0] && book?.bids[0] ? book.asks[0].px - book.bids[0].px : null
  const mid = book?.asks[0] && book?.bids[0] ? (book.asks[0].px + book.bids[0].px) / 2 : m.price
  const unit = usd ? 'USD' : m.base
  const sz = (v: number) => (usd ? (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(1)}K` : fmt(v, 0)) : fmt(v, szD))

  const row = (l: Level & { total: number }, ask: boolean) => (
    <button key={l.px} className={`ob-row ${ask ? 'is-ask' : 'is-bid'}`} onClick={() => onPrice(l.px)} title={`Use ${fmt(l.px, grpD)} as limit price · ${l.n} order${l.n > 1 ? 's' : ''}`}>
      <span className="ob-row__bar" style={{ transform: `scaleX(${l.total / max})` }} />
      <span className="ob-row__px num">{fmt(l.px, grpD)}</span>
      <span className="num">{sz(usd ? l.sz * l.px : l.sz)}</span>
      <span className="num">{sz(l.total)}</span>
    </button>
  )
  const empty = (k: string) => Array.from({ length: ROWS }, (_, i) => <div key={k + i} className="ob-row ob-row--sk"><span className="sk" /></div>)

  return (
    <section className="ob" aria-label="Order book">
      <div className="ob-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>Order Book</button>
        <button role="tab" aria-selected={tab === 'trades'} onClick={() => setTab('trades')}>Recent Trades</button>
      </div>
      {tab === 'book' ? (
        <>
          <div className="ob-ctrl">
            <div className="ob-menu">
              <button aria-expanded={menu === 'unit'} onClick={() => setMenu(menu === 'unit' ? null : 'unit')} aria-label={`Size unit: ${unit}`}>{unit}<IcoCaretDown s={14} /></button>
              {menu === 'unit' && (
                <div className="tmenu__pop" role="menu">
                  {[false, true].map((u) => <button key={String(u)} role="menuitemradio" aria-checked={usd === u} onClick={() => { setUsd(u); setMenu(null) }}>{u ? 'USD' : m.base}</button>)}
                </div>
              )}
            </div>
            <div className="ob-menu">
              <button aria-expanded={menu === 'group'} onClick={() => setMenu(menu === 'group' ? null : 'group')} aria-label={`Price grouping: ${tickLabel(cur.tick)}`}>{tickLabel(cur.tick)}<IcoCaretDown s={14} /></button>
              {menu === 'group' && (
                <div className="tmenu__pop tmenu__pop--end" role="menu">
                  {groups.map((g) => <button key={String(g.n)} role="menuitemradio" aria-checked={g.n === sig} onClick={() => { setSig(g.n); setMenu(null) }}>{tickLabel(g.tick)}</button>)}
                </div>
              )}
            </div>
          </div>
          <div className="ob-head"><span>Price</span><span>Size ({unit})</span><span>Total ({unit})</span></div>
          <div className="ob-side ob-side--asks">{asks.length ? [...asks].reverse().map((l) => row(l, true)) : empty('a')}</div>
          <div className="ob-spread num">
            <span>Spread</span>
            <span>{spread != null ? `${fmt(spread, grpD)} · ${((spread / mid) * 100).toFixed(3)}%` : '—'}</span>
          </div>
          <div className="ob-side">{bids.length ? bids.map((l) => row(l, false)) : empty('b')}</div>
        </>
      ) : (
        <>
          <div className="ob-head"><span>Price</span><span>Size ({m.base})</span><span>Time</span></div>
          <div className="ob-trades">
            {s.trades?.coin === m.coin && s.trades.list.length
              ? s.trades.list.map((t) => (
                  <button key={t.tid + ':' + t.time} className={`ob-row ob-row--trade ${t.side === 'B' ? 'is-bid' : 'is-ask'}`} onClick={() => onPrice(t.px)} title="Use as limit price">
                    <span className="ob-row__px num">{fmt(t.px, d)}</span>
                    <span className="num">{fmt(t.sz, szD)}</span>
                    <span className="num ob-row__t">{new Date(t.time).toISOString().slice(11, 19)}</span>
                  </button>
                ))
              : empty('t')}
          </div>
        </>
      )}
    </section>
  )
}
