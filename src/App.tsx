import { useEffect } from 'react'
import { useRoute } from './router'
import { Navbar, Outcomes, Tables, Ticker } from './components/sections'
import { DiscoverRail, FeaturedMarkets } from './components/Discover'
import { Toasts } from './components/primitives'
import { OutcomePage } from './pages/Outcome'
import { MarketPage } from './pages/Market'

export function App() {
  const r = useRoute()
  useEffect(() => {
    document.title = r.page === 'discover' ? 'Aimo — Discover' : r.page === 'market' ? 'Aimo — Market' : 'Aimo — Outcome'
  }, [r.page])
  return (
    <div className="app">
      <Navbar />
      {r.page === 'market' ? (
        <MarketPage source={r.source} id={r.id} m={r.m} side={r.side} />
      ) : r.page === 'outcome' ? (
        <OutcomePage tab={r.tab} src={r.src} focus={r.focus} />
      ) : (
        <main className="main main--discover">
          <FeaturedMarkets />
          <DiscoverRail />
          <Tables />
          <Outcomes />
        </main>
      )}
      <Ticker />
      <Toasts />
    </div>
  )
}
