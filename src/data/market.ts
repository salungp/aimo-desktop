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
  change?: number       // 24h move of the lead row's Yes price (Polymarket oneDayPriceChange)
  vol24?: number        // 24h volume
  rules?: string        // resolution text when the card source already knows it (Hyperliquid templates)
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
  books: Record<string, Book>    // `${detailKey}|${marketId}` → Yes-side order book
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
let state: State = { assets: {}, outcomes: [], feeds: {}, hlOutcomes: [], hlOutcomeStatus: 'idle', details: {}, books: {}, hl: 'connecting', pm: 'connecting', tick: 0 }
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
type HLOutcomeSpec = { outcome: number; name: string; description: string; sideSpecs: { name: string }[] }
type HLQuestion = { question: number; name: string; description: string; fallbackOutcome: number; namedOutcomes: number[]; settledNamedOutcomes: number[] }
type HLOutcomeMeta = { outcomes: HLOutcomeSpec[]; questions?: HLQuestion[] }
const kv = (d: string) => Object.fromEntries(d.split('|').map((p) => p.split(':')).filter((x) => x.length >= 2).map(([k, ...v]) => [k, v.join(':')]))
const hlExpiry = (s?: string) => {
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : undefined
}
const PERIOD: Record<string, string> = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': 'daily', '1w': 'weekly' }
const hlDay = (t?: number) => (t ? new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '')
const hlUsd = (v: string) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 })
// "perp:BTC" → BTC; builder perps ("xyz:CL") keep their ticker but get no coin logo.
const hlPerp = (perp = '') => { const i = perp.lastIndexOf(':'); return { sym: perp.slice(i + 1), coin: i < 0 ? perp : undefined } }
const hlTok = (outcome: number, side = 0) => `#${outcome * 10 + side}`
const hlWhen = (t?: number) => (t ? new Date(t).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' UTC' : 'expiry')
const HL_SETTLE = 'Settles automatically on Hyperliquid: Yes tokens of the winning outcome redeem for 1 USDC, all others for 0. Fully collateralized, no liquidation.'
const hlSource = (d: Record<string, string>) => (d.officialSource ? ` Official source: ${d.officialSource}.` : '')

/** Map one standalone HIP-4 outcome to a card; null when the template is unknown or already expired. */
function hlStandalone(o: HLOutcomeSpec, now: number): Outcome | null {
  const d = kv(o.description || '')
  const base = { id: `hl-${o.outcome}`, source: 'hyperliquid' as const, volume: 0, url: 'https://app.hyperliquid.xyz/trade' }
  const yes = (title: string, category: string, expiry: number | undefined, underlying: string | undefined, rules: string): Outcome | null =>
    expiry && expiry < now ? null : { ...base, title, category, expiry, underlying, rules: `${rules}\n${HL_SETTLE}`, kind: 'binary', rows: [{ label: 'Yes', p: 0.5, token: hlTok(o.outcome) }] }
  if (d.class === 'priceBinary') {
    const t = hlExpiry(d.expiry)
    return yes(`${d.underlying} above ${hlUsd(d.targetPrice)}${PERIOD[d.period] ? ` · ${PERIOD[d.period]}` : ''}`, 'Crypto', t, d.underlying,
      `Resolves "Yes" if the ${d.underlying} price is above ${hlUsd(d.targetPrice)} at ${hlWhen(t)}. Otherwise "No".`)
  }
  switch (o.name) {
    case 'template:binaryPrice': case 'template:priceTouch': {
      const { sym, coin } = hlPerp(d.perp), t = hlExpiry(d.time)
      const verb = o.name === 'template:priceTouch' ? 'touches' : 'above'
      const px = hlUsd(d.threshold ?? d.target), feed = (d.priceDescription || sym).trim()
      return yes(`${sym} ${verb} ${px}${t ? ` by ${hlDay(t)}` : ''}`, coin ? 'Crypto' : 'Finance', t, coin,
        o.name === 'template:priceTouch'
          ? `Resolves "Yes" if the ${feed} price reaches ${px} at any time before ${hlWhen(t)}. Otherwise "No".`
          : `Resolves "Yes" if the ${feed} price is above ${px} at ${hlWhen(t)}. Otherwise "No".`)
    }
    case 'template:companyIpoConfirmed': {
      const t = hlExpiry(d.dateTime)
      return yes(`${d.company} IPO by ${hlDay(t)}?`, 'Finance', t, undefined,
        `Resolves "Yes" if ${d.company} completes an initial public offering by ${hlWhen(t)}. Otherwise "No".`)
    }
    case 'template:sportsContestWinner': {
      const t = hlExpiry(d.resolutionDeadline)
      if (!d.participantA || !d.participantB || (t && t < now)) return null
      return {
        ...base, title: `${d.participantA} vs ${d.participantB}`, category: 'Sports', expiry: hlExpiry(d.scheduledStart) ?? t, kind: 'versus',
        rules: `Resolves to the winner of the ${d.competition ?? ''} ${(d.contestType ?? 'game').toLowerCase()} between ${d.participantA} and ${d.participantB}${d.countedPlay ? `, counting ${d.countedPlay}` : ''}.${hlSource(d)}\n${HL_SETTLE}`.replace(/\s+\./g, '.').replace(/ {2,}/g, ' '),
        rows: [{ label: d.participantA, p: 0.5, token: hlTok(o.outcome, 0) }, { label: d.participantB, p: 0.5, token: hlTok(o.outcome, 1) }],
      }
    }
  }
  return null
}

