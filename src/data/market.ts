import { useSyncExternalStore } from 'react'
import { SNAPSHOT_ASSETS, SNAPSHOT_EXTRA, SNAPSHOT_OUTCOMES } from './snapshot'

/* ─────────────────────────── types ─────────────────────────── */
export type Asset = {
  coin: string; price: number; prevDay: number; vol24: number; maxLev: number; spark: number[]; listIndex: number
}
export type OutcomeRow = { label: string; p: number; token?: string }
export type Outcome = {
  id: string
  source: 'polymarket' | 'hyperliquid'
  title: string
  image?: string
  underlying?: string   // HL price binaries: coin logo
  category: string
  volume: number
  url: string
  kind: 'multi' | 'versus' | 'binary'
  rows: OutcomeRow[]    // multi: top 2 (Yes prob) · versus: 2 teams · binary: [Yes]
  expiry?: number       // ms epoch
}
export type Source = 'connecting' | 'live' | 'snapshot' | 'mock'
export type Feed = { items: Outcome[]; status: 'idle' | 'loading' | 'ready' | 'error'; done: boolean; offset: number }
type State = {
  assets: Record<string, Asset>
  outcomes: Outcome[]           // Discover "Trending outcome"
  feeds: Record<string, Feed>   // Outcome page, per category tab
  hlOutcomes: Outcome[]         // Hyperliquid HIP-4
  hlOutcomeStatus: Feed['status']
  details: Record<string, Detail>
  hl: Source
  pm: Source
  tick: number
}

/* ─────────────────────────── categories ─────────────────────── */
// Polymarket tag slugs behind each tab of the Figma tab bar.
export const CATEGORIES: { slug: string; label: string; tag?: string; icon?: 'fire' | 'stack' }[] = [
  { slug: 'trending', label: 'Trending', icon: 'fire' },
  { slug: 'combo', label: 'Combo', icon: 'stack' },
  { slug: 'crypto', label: 'Crypto', tag: 'crypto' },
  { slug: 'sports', label: 'Sports', tag: 'sports' },
  { slug: 'politics', label: 'Politics', tag: 'politics' },
  { slug: 'finance', label: 'Finance', tag: 'finance' },
  { slug: 'esports', label: 'Esports', tag: 'esports' },
  { slug: 'iran', label: 'Iran', tag: 'iran' },
  { slug: 'geopolitics', label: 'Geopolitics', tag: 'geopolitics' },
  { slug: 'tech', label: 'Tech', tag: 'tech' },
  { slug: 'culture', label: 'Culture', tag: 'pop-culture' },
  { slug: 'economy', label: 'Economy', tag: 'economy' },
  { slug: 'weather', label: 'Weather', tag: 'weather' },
  { slug: 'world', label: 'World', tag: 'world' },
]
export const categorySlug = (label: string) => {
  const l = label.toLowerCase()
  return CATEGORIES.find((c) => c.label.toLowerCase() === l || c.tag === l)?.slug
}

/* ─────────────────────────── store ─────────────────────────── */
let state: State = { assets: {}, outcomes: [], feeds: {}, hlOutcomes: [], hlOutcomeStatus: 'idle', details: {}, hl: 'connecting', pm: 'connecting', tick: 0 }
const subs = new Set<() => void>()
let raf = 0
const emit = () => {
  if (raf) return
  raf = requestAnimationFrame(() => { raf = 0; state = { ...state, tick: state.tick + 1 }; subs.forEach((f) => f()) })
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f) }
export const useMarket = () => useSyncExternalStore(subscribe, () => state)

const offline = () => state.pm === 'snapshot' || state.pm === 'mock'
const seedSnapshot = () => {
  if (!Object.keys(state.assets).length) {
    const a: Record<string, Asset> = {}
    SNAPSHOT_ASSETS.forEach((x) => (a[x.coin] = { ...x, spark: [...x.spark] }))
    state.assets = a
  }
  if (!state.outcomes.length) state.outcomes = SNAPSHOT_OUTCOMES.filter((o) => o.source === 'polymarket' && o.kind !== 'binary').slice(0, 8)
  if (!state.hlOutcomes.length) { state.hlOutcomes = SNAPSHOT_OUTCOMES.filter((o) => o.source === 'hyperliquid'); state.hlOutcomeStatus = 'ready' }
}

