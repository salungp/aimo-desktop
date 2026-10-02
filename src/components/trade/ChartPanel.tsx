import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createChart, CrosshairMode, LineStyle, PriceScaleMode, type IChartApi, type IPriceLine, type ISeriesApi, type MouseEventParams, type Time, type UTCTimestamp } from 'lightweight-charts'
import { toggleFav, useFavs } from '../../data/favs'
import { displayName } from '../../data/names'
import { chg, compact, fmt, IV_MS, loadCandles, onCandle, pxDecimals, toCandle, watchCandles, type Candle, type Interval, type Market } from '../../data/trade'
import { CaretDown, CaretUp, Star } from '../../icons'
import { Coin, toast } from '../primitives'
import {
  IcoArea, IcoCalendar, IcoCamera, IcoCandles, IcoCaretDown, IcoCopy, IcoCornersIn, IcoCornersOut, IcoCross, IcoEye, IcoEyeOff, IcoFx, IcoGear,
  IcoHLine, IcoLine, IcoLock, IcoMagnet, IcoPanel, IcoRedo, IcoSearch, IcoTrash, IcoUndo, IcoUnlock, IcoZoomIn, IcoZoomOut,
} from './icons'

/* Center chart column (Figma 788:24921): market header + stats, chart toolbar, tool rail, candles, range bar. */

const C = { up: '#10b93d', down: '#ef4444', upVol: 'rgba(16,185,61,0.35)', downVol: 'rgba(239,68,68,0.35)', grid: 'rgba(255,255,255,0.04)', text: '#a1a1a1', line: 'rgba(255,255,255,0.1)', lime: '#a7f932' }
const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w']
const RANGES: { k: string; iv: Interval; days: number | 'ytd' | 'all' }[] = [
  { k: '1D', iv: '5m', days: 1 }, { k: '5D', iv: '15m', days: 5 }, { k: '1M', iv: '1h', days: 30 }, { k: '3M', iv: '4h', days: 90 },
  { k: '6M', iv: '4h', days: 180 }, { k: 'YTD', iv: '1d', days: 'ytd' }, { k: '1Y', iv: '1d', days: 365 }, { k: '5Y', iv: '1w', days: 1825 }, { k: 'All', iv: '1w', days: 'all' },
]
type Kind = 'candles' | 'line' | 'area'
type Ind = 'ma20' | 'ma50' | 'ema20' | 'vol'
const IND: Record<Ind, { label: string; color?: string }> = { ma20: { label: 'MA 20', color: '#f59e0b' }, ma50: { label: 'MA 50', color: '#ad46ff' }, ema20: { label: 'EMA 20', color: '#2b7fff' }, vol: { label: 'Volume' } }
type Tool = 'cross' | 'hline'

const sma = (d: Candle[], n: number) => d.flatMap((_, i) => (i < n - 1 ? [] : [{ time: d[i].time as UTCTimestamp, value: d.slice(i - n + 1, i + 1).reduce((s, x) => s + x.close, 0) / n }]))
const ema = (d: Candle[], n: number) => { const k = 2 / (n + 1); let e = d[0]?.close ?? 0; return d.map((x, i) => ({ time: x.time as UTCTimestamp, value: (e = i ? x.close * k + e * (1 - k) : x.close) })) }

