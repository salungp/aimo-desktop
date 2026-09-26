import type { Asset, Outcome } from './market'

// Offline fallback, values taken from the Figma frame. Replaced by live data as soon as APIs answer.
const A = (coin: string, price: number, chg: number, vol24: number, maxLev: number, listIndex: number): Asset =>
  ({ coin, price, prevDay: price / (1 + chg / 100), vol24, maxLev, spark: [], listIndex })

export const SNAPSHOT_ASSETS: Asset[] = [
  A('BTC', 120667, 0.43, 3.1e9, 40, 0), A('ETH', 4420, 1.8, 1.9e9, 25, 1), A('SOL', 240.38, 6.9, 6.2e8, 20, 5),
  A('SEI', 0.34, 1.44, 4.1e7, 10, 60), A('RENDER', 3.61, 5.4, 2.2e7, 10, 70), A('kPEPE', 0.0115, -1.2, 9.4e7, 10, 40),
  A('DOGE', 0.268, 2.15, 2.4e8, 10, 12), A('LINK', 23.4, 1.44, 8.8e7, 10, 16), A('ADA', 0.89, -0.5, 6.1e7, 10, 50),
  A('XRP', 3.02, 1.1, 2.6e8, 20, 30), A('BNB', 862.5, -0.85, 4.4e7, 10, 7), A('VIRTUAL', 2.47, 14.8, 5.3e7, 5, 190),
  A('LDO', 1.29, -8.4, 3.1e7, 10, 191), A('MORPHO', 1.38, 3.9, 1.2e7, 5, 192),
]

const PM = 'https://polymarket.com'
const O = (id: string, title: string, category: string, volume: number, rows: [string, number][], kind: Outcome['kind'] = 'multi'): Outcome =>
  ({ id, source: 'polymarket', title, category, volume, url: PM, kind, rows: rows.map(([label, p]) => ({ label, p })) })
const H = (id: string, underlying: string, target: number, period: string, p: number, mins: number): Outcome =>
  ({ id, source: 'hyperliquid', title: `${underlying} above $${target.toLocaleString('en-US')} · ${period}`, underlying, category: 'Crypto', volume: 0,
     url: 'https://app.hyperliquid.xyz/trade', kind: 'binary', rows: [{ label: 'Yes', p }], expiry: Date.now() + mins * 60_000 })

export const SNAPSHOT_OUTCOMES: Outcome[] = [
  O('s1', 'Balance of Power: 2026 Midterms', 'Politics', 32.5e6, [['D Senate, D House', 0.45], ['R Senate, D House', 0.32]]),
  O('s2', 'Team Spirit vs Aurora Gaming', 'Esports', 2.1e6, [['Team Spirit', 0.79], ['Aurora', 0.22]], 'versus'),
  O('s3', 'Will Solana (SOL) hit $250 before the end of Q4 2026?', 'Crypto', 8.4e6, [['↑ 250', 0.45], ['↓ 200', 0.32]]),
  O('s4', 'US-Iran ceasefire continues through...?', 'Iran', 12.2e6, [['September 30', 0.45], ['October 31', 0.32]]),
  O('s5', 'NATO x Russia military clash by...?', 'Geopolitics', 5.7e6, [['December 31', 0.12], ['June 30, 2027', 0.09]]),
  O('s6', 'What price will Bitcoin hit in September?', 'Crypto', 32.5e6, [['↑ 100,000', 0.45], ['↓ 90,000', 0.32]]),
  O('s7', 'UEFA Champions League: 2027 Champion', 'Sports', 32.5e6, [['Barcelona', 0.45], ['Bayern Munich', 0.32]]),
  O('s8', 'Fed decision in October?', 'Economy', 18.9e6, [['25 bps decrease', 0.71], ['No change', 0.27]]),
  O('s9', 'US announces diesel export ban by...?', 'Economy', 3.3e6, [['October 31', 0.18], ['December 31', 0.27]]),
  O('s10', 'Bitcoin Up or Down — 5 minutes', 'Crypto', 1.2e6, [['Up', 0.5]], 'binary'),
  O('s11', 'Will OpenAI release GPT-6 in 2026?', 'Tech', 4.8e6, [['Yes', 0.31]], 'binary'),
  O('s12', 'Highest temperature in NYC today?', 'Weather', 0.6e6, [['72–73°F', 0.41], ['74–75°F', 0.33]]),
  O('s13', 'S&P 500 above 7,000 on Friday?', 'Finance', 2.2e6, [['Yes', 0.62]], 'binary'),
  O('s14', 'Taylor Swift album announced by...?', 'Culture', 1.4e6, [['October 31', 0.22], ['December 31', 0.48]]),
  O('s15', 'Ukraine x Russia ceasefire in 2026?', 'World', 21.6e6, [['Yes', 0.19]], 'binary'),
  O('s16', 'Lakers vs Celtics', 'Sports', 0.9e6, [['Lakers', 0.46], ['Celtics', 0.55]], 'versus'),
  H('h1', 'BTC', 120500, '1h', 0.58, 42), H('h2', 'BTC', 121000, 'daily', 0.41, 610), H('h3', 'HYPE', 48, 'daily', 0.52, 610),
]

// Offline/demo only: fuller market lists for the details page (live mode loads these from Polymarket).
export const SNAPSHOT_EXTRA: Record<string, [string, number, number][]> = {
  s6: [['↑ 100,000', 0.45, 4.2e6], ['↓ 90,000', 0.32, 3.1e6], ['↑ 110,000', 0.18, 2.4e6], ['↓ 80,000', 0.09, 1.6e6], ['↑ 120,000', 0.05, 1.1e6]],
  s1: [['D Senate, D House', 0.45, 9.8e6], ['R Senate, D House', 0.32, 7.7e6], ['R Senate, R House', 0.17, 6.1e6], ['D Senate, R House', 0.06, 2.2e6]],
  s7: [['Barcelona', 0.45, 5.1e6], ['Bayern Munich', 0.32, 4.4e6], ['Real Madrid', 0.12, 3.9e6], ['Arsenal', 0.08, 2.8e6], ['PSG', 0.03, 1.9e6]],
}
