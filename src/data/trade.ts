import { useSyncExternalStore } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   Trade page data (Hyperliquid public API, no wallet):
   · markets  — perps (metaAndAssetCtxs) + USDC spot pairs (spotMetaAndAssetCtxs), refreshed every 15 s,
                prices streamed from `allMids`
   · book     — `l2Book` stream for the selected market, with price grouping (nSigFigs)
   · trades   — `trades` stream for the selected market
   · candles  — `candleSnapshot` + `candle` stream (see useCandles in the chart)
   One socket; subscriptions follow the selected market.
   ───────────────────────────────────────────────────────────────────────────── */

const API = 'https://api.hyperliquid.xyz/info'
export const info = async <T,>(body: unknown): Promise<T> => {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`HL ${r.status}`)
  return r.json()
}

export type Market = {
  id: string            // route id: "BTC" for perps, "spot:HYPE" for spot
  coin: string          // Hyperliquid coin used by the API ("BTC", "@107", "PURR/USDC")
  kind: 'perp' | 'spot'
  base: string          // display ticker ("BTC", "HYPE")
  logo: string          // logo key for <Coin> ("BTC", "HYPE_spot")
  price: number
  prevDay: number
  vol24: number
  szDecimals: number
  maxLev: number        // 1 for spot
  funding?: number      // hourly rate
  oi?: number           // open interest, base units
  oracle?: number
  supply?: number       // spot circulating supply
  tokenId?: string      // spot token id (copyable)
}
export type Level = { px: number; sz: number; n: number }
export type Trade = { px: number; sz: number; side: 'B' | 'A'; time: number; tid: number }
type State = {
  markets: Record<string, Market>   // by id
  byCoin: Record<string, string>    // coin → id
  status: 'loading' | 'ready' | 'error'
  book: { coin: string; sig: number; bids: Level[]; asks: Level[]; t: number } | null
  trades: { coin: string; list: Trade[] } | null
  tick: number
}

let state: State = { markets: {}, byCoin: {}, status: 'loading', book: null, trades: null, tick: 0 }
const subs = new Set<() => void>()
let raf = 0
const emit = () => {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; state = { ...state, tick: state.tick + 1 }; subs.forEach((f) => f()) })
}
export const useTrade = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
export const getTrade = () => state

/* ───────────── markets ───────────── */
type PerpMeta = { universe: { name: string; szDecimals: number; maxLeverage: number; isDelisted?: boolean }[] }
type PerpCtx = { funding: string; openInterest: string; prevDayPx: string; dayNtlVlm: string; oraclePx: string; markPx: string; midPx: string | null }
type SpotMeta = { universe: { name: string; tokens: [number, number]; index: number }[]; tokens: { name: string; szDecimals: number; index: number; tokenId: string; fullName: string | null }[] }
type SpotCtx = { coin: string; prevDayPx: string; dayNtlVlm: string; markPx: string; midPx: string | null; circulatingSupply: string }