/* ───────────────────────── Hyperliquid ─────────────────────── */
const HL = 'https://api.hyperliquid.xyz/info'
const hlPost = async <T,>(body: unknown): Promise<T> => {
  const r = await fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`HL ${r.status}`)
  return r.json()
}
type HLUniverse = { name: string; maxLeverage: number; isDelisted?: boolean }
type HLCtx = { markPx: string; midPx: string | null; prevDayPx: string; dayNtlVlm: string }

async function loadHLMeta() {
  const [meta, ctxs] = await hlPost<[{ universe: HLUniverse[] }, HLCtx[]]>({ type: 'metaAndAssetCtxs' })
  const next: Record<string, Asset> = {}
  meta.universe.forEach((u, i) => {
    const c = ctxs[i]
    if (!c || u.isDelisted) return
    const price = Number(c.midPx ?? c.markPx)
    if (!isFinite(price) || price <= 0) return
    const prev = state.assets[u.name]
    const live = state.hl === 'live'
    next[u.name] = {
      coin: u.name, price: live && prev ? prev.price : price, prevDay: Number(c.prevDayPx) || price,
      vol24: Number(c.dayNtlVlm) || 0, maxLev: u.maxLeverage, spark: live && prev ? prev.spark : [], listIndex: i,
    }
  })
  state.assets = next
  state.hl = 'live'
  emit()
}

const sparkLoaded = new Map<string, number>()
export async function ensureSparks(coins: string[]) {
  if (state.hl !== 'live') return
  const now = Date.now()
  const todo = coins.filter((c) => state.assets[c] && now - (sparkLoaded.get(c) ?? 0) > 5 * 60_000)
  todo.forEach((c) => sparkLoaded.set(c, now))
  await Promise.all(todo.map(async (coin) => {
    try {
      const k = await hlPost<{ c: string }[]>({ type: 'candleSnapshot', req: { coin, interval: '1h', startTime: now - 24 * 3600_000, endTime: now } })
      const a = state.assets[coin]
      if (a && k.length) { a.spark = k.map((x) => Number(x.c)); emit() }
    } catch { sparkLoaded.delete(coin) }
  }))
}

/* HIP-4 outcome markets. Side coin = "#<10·outcome + side>"; YES mid = probability. */
type HLOutcomeMeta = { outcomes: { outcome: number; name: string; description: string; sideSpecs: { name: string }[] }[] }
const kv = (d: string) => Object.fromEntries(d.split('|').map((p) => p.split(':')).filter((x) => x.length >= 2).map(([k, ...v]) => [k, v.join(':')]))
const hlExpiry = (s?: string) => {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : undefined
}
const PERIOD: Record<string, string> = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': 'daily', '1w': 'weekly' }

export async function loadHLOutcomes() {
  if (state.hlOutcomeStatus === 'loading' || state.hlOutcomeStatus === 'ready' || state.hl === 'mock' || state.hl === 'snapshot') return
  state.hlOutcomeStatus = 'loading'; emit()
  try {
    const meta = await hlPost<HLOutcomeMeta>({ type: 'outcomeMeta' })
    state.hlOutcomes = meta.outcomes.map((o) => {
      const d = kv(o.description || '')
      const yes = `#${o.outcome * 10}`
      const binary = d.class === 'priceBinary'
      const title = binary
        ? `${d.underlying} above $${Number(d.targetPrice).toLocaleString('en-US')}${PERIOD[d.period] ? ` · ${PERIOD[d.period]}` : ''}`
        : o.name
      return {
        id: `hl-${o.outcome}`, source: 'hyperliquid', title, underlying: d.underlying, category: binary ? 'Crypto' : 'Hyperliquid',
        volume: 0, url: 'https://app.hyperliquid.xyz/trade', kind: 'binary',
        rows: [{ label: o.sideSpecs[0]?.name || 'Yes', p: 0.5, token: yes }], expiry: hlExpiry(d.expiry),
      } satisfies Outcome
    })
    state.hlOutcomeStatus = 'ready'
    emit()
    await refreshHLOutcomePrices()
    setInterval(refreshHLOutcomePrices, 10_000)
  } catch {
    state.hlOutcomeStatus = 'error'; emit()
  }
}
async function refreshHLOutcomePrices() {
  await Promise.all(state.hlOutcomes.slice(0, 24).map(async (o) => {
    try {
      const b = await hlPost<{ levels: { px: string }[][] }>({ type: 'l2Book', coin: o.rows[0].token })
      const bid = Number(b.levels[0]?.[0]?.px), ask = Number(b.levels[1]?.[0]?.px)
      if (bid && ask) o.rows[0].p = (bid + ask) / 2
      else if (bid || ask) o.rows[0].p = bid || ask
    } catch {}
  }))
  emit()
}

