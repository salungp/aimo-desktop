import type { Outcome } from '../data/market'
import { usdCompact } from '../format'
import { FireLine } from '../icons'
import { marketHref } from '../router'
import { toast } from './primitives'
import ctaBg from '../assets/outcome/cta-bg.png'
import ctaPhone from '../assets/outcome/cta-phone.png'
import appleMark from '../assets/outcome/appstore-apple.svg'
import appStoreWord from '../assets/outcome/appstore-app.svg'
import downloadWord from '../assets/outcome/appstore-dl.svg'

/* Outcome page right rail (Figma 793:12256): Hot topics · Top movers · App download banner. */

const sk = (k: number, h = 19) => <div key={k} className="rail-sk"><span className="sk" style={{ height: h }} /></div>

export function HotTopics({ items, onExplore }: { items: Outcome[]; onExplore: () => void }) {
  return (
    <section className="rail-sec" aria-labelledby="h-hot">
      <h2 id="h-hot" className="t-20s">Hot topics</h2>
      <ol className="hot">
        {items.length
          ? items.map((o, i) => (
              <li key={o.id}>
                <a className="hot__row" href={marketHref(o)}>
                  <span className="hot__n num">{i + 1}</span>
                  <span className="hot__name" title={o.title}>{o.title}</span>
                  <span className="hot__vol num">{usdCompact(o.vol24 ?? o.volume)}</span>
                  <FireLine width={19} height={19} className="hot__fire" />
                </a>
              </li>
            ))
          : [0, 1, 2, 3, 4].map((k) => sk(k))}
      </ol>
      <button className="rail-btn" onClick={onExplore}>Explore all</button>
    </section>
  )
}

const ACCENT = ['#f6339a', '#ad46ff', '#737373', '#00c950', '#ff6900']

export function TopMovers({ items }: { items: Outcome[] }) {
  return (
    <section className="rail-sec" aria-labelledby="h-movers">
      <h2 id="h-movers" className="t-20s">Top movers</h2>
      <ul className="movers">
        {items.length
          ? items.map((o, i) => {
              const up = (o.change ?? 0) >= 0
              const p = o.rows[0]?.p ?? 0
              return (
                <li key={o.id} className="mover">
                  <a className="mover__name" href={marketHref(o)}>
                    <i style={{ background: ACCENT[i % ACCENT.length] }} />
                    <span>{o.title}</span>
                  </a>
                  <a className={`mover__side ${up ? 'is-yes' : 'is-no'}`} href={marketHref(o, { side: up ? 'yes' : 'no' })}
                    aria-label={`${up ? 'Yes' : 'No'} is moving${o.change ? ` ${(Math.abs(o.change) * 100).toFixed(0)} points today` : ''}`}
                    title={o.change ? `${up ? '+' : '−'}${(Math.abs(o.change) * 100).toFixed(1)} pts in 24h` : undefined}>
                    {up ? 'Yes' : 'No'}
                  </a>
                  <span className="mover__p num" aria-label={`Yes at ${Math.round(p * 100)}%`}>{Math.round(p * 100)}%</span>
                </li>
              )
            })
          : [0, 1, 2, 3, 4].map((k) => sk(k, 38))}
      </ul>
    </section>
  )
}

export function AppCta() {
  return (
    <aside className="app-cta" aria-label="Download the Aimo app">
      <img className="app-cta__pattern" src={ctaBg} alt="" width={296} height={150} />
      <div className="app-cta__copy">
        <p className="app-cta__kicker">Download the App</p>
        <p className="app-cta__title">Everything you trade. One place to hold it.</p>
      </div>
      <button className="app-store" onClick={() => toast('App Store link — coming soon')} aria-label="Download on the App Store">
        <img src={appleMark} alt="" className="app-store__apple" />
        <img src={downloadWord} alt="" className="app-store__dl" />
        <img src={appStoreWord} alt="" className="app-store__word" />
      </button>
      <img className="app-cta__phone" src={ctaPhone} alt="" width={103} height={136} />
    </aside>
  )
}
