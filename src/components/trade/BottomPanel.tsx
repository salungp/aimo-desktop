import { useEffect, useState } from 'react'
import { info, type Market } from '../../data/trade'
import { IcoSignal } from './icons'

/* Positions panel (Figma 788:25826). Account tabs need a wallet; Funding shows the market's real funding history. */

const TABS = ['Account', 'Positions', 'Open Orders', 'Trade history', 'Funding'] as const
type Tab = (typeof TABS)[number]
const EMPTY: Record<Exclude<Tab, 'Funding'>, string> = {
  Account: 'Connect a wallet to see balances and margin.',
  Positions: 'No open positions yet.',
  'Open Orders': 'No open orders.',
  'Trade history': 'No trades yet.',
}
type F = { time: number; fundingRate: string; premium: string }

function Funding({ m }: { m: Market }) {
  const [rows, setRows] = useState<F[] | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (m.kind !== 'perp') return
    let on = true
    setRows(null); setErr(false)
    info<F[]>({ type: 'fundingHistory', coin: m.coin, startTime: Date.now() - 24 * 36e5 })
      .then((r) => on && setRows(r.slice().reverse()))
      .catch(() => on && setErr(true))
    return () => { on = false }
  }, [m.coin])
  if (m.kind !== 'perp') return <Empty text="Spot markets don’t pay funding." />
  if (err) return <Empty text="Couldn’t load funding history. It refreshes when you reopen this tab." />
  if (!rows) return <div className="bp-table"><div className="sk" style={{ height: 14, margin: 16 }} /></div>
  const avg = rows.reduce((s, r) => s + Number(r.fundingRate), 0) / Math.max(1, rows.length)
  return (
    <div className="bp-table" role="table" aria-label={`${m.base} funding, last 24 hours`}>
      <div className="bp-tr bp-th" role="row"><span>Time (UTC)</span><span>Rate / 1h</span><span>APR</span><span>Premium</span></div>
      {rows.map((r) => {
        const f = Number(r.fundingRate)
        return (
          <div className="bp-tr" role="row" key={r.time}>
            <span className="num">{new Date(r.time).toISOString().slice(5, 16).replace('T', ' ')}</span>
            <span className={`num ${f >= 0 ? 'up' : 'down'}`}>{(f * 100).toFixed(4)}%</span>
            <span className="num">{(f * 24 * 365 * 100).toFixed(2)}%</span>
            <span className="num">{(Number(r.premium) * 100).toFixed(4)}%</span>
          </div>
        )
      })}
      <div className="bp-note">24h average {(avg * 100).toFixed(4)}% / h · longs pay shorts when positive</div>
    </div>
  )
}

const Empty = ({ text, cta, onCta }: { text: string; cta?: string; onCta?: () => void }) => (
  <div className="bp-empty">
    <span className="bp-empty__ico"><IcoSignal s={16} /></span>
    <p>{text}</p>
    {cta && <button className="bp-cta" onClick={onCta}>{cta}</button>}
  </div>
)

export function BottomPanel({ m, onOpen }: { m: Market; onOpen: () => void }) {
  const [tab, setTab] = useState<Tab>('Positions')
  return (
    <section className="bp" aria-label="Account activity">
      <div className="bp-tabs" role="tablist">
        {TABS.map((t, i) => (
          <span key={t} className="bp-tabs__item">
            {i > 0 && <i aria-hidden />}
            <button role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
          </span>
        ))}
      </div>
      <div className="bp-body" role="tabpanel" aria-label={tab}>
        {tab === 'Funding' ? <Funding m={m} /> : <Empty text={EMPTY[tab]} cta={tab === 'Positions' || tab === 'Open Orders' ? 'Open Positions' : undefined} onCta={onOpen} />}
      </div>
    </section>
  )
}