function connectHLSocket() {
  let ping = 0, retry = 0
  const open = () => {
    const ws = new WebSocket('wss://api.hyperliquid.xyz/ws')
    ws.onopen = () => {
      retry = 0
      ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }))
      ping = window.setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ method: 'ping' })), 30_000)
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.channel !== 'allMids') return
      const mids: Record<string, string> = m.data.mids
      for (const k in mids) {
        const a = state.assets[k]
        if (a) { const p = Number(mids[k]); a.price = p; if (a.spark.length) a.spark[a.spark.length - 1] = p; continue }
        if (k[0] === '#') {
          for (const o of state.hlOutcomes) if (o.rows[0].token === k) o.rows[0].p = Number(mids[k])
          for (const d of Object.values(state.details)) for (const m of d.markets) if (m.token === k) m.p = Number(mids[k])
        }
      }
      emit()
    }
    ws.onclose = () => { clearInterval(ping); setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++)) }
  }
  open()
}

/* ───────────────────────── Polymarket ──────────────────────── */
type GammaMarket = { id?: string; volume?: string; volumeNum?: number; question: string; groupItemTitle?: string; outcomes?: string; outcomePrices?: string; clobTokenIds?: string; active?: boolean; closed?: boolean }
type GammaEvent = { id: string; slug: string; title: string; image?: string; icon?: string; volume?: number; endDate?: string; tags?: { label: string; slug?: string }[]; markets?: GammaMarket[] }
const parse = <T,>(s?: string): T | undefined => { try { return s ? JSON.parse(s) : undefined } catch { return undefined } }
const HIDE_TAGS = new Set(['All', 'Featured', 'Hide From New', 'Recurring', 'Trending', 'Breaking News', 'Games', 'Up or Down'])

function toOutcome(ev: GammaEvent): Outcome | null {
  const ms = (ev.markets ?? []).filter((m) => m.active !== false && !m.closed && m.outcomePrices)
  if (!ms.length) return null
  const base = {
    id: ev.id, source: 'polymarket' as const, title: ev.title, image: ev.image || ev.icon,
    category: ev.tags?.find((t) => !HIDE_TAGS.has(t.label))?.label ?? 'Trending', volume: Number(ev.volume) || 0,
    url: `https://polymarket.com/event/${ev.slug}`, expiry: ev.endDate ? Date.parse(ev.endDate) : undefined,
  }
  if (ms.length === 1) {
    const outs = parse<string[]>(ms[0].outcomes) ?? []
    const prices = (parse<string[]>(ms[0].outcomePrices) ?? []).map(Number)
    const toks = parse<string[]>(ms[0].clobTokenIds) ?? []
    if (outs.length !== 2) return null
    if (outs[0] === 'Yes' || outs[0] === 'Up') return { ...base, kind: 'binary', rows: [{ label: outs[0], p: prices[0] ?? 0.5, token: toks[0] }] }
    return { ...base, kind: 'versus', rows: outs.map((label, i) => ({ label, p: prices[i] ?? 0.5, token: toks[i] })) }
  }
  const rows = ms
    .map((m) => ({ label: m.groupItemTitle || m.question, p: Number((parse<string[]>(m.outcomePrices) ?? [])[0]) || 0, token: (parse<string[]>(m.clobTokenIds) ?? [])[0] }))
    .filter((r) => r.p > 0.005 && r.p < 0.995)
    .sort((a, b) => b.p - a.p).slice(0, 2)
  if (rows.length < 2) return null
  return { ...base, kind: 'multi', rows }
}