/* ───────────── tiny popover menu ───────────── */
function Menu({ label, children, className = '', title }: { label: ReactNode; children: (close: () => void) => ReactNode; className?: string; title?: string }) {
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
    <div className="tmenu" ref={ref}>
      <button className={`tb-btn ${className}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} title={title}>{label}</button>
      {open && <div className="tmenu__pop" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  )
}

/* ───────────── market header + stats (Figma 788:24922) ───────────── */
function useCountdown() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return now
}
function Stat({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return <div className="stat" title={title}><span className="stat__l">{label}</span><span className="stat__v num">{children}</span></div>
}
export function MarketHeader({ m, picker }: { m: Market; picker: ReactNode }) {
  const favs = useFavs()
  const now = useCountdown()
  const fav = favs.includes(m.id)
  const c = chg(m), up = c >= 0
  const d = pxDecimals(m, m.price)
  const left = 3600 - Math.floor((now / 1000) % 3600)
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
  return (
    <div className="mh">
      <div className="mh__id">
        <button className="mh__fav" aria-pressed={fav} aria-label={fav ? `Remove ${m.base} from watchlist` : `Add ${m.base} to watchlist`}
          onClick={() => toast(toggleFav(m.id) ? `${m.base} added to watchlist` : `${m.base} removed from watchlist`)}><Star width={16} height={16} /></button>
        <Coin coin={m.logo} size={38} />
        <div className="mh__txt">
          {picker}
          <div className="mh__meta">
            <span>{displayName(m.base)}</span><i>·</i><span>{m.kind === 'perp' ? `Perp · up to ${m.maxLev}x` : 'Spot'}</span>
            {m.tokenId && <><i>·</i><button className="mh__addr" onClick={() => navigator.clipboard?.writeText(m.tokenId!).then(() => toast('Token ID copied'), () => toast('Couldn’t copy — select the ID instead'))} title={m.tokenId}>
              <span>{m.tokenId}</span><IcoCopy s={12} /></button></>}
          </div>
        </div>
      </div>
      <div className="mh__stats">
        <Stat label="Price">${fmt(m.price, d)}</Stat>
        {m.kind === 'spot'
          ? <Stat label="Market cap" title="Circulating supply × price">{m.supply ? compact(m.supply * m.price) : '—'}</Stat>
          : <Stat label="Open interest" title={`${fmt(m.oi ?? 0, 2)} ${m.base}`}>{compact((m.oi ?? 0) * m.price)}</Stat>}
        <Stat label="24H change"><span className={`mh__chg ${up ? 'up' : 'down'}`}>{up ? <CaretUp /> : <CaretDown />}{(Math.abs(c) * 100).toFixed(2)}%</span></Stat>
        <Stat label="24h vol">{compact(m.vol24)}</Stat>
        {m.kind === 'perp' ? (
          <>
            <Stat label="Funding / 1h" title={`Next payment in ${mmss}`}><span className={(m.funding ?? 0) >= 0 ? 'up' : 'down'}>{((m.funding ?? 0) * 100).toFixed(4)}%</span></Stat>
            <Stat label="Next funding">{mmss}</Stat>
            <Stat label="Oracle">${fmt(m.oracle ?? 0, d)}</Stat>
          </>
        ) : (
          <Stat label="Supply">{m.supply ? compact(m.supply).slice(1) : '—'}</Stat>
        )}
      </div>
      <span className="mh__fade" aria-hidden />
    </div>
  )
}

/* ───────────── chart ───────────── */
type Props = { m: Market; onSearch: () => void; panelOpen: boolean; onTogglePanel: () => void }
export function ChartPanel({ m, onSearch, panelOpen, onTogglePanel }: Props) {
  const [iv, setIv] = useState<Interval>(() => (localStorage.getItem('aimo:iv') as Interval) || '15m')
  const [range, setRange] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('candles')
  const [inds, setInds] = useState<Ind[]>(['vol'])
  const [mcap, setMcap] = useState(false)
  const [scale, setScale] = useState<'normal' | 'log' | 'pct'>('normal')
  const [auto, setAuto] = useState(true)
  const [grid, setGrid] = useState(true)
  const [tool, setTool] = useState<Tool>('cross')
  const [magnet, setMagnet] = useState(false)
  const [locked, setLocked] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [lines, setLines] = useState<Record<string, number[]>>({}) // coin → horizontal line prices
  const [redo, setRedo] = useState<number[]>([])
  const [legend, setLegend] = useState<Candle | null>(null)
  const [loading, setLoading] = useState(true)
  const [full, setFull] = useState(false)
  const [clock, setClock] = useState(() => new Date())

  const box = useRef<HTMLDivElement>(null)
  const section = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi>()
  const main = useRef<ISeriesApi<'Candlestick' | 'Line' | 'Area'>>()
  const vol = useRef<ISeriesApi<'Histogram'>>()
  const indS = useRef<Partial<Record<Ind, ISeriesApi<'Line'>>>>({})
  const last = useRef<IPriceLine>()
  const drawn = useRef<IPriceLine[]>([])
  const data = useRef<Candle[]>([])
  const loadingOlder = useRef(false)
  const volOn = useRef(true)
  volOn.current = inds.includes('vol')
  const mul = mcap && m.kind === 'spot' && m.supply ? m.supply : 1
  const d = pxDecimals(m, m.price)
  const coinLines = lines[m.coin] ?? []

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { try { localStorage.setItem('aimo:iv', iv) } catch {} }, [iv])
  useEffect(() => { if (m.kind !== 'spot') setMcap(false) }, [m.kind])

  // Chart instance (once)
  useLayoutEffect(() => {
    const el = box.current!
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: C.text, fontFamily: 'Inter, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.line, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: C.line, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#525252', labelBackgroundColor: '#2e2e2e' }, horzLine: { color: '#525252', labelBackgroundColor: '#2e2e2e' } },
    })
    chart.current = c
    vol.current = c.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    c.subscribeCrosshairMove((p: MouseEventParams) => {
      const b = p.time != null ? data.current.find((x) => x.time === p.time) : null
      setLegend(b ?? null)
    })
    // Drop every series handle with the chart: StrictMode (dev) mounts twice, and stale handles from the
    // first chart would be passed to the second one's removeSeries().
    return () => { c.remove(); chart.current = undefined; main.current = undefined; vol.current = undefined; indS.current = {}; last.current = undefined; drawn.current = [] }
  }, [])

  // Main series per chart type
  useEffect(() => {
    const c = chart.current!
    if (main.current) { c.removeSeries(main.current); last.current = undefined; drawn.current = [] }
    const fmtOpt = { priceFormat: { type: 'price' as const, precision: d, minMove: 1 / 10 ** d }, lastValueVisible: false, priceLineVisible: false }
    main.current = kind === 'candles'
      ? c.addCandlestickSeries({ ...fmtOpt, upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false })
      : kind === 'line'
        ? c.addLineSeries({ ...fmtOpt, color: C.lime, lineWidth: 2 })
        : c.addAreaSeries({ ...fmtOpt, lineColor: C.lime, topColor: 'rgba(167,249,50,0.22)', bottomColor: 'rgba(167,249,50,0)', lineWidth: 2 })
    paint()
  }, [kind])

  useEffect(() => { main.current?.applyOptions({ priceFormat: { type: mcap ? 'volume' : 'price', precision: mcap ? 0 : d, minMove: mcap ? 1 : 1 / 10 ** d } }) }, [d, mcap])
  useEffect(() => {
    chart.current?.applyOptions({ grid: { vertLines: { visible: grid }, horzLines: { visible: grid } }, crosshair: { mode: magnet ? CrosshairMode.Magnet : CrosshairMode.Normal } })
    chart.current?.priceScale('right').applyOptions({ mode: scale === 'log' ? PriceScaleMode.Logarithmic : scale === 'pct' ? PriceScaleMode.Percentage : PriceScaleMode.Normal, autoScale: auto })
  }, [grid, magnet, scale, auto])

  function paint() {
    const s = main.current, v = vol.current, k = data.current
    if (!s || !v) return
    const t = (x: Candle) => x.time as UTCTimestamp
    if (kind === 'candles') (s as ISeriesApi<'Candlestick'>).setData(k.map((x) => ({ time: t(x), open: x.open * mul, high: x.high * mul, low: x.low * mul, close: x.close * mul })))
    else (s as ISeriesApi<'Line'>).setData(k.map((x) => ({ time: t(x), value: x.close * mul })))
    v.setData(inds.includes('vol') ? k.map((x) => ({ time: t(x), value: x.volume, color: x.close >= x.open ? C.upVol : C.downVol })) : [])
    paintInds()
    paintLast()
    paintLines()
  }
  function paintInds() {
    const c = chart.current!, k = data.current
    for (const key of ['ma20', 'ma50', 'ema20'] as const) {
      const on = inds.includes(key)
      let s = indS.current[key]
      if (!on) { if (s) { c.removeSeries(s); delete indS.current[key] } continue }
      if (!s) s = indS.current[key] = c.addLineSeries({ color: IND[key].color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      const pts = key === 'ema20' ? ema(k, 20) : sma(k, key === 'ma20' ? 20 : 50)
      s.setData(pts.map((p) => ({ ...p, value: p.value * mul })))
    }
  }
  function paintLast() {
    const s = main.current, b = data.current[data.current.length - 1]
    if (!s || !b) return
    const opt = { price: b.close * mul, color: C.lime, lineStyle: LineStyle.Dashed, lineWidth: 1 as const, axisLabelVisible: true, axisLabelColor: C.lime, axisLabelTextColor: '#171717', title: '' }
    if (last.current) last.current.applyOptions(opt)
    else last.current = s.createPriceLine(opt)
  }
  function paintLines() {
    const s = main.current
    if (!s) return
    drawn.current.forEach((l) => s.removePriceLine(l))
    drawn.current = hidden ? [] : coinLines.map((p) => s.createPriceLine({ price: p * mul, color: '#2b7fff', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: '' }))
  }

  // Load candles on market / interval / range change
  useEffect(() => {
    let live = true
    setLoading(true)
    const r = RANGES.find((x) => x.k === range)
    const now = Date.now()
    const from = r
      ? r.days === 'ytd' ? Date.UTC(new Date().getUTCFullYear(), 0, 1) : r.days === 'all' ? now - 5000 * IV_MS[iv] : now - r.days * 864e5
      : now - 400 * IV_MS[iv]
    loadCandles(m.coin, iv, from, now).then((k) => {
      if (!live) return
      data.current = k
      setLoading(false)
      paint()
      const ts = chart.current?.timeScale()
      if (r) ts?.fitContent()
      else if (k.length) ts?.setVisibleLogicalRange({ from: Math.max(0, k.length - 140), to: k.length + 6 })
    }).catch(() => { if (live) { setLoading(false); toast('Couldn’t load candles — retrying when the market updates') } })
    watchCandles(m.coin, iv)
    const off = onCandle((raw) => {
      if (raw.s !== m.coin || raw.i !== iv) return
      const b = toCandle(raw), k = data.current
      if (!k.length || b.time < k[k.length - 1].time) return
      if (k[k.length - 1].time === b.time) k[k.length - 1] = b
      else k.push(b)
      const t = b.time as UTCTimestamp
      if (kind === 'candles') (main.current as ISeriesApi<'Candlestick'>)?.update({ time: t, open: b.open * mul, high: b.high * mul, low: b.low * mul, close: b.close * mul })
      else (main.current as ISeriesApi<'Line'>)?.update({ time: t, value: b.close * mul })
      if (volOn.current) vol.current?.update({ time: t, value: b.volume, color: b.close >= b.open ? C.upVol : C.downVol })
      paintLast()
    })
    return () => { live = false; off() }
  }, [m.coin, iv, range, kind, mul])

  useEffect(() => { paint() }, [inds.join(), mul])
  useEffect(() => { paintLines() }, [coinLines.join(), hidden, mul, kind])

  // Lazy-load older bars when panning left
  useEffect(() => {
    const ts = chart.current?.timeScale()
    if (!ts) return
    const h = (lr: { from: number } | null) => {
      if (!lr || lr.from > 20 || loadingOlder.current || !data.current.length) return
      loadingOlder.current = true
      const first = data.current[0].time * 1000
      loadCandles(m.coin, iv, first - 400 * IV_MS[iv], first - 1).then((k) => {
        if (k.length) { data.current = [...k.filter((x) => x.time < data.current[0].time), ...data.current]; paint() }
      }).catch(() => {}).finally(() => { setTimeout(() => (loadingOlder.current = false), 400) })
    }
    ts.subscribeVisibleLogicalRangeChange(h)
    return () => ts.unsubscribeVisibleLogicalRangeChange(h)
  }, [m.coin, iv, kind, mul])

  // Horizontal line tool
  useEffect(() => {
    const c = chart.current
    if (!c || tool !== 'hline') return
    const click = (p: MouseEventParams) => {
      if (!p.point || !main.current || locked) return
      const raw = main.current.coordinateToPrice(p.point.y)
      if (raw == null) return
      let price = Number(raw) / mul
      const b = magnet && p.time != null ? data.current.find((x) => x.time === (p.time as Time)) : undefined
      if (b) price = [b.open, b.high, b.low, b.close].reduce((a, x) => (Math.abs(x - price) < Math.abs(a - price) ? x : a))
      setLines((L) => ({ ...L, [m.coin]: [...(L[m.coin] ?? []), +price.toFixed(d)] }))
      setRedo([])
      setTool('cross')
    }
    c.subscribeClick(click)
    return () => c.unsubscribeClick(click)
  }, [tool, locked, magnet, m.coin, mul, d])

  const undo = () => { if (!coinLines.length) return; setRedo((r) => [...r, coinLines[coinLines.length - 1]]); setLines((L) => ({ ...L, [m.coin]: coinLines.slice(0, -1) })) }
  const redoIt = () => { if (!redo.length) return; setLines((L) => ({ ...L, [m.coin]: [...coinLines, redo[redo.length - 1]] })); setRedo((r) => r.slice(0, -1)) }
  const zoom = (f: number) => {
    const ts = chart.current?.timeScale(), lr = ts?.getVisibleLogicalRange()
    if (!ts || !lr) return
    const mid = lr.to - (lr.to - lr.from) / 2, half = ((lr.to - lr.from) / 2) * f
    ts.setVisibleLogicalRange({ from: mid - half, to: mid + half })
  }
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else section.current?.requestFullscreen?.().catch(() => toast('Full screen isn’t available here'))
  }
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  const snap = () => {
    const cv = chart.current?.takeScreenshot()
    if (!cv) return
    const a = document.createElement('a')
    a.download = `${m.base}-${iv}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.png`
    a.href = cv.toDataURL('image/png')
    a.click()
    toast('Chart snapshot saved')
  }
  const pickIv = (x: Interval) => { setIv(x); setRange(null) }
  const pickRange = (k: string) => { const r = RANGES.find((x) => x.k === k)!; setRange(k); setIv(r.iv) }

  // Keyboard: Alt+H horizontal line, Esc back to crosshair
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      if (e.altKey && e.code === 'KeyH') { e.preventDefault(); setTool('hline') }
      if (e.key === 'Escape') setTool('cross')
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const lb = legend ?? data.current[data.current.length - 1]
  const lup = lb ? lb.close >= lb.open : true
  const KindIco = kind === 'candles' ? IcoCandles : kind === 'line' ? IcoLine : IcoArea
  const rail: { k: string; label: string; icon: ReactNode; on?: boolean; act: () => void; disabled?: boolean }[] = [
    { k: 'cross', label: 'Crosshair (Esc)', icon: <IcoCross s={18} />, on: tool === 'cross', act: () => setTool('cross') },
    { k: 'hline', label: 'Horizontal line (Alt+H)', icon: <IcoHLine s={18} />, on: tool === 'hline', act: () => setTool(tool === 'hline' ? 'cross' : 'hline'), disabled: locked },
    { k: 'magnet', label: magnet ? 'Magnet on — snaps to OHLC' : 'Magnet off', icon: <IcoMagnet s={18} />, on: magnet, act: () => setMagnet(!magnet) },
    { k: 'zin', label: 'Zoom in', icon: <IcoZoomIn s={18} />, act: () => zoom(0.7) },
    { k: 'zout', label: 'Zoom out', icon: <IcoZoomOut s={18} />, act: () => zoom(1.4) },
    { k: 'lock', label: locked ? 'Unlock drawings' : 'Lock drawings', icon: locked ? <IcoLock s={18} /> : <IcoUnlock s={18} />, on: locked, act: () => { setLocked(!locked); setTool('cross') } },
    { k: 'hide', label: hidden ? 'Show drawings' : 'Hide drawings', icon: hidden ? <IcoEyeOff s={18} /> : <IcoEye s={18} />, on: hidden, act: () => setHidden(!hidden) },
    { k: 'trash', label: 'Remove all drawings', icon: <IcoTrash s={18} />, act: () => { if (coinLines.length) { setLines((L) => ({ ...L, [m.coin]: [] })); toast(`${coinLines.length} line${coinLines.length > 1 ? 's' : ''} removed`) } }, disabled: locked || !coinLines.length },
  ]

  return (
    <section className={`cp${full ? ' is-full' : ''}`} ref={section} aria-label={`${m.base} chart`}>
      <div className="cp__bar">
        <Menu label={<>{iv}</>} className="tb-btn--txt" title="Interval">
          {(close) => INTERVALS.map((x) => <button key={x} role="menuitemradio" aria-checked={x === iv} onClick={() => { pickIv(x); close() }}>{x}</button>)}
        </Menu>
        <Menu label={<KindIco s={20} />} title="Chart type">
          {(close) => ([['candles', 'Candles', IcoCandles], ['line', 'Line', IcoLine], ['area', 'Area', IcoArea]] as const).map(([k, l, I]) => (
            <button key={k} role="menuitemradio" aria-checked={kind === k} onClick={() => { setKind(k); close() }}><I s={16} />{l}</button>
          ))}
        </Menu>
        <span className="tb-sep" />
        <Menu label={<><IcoFx s={20} />Indicators{inds.filter((x) => x !== 'vol').length ? <b className="tb-count">{inds.filter((x) => x !== 'vol').length}</b> : null}</>} className="tb-btn--txt" title="Indicators">
          {() => (Object.keys(IND) as Ind[]).map((k) => (
            <button key={k} role="menuitemcheckbox" aria-checked={inds.includes(k)} onClick={() => setInds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}>
              {IND[k].color ? <i className="tmenu__swatch" style={{ background: IND[k].color }} /> : <i className="tmenu__swatch tmenu__swatch--vol" />}{IND[k].label}
            </button>
          ))}
        </Menu>
        {m.kind === 'spot' && (
          <>
            <span className="tb-sep" />
            <div className="tb-toggle" role="radiogroup" aria-label="Chart values">
              <button role="radio" aria-checked={!mcap} onClick={() => setMcap(false)}>Price</button><span>/</span>
              <button role="radio" aria-checked={mcap} onClick={() => setMcap(true)} disabled={!m.supply}>MCap</button>
            </div>
          </>
        )}
        <span className="tb-sep" />
        <button className="tb-btn" onClick={undo} disabled={!coinLines.length} aria-label="Undo drawing" title="Undo"><IcoUndo s={20} /></button>
        <button className="tb-btn" onClick={redoIt} disabled={!redo.length} aria-label="Redo drawing" title="Redo"><IcoRedo s={20} /></button>
        <span className="tb-sep" />
        <Menu label={<>Chart<IcoCaretDown s={14} /></>} className="tb-btn--txt tb-btn--strong" title="Chart options">
          {(close) => (
            <>
              <button role="menuitemcheckbox" aria-checked={grid} onClick={() => setGrid(!grid)}>Grid lines</button>
              <button role="menuitemcheckbox" aria-checked={inds.includes('vol')} onClick={() => setInds((x) => (x.includes('vol') ? x.filter((y) => y !== 'vol') : [...x, 'vol']))}>Volume</button>
              <button role="menuitemcheckbox" aria-checked={panelOpen} onClick={onTogglePanel}>Positions panel</button>
              <button role="menuitem" onClick={() => { chart.current?.timeScale().fitContent(); close() }}>Fit all data</button>
            </>
          )}
        </Menu>
        <span className="cp__bar-gap" />
        <button className="tb-btn" onClick={onSearch} aria-label="Search markets" title="Search markets (/)"><IcoSearch s={20} /></button>
        <Menu label={<IcoGear s={20} />} title="Settings">
          {() => (
            <>
              <button role="menuitemradio" aria-checked={scale === 'normal'} onClick={() => setScale('normal')}>Linear scale</button>
              <button role="menuitemradio" aria-checked={scale === 'log'} onClick={() => setScale('log')}>Log scale</button>
              <button role="menuitemradio" aria-checked={scale === 'pct'} onClick={() => setScale('pct')}>Percent scale</button>
              <button role="menuitemcheckbox" aria-checked={magnet} onClick={() => setMagnet(!magnet)}>Magnet crosshair</button>
            </>
          )}
        </Menu>
        <button className="tb-btn" onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen chart'} title={full ? 'Exit full screen' : 'Full screen'}>{full ? <IcoCornersIn s={20} /> : <IcoCornersOut s={20} />}</button>
        <button className="tb-btn" onClick={snap} aria-label="Save chart snapshot" title="Save snapshot (PNG)"><IcoCamera s={20} /></button>
      </div>

      <div className="cp__body">
        <div className="cp__rail" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
          {rail.map((t) => (
            <button key={t.k} className="rail-btn" aria-label={t.label} title={t.label} aria-pressed={t.on ?? undefined} onClick={t.act} disabled={t.disabled}>{t.icon}</button>
          ))}
        </div>
        <div className={`cp__chart${tool === 'hline' ? ' is-drawing' : ''}`}>
          <div className="cp__legend num">
            <b>{m.base}-USDC</b><i>·</i><b>{iv}</b><i>·</i>
            {lb && (['O', 'H', 'L', 'C'] as const).map((k) => (
              <span key={k}>{k} <em className={lup ? 'up' : 'down'}>{fmt((k === 'O' ? lb.open : k === 'H' ? lb.high : k === 'L' ? lb.low : lb.close) * mul, mcap ? 0 : d)}</em></span>
            ))}
            {inds.filter((x) => x !== 'vol').map((k) => <span key={k} style={{ color: IND[k].color }}>{IND[k].label}</span>)}
          </div>
          {tool === 'hline' && <div className="cp__hint" role="status">Click the chart to place a horizontal line · Esc to cancel</div>}
          {loading && <div className="cp__loading" aria-hidden><span className="sk" /></div>}
          <div className="cp__canvas" ref={box} />
        </div>
      </div>

      <div className="cp__foot">
        <div className="cp__ranges" role="radiogroup" aria-label="Range">
          {RANGES.map((r) => <button key={r.k} role="radio" aria-checked={range === r.k} onClick={() => pickRange(r.k)}>{r.k}</button>)}
        </div>
        <span className="tb-sep" />
        <button className="tb-btn" onClick={() => chart.current?.timeScale().scrollToRealTime()} aria-label="Jump to latest bar" title="Jump to latest"><IcoCalendar s={16} /></button>
        <span className="cp__bar-gap" />
        <span className="cp__clock num">{clock.toISOString().slice(11, 19)} (UTC)</span>
        <span className="tb-sep" />
        <button className="cp__flag" aria-pressed={scale === 'pct'} onClick={() => setScale(scale === 'pct' ? 'normal' : 'pct')} title="Percent scale">%</button>
        <button className="cp__flag" aria-pressed={scale === 'log'} onClick={() => setScale(scale === 'log' ? 'normal' : 'log')} title="Log scale">log</button>
        <button className="cp__flag" aria-pressed={auto} onClick={() => setAuto(!auto)} title="Auto-fit price scale">auto</button>
        <button className="cp__panel" aria-pressed={panelOpen} onClick={onTogglePanel} aria-label={panelOpen ? 'Hide positions panel' : 'Show positions panel'} title="Positions panel"><IcoPanel s={16} /></button>
      </div>
    </section>
  )
}

