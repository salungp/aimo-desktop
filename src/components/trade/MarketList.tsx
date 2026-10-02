import { forwardRef, memo, useMemo, useState } from 'react'
import { useFavs } from '../../data/favs'
import { displayName } from '../../data/names'
import { chg, compactN, marketList, pxDecimals, fmt, useTrade, type Market } from '../../data/trade'
import { CaretDown, CaretUp, Lightning, Star } from '../../icons'
import { href } from '../../router'
import { Coin } from '../primitives'
import { IcoCaretDoubleLeft, IcoSearch } from './icons'

/* Left sidebar (Figma 788:24748): All / Watchlist / Holding · search · All / Perps / Tokens · market rows. */

const USDC = () => (
  <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden className="mkt-quote">
    <circle cx="16" cy="16" r="16" fill="#2775CA" />
    <path fill="#fff" d="M20.2 18.4c0-2.2-1.3-3-4-3.3-1.9-.3-2.3-.8-2.3-1.7s.7-1.4 1.9-1.4c1.1 0 1.8.4 2.1 1.3.1.2.2.3.4.3h1c.2 0 .4-.2.4-.4-.3-1.3-1.3-2.3-2.7-2.5V9.3c0-.2-.2-.4-.5-.4h-.9c-.2 0-.4.2-.4.5v1.4c-1.9.3-3.1 1.5-3.1 3.1 0 2.1 1.3 2.9 4 3.2 1.8.3 2.3.7 2.3 1.7s-.9 1.7-2.1 1.7c-1.7 0-2.2-.7-2.4-1.6-.1-.2-.2-.3-.4-.3h-1c-.2 0-.4.2-.4.4.3 1.4 1.1 2.4 3 2.7v1.4c0 .2.2.4.5.4h.9c.2 0 .4-.2.4-.5v-1.4c1.9-.3 3.2-1.6 3.2-3.3Z" />
    <path fill="#fff" d="M12.9 24.6A8.7 8.7 0 0 1 7.6 13.4a8.6 8.6 0 0 1 5.3-5.2c.2-.1.3-.3.3-.6v-.8c0-.2-.1-.4-.3-.4h-.2a10 10 0 0 0 0 19.1c.2.1.4 0 .5-.2v-.9c0-.2-.1-.4-.3-.4Zm6.4-17.9c-.2-.1-.4 0-.5.2v.8c0 .3.1.4.3.6a8.7 8.7 0 0 1 5.3 11.2 8.6 8.6 0 0 1-5.3 5.2c-.2.1-.3.3-.3.6v.8c0 .2.1.4.3.4h.2a10 10 0 0 0 0-19.1Z" />
  </svg>
)

type Scope = 'all' | 'watch' | 'hold'
type Kind = 'all' | 'perp' | 'spot'

export const MarketRow = memo(function MarketRow({ m, active, fav, tick }: { m: Market; active: boolean; fav: boolean; tick: number }) {
  void tick
  const c = chg(m), up = c >= 0
  return (
    <a className="mkt-row" href={href.trade(m.id)} aria-current={active ? 'page' : undefined}>
      <span className="mkt-logo"><Coin coin={m.logo} size={32} /><USDC /></span>
      <span className="mkt-row__txt">
        <span className="mkt-row__name">{m.base}{fav && <Star className="mkt-row__fav" width={12} height={12} />}</span>
        <span className="mkt-row__tags">
          {m.kind === 'perp'
            ? <><span className="tag tag--perp">Perps</span><span className="tag tag--lev"><Lightning width={10} height={10} />{m.maxLev}x</span></>
            : <><span className="tag tag--new">Tokens</span><span className="mkt-row__vol">Vol {compactN(m.vol24)}</span></>}
        </span>
      </span>
      <span className="mkt-row__val">
        <span className="num">${fmt(m.price, pxDecimals(m, m.price))}</span>
        <span className={`badge-chg num t-10m ${up ? 'up' : 'down'}`}>{up ? <CaretUp /> : <CaretDown />}{(up ? '+' : '') + (c * 100).toFixed(2)}%</span>
      </span>
    </a>
  )
})