const PAGE = 24
const gamma = async (q: Record<string, string | number>) => {
  const u = new URL('https://gamma-api.polymarket.com/events')
  Object.entries({ active: 'true', closed: 'false', archived: 'false', order: 'volume24hr', ascending: 'false', ...q })
    .forEach(([k, v]) => u.searchParams.set(k, String(v)))
  const r = await fetch(u)
  if (!r.ok) throw new Error(`PM ${r.status}`)
  return (await r.json()) as GammaEvent[]
}

/** Load (or extend) the feed for a category tab. Safe to call repeatedly. */
export async function loadFeed(slug: string, more = false) {
  const f: Feed = state.feeds[slug] ?? { items: [], status: 'idle', done: false, offset: 0 }
  state.feeds[slug] = f
  if (f.status === 'loading' || (f.status === 'ready' && !more) || (more && f.done)) return
  if (offline()) {
    const cat = CATEGORIES.find((c) => c.slug === slug)
    const pool = SNAPSHOT_OUTCOMES.filter((o) => o.source === 'polymarket')
    f.items = slug === 'trending' ? pool : slug === 'combo' ? pool.filter((o) => o.kind === 'multi') : pool.filter((o) => o.category.toLowerCase() === cat?.label.toLowerCase())
    f.status = 'ready'; f.done = true; emit(); return
  }
  f.status = 'loading'; emit()
  try {
    const cat = CATEGORIES.find((c) => c.slug === slug)
    const evs = await gamma({ limit: PAGE, offset: f.offset, ...(cat?.tag ? { tag_slug: cat.tag } : {}) })
    let items = evs.map(toOutcome).filter(Boolean) as Outcome[]
    if (slug === 'combo') items = items.filter((o) => o.kind === 'multi')
    const seen = new Set(f.items.map((o) => o.id))
    f.items = [...f.items, ...items.filter((o) => !seen.has(o.id))]
    f.offset += PAGE
    f.done = evs.length < PAGE
    f.status = 'ready'
    watchTokens()
  } catch { f.status = f.items.length ? 'ready' : 'error' }
  emit()
}
export const retryFeed = (slug: string) => { const f = state.feeds[slug]; if (f) f.status = 'idle'; return loadFeed(slug) }

async function loadDiscoverOutcomes() {
  await loadFeed('trending')
  const f = state.feeds.trending
  if (f.status !== 'ready' || f.items.length < 4) throw new Error('PM unavailable')
  state.outcomes = f.items.filter((o) => o.kind !== 'binary').slice(0, 12)
  state.pm = 'live'
  emit()
}

/* One CLOB socket for every loaded Polymarket token (Discover + all visited tabs). */
let pmWs: WebSocket | null = null, pmKey = '', pmTimer = 0
function allPM() {
  const detailRows = Object.values(state.details).filter((d) => d.source === 'polymarket').map((d) => ({ rows: d.markets, source: 'polymarket' } as unknown as Outcome))
  return [...state.outcomes, ...Object.values(state.feeds).flatMap((f) => f.items), ...detailRows].filter((o) => o.source === 'polymarket')
}
function watchTokens() {
  clearTimeout(pmTimer)
  pmTimer = window.setTimeout(() => {
    const ids = [...new Set(allPM().flatMap((o) => o.rows.map((r) => r.token)).filter(Boolean) as string[])].slice(0, 500)
    const key = ids.join()
    if (!ids.length || key === pmKey) return
    pmKey = key
    const old = pmWs
    const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market')
    pmWs = ws
    old?.close()
    let ping = 0
    const set = (asset: string, p: number) => {
      if (!isFinite(p) || p <= 0 || p >= 1) return
      for (const o of allPM()) for (const r of o.rows) if (r.token === asset) r.p = p
    }
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'market', assets_ids: ids })); ping = window.setInterval(() => ws.readyState === 1 && ws.send('PING'), 10_000) }
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data === 'PONG') return
      let msg: any
      try { msg = JSON.parse(e.data) } catch { return }
      for (const m of Array.isArray(msg) ? msg : [msg]) {
        if (m.event_type === 'price_change') {
          for (const c of m.price_changes ?? m.changes ?? []) {
            const bb = Number(c.best_bid), ba = Number(c.best_ask)
            if (bb && ba && ba - bb <= 0.1) set(c.asset_id ?? m.asset_id, (bb + ba) / 2)
          }
        } else if (m.event_type === 'last_trade_price') set(m.asset_id, Number(m.price))
      }
      emit()
    }
    ws.onclose = () => { clearInterval(ping); if (pmWs === ws) { pmKey = ''; setTimeout(watchTokens, 3000) } }
  }, 300)
}