/** Map a HIP-4 question (group of named outcomes) to one multi-outcome card. */
function hlQuestion(q: HLQuestion, byId: Map<number, HLOutcomeSpec>, now: number): Outcome | null {
  const d = kv(q.description || '')
  const label = (o: HLOutcomeSpec) => {
    const od = kv(o.description || '')
    if (od.participant) return od.participant
    if (o.name === 'template:sportsContestDraw2') return 'Draw'
    const rate = o.name.match(/^template:policyRate(Increase|Decrease|NoChange)$/)?.[1]
    return rate ? (rate === 'NoChange' ? 'No change' : rate) : null
  }
  const rows = q.namedOutcomes
    .filter((n) => !q.settledNamedOutcomes.includes(n))
    .map((n) => byId.get(n))
    .map((o) => (o && label(o) ? { label: label(o)!, p: 0.5, token: hlTok(o.outcome) } : null))
    .filter(Boolean) as OutcomeRow[]
  if (rows.length < 2) return null
  const expiry = hlExpiry(d.resolutionDeadline ?? d.decisionDeadline)
  if (expiry && expiry < now) return null
  let title: string, category: string, rules: string
  switch (q.name) {
    case 'template:sportsTournamentWinner':
      title = `${d.competition} ${d.season ?? ''} winner`.replace(/\s+/g, ' '); category = 'Sports'
      rules = `Resolves to the team that wins the ${d.competition}${d.season ? ` ${d.season}` : ''}.${hlSource(d)}`; break
    case 'template:sportsContestResult':
      title = `${d.participantA} vs ${d.participantB}`; category = 'Sports'
      rules = `Resolves to the result of ${d.participantA} vs ${d.participantB} (${d.competition})${d.countedPlay ? `, counting ${d.countedPlay}` : ''}. A tie resolves to "Draw".${hlSource(d)}`; break
    case 'template:policyRateDecision':
      title = `${d.institution?.includes('Federal Reserve') ? 'Fed' : d.institution} decision · ${d.decisionLabel}`; category = 'Economy'
      rules = `Resolves to the ${d.institution}'s decision on ${d.policyMeasure ?? 'its policy rate'} at the ${d.decisionLabel} meeting: an increase, no change, or a decrease.${hlSource(d)}`; break
    default: return null
  }
  return { id: `hlq-${q.question}`, source: 'hyperliquid', title, category, volume: 0, url: 'https://app.hyperliquid.xyz/trade', kind: 'multi', rows, expiry, rules: `${rules}\n${HL_SETTLE}` }
}

let hlLoading: Promise<void> | null = null
/** Load HIP-4 outcomes once; concurrent callers share the same request. */
export function loadHLOutcomes(): Promise<void> {
  if (state.hlOutcomeStatus === 'ready' || state.hl === 'mock' || state.hl === 'snapshot') return Promise.resolve()
  return (hlLoading ??= fetchHLOutcomes().finally(() => { hlLoading = null }))
}
async function fetchHLOutcomes() {
  state.hlOutcomeStatus = 'loading'; emit()
  try {
    const meta = await hlPost<HLOutcomeMeta>({ type: 'outcomeMeta' })
    const now = Date.now()
    const byId = new Map(meta.outcomes.map((o) => [o.outcome, o]))
    const inQuestion = new Set((meta.questions ?? []).flatMap((q) => [...q.namedOutcomes, q.fallbackOutcome]))
    const standalone = meta.outcomes.filter((o) => !inQuestion.has(o.outcome)).map((o) => hlStandalone(o, now))
    const grouped = (meta.questions ?? []).map((q) => hlQuestion(q, byId, now))
    state.hlOutcomes = ([...grouped, ...standalone].filter(Boolean) as Outcome[])
      .sort((a, b) => (a.expiry ?? Infinity) - (b.expiry ?? Infinity))
    state.hlOutcomeStatus = 'ready'
    emit()
    await refreshHLOutcomePrices()
    setInterval(refreshHLOutcomePrices, 10_000)
  } catch {
    state.hlOutcomeStatus = 'error'; emit()
  }
}
/** Apply a mid price to every card row / detail market trading that outcome token. */
function applyHLMid(tok: string, p: number) {
  for (const o of state.hlOutcomes) {
    let hit = false
    for (const r of o.rows) if (r.token === tok) { r.p = p; hit = true }
    if (hit && o.kind === 'multi') o.rows.sort((a, b) => b.p - a.p)
  }
  for (const d of Object.values(state.details)) for (const m of d.markets) if (m.token === tok) m.p = p
}
async function refreshHLOutcomePrices() {
  try {
    const mids = await hlPost<Record<string, string>>({ type: 'allMids' })
    for (const k in mids) if (k[0] === '#') applyHLMid(k, Number(mids[k]))
    emit()
  } catch {}
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
        if (k[0] === '#') applyHLMid(k, Number(mids[k]))
      }
      emit()
    }
    ws.onclose = () => { clearInterval(ping); setTimeout(open, Math.min(15_000, 1000 * 2 ** retry++)) }
  }
  open()
}