type Props = { selected: string; collapsed?: boolean; onCollapse?: () => void; onPicked?: () => void; autoFocus?: boolean }
export const MarketList = forwardRef<HTMLInputElement, Props>(function MarketList({ selected, collapsed, onCollapse, onPicked, autoFocus }, searchRef) {
  const s = useTrade()
  const favs = useFavs()
  const [scope, setScope] = useState<Scope>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [q, setQ] = useState('')
  const all = useMemo(() => marketList(s), [s.markets])
  const needle = q.trim().toLowerCase()
  const list = all.filter((m) =>
    (kind === 'all' || m.kind === kind) &&
    (scope !== 'watch' || favs.includes(m.id)) &&
    (!needle || m.base.toLowerCase().includes(needle) || displayName(m.base).toLowerCase().includes(needle)),
  )

  if (collapsed) {
    return (
      <nav className="mkt mkt--rail" aria-label="Markets">
        <button className="mkt-collapse" onClick={onCollapse} aria-label="Expand market list" style={{ rotate: '180deg' }}><IcoCaretDoubleLeft s={12} /></button>
        <div className="mkt-rail">
          {all.filter((m) => favs.includes(m.id)).concat(all.filter((m) => !favs.includes(m.id))).slice(0, 30).map((m) => (
            <a key={m.id} href={href.trade(m.id)} className="mkt-rail__item" aria-current={m.id === selected ? 'page' : undefined} title={`${m.base} ${m.kind === 'perp' ? 'Perp' : 'Spot'}`}>
              <Coin coin={m.logo} size={28} />
            </a>
          ))}
        </div>
      </nav>
    )
  }

  return (
    <nav className="mkt" aria-label="Markets">
      <div className="mkt-scope">
        <div role="tablist" aria-label="Show" className="mkt-scope__tabs">
          {([['all', 'All'], ['watch', 'Watchlist'], ['hold', 'Holding']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)}>{l}</button>
          ))}
        </div>
        {onCollapse && <button className="mkt-collapse" onClick={onCollapse} aria-label="Collapse market list"><IcoCaretDoubleLeft s={12} /></button>}
      </div>
      <div className="mkt-filters">
        <label className="mkt-search">
          <IcoSearch s={16} />
          <input ref={searchRef} type="search" placeholder="Search tokens..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus}
            onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { location.hash = href.trade(list[0].id); onPicked?.() } if (e.key === 'Escape') setQ('') }} />
          <kbd className="mkt-search__k" aria-hidden>/</kbd>
        </label>
        <div className="seg" role="radiogroup" aria-label="Market type">
          {([['all', 'All'], ['perp', 'Perps'], ['spot', 'Tokens']] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mkt-head t-10r"><span>TOKEN / VOL</span><span>PRICE / 24H CHG</span></div>
      <div className="mkt-list" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onPicked?.() }}>
        {scope === 'hold' ? (
          <p className="mkt-empty">Holdings show up here once a wallet with balances is connected.</p>
        ) : s.status === 'loading' ? (
          Array.from({ length: 8 }, (_, i) => <div key={i} className="mkt-row mkt-row--sk"><span className="sk" style={{ width: 32, height: 32, borderRadius: 16 }} /><span className="sk" style={{ flex: 1, height: 14 }} /></div>)
        ) : list.length ? (
          list.map((m) => <MarketRow key={m.id} m={m} active={m.id === selected} fav={favs.includes(m.id)} tick={s.tick} />)
        ) : (
          <p className="mkt-empty">{scope === 'watch' && !needle ? 'Star a market to add it to your watchlist.' : `No markets match “${q}”.`}</p>
        )}
      </div>
    </nav>
  )
})