/* ───────────────────────── mock mode ───────────────────────── */
function startMock() {
  state.pm = 'mock'; state.hl = 'mock'
  seedSnapshot()
  Object.values(state.assets).forEach((a) => { if (!a.spark.length) a.spark = walk(a.prevDay, a.price, 24) })
  emit()
  setInterval(() => {
    for (const a of Object.values(state.assets)) {
      if (Math.random() < 0.55) continue
      a.price *= 1 + (Math.random() - 0.5) * 0.0016
      a.spark[a.spark.length - 1] = a.price
    }
    const outs = new Set([...state.outcomes, ...state.hlOutcomes, ...Object.values(state.feeds).flatMap((f) => f.items)])
    for (const o of outs) for (const r of o.rows) if (Math.random() < 0.12) r.p = Math.min(0.99, Math.max(0.01, r.p + (Math.random() - 0.5) * 0.03))
    for (const d of Object.values(state.details)) for (const m of d.markets) if (Math.random() < 0.35) m.p = Math.min(0.99, Math.max(0.01, m.p + (Math.random() - 0.5) * 0.012))
    emit()
  }, 900)
}
export function walk(from: number, to: number, n: number) {
  const out: number[] = []
  let seed = Math.round(from * 1e4) % 9973 || 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    out.push(from + (to - from) * t + (rnd() - 0.5) * Math.abs(to - from || from * 0.01) * 0.9 * Math.sin(Math.PI * t))
  }
  out[n - 1] = to
  return out
}

/* ─────────────────────────── boot ──────────────────────────── */
let booted = false
export function boot() {
  if (booted) return
  booted = true
  if (new URLSearchParams(location.search).has('mock')) return startMock()
  loadHLMeta()
    .then(() => { connectHLSocket(); setInterval(() => loadHLMeta().catch(() => {}), 30_000) })
    .catch(() => {
      seedSnapshot(); state.hl = 'snapshot'
      Object.values(state.assets).forEach((a) => { if (!a.spark.length) a.spark = walk(a.prevDay, a.price, 24) })
      emit()
    })
  loadDiscoverOutcomes().catch(() => { state.pm = 'snapshot'; state.feeds = {}; seedSnapshot(); emit() })
}

/* ───────────────────────── selectors ───────────────────────── */
export const change = (a: Asset) => (a.prevDay ? (a.price - a.prevDay) / a.prevDay : 0)
const MAJORS = new Set(['BTC', 'ETH', 'SOL'])
const liquid = (s: State, min = 2e6) => Object.values(s.assets).filter((a) => a.vol24 >= min)
export const pick = (s: State, coins: string[]) => coins.map((c) => s.assets[c]).filter(Boolean) as Asset[]
export const newListings = (s: State, n = 3) => Object.values(s.assets).sort((a, b) => b.listIndex - a.listIndex).slice(0, n)
export const biggestMoves = (s: State, n = 3) =>
  liquid(s).sort((a, b) => b.vol24 - a.vol24).slice(0, 20).sort((a, b) => Math.abs(change(b)) - Math.abs(change(a))).slice(0, n)
export const trendingTokens = (s: State, n = 5) => liquid(s).filter((a) => !MAJORS.has(a.coin)).sort((a, b) => b.vol24 - a.vol24).slice(0, n)
export const moversPerps = (s: State, n = 5) => liquid(s, 5e6).sort((a, b) => Math.abs(change(b)) - Math.abs(change(a))).slice(0, n)
export const topVolumeAlt = (s: State) => trendingTokens(s, 1)[0]


