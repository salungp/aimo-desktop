import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { fmt, pxDecimals, useTrade, type Market } from '../../data/trade'
import { Coin, toast } from '../primitives'
import { IcoCaretDown, IcoQuestion } from './icons'

/* Order ticket (Figma 788:25849). No wallet is connected in this prototype, so funds are $0 and
   submitting explains what's missing — but every number on the ticket is computed live from the market. */

type Side = 'buy' | 'sell'
type Type = 'market' | 'limit' | 'stop-market' | 'stop-limit'
const FEES = { perp: { taker: 0.00045, maker: 0.00015 }, spot: { taker: 0.0007, maker: 0.0004 } }
const MAX_SLIP = 0.02
const AVAILABLE = 0 // USDC — no wallet connected

const Check = ({ on, set, children, tip, disabled }: { on: boolean; set: (v: boolean) => void; children: ReactNode; tip: string; disabled?: boolean }) => (
  <label className={`tk-check${disabled ? ' is-off' : ''}`} title={disabled ? tip : undefined}>
    <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => set(e.target.checked)} />
    <span className="tk-check__box" aria-hidden />
    <span>{children}</span>
    <span className="tk-tip" tabIndex={0} aria-label={tip} data-tip={tip}><IcoQuestion s={12} /></span>
  </label>
)

function PriceField({ label, value, onChange, d, onMid }: { label: string; value: string; onChange: (v: string) => void; d: number; onMid?: () => void }) {
  return (
    <label className="tk-px">
      <span>{label}</span>
      <input inputMode="decimal" placeholder={(0).toFixed(d)} value={value} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)} />
      {onMid && <button type="button" className="tk-px__mid" onClick={onMid}>Mid</button>}
    </label>
  )
}