async function loadMarkets() {
  const [[pm, pc], [sm, sc]] = await Promise.all([
    info<[PerpMeta, PerpCtx[]]>({ type: 'metaAndAssetCtxs' }),
    info<[SpotMeta, SpotCtx[]]>({ type: 'spotMetaAndAssetCtxs' }),
  ])
  const next: Record<string, Market> = {}, byCoin: Record<string, string> = {}
  const keep = (id: string, m: Omit<Market, 'price'> & { price: number }) => {
    const prev = state.markets[id]
    next[id] = { ...m, price: prev && state.status === 'ready' ? prev.price : m.price }
    byCoin[m.coin] = id
  }
  pm.universe.forEach((u, i) => {
    const c = pc[i]
    if (!c || u.isDelisted) return
    const price = Number(c.midPx ?? c.markPx)
    if (!(price > 0)) return
    keep(u.name, {
      id: u.name, coin: u.name, kind: 'perp', base: u.name.replace(/^k(?=[A-Z])/, ''), logo: u.name, price,
      prevDay: Number(c.prevDayPx) || price, vol24: Number(c.dayNtlVlm) || 0, szDecimals: u.szDecimals, maxLev: u.maxLeverage,
      funding: Number(c.funding), oi: Number(c.openInterest), oracle: Number(c.oraclePx),
    })
  })
  const ctx = new Map(sc.map((c) => [c.coin, c]))
  const tok = new Map(sm.tokens.map((t) => [t.index, t]))
  // USDC-quoted pairs only; when a token has several, the most traded one wins.
  for (const u of sm.universe) {
    if (u.tokens[1] !== 0) continue
    const c = ctx.get(u.name), t = tok.get(u.tokens[0])
    if (!c || !t) continue
    const price = Number(c.midPx ?? c.markPx), vol = Number(c.dayNtlVlm) || 0
    if (!(price > 0) || vol < 1000) continue
    const id = `spot:${t.name}`
    if (next[id] && next[id].vol24 >= vol) continue
    keep(id, {
      id, coin: u.name, kind: 'spot', base: t.name, logo: `${t.name}_spot`, price, prevDay: Number(c.prevDayPx) || price,
      vol24: vol, szDecimals: t.szDecimals, maxLev: 1, supply: Number(c.circulatingSupply) || undefined, tokenId: t.tokenId,
    })
  }
  state.markets = next
  state.byCoin = byCoin
  state.status = 'ready'
  emit()
}

/* ───────────── socket ───────────── */
let ws: WebSocket | null = null
let retry = 0, ping = 0
const active = new Map<string, object>() // key → subscription
const send = (m: unknown) => ws?.readyState === 1 && ws.send(JSON.stringify(m))
const subscribe = (key: string, sub: object) => { if (active.has(key)) return; active.set(key, sub); send({ method: 'subscribe', subscription: sub }) }
const unsubscribe = (key: string) => { const s = active.get(key); if (!s) return; active.delete(key); send({ method: 'unsubscribe', subscription: s }) }
type CandleMsg = { t: number; T: number; s: string; i: string; o: string; c: string; h: string; l: string; v: string }
const candleListeners = new Set<(c: CandleMsg) => void>()
export const onCandle = (f: (c: CandleMsg) => void) => { candleListeners.add(f); return () => { candleListeners.delete(f) } }

function connect() {
  ws = new WebSocket('wss://api.hyperliquid.xyz/ws')
  ws.onopen = () => {
    retry = 0
    active.forEach((s) => send({ method: 'subscribe', subscription: s }))
    ping = window.setInterval(() => send({ method: 'ping' }), 30_000)
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.channel === 'allMids') {
      const mids: Record<string, string> = m.data.mids
      for (const k in mids) { const id = state.byCoin[k]; const mk = id && state.markets[id]; if (mk) mk.price = Number(mids[k]) }
      emit()
    } else if (m.channel === 'l2Book') {
      const d = m.data as { coin: string; time: number; levels: [{ px: string; sz: string; n: number }[], { px: string; sz: string; n: number }[]] }
      if (!state.book || state.book.coin !== d.coin) return
      const map = (l: { px: string; sz: string; n: number }) => ({ px: Number(l.px), sz: Number(l.sz), n: l.n })
      state.book = { ...state.book, bids: d.levels[0].map(map), asks: d.levels[1].map(map), t: d.time }
      emit()
    } else if (m.channel === 'trades') {
      const list = (m.data as { coin: string; px: string; sz: string; side: 'B' | 'A'; time: number; tid: number }[])
      if (!state.trades || !list.length || state.trades.coin !== list[0].coin) return
      const add = list.map((t) => ({ px: Number(t.px), sz: Number(t.sz), side: t.side, time: t.time, tid: t.tid })).reverse()
      state.trades = { coin: state.trades.coin, list: [...add, ...state.trades.list].slice(0, 60) }
      emit()
    } else if (m.channel === 'candle') {
      candleListeners.forEach((f) => f(m.data))
    }
  }
  ws.onclose = () => { clearInterval(ping); ws = null; setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++)) }
}

