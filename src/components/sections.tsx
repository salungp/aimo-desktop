import { useEffect, useState, type ReactNode } from 'react'
import { href, marketHref, useRoute } from '../router'
import { OutcomeCard } from './OutcomeCard'
import { Bell, Bolt, CaretRight, ChartBar, Fire, Lightning, Logo, Plus, Rocket, Search, Star, UserCircle } from '../icons'
import {
  biggestMoves, categorySlug, change, ensureSparks, moversPerps, newListings, pick, topVolumeAlt, trendingTokens,
  type Asset, type Outcome, type Source, useMarket,
} from '../data/market'
import { displayName, displaySym } from '../data/names'
import { ChangeBadge, Coin, CoinCombo, PriceText, Sparkline, toast, useClearLogo } from './primitives'

const hl = (a: Asset) => `https://app.hyperliquid.xyz/trade/${a.coin}`
const open = (url: string) => window.open(url, '_blank', 'noopener')

/* ───────────── Navbar ───────────── */
const TABS = [
  { label: 'Discover', to: href.discover },
  { label: 'Portfolio' },
  { label: 'Trade' },
  { label: 'Outcome', to: href.outcome() },
]
export function Navbar() {
  const r = useRoute()
  const active = r.page === 'discover' ? 'Discover' : 'Outcome'
  return (
    <header className="navbar">
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

/* ───────────── Highlight cards ───────────── */
function HLCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="hl-card">
      <span className="glow" />
      <div className="hl-card__head">
        <span className="hl-icon">{icon}</span>
        <h3 className="t-16m" style={{ margin: 0 }}>{title}</h3>
      </div>
      <div>{children}</div>
    </article>
  )
}
function AssetRow({ a }: { a: Asset }) {
  return (
    <a className="hl-row" href={hl(a)} target="_blank" rel="noopener">
      <span className="hl-row__name">
        <Coin coin={a.coin} size={24} />
        <span className="t-14m"><span className="q">{displayName(a.coin)}</span><span className="muted">/</span><span className="muted">{displaySym(a.coin)}</span></span>
      </span>
      <span className="hl-row__val">
        <PriceText value={a.price} className="t-14m" />
        <ChangeBadge value={change(a)} />
      </span>
    </a>
  )
}
function OutcomeRowMini({ o }: { o: Outcome }) {
  const [thumb, clear] = useClearLogo<HTMLSpanElement>()
  return (
    <div className="hl-row">
      <span className="hl-row__name">
        <span ref={thumb} className={`coin mini-thumb${clear ? ' is-clear' : ''}`} style={{ width: 24, height: 24 }}>{o.image ? <img src={o.image} alt="" /> : null}</span>
        <span className="t-14m" style={{ minWidth: 0 }}><span className="q" title={o.title}>{o.title}</span></span>
      </span>
      <a className="chip-btn t-12m" href={marketHref(o)}>See details</a>
    </div>
  )
}
const Skel = () => <div className="hl-row"><span className="sk" style={{ width: 140, height: 16 }} /><span className="sk" style={{ width: 90, height: 16 }} /></div>
const rows = (list: Asset[]) => (list.length ? list.map((a) => <AssetRow key={a.coin} a={a} />) : [0, 1, 2].map((i) => <Skel key={i} />))

export function Highlights() {
  const s = useMarket()
  const crypto = s.outcomes.filter((o) => /crypto|bitcoin|ethereum|solana/i.test(o.category + o.title))
  const polls = (crypto.length >= 2 ? crypto : s.outcomes).slice(0, 2)
  const alt = topVolumeAlt(s)
  return (
    <section className="grid4" aria-label="Market highlights">
      <HLCard icon={<ChartBar />} title="Market Highlights">{rows(pick(s, ['BTC', 'ETH', 'SOL']))}</HLCard>
      <HLCard icon={<Rocket />} title="New listings on Aimo">{rows(newListings(s))}</HLCard>
      <HLCard icon={<Fire />} title="Trending Now">
        {polls[0] ? <OutcomeRowMini o={polls[0]} /> : <Skel />}
        {alt ? <AssetRow a={alt} /> : <Skel />}
        {polls[1] ? <OutcomeRowMini o={polls[1]} /> : <Skel />}
      </HLCard>
      <HLCard icon={<Bolt />} title="Biggest Move">{rows(biggestMoves(s))}</HLCard>
    </section>
  )
}

/* ───────────── Token tables ───────────── */
const FAV_KEY = 'aimo:favs'
const readFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]') } catch { return [] } }
function useFavs() {
  const [f, setF] = useState<string[]>(readFavs)
  const toggle = (c: string) => setF((x) => {
    const n = x.includes(c) ? x.filter((y) => y !== c) : [...x, c]
    try { localStorage.setItem(FAV_KEY, JSON.stringify(n)) } catch {}
    toast(n.includes(c) ? `${displaySym(c)} added to watchlist` : `${displaySym(c)} removed from watchlist`)
    return n
  })
  return [f, toggle] as const
}

function TokenTable({ title, list, perps, favs, onFav }: { title: string; list: Asset[]; perps?: boolean; favs: string[]; onFav: (c: string) => void }) {
  useEffect(() => { ensureSparks(list.map((a) => a.coin)) }, [list.map((a) => a.coin).join()])
  return (
    <section className="tbl-wrap" aria-labelledby={`h-${title}`}>
      <div className="sec-head">
        <h2 id={`h-${title}`} className="t-20m">{title}</h2>
        <a className="see-more t-12m" href={perps ? 'https://app.hyperliquid.xyz/trade' : 'https://app.hyperliquid.xyz/trade'} target="_blank" rel="noopener">See more <CaretRight /></a>
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
                  <span className="tok__title t-16m">
                    <span>{perps ? displaySym(a.coin) : displayName(a.coin)}</span>
                    {perps && <span className="lev t-10m"><Lightning />{a.maxLev}x</span>}
                  </span>
                  <span className="t-12m muted">{perps ? displayName(a.coin) : displaySym(a.coin)}</span>
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
  const [favs, onFav] = useFavs()
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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="h-out">
      <div className="sec-head">
        <h2 id="h-out" className="t-20m">Trending outcome</h2>
        <a className="see-more t-12m" href={href.outcome()}>See more <CaretRight /></a>
      </div>
      <div className="out-grid">
        {s.outcomes.length
          ? s.outcomes.slice(0, 8).map((o) => <OutcomeCard key={o.id} o={o} tick={s.tick} />)
          : Array.from({ length: 8 }, (_, i) => <div key={i} className="out-card"><div className="out-card__head"><span className="sk" style={{ width: 40, height: 40, borderRadius: 10 }} /><span className="sk" style={{ flex: 1, height: 16 }} /></div></div>)}
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