/* ───────────────────────── Market details ──────────────────── */
export type DMarket = { id: string; label: string; p: number; token?: string; noToken?: string; volume: number; closed: boolean }
export type Range = '1H' | '6H' | '1D' | '1W' | '1M' | 'All'
export type Pt = { t: number; p: number }
export type Detail = {
  key: string; source: Outcome['source']; title: string; image?: string; underlying?: string
  category: string; sub?: string; volume: number; endDate?: number; rules: string; url: string
  markets: DMarket[]
  history: Partial<Record<Range, Record<string, Pt[]>>>
  histStatus: Partial<Record<Range, 'loading' | 'ready' | 'error'>>
  status: 'loading' | 'ready' | 'error'
}
export const detailKey = (o: Pick<Outcome, 'source' | 'id'>) => `${o.source === 'hyperliquid' ? 'hl' : 'pm'}:${o.id}`

const RANGE: Record<Range, { pm: string; fid: number; ms: number; hl: string }> = {
  '1H': { pm: '1h', fid: 1, ms: 3600e3, hl: '1m' },
  '6H': { pm: '6h', fid: 2, ms: 6 * 3600e3, hl: '5m' },
  '1D': { pm: '1d', fid: 10, ms: 864e5, hl: '15m' },
  '1W': { pm: '1w', fid: 60, ms: 7 * 864e5, hl: '1h' },
  '1M': { pm: '1m', fid: 240, ms: 30 * 864e5, hl: '4h' },
  All: { pm: 'max', fid: 720, ms: 180 * 864e5, hl: '1d' },
}

function findOutcome(source: string, id: string): Outcome | undefined {
  const pool = [...state.outcomes, ...state.hlOutcomes, ...Object.values(state.feeds).flatMap((f) => f.items), ...SNAPSHOT_OUTCOMES]
  return pool.find((o) => o.id === id && (source === 'hl') === (o.source === 'hyperliquid'))
}

function fromOutcome(o: Outcome, key: string): Detail {
  return {
    key, source: o.source, title: o.title, image: o.image, underlying: o.underlying, category: o.category,
    sub: o.underlying ? ({ BTC: 'Bitcoin', ETH: 'Ethereum', HYPE: 'Hyperliquid', SOL: 'Solana' } as Record<string, string>)[o.underlying] ?? o.underlying : undefined,
    volume: o.volume, endDate: o.expiry, url: o.url, status: 'loading', history: {}, histStatus: {},
    rules: o.source === 'hyperliquid'
      ? `Resolves "Yes" if ${o.underlying} is above the target price in the title at expiry${o.expiry ? ` (${new Date(o.expiry).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} UTC)` : ''}. Settles automatically on Hyperliquid: Yes tokens redeem for 1 USDH, No tokens for 0. Fully collateralized, no liquidation.`
      : '',
    markets: SNAPSHOT_EXTRA[o.id] && offline()
      ? SNAPSHOT_EXTRA[o.id].map(([label, p, volume], i) => ({ id: String(i), label, p, volume, closed: false }))
      : o.rows.map((r, i) => ({ id: String(i), label: o.kind === 'binary' ? o.title : r.label, p: r.p, token: r.token, volume: o.volume / Math.max(1, o.rows.length), closed: false })),
  }
}

