import { useState } from 'react'
import { useMarket } from '../../data/market'
import { useFavs, useRecent } from '../../data/favs'
import { chg, fmt, marketList, pxDecimals, useTrade, type Market } from '../../data/trade'
import { Star } from '../../icons'
import { href, marketHref } from '../../router'
import { Coin } from '../primitives'
import { IcoClock, IcoNews } from './icons'

/* Ticker bar under the navbar (Figma 788:24677): Watchlist · Markets & predictions · Recently viewed. */

type Mode = 'watch' | 'mix' | 'recent'

export function TopStrip() {
  const t = useTrade()
  const s = useMarket()
  const favs = useFavs()
  const recent = useRecent()
  const [mode, setMode] = useState<Mode>(() => (favs.length ? 'watch' : 'mix'))
  const markets = marketList(t)
  const byId = (ids: string[]) => ids.map((id) => t.markets[id]).filter(Boolean) as Market[]
  const preds = s.outcomes.filter((o) => o.kind === 'multi' || o.kind === 'binary').slice(0, 4)

  const asset = (m: Market) => {
    const c = chg(m)
    return (
      <a key={m.id} className="ts-item" href={href.trade(m.id)}>
        <Coin coin={m.logo} size={16} />
        <span className="ts-item__k">{m.base}:</span>
        <span className="num">${fmt(m.price, pxDecimals(m, m.price))}</span>
        <span className={`num ${c >= 0 ? 'up' : 'down'}`}>{(c >= 0 ? '+' : '') + (c * 100).toFixed(2)}%</span>
      </a>
    )
  }
  let items: JSX.Element[] = []
  if (mode === 'watch') items = byId(favs).map(asset)
  else if (mode === 'recent') items = byId(recent).map(asset)
  else {
    const top = markets.slice(0, 10)
    top.forEach((m, i) => {
      items.push(asset(m))
      const o = preds[Math.floor(i / 2)]
      if (i % 2 === 1 && o) items.push(
        <a key={o.id} className="ts-item ts-item--pred" href={marketHref(o)} title={o.title}>
          <span className="ts-thumb">{o.image ? <img src={o.image} alt="" /> : null}</span>
          <span className="ts-item__q">{o.title}</span>
        </a>,
      )
    })
  }
  const empty = mode === 'watch' ? 'Star markets to pin them here.' : mode === 'recent' ? 'Markets you open show up here.' : t.status === 'error' ? 'Markets couldn’t load.' : ''

  return (
    <div className="ts" role="region" aria-label="Market ticker">
      <div className="ts-modes" role="radiogroup" aria-label="Ticker shows">
        <button role="radio" aria-checked={mode === 'watch'} onClick={() => setMode('watch')} aria-label="Watchlist" title="Watchlist" className="ts-mode--star"><Star width={16} height={16} /></button>
        <button role="radio" aria-checked={mode === 'mix'} onClick={() => setMode('mix')} aria-label="Top markets and predictions" title="Top markets & predictions"><IcoNews s={16} /></button>
        <button role="radio" aria-checked={mode === 'recent'} onClick={() => setMode('recent')} aria-label="Recently viewed" title="Recently viewed"><IcoClock s={16} /></button>
      </div>
      <span className="ts-sep" aria-hidden />
      <div className="ts-track">{items.length ? items : <span className="ts-empty">{empty}</span>}</div>
      <span className="ts-fade" aria-hidden />
    </div>
  )
}