type Props = { m: Market; preset: { px: number; n: number } | null }
export const Ticket = forwardRef<HTMLInputElement, Props>(function Ticket({ m, preset }, amountRef) {
  const s = useTrade()
  const [side, setSide] = useState<Side>('buy')
  const [type, setType] = useState<Type>('market')
  const [amt, setAmt] = useState('')
  const [px, setPx] = useState('')
  const [trigger, setTrigger] = useState('')
  const [lev, setLev] = useState(Math.min(10, m.maxLev))
  const [reduce, setReduce] = useState(false)
  const [tpsl, setTpsl] = useState(false)
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [pro, setPro] = useState(false)
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(0)
  const proRef = useRef<HTMLDivElement>(null)
  const perp = m.kind === 'perp'
  const d = pxDecimals(m, m.price)

  // Reset per market; keep side/type.
  useEffect(() => { setAmt(''); setPx(''); setTrigger(''); setTp(''); setSl(''); setErr(''); setLev(Math.min(10, m.maxLev)); if (!perp) setReduce(false) }, [m.id])
  // Book / tape click → limit price
  useEffect(() => {
    if (!preset) return
    setPx(preset.px.toFixed(d))
    setType((t) => (t === 'market' ? 'limit' : t === 'stop-market' ? 'stop-limit' : t))
  }, [preset?.n])
  useEffect(() => {
    if (!pro) return
    const off = (e: PointerEvent) => { if (!proRef.current?.contains(e.target as Node)) setPro(false) }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [pro])

  const book = s.book?.coin === m.coin ? s.book : null
  const bestAsk = book?.asks[0]?.px, bestBid = book?.bids[0]?.px
  const mid = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : m.price
  const size = Number(amt) || 0
  const limitPx = Number(px) || 0
  const usesLimit = type === 'limit' || type === 'stop-limit'

  // Walk the book for a market fill
  let fill = side === 'buy' ? bestAsk ?? m.price : bestBid ?? m.price
  let depthOk = true
  if (!usesLimit && size > 0 && book) {
    let left = size, cost = 0
    for (const l of side === 'buy' ? book.asks : book.bids) { const q = Math.min(left, l.sz); cost += q * l.px; left -= q; if (left <= 0) break }
    depthOk = left <= 1e-12
    if (size - left > 0) fill = cost / (size - left)
  }
  const execPx = usesLimit ? limitPx || mid : type === 'stop-market' ? Number(trigger) || mid : fill
  const value = size * execPx
  const L = perp ? lev : 1
  const margin = value / L
  const slip = !usesLimit && size > 0 ? Math.abs(fill - mid) / mid : 0
  const fee = (perp ? FEES.perp : FEES.spot)[usesLimit ? 'maker' : 'taker']
  const mmr = 1 / (2 * m.maxLev)
  const liq = perp && size > 0 ? (side === 'buy' ? (execPx * (1 - 1 / L)) / (1 - mmr) : (execPx * (1 + 1 / L)) / (1 + mmr)) : 0
  const liqText = !perp ? 'n/a for spot' : size <= 0 ? '—' : side === 'buy' && liq <= 0 ? 'None at 1x' : `$${fmt(liq, d)}`
  const typeLabel = { market: 'Market', limit: 'Limit', 'stop-market': 'Stop Market', 'stop-limit': 'Stop Limit' }[type]
  const levs = [1, 3, 5, 10, 50].filter((x) => x <= m.maxLev)
  const pnl = (exit: number) => { const v = (exit - execPx) * size * (side === 'buy' ? 1 : -1); return `${v >= 0 ? '+' : '−'}$${fmt(Math.abs(v), 2)}` }

  const submit = () => {
    const fail = (msg: string) => { setErr(msg); setShake((x) => x + 1); (amountRef as React.RefObject<HTMLInputElement>)?.current?.focus() }
    if (size <= 0) return fail(`Enter an amount in ${m.base}`)
    if (usesLimit && limitPx <= 0) return fail('Enter a limit price')
    if (type.startsWith('stop') && !(Number(trigger) > 0)) return fail('Enter a trigger price')
    if (!usesLimit && !depthOk) return fail('Not enough liquidity on the book for this size')
    if (margin > AVAILABLE) {
      setErr('')
      toast(`Deposit at least $${fmt(margin + value * fee, 2)} USDC to place this order`)
      return
    }
  }

  return (
    <section className="tk" aria-label="Order ticket">
      <div className="tk-id">
        <Coin coin={m.logo} size={32} />
        <div className="tk-id__txt">
          <span><em>Order ticket:</em> {m.base}{perp ? '-PERP' : '/USDC'}</span>
          <span><em>{perp ? 'Mark:' : 'Price:'}</em> <b className="num">${fmt(m.price, d)}</b></span>
        </div>
      </div>

      <div className="tk-body">
        <div className="seg seg--lg" role="radiogroup" aria-label="Side">
          <button role="radio" aria-checked={side === 'buy'} onClick={() => setSide('buy')}>{perp ? 'Buy / Long' : 'Buy'}</button>
          <button role="radio" aria-checked={side === 'sell'} className="is-sell" onClick={() => setSide('sell')}>{perp ? 'Sell / Short' : 'Sell'}</button>
        </div>
        <div className="seg seg--lg" role="radiogroup" aria-label="Order type">
          <button role="radio" aria-checked={type === 'market'} onClick={() => setType('market')}>Market</button>
          <button role="radio" aria-checked={type === 'limit'} onClick={() => setType('limit')}>Limit</button>
          <div className="tk-pro" ref={proRef}>
            <button role="radio" aria-checked={type.startsWith('stop')} aria-haspopup="menu" aria-expanded={pro} onClick={() => setPro(!pro)}>
              {type.startsWith('stop') ? typeLabel : 'Pro'}<IcoCaretDown s={14} />
            </button>
            {pro && (
              <div className="tmenu__pop tmenu__pop--end" role="menu">
                {(['stop-market', 'stop-limit'] as const).map((t) => (
                  <button key={t} role="menuitemradio" aria-checked={type === t} onClick={() => { setType(t); setPro(false) }}>{t === 'stop-market' ? 'Stop Market' : 'Stop Limit'}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tk-form">
        {type.startsWith('stop') && <PriceField label="Trigger price" value={trigger} onChange={setTrigger} d={d} onMid={() => setTrigger(mid.toFixed(d))} />}
        {usesLimit && <PriceField label="Limit price" value={px} onChange={setPx} d={d} onMid={() => setPx(mid.toFixed(d))} />}
        <div className={`tk-amt${err ? ' is-err' : ''}`} key={shake} data-shake={shake ? '' : undefined}>
          <label className="tk-amt__in">
            <span>Enter amount</span>
            <input ref={amountRef} inputMode="decimal" aria-label={`Amount in ${m.base}`} placeholder={(0).toFixed(Math.min(5, m.szDecimals || 2))}
              value={amt} onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) { setAmt(e.target.value); setErr('') } }}
              onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </label>
          {perp && (
            <div className="tk-lev" role="radiogroup" aria-label="Leverage">
              {levs.map((x) => <button key={x} role="radio" aria-checked={lev === x} onClick={() => setLev(x)}>{x}x</button>)}
              <button role="radio" aria-checked={lev === m.maxLev && !levs.includes(m.maxLev)} className="tk-lev__max" onClick={() => setLev(m.maxLev)} title={`Maximum leverage for ${m.base}: ${m.maxLev}x`}>Max</button>
            </div>
          )}
        </div>
        {err && <p className="tk-err" role="alert">{err}</p>}
        <div className="tk-row"><span>Available funds</span><b className="num">${fmt(AVAILABLE, 2)}</b></div>
        <div className="tk-row"><span>Current position</span><b className="num">0 {m.base}</b></div>
        <div className="tk-slider" title="Size by % of available funds — deposit to enable">
          <input type="range" min={0} max={100} step={25} value={0} disabled aria-label="Order size as % of available funds" readOnly />
          <span className="tk-slider__dots" aria-hidden>{[0, 25, 50, 75, 100].map((p) => <i key={p} style={{ left: `${p}%` }} />)}</span>
          <span className="tk-slider__pct num">0%</span>
        </div>
        <div className="tk-checks">
          <Check on={reduce} set={setReduce} disabled={!perp} tip={perp ? 'Only reduces an open position; never opens or flips one' : 'Spot orders can’t be reduce-only'}>Reduce Only</Check>
          <Check on={tpsl} set={setTpsl} tip="Attach take-profit and stop-loss triggers to this order">TP/SL</Check>
        </div>
        {tpsl && (
          <div className="tk-tpsl">
            <PriceField label="Take profit" value={tp} onChange={setTp} d={d} />
            <PriceField label="Stop loss" value={sl} onChange={setSl} d={d} />
            {size > 0 && (Number(tp) > 0 || Number(sl) > 0) && (
              <p className="tk-hint num">
                {Number(tp) > 0 && <>TP {pnl(Number(tp))}</>}
                {Number(tp) > 0 && Number(sl) > 0 && ' · '}
                {Number(sl) > 0 && <>SL {pnl(Number(sl))}</>}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="tk-foot">
        <dl className="tk-sum">
          <div><dt>Est. liquidation</dt><dd className="num">{liqText}</dd></div>
          <div><dt>Order value</dt><dd className="num">${fmt(value, 2)}</dd></div>
          <div><dt>Margin required</dt><dd className="num">${fmt(margin, 2)}</dd></div>
          <div><dt>Slippage</dt><dd className="num">{usesLimit ? 'None (limit)' : size > 0 ? (depthOk ? `Est ${(slip * 100).toFixed(3)}% · Max ${MAX_SLIP * 100}%` : 'Exceeds book') : `Max ${MAX_SLIP * 100}%`}</dd></div>
          <div><dt>Fees</dt><dd className="num">${fmt(value * fee, 2)} · {(fee * 100).toFixed(3).replace(/0$/, '')}%</dd></div>
        </dl>
        <button className={`tk-cta ${side === 'sell' ? 'is-sell' : ''}`} onClick={submit}>
          {side === 'buy' ? 'Buy' : 'Sell'} {m.base}
        </button>
        {margin > AVAILABLE && size > 0 && <button className="tk-deposit" onClick={() => toast('Deposit flow — coming in the next prototype')}>Deposit USDC to trade</button>}
      </div>
    </section>
  )
})