/** Open a market: seeds instantly from the card, then hydrates from the venue. */
export async function loadDetail(source: string, id: string) {
  const key = `${source}:${id}`
  if (state.details[key]?.status === 'ready' || state.details[key]?.status === 'loading') return
  const seed = findOutcome(source, id)
  state.details[key] = seed ? fromOutcome(seed, key) : {
    key, source: source === 'hl' ? 'hyperliquid' : 'polymarket', title: '', category: '', volume: 0, rules: '', url: '',
    markets: [], history: {}, histStatus: {}, status: 'loading',
  }
  emit()
  const d = state.details[key]
  if (source === 'pm' && !offline()) {
    try {
      const r = await fetch(`https://gamma-api.polymarket.com/events/${id}`)
      if (!r.ok) throw new Error()
      const ev: GammaEvent & { description?: string; markets: (GammaMarket & { id: string; volume?: string; volumeNum?: number })[] } = await r.json()
      Object.assign(d, {
        title: ev.title, image: ev.image || ev.icon, volume: Number(ev.volume) || d.volume, rules: (ev as any).description || '',
        endDate: ev.endDate ? Date.parse(ev.endDate) : undefined, url: `https://polymarket.com/event/${ev.slug}`,
        category: ev.tags?.find((t) => !HIDE_TAGS.has(t.label))?.label ?? d.category,
        sub: ev.tags?.filter((t) => !HIDE_TAGS.has(t.label))[1]?.label,
      })
      const single = ev.markets.length === 1
      d.markets = ev.markets.map((m) => {
        const outs = parse<string[]>(m.outcomes) ?? []
        const px = (parse<string[]>(m.outcomePrices) ?? []).map(Number)
        const tk = parse<string[]>(m.clobTokenIds) ?? []
        return {
          id: m.id ?? m.question, label: single ? (outs[0] === 'Yes' ? ev.title : outs[0]) : m.groupItemTitle || m.question, p: px[0] ?? 0,
          token: tk[0], noToken: tk[1], volume: Number(m.volumeNum ?? m.volume) || 0, closed: !!m.closed || m.active === false,
        }
      })
      // Two-sided sports market (Team A vs Team B): expose both teams as rows.
      if (single) {
        const m = ev.markets[0], outs = parse<string[]>(m.outcomes) ?? [], px = (parse<string[]>(m.outcomePrices) ?? []).map(Number), tk = parse<string[]>(m.clobTokenIds) ?? []
        if (outs.length === 2 && outs[0] !== 'Yes')
          d.markets = outs.map((o, i) => ({ id: `${m.id}-${i}`, label: o, p: px[i] ?? 0, token: tk[i], noToken: tk[1 - i], volume: (Number(m.volumeNum ?? m.volume) || 0) / 2, closed: false }))
      }
      d.markets.sort((a, b) => Number(a.closed) - Number(b.closed) || b.p - a.p)
      d.status = 'ready'
      watchTokens()
    } catch { d.status = d.markets.length ? 'ready' : 'error' }
  } else {
    if (!d.rules) d.rules = 'Full resolution rules load from the venue when you are online.'
    d.status = d.markets.length ? 'ready' : 'error'
  }
  emit()
}

export async function loadHistory(key: string, range: Range) {
  const d = state.details[key]
  if (!d || d.histStatus[range] === 'loading' || d.histStatus[range] === 'ready') return
  d.histStatus[range] = 'loading'; emit()
  const now = Date.now(), R = RANGE[range]
  const top = d.markets.filter((m) => !m.closed).slice(0, 4)
  const series: Record<string, Pt[]> = {}
  const synth = (m: DMarket) => {
    const n = 90, start = now - R.ms
    const raw = walk(Math.min(0.95, Math.max(0.03, m.p + (hashN(m.id + m.label) - 0.5) * 0.3)), m.p, n)
    const base = raw.map((_, i) => { const w = raw.slice(Math.max(0, i - 4), i + 1); return w.reduce((a, b) => a + b, 0) / w.length })
    base[n - 1] = m.p
    return base.map((p, i) => ({ t: start + (i / (n - 1)) * R.ms, p: Math.min(0.99, Math.max(0.01, p)) }))
  }
  try {
    if (offline() || state.hl === 'mock') top.forEach((m) => (series[m.id] = synth(m)))
    else if (d.source === 'polymarket') {
      await Promise.all(top.map(async (m) => {
        if (!m.token) return
        const r = await fetch(`https://clob.polymarket.com/prices-history?market=${m.token}&interval=${R.pm}&fidelity=${R.fid}`)
        const j: { history: { t: number; p: number }[] } = await r.json()
        series[m.id] = j.history.map((h) => ({ t: h.t * 1000, p: h.p }))
      }))
    } else {
      await Promise.all(top.map(async (m) => {
        const k = await hlPost<{ t: number; c: string }[]>({ type: 'candleSnapshot', req: { coin: m.token, interval: R.hl, startTime: now - R.ms, endTime: now } }).catch(() => [])
        series[m.id] = k.map((x) => ({ t: x.t, p: Number(x.c) }))
      }))
    }
    d.history[range] = series
    d.histStatus[range] = 'ready'
  } catch { d.histStatus[range] = 'error' }
  emit()
}
const hashN = (s: string) => ([...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381) % 1000) / 1000