/* ───────────────────────── Polymarket ──────────────────────── */
type GammaMarket = { id?: string; volume?: string; volumeNum?: number; question: string; groupItemTitle?: string; outcomes?: string; outcomePrices?: string; clobTokenIds?: string; active?: boolean; closed?: boolean; oneDayPriceChange?: number }
type GammaEvent = { id: string; slug: string; title: string; image?: string; icon?: string; volume?: number; volume24hr?: number; endDate?: string; tags?: { label: string; slug?: string }[]; markets?: GammaMarket[] }
const parse = <T,>(s?: string): T | undefined => { try { return s ? JSON.parse(s) : undefined } catch { return undefined } }
const HIDE_TAGS = new Set(['All', 'Featured', 'Hide From New', 'Recurring', 'Trending', 'Breaking News', 'Games', 'Up or Down'])

function toOutcome(ev: GammaEvent): Outcome | null {
  const ms = (ev.markets ?? []).filter((m) => m.active !== false && !m.closed && m.outcomePrices)
  if (!ms.length) return null
  const base = {
    id: ev.id, source: 'polymarket' as const, title: ev.title, image: ev.image || ev.icon,
    category: ev.tags?.find((t) => !HIDE_TAGS.has(t.label))?.label ?? 'Trending', volume: Number(ev.volume) || 0,
    url: `https://polymarket.com/event/${ev.slug}`, expiry: ev.endDate ? Date.parse(ev.endDate) : undefined,
    vol24: Number(ev.volume24hr) || undefined,
  }
  if (ms.length === 1) {
    const outs = parse<string[]>(ms[0].outcomes) ?? []
    const prices = (parse<string[]>(ms[0].outcomePrices) ?? []).map(Number)
    const toks = parse<string[]>(ms[0].clobTokenIds) ?? []
    if (outs.length !== 2) return null
    const change = ms[0].oneDayPriceChange
    if (outs[0] === 'Yes' || outs[0] === 'Up') return { ...base, change, kind: 'binary', rows: [{ label: outs[0], p: prices[0] ?? 0.5, token: toks[0] }] }
    return { ...base, change, kind: 'versus', rows: outs.map((label, i) => ({ label, p: prices[i] ?? 0.5, token: toks[i] })) }
  }
  const rows = ms
    .map((m) => ({ label: m.groupItemTitle || m.question, p: Number((parse<string[]>(m.outcomePrices) ?? [])[0]) || 0, token: (parse<string[]>(m.clobTokenIds) ?? [])[0], d: m.oneDayPriceChange }))
    .filter((r) => r.p > 0.005 && r.p < 0.995)
    .sort((a, b) => b.p - a.p).slice(0, 2)
  if (rows.length < 2) return null
  return { ...base, change: rows[0].d, kind: 'multi', rows: rows.map(({ d, ...r }) => r) }
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
    rules: o.rules ?? (o.source === 'hyperliquid'
      ? `Resolves "Yes" if ${o.underlying} is above the target price in the title at expiry${o.expiry ? ` (${new Date(o.expiry).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} UTC)` : ''}. Settles automatically on Hyperliquid: Yes tokens redeem for 1 USDH, No tokens for 0. Fully collateralized, no liquidation.`
      : ''),
    markets: SNAPSHOT_EXTRA[o.id] && offline()
      ? SNAPSHOT_EXTRA[o.id].map(([label, p, volume], i) => ({ id: String(i), label, p, volume, closed: false }))
      : o.rows.map((r, i) => ({ id: String(i), label: o.kind === 'binary' ? o.title : r.label, p: r.p, token: r.token, volume: o.volume / Math.max(1, o.rows.length), closed: false })),
  }
}

