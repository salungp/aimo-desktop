import { useEffect } from 'react'
import { toggleFav, useFavs } from '../data/favs'
import { href, useRoute } from '../router'
import { OutcomeCard } from './OutcomeCard'
import { MorePill } from './Discover'
import { Bell, Lightning, Logo, Plus, Search, Star, UserCircle } from '../icons'
import { change, ensureSparks, moversPerps, pick, trendingTokens, type Asset, type Source, useMarket } from '../data/market'
import { displayName, displaySym } from '../data/names'
import { ChangeBadge, Coin, CoinCombo, PriceText, Sparkline, toast } from './primitives'

const hl = (a: Asset) => `https://app.hyperliquid.xyz/trade/${a.coin}`
const open = (url: string) => window.open(url, '_blank', 'noopener')

/* ───────────── Navbar ───────────── */
const TABS = [
  { label: 'Discover', to: href.discover },
  { label: 'Portfolio' },
  { label: 'Trade', to: href.trade() },
  { label: 'Outcome', to: href.outcome() },
]
export function Navbar() {
  const r = useRoute()
  const active = r.page === 'discover' ? 'Discover' : r.page === 'trade' ? 'Trade' : 'Outcome'
  return (
    <header className={`navbar${r.page === 'trade' ? ' navbar--app' : ''}`}>
      <div className="navbar__left">
        <a href={href.discover} aria-label="Aimo home" className="brand"><Logo /></a>
        <nav className="navbar__tabs" aria-label="Primary">
          {TABS.map((t) =>
            t.to ? (
              <a key={t.label} className="tab" href={t.to} aria-current={active === t.label ? 'page' : undefined}>{t.label}</a>
            ) : (
              <button key={t.label} className="tab" onClick={() => toast(`${t.label} is not part of this prototype yet`)}>{t.label}</button>
            ),
          )}
        </nav>
      </div>
      <div className="navbar__right">
        <button className="icon-btn" aria-label="Search" data-tip="Search  ⌘K"><Search /></button>
        <button className="btn-lime btn-deposit" onClick={() => toast('Deposit flow — coming in the next prototype')}>
          <Plus /><span className="lbl">Deposit</span>
        </button>
        <button className="icon-btn" aria-label="Notifications" data-tip="Notifications"><Bell /><span className="dot" /></button>
        <button className="icon-btn" aria-label="Account" data-tip="Account"><UserCircle /></button>
      </div>
    </header>
  )
}

/* ───────────── Token tables ───────────── */
function useWatch() {
  const f = useFavs()
  const toggle = (c: string) => toast(toggleFav(c) ? `${displaySym(c)} added to watchlist` : `${displaySym(c)} removed from watchlist`)
  return [f, toggle] as const
}

function TokenTable({ title, list, perps, favs, onFav }: { title: string; list: Asset[]; perps?: boolean; favs: string[]; onFav: (c: string) => void }) {
  useEffect(() => { ensureSparks(list.map((a) => a.coin)) }, [list.map((a) => a.coin).join()])
  return (
    <section className="tbl-wrap" aria-labelledby={`h-${title}`}>
      <div className="sec-head">
        <h2 id={`h-${title}`} className="t-20m">{title}</h2>
        <MorePill href="https://app.hyperliquid.xyz/trade" external />
      </div>
      <div className="tbl" role="table">
        <div className="tbl__head t-12m" role="row">
          <span />
          <span role="columnheader">TOKEN NAME</span>
          <span role="columnheader">24H TREND</span>
          <span role="columnheader">PRICE / 24H CHG</span>
        </div>
        {(list.length ? list : Array(5).fill(null)).map((a: Asset | null, i) =>
          a ? (
            <div className="tbl__row" role="row" key={a.coin} onClick={() => open(hl(a))}>
              <span>
                <button className="star" aria-label={`Watch ${displaySym(a.coin)}`} aria-pressed={favs.includes(a.coin)}
                  onClick={(e) => { e.stopPropagation(); onFav(a.coin) }}><Star /></button>
              </span>
              <span className="tok">
                <CoinCombo coin={a.coin} />
                <span className="tok__text" style={{ gap: perps ? 4 : 8 }}>
                  <span className="tok__title t-14m">
                    <span>{perps ? displaySym(a.coin) : displayName(a.coin)}</span>
                    {perps && <span className="lev t-10m"><Lightning />{a.maxLev}x</span>}
                  </span>
                  <span className="tok__sub t-12m muted">{perps ? displayName(a.coin) : displaySym(a.coin)}</span>
                </span>
              </span>
              <span className="cell-chart"><Sparkline data={a.spark} up={change(a) >= 0} /></span>
              <span className="cell-price">
                <PriceText value={a.price} style="table" className="t-14m" />
                <ChangeBadge value={change(a)} size={10} />
              </span>
            </div>
          ) : (
            <div className="tbl__row" key={i}><span /><span className="tok"><span className="sk" style={{ width: 40, height: 40, borderRadius: 20 }} /><span className="sk" style={{ width: 100, height: 16 }} /></span><span className="cell-chart"><span className="sk" style={{ width: 69, height: 27 }} /></span><span className="cell-price"><span className="sk" style={{ width: 60, height: 14 }} /></span></div>
          ),
        )}
      </div>
    </section>
  )
}

