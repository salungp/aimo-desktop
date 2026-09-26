import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CATEGORIES, loadFeed, loadHLOutcomes, retryFeed, useMarket, type Outcome as O } from '../data/market'
import { FireLine, Globe, HyperliquidMark, PolymarketMark, Stack } from '../icons'
import { go, href, type Src } from '../router'
import { OutcomeCard } from '../components/OutcomeCard'

/* Category tab bar — sliding lime indicator, roving focus, edge fade when scrollable. */
function CategoryTabs({ tab, src }: { tab: string; src: Src }) {
  const bar = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)
  const [edges, setEdges] = useState({ l: false, r: false })

  const measure = () => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth })
    const b = bar.current
    if (b) setEdges({ l: b.scrollLeft > 2, r: b.scrollLeft + b.clientWidth < b.scrollWidth - 2 })
  }
  useLayoutEffect(() => {
    measure()
    const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [tab])
  useEffect(() => {
    const ro = new ResizeObserver(measure)
    bar.current && ro.observe(bar.current)
    document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    const i = CATEGORIES.findIndex((c) => c.slug === tab)
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = CATEGORIES[(i + d + CATEGORIES.length) % CATEGORIES.length]
    go(href.outcome(next.slug, { src }))
    requestAnimationFrame(() => bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }

  return (
    <div className="cat-bar" data-l={edges.l || undefined} data-r={edges.r || undefined}>
      <div className="cat-bar__scroll" ref={bar} role="tablist" aria-label="Market categories" onScroll={measure} onKeyDown={onKey}>
        {CATEGORIES.map((c) => {
          const sel = c.slug === tab
          return (
            <a key={c.slug} role="tab" aria-selected={sel} tabIndex={sel ? 0 : -1} className="cat-tab" href={href.outcome(c.slug, { src })}>
              {c.icon === 'fire' && <FireLine />}
              {c.icon === 'stack' && <Stack />}
              {c.label}
            </a>
          )
        })}
        {ind && <span className="cat-ind" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />}
      </div>
    </div>
  )
}

const SOURCES: { id: Src; label: string; icon: JSX.Element }[] = [
  { id: 'unified', label: 'Unified', icon: <Globe /> },
  { id: 'hyperliquid', label: 'Hyperliquid', icon: <HyperliquidMark /> },
  { id: 'polymarket', label: 'Polymarket', icon: <PolymarketMark /> },
]
function SourceFilter({ tab, src }: { tab: string; src: Src }) {
  return (
    <div className="src-pills" role="radiogroup" aria-label="Market source">
      {SOURCES.map((s) => (
        <a key={s.id} role="radio" aria-checked={src === s.id} className="src-pill" href={href.outcome(tab, { src: s.id })}>
          {s.icon}<span>{s.label}</span>
        </a>
      ))}
    </div>
  )
}

const HL_TABS = new Set(['trending', 'crypto'])
function mix(pm: O[], hl: O[]) {
  // Unified feed: Hyperliquid binaries slot in after the first row, then every 6 cards.
  const out = [...pm]
  hl.forEach((h, i) => out.splice(Math.min(out.length, 5 + i * 6), 0, h))
  return out
}

function SkeletonCard({ i }: { i: number }) {
  return (
    <div className="out-card out-card--page sk-card" style={{ ['--i' as any]: i }}>
      <div className="out-card__head"><span className="sk" style={{ width: 40, height: 40, borderRadius: 10 }} /><span className="sk" style={{ flex: 1, height: 14 }} /></div>
      <div className="out-body">{[0, 1].map((k) => <div className="out-row" key={k}><span className="sk" style={{ width: 90, height: 14 }} /><span className="sk" style={{ width: 120, height: 28 }} /></div>)}</div>
    </div>
  )
}

export function OutcomePage({ tab, src, focus }: { tab: string; src: Src; focus?: string }) {
  const s = useMarket()
  const cat = CATEGORIES.find((c) => c.slug === tab) ?? CATEGORIES[0]
  const feed = s.feeds[cat.slug]
  const wantsHL = src !== 'polymarket' && HL_TABS.has(cat.slug)

  useEffect(() => { if (src !== 'hyperliquid') loadFeed(cat.slug) }, [cat.slug, src, s.pm])
  useEffect(() => { if (src !== 'polymarket') loadHLOutcomes() }, [src, s.hl])

  const pmItems = src === 'hyperliquid' ? [] : feed?.items ?? []
  const hlItems = wantsHL ? s.hlOutcomes : []
  const items = src === 'unified' ? mix(pmItems, hlItems) : src === 'hyperliquid' ? hlItems : pmItems
  const loading = (src !== 'hyperliquid' && (!feed || feed.status === 'loading' || feed.status === 'idle') && !pmItems.length) ||
    (src === 'hyperliquid' && s.hlOutcomeStatus === 'loading')
  const error = src !== 'hyperliquid' && feed?.status === 'error'

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (src === 'hyperliquid' || !sentinel.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadFeed(cat.slug, true), { rootMargin: '600px' })
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [cat.slug, src, feed?.status])

  // Deep link from Discover: scroll to the market and pulse it once.
  const [pulse, setPulse] = useState<string | undefined>()
  useEffect(() => {
    if (!focus || !items.some((o) => o.id === focus)) return
    const el = document.getElementById(`o-${focus}`)
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    setPulse(focus)
    const t = setTimeout(() => setPulse(undefined), 1800)
    return () => clearTimeout(t)
  }, [focus, items.length > 0])

  const title = cat.slug === 'trending' ? 'All markets' : `${cat.label} markets`
  const gridKey = `${cat.slug}:${src}`

  return (
    <>
      <CategoryTabs tab={cat.slug} src={src} />
      <main className="main main--outcome">
        <div className="sec-head">
          <h1 className="t-20s" style={{ margin: 0 }}>{title}</h1>
          <SourceFilter tab={cat.slug} src={src} />
        </div>

        {error ? (
          <div className="empty">
            <p className="t-16m" style={{ margin: 0 }}>Couldn't reach Polymarket</p>
            <p className="t-14r muted" style={{ margin: 0 }}>Check your connection, then try again.</p>
            <button className="see-more t-12m" onClick={() => retryFeed(cat.slug)}>Retry</button>
          </div>
        ) : !loading && !items.length ? (
          <div className="empty">
            <p className="t-16m" style={{ margin: 0 }}>No {src === 'hyperliquid' ? 'Hyperliquid' : ''} markets in {cat.label} right now</p>
            <p className="t-14r muted" style={{ margin: 0 }}>
              {src === 'hyperliquid' ? 'Hyperliquid outcome markets are crypto price binaries.' : 'New markets list here as soon as they open.'}
            </p>
            {src !== 'unified' && <a className="see-more t-12m" href={href.outcome(cat.slug)}>Show all sources</a>}
          </div>
        ) : (
          <div className="out-grid out-grid--page" key={gridKey}>
            {loading
              ? Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} i={i} />)
              : items.map((o, i) => (
                  <OutcomeCard key={o.id} o={o} page tick={s.tick} focused={pulse === o.id} style={{ ['--i' as any]: Math.min(i, 11) }} />
                ))}
          </div>
        )}
        {!loading && src !== 'hyperliquid' && feed?.status === 'loading' && pmItems.length > 0 && (
          <div className="out-grid out-grid--page">{Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} i={i} />)}</div>
        )}
        <div ref={sentinel} style={{ height: 1 }} />
      </main>
    </>
  )
}
