import { useEffect, useRef, useState } from 'react'
import { pushRecent } from '../data/favs'
import { startTrade, useTrade } from '../data/trade'
import { replace, href } from '../router'
import { BottomPanel } from '../components/trade/BottomPanel'
import { ChartPanel, MarketHeader } from '../components/trade/ChartPanel'
import { IcoCaretDown } from '../components/trade/icons'
import { MarketList } from '../components/trade/MarketList'
import { OrderBook } from '../components/trade/OrderBook'
import { Ticket } from '../components/trade/Ticket'
import { TopStrip } from '../components/trade/TopStrip'

/* Trade (Figma 788:24659): markets · chart + order book · positions · order ticket. Live Hyperliquid data. */

const store = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch {} return null }

function Picker({ label, selected }: { label: string; selected: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="picker" ref={ref}>
      <button className="picker__btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <span>{label}</span>
        <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="16" fill="#2775CA" /><path fill="#fff" d="M20.2 18.4c0-2.2-1.3-3-4-3.3-1.9-.3-2.3-.8-2.3-1.7s.7-1.4 1.9-1.4c1.1 0 1.8.4 2.1 1.3.1.2.2.3.4.3h1c.2 0 .4-.2.4-.4-.3-1.3-1.3-2.3-2.7-2.5V9.3c0-.2-.2-.4-.5-.4h-.9c-.2 0-.4.2-.4.5v1.4c-1.9.3-3.1 1.5-3.1 3.1 0 2.1 1.3 2.9 4 3.2 1.8.3 2.3.7 2.3 1.7s-.9 1.7-2.1 1.7c-1.7 0-2.2-.7-2.4-1.6-.1-.2-.2-.3-.4-.3h-1c-.2 0-.4.2-.4.4.3 1.4 1.1 2.4 3 2.7v1.4c0 .2.2.4.5.4h.9c.2 0 .4-.2.4-.5v-1.4c1.9-.3 3.2-1.6 3.2-3.3Z" /></svg>
        <IcoCaretDown s={16} className="picker__caret" />
      </button>
      {open && (
        <div className="picker__pop" role="dialog" aria-label="Choose a market">
          <MarketList selected={selected} autoFocus onPicked={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

export function TradePage({ market }: { market: string }) {
  const s = useTrade()
  useEffect(() => { startTrade() }, [])
  const m = s.markets[market]
  // Unknown market (typo, delisted) → BTC, keeping history clean.
  useEffect(() => { if (s.status === 'ready' && !m) replace(href.trade('BTC')) }, [s.status, m, market])
  useEffect(() => { if (m) { pushRecent(m.id); document.title = `${m.base} ${m.kind === 'perp' ? 'Perp' : 'Spot'} · $${m.price.toLocaleString('en-US', { maximumSignificantDigits: 6 })} — Aimo` } }, [m?.id, Math.round((m?.price ?? 0) * 100)])

  const [collapsed, setCollapsed] = useState(() => store('aimo:mkt-collapsed') === '1' || (store('aimo:mkt-collapsed') == null && innerWidth < 1280))
  const [panel, setPanel] = useState(() => store('aimo:panel') !== '0')
  const [preset, setPreset] = useState<{ px: number; n: number } | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const amount = useRef<HTMLInputElement>(null)
  const collapse = (v: boolean) => { setCollapsed(v); store('aimo:mkt-collapsed', v ? '1' : '0') }
  const togglePanel = () => setPanel((p) => { store('aimo:panel', p ? '0' : '1'); return !p })
  const focusSearch = () => {
    if (collapsed) collapse(false)
    requestAnimationFrame(() => (search.current ?? document.querySelector<HTMLInputElement>('.mkt-search input'))?.focus())
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,[contenteditable]')) { e.preventDefault(); focusSearch() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [collapsed])

  if (!m) {
    return (
      <main className="trade trade--loading" aria-busy={s.status === 'loading'}>
        <TopStrip />
        {s.status === 'error'
          ? <div className="trade__err"><p>Hyperliquid markets couldn’t load. Check your connection — the page retries every 15 seconds.</p></div>
          : <div className="trade__sk"><span className="sk" /><span className="sk" /><span className="sk" /></div>}
      </main>
    )
  }

  return (
    <main className={`trade${collapsed ? ' is-collapsed' : ''}${panel ? '' : ' no-panel'}`}>
      <TopStrip />
      <aside className="trade__left">
        <MarketList ref={search} selected={m.id} collapsed={collapsed} onCollapse={() => collapse(!collapsed)} />
      </aside>
      <div className="trade__center">
        <div className="trade__top">
          <div className="trade__chartcol">
            <MarketHeader m={m} picker={<Picker label={m.base} selected={m.id} />} />
            <ChartPanel m={m} onSearch={focusSearch} panelOpen={panel} onTogglePanel={togglePanel} />
          </div>
          <OrderBook m={m} onPrice={(px) => { setPreset((p) => ({ px, n: (p?.n ?? 0) + 1 })); amount.current?.focus() }} />
        </div>
        {panel && <BottomPanel m={m} onOpen={() => amount.current?.focus()} />}
      </div>
      <aside className="trade__right">
        <Ticket ref={amount} m={m} preset={preset} />
      </aside>
    </main>
  )
}