let started = false
export function startTrade() {
  if (started) return
  started = true
  loadMarkets().catch(() => { state.status = 'error'; emit() })
  setInterval(() => loadMarkets().catch(() => {}), 15_000)
  connect()
  subscribe('mids', { type: 'allMids' })
}

/** Follow one market: order book (with grouping) and trade tape. */
export function watchMarket(coin: string, sig: number | null) {
  const bookKey = `book:${coin}:${sig ?? 'full'}`
  for (const k of [...active.keys()]) if ((k.startsWith('book:') && k !== bookKey) || (k.startsWith('trades:') && k !== `trades:${coin}`)) unsubscribe(k)
  if (state.book?.coin !== coin || state.book.sig !== (sig ?? 0)) state.book = { coin, sig: sig ?? 0, bids: [], asks: [], t: 0 }
  if (state.trades?.coin !== coin) {
    state.trades = { coin, list: [] }
    info<{ px: string; sz: string; side: 'B' | 'A'; time: number; tid: number }[]>({ type: 'recentTrades', coin })
      .then((l) => { if (state.trades?.coin === coin && !state.trades.list.length) { state.trades.list = l.map((t) => ({ px: +t.px, sz: +t.sz, side: t.side, time: t.time, tid: t.tid })).reverse().slice(0, 60); emit() } })
      .catch(() => {})
  }
  // Seed the book over HTTP so it paints before the first socket frame.
  info<{ levels: [{ px: string; sz: string; n: number }[], { px: string; sz: string; n: number }[]] }>({ type: 'l2Book', coin, ...(sig ? { nSigFigs: sig } : {}) })
    .then((d) => {
      if (state.book?.coin !== coin || state.book.bids.length) return
      const map = (l: { px: string; sz: string; n: number }) => ({ px: +l.px, sz: +l.sz, n: l.n })
      state.book = { ...state.book, bids: d.levels[0].map(map), asks: d.levels[1].map(map) }
      emit()
    })
    .catch(() => {})
  subscribe(bookKey, { type: 'l2Book', coin, ...(sig ? { nSigFigs: sig } : {}) })
  subscribe(`trades:${coin}`, { type: 'trades', coin })
  emit()
}

export function watchCandles(coin: string, interval: string) {
  const key = `candle:${coin}:${interval}`
  for (const k of [...active.keys()]) if (k.startsWith('candle:') && k !== key) unsubscribe(k)
  subscribe(key, { type: 'candle', coin, interval })
}

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w'
export const IV_MS: Record<Interval, number> = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }
export async function loadCandles(coin: string, interval: Interval, from: number, to = Date.now()): Promise<Candle[]> {
  const k = await info<CandleMsg[]>({ type: 'candleSnapshot', req: { coin, interval, startTime: from, endTime: to } })
  return k.map(toCandle)
}
export const toCandle = (x: CandleMsg): Candle => ({ time: Math.floor(x.t / 1000), open: +x.o, high: +x.h, low: +x.l, close: +x.c, volume: +x.v })

/* ───────────── selectors / helpers ───────────── */
export const chg = (m: Market) => (m.prevDay ? (m.price - m.prevDay) / m.prevDay : 0)
export const marketList = (s: State) => Object.values(s.markets).sort((a, b) => b.vol24 - a.vol24)
/** Price decimals the way Hyperliquid quotes them: 5 significant figures, capped by size decimals. */
export const pxDecimals = (m: Pick<Market, 'kind' | 'szDecimals'>, px: number) => {
  const max = (m.kind === 'perp' ? 6 : 8) - m.szDecimals
  const sig = px > 0 ? Math.max(0, 5 - Math.floor(Math.log10(px)) - 1) : 2
  return Math.max(0, Math.min(max, sig))
}
const nfs = new Map<number, Intl.NumberFormat>()
export const fmt = (v: number, d: number) => {
  let f = nfs.get(d)
  if (!f) nfs.set(d, (f = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })))
  return isFinite(v) ? f.format(v) : '—'
}
export const compact = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}
export const compactN = (v: number) => compact(v).slice(1)
