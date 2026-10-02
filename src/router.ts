import { useSyncExternalStore } from 'react'

// Hash routes (work from file:// and any static host):
//   #/                         Discover
//   #/outcome/:tab?src=&focus= Outcome (tab = category slug, src = unified|hyperliquid|polymarket)
//   #/trade/:market            Trade (market = perp coin "BTC" or "spot:HYPE")
export type Route =
  | { page: 'discover' }
  | { page: 'outcome'; tab: string; src: Src; focus?: string }
  | { page: 'market'; source: 'pm' | 'hl'; id: string; m?: string; side: 'yes' | 'no' }
  | { page: 'trade'; market: string }
export type Src = 'unified' | 'hyperliquid' | 'polymarket'

const parse = (): Route => {
  const [path, qs = ''] = location.hash.replace(/^#/, '').split('?')
  const seg = path.split('/').filter(Boolean)
  const q = new URLSearchParams(qs)
  if (seg[0] === 'market' && seg[2]) {
    return { page: 'market', source: seg[1] === 'hl' ? 'hl' : 'pm', id: decodeURIComponent(seg[2]), m: q.get('m') ?? undefined, side: q.get('side') === 'no' ? 'no' : 'yes' }
  }
  if (seg[0] === 'trade') return { page: 'trade', market: decodeURIComponent(seg[1] || 'BTC') }
  if (seg[0] === 'outcome') {
    const src = (q.get('src') as Src) || 'unified'
    return { page: 'outcome', tab: seg[1] || 'trending', src: ['unified', 'hyperliquid', 'polymarket'].includes(src) ? src : 'unified', focus: q.get('focus') ?? undefined }
  }
  return { page: 'discover' }
}

let route = parse()
const subs = new Set<() => void>()
window.addEventListener('hashchange', () => {
  const prev = route
  route = parse()
  const pageChanged = prev.page !== route.page || (prev.page === 'market' && route.page === 'market' && prev.id !== route.id)
  const swap = () => subs.forEach((f) => f())
  // Cross-page: View Transition (crossfade) when available; within a page: instant.
  const vt = (document as any).startViewTransition
  if (pageChanged && vt && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Heavy pages (Trade's chart) can outlast the transition's DOM-update budget; that only skips the crossfade.
    const t = vt.call(document, swap)
    for (const p of [t?.ready, t?.finished, t?.updateCallbackDone]) p?.catch?.(() => {})
  }
  else swap()
  if (pageChanged) {
    const y = pageChanged && route.page === 'discover' ? discoverScroll : 0
    requestAnimationFrame(() => window.scrollTo({ top: y }))
  }
})
let discoverScroll = 0
window.addEventListener('scroll', () => { if (route.page === 'discover') discoverScroll = window.scrollY }, { passive: true })

export const useRoute = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => route)

export const href = {
  discover: '#/',
  trade: (market = 'BTC') => `#/trade/${encodeURIComponent(market)}`,
  outcome: (tab = 'trending', o: { src?: Src; focus?: string } = {}) => {
    const q = new URLSearchParams()
    if (o.src && o.src !== 'unified') q.set('src', o.src)
    if (o.focus) q.set('focus', o.focus)
    const s = q.toString()
    return `#/outcome/${tab}${s ? '?' + s : ''}`
  },
}
export const marketHref = (o: { source: 'polymarket' | 'hyperliquid'; id: string }, opt: { m?: string; side?: 'yes' | 'no' } = {}) => {
  const q = new URLSearchParams()
  if (opt.m) q.set('m', opt.m)
  if (opt.side === 'no') q.set('side', 'no')
  const s = q.toString()
  return `#/market/${o.source === 'hyperliquid' ? 'hl' : 'pm'}/${encodeURIComponent(o.id)}${s ? '?' + s : ''}`
}
export const go = (h: string) => { if (location.hash !== h) location.hash = h }
/** Same-page state change (selected market/side): replaces history instead of stacking entries. */
export const replace = (h: string) => { if (location.hash !== h) location.replace(h) }