export function Tables() {
  const s = useMarket()
  const [favs, onFav] = useWatch()
  return (
    <div className="grid2">
      <TokenTable title="Trending token" list={trendingTokens(s)} favs={favs} onFav={onFav} />
      <TokenTable title="Movers perps" list={moversPerps(s)} perps favs={favs} onFav={onFav} />
    </div>
  )
}

/* ───────────── Outcome cards (Discover) ───────────── */
export function Outcomes() {
  const s = useMarket()
  return (
    <section className="outs" aria-labelledby="h-out">
      <div className="sec-head">
        <h2 id="h-out" className="t-20m">Trending outcome</h2>
        <MorePill href={href.outcome()} />
      </div>
      <div className="out-grid out-grid--discover">
        {s.outcomes.length
          ? s.outcomes.slice(0, 6).map((o) => <OutcomeCard key={o.id} o={o} tick={s.tick} />)
          : Array.from({ length: 6 }, (_, i) => <div key={i} className="out-card"><div className="out-card__head"><span className="sk" style={{ width: 40, height: 40, borderRadius: 10 }} /><span className="sk" style={{ flex: 1, height: 16 }} /></div></div>)}
      </div>
    </section>
  )
}

/* ───────────── Bottom ticker ───────────── */
const TICK = ['BTC', 'ETH', 'SOL', 'SEI', 'DOGE', 'BNB', 'XRP', 'HYPE', 'LINK', 'SUI', 'AVAX', 'kPEPE']
const label: Record<Source, string> = { connecting: 'Connecting', live: 'Live', snapshot: 'Offline snapshot', mock: 'Demo feed' }
export function Ticker() {
  const s = useMarket()
  const list = pick(s, TICK)
  const items = list.map((a) => (
    <span className="ticker__item" key={a.coin}>
      <Coin coin={a.coin} size={16} />
      <span className="k">{displaySym(a.coin)}:</span>
      <PriceText value={a.price} style="ticker" className="v" />
      <span className={`c num ${change(a) >= 0 ? 'up' : 'down'}`}>{(change(a) >= 0 ? '+' : '') + (change(a) * 100).toFixed(2)}%</span>
    </span>
  ))
  const src = s.hl === 'live' || s.pm === 'live' ? (s.hl === s.pm ? s.hl : 'live') : s.hl
  return (
    <footer className="ticker" aria-label="Live prices">
      <div className="ticker__track">{items}<span aria-hidden style={{ display: 'contents' }}>{items}</span></div>
      <span className="ticker__fade ticker__fade--l" />
      <span className="ticker__fade ticker__fade--r" />
      <span className="status t-12m" data-s={src} title={`Hyperliquid: ${label[s.hl]} · Polymarket: ${label[s.pm]}`}><i />{label[src]}</span>
    </footer>
  )
}