/** Open a market: seeds instantly from the card, then hydrates from the venue. */
export async function loadDetail(source: string, id: string) {
  const key = `${source}:${id}`
  if (state.details[key]?.status === 'ready' || state.details[key]?.status === 'loading') return
  const blank = (): Detail => ({
    key, source: source === 'hl' ? 'hyperliquid' : 'polymarket', title: '', category: '', volume: 0, rules: '', url: '',
    markets: [], history: {}, histStatus: {}, status: 'loading',
  })
  let seed = findOutcome(source, id)
  // Deep link / reload straight into a Hyperliquid market: its card data comes from outcomeMeta, so fetch that first.
  if (!seed && source === 'hl') {
    state.details[key] = blank(); emit()
    await loadHLOutcomes()
    seed = findOutcome(source, id)
  }
  state.details[key] = seed ? fromOutcome(seed, key) : blank()
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

/* ───────────────────────── Order book ──────────────────────── */
export type Level = { p: number; s: number }
/** Yes-side book: bids best-first (desc), asks best-first (asc). No-side is derived by inversion. */
export type Book = { bids: Level[]; asks: Level[]; last?: number; status: 'loading' | 'ready' | 'error'; t: number }
export const bookKey = (key: string, marketId: string) => `${key}|${marketId}`

/** Fetch (or refresh) one market's order book. Safe to call on an interval. */
export async function loadBook(key: string, marketId: string) {
  const d = state.details[key], m = d?.markets.find((x) => x.id === marketId)
  if (!d || !m) return
  const k = bookKey(key, marketId), prev = state.books[k]
  if (prev?.status === 'loading') return
  state.books[k] = prev ? { ...prev, status: prev.status === 'ready' ? 'ready' : 'loading' } : { bids: [], asks: [], t: 0, status: 'loading' }
  if (!prev) emit()
  const lv = (xs: { price?: string; px?: string; size?: string; sz?: string }[]) =>
    xs.map((x) => ({ p: Number(x.price ?? x.px), s: Number(x.size ?? x.sz) })).filter((x) => x.p > 0 && x.p < 1 && x.s > 0)
  try {
    let bids: Level[], asks: Level[], last: number | undefined
    if (offline() || state.hl === 'mock' || !m.token) {
      // Deterministic synthetic depth around the live price (demo / offline).
      const h = hashN(m.id + m.label), tick = 0.01
      const size = (i: number) => Math.round(60 + ((h * 997 + i * 131) % 1) * 2200 + i * 180)
      asks = Array.from({ length: 6 }, (_, i) => ({ p: +(Math.min(0.99, m.p + tick * (i + 1))).toFixed(3), s: size(i) }))
      bids = Array.from({ length: 6 }, (_, i) => ({ p: +(Math.max(0.01, m.p - tick * (i + 1))).toFixed(3), s: size(i + 7) }))
      last = m.p
    } else if (d.source === 'polymarket') {
      // The book's own last_trade_price can report the complementary token; the dedicated endpoint is per-token.
      const [r, lt] = await Promise.all([
        fetch(`https://clob.polymarket.com/book?token_id=${m.token}`),
        fetch(`https://clob.polymarket.com/last-trade-price?token_id=${m.token}`).then((x) => (x.ok ? x.json() : null)).catch(() => null) as Promise<{ price?: string } | null>,
      ])
      if (!r.ok) throw new Error(`book ${r.status}`)
      const b: { bids: { price: string; size: string }[]; asks: { price: string; size: string }[] } = await r.json()
      bids = lv(b.bids); asks = lv(b.asks); last = lt?.price ? Number(lt.price) : undefined
    } else {
      const [b, trades] = await Promise.all([
        hlPost<{ levels: { px: string; sz: string }[][] }>({ type: 'l2Book', coin: m.token }),
        hlPost<{ px: string; time: number }[] | null>({ type: 'recentTrades', coin: m.token }).catch(() => null),
      ])
      bids = lv(b.levels[0] ?? []); asks = lv(b.levels[1] ?? [])
      const latest = (trades ?? []).reduce<{ px: string; time: number } | null>((a, t) => (!a || t.time > a.time ? t : a), null)
      last = latest ? Number(latest.px) : undefined
    }
    bids.sort((a, b) => b.p - a.p); asks.sort((a, b) => a.p - b.p)
    state.books[k] = { bids, asks, last, status: 'ready', t: Date.now() }
  } catch {
    const cur = state.books[k]
    state.books[k] = { ...cur, status: cur.t ? 'ready' : 'error' }
  }
  emit()
}
