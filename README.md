# aimo-desktop

Front-end prototype of **Aimo Desktop Revamp**: Discover (Figma `645:20769`) and Outcome (Figma `653:6580`).

## Routes
| URL hash | Page |
|---|---|
| `#/` | Discover |
| `#/outcome/:category` | Outcome, e.g. `#/outcome/crypto` |
| `?src=hyperliquid\|polymarket` | Source filter (default Unified) |
| `?focus=<eventId>` | Scroll to + highlight a market on Outcome |
| `#/market/pm/<eventId>?m=<marketId\|tokenId>&side=yes\|no` | Market details (Polymarket) |
| `#/market/hl/<outcomeId>?side=yes\|no` | Market details (Hyperliquid HIP-4) |

Every outcome card (title, thumbnail, Yes/No, team buttons) opens its details page with the clicked market + side preselected. Discover "Trending Now → See details" opens details directly.

Discover links into Outcome: navbar tab, "Trending outcome → See more", card category labels, "Trending Now → See details". Back/forward and Discover scroll position are preserved.

## Run
- Instant: open `dist/index.html` (single self-contained file, fonts and art inlined).
- Dev: `npm install && npm run dev`
- Build: `npm run build` (outputs `dist/index.html`)
- Demo feed: add `?mock` to the URL (simulated ticks, no network).

## Data
| Section | Source |
|---|---|
| Market Highlights, ticker | Hyperliquid `allMids` WebSocket (real time) |
| New listings | Newest markets in Hyperliquid perp universe |
| Biggest Move / Movers perps | Largest 24h % move (Hyperliquid, liquid markets) |
| Trending token | Highest 24h volume, ex BTC/ETH/SOL |
| Sparklines | Hyperliquid `candleSnapshot` 1h × 24, last point live |
| Trending outcome, Trending Now | Polymarket Gamma events by 24h volume + CLOB market WebSocket |
| Outcome page, per category | Polymarket Gamma `tag_slug` feeds, 24 per page, infinite scroll |
| Details: event + markets + rules | Polymarket Gamma `events/{id}` |
| Details: chart history | Polymarket CLOB `prices-history` (1H–All) · Hyperliquid `candleSnapshot` on `#<outcome>` |
| Details: live odds | Same CLOB / `allMids` sockets; chart tail and numbers tween on every tick |
| Outcome page, Hyperliquid | HIP-4 `outcomeMeta` (price binaries), YES mid from `l2Book` every 10s |

APIs unreachable → falls back to Figma values; status pill (bottom right) shows `Live`, `Offline snapshot`, or `Demo feed`.

## Notes
- Hero art: Figma uses a WebGPU dither shader. `src/components/Hero.tsx` is a CPU port of the same Bayer 16×16 / 3-level / 2px pass plus the mask gradient.
- Icons, logo, chain badges: exported verbatim from Figma (`src/icons.tsx`).
- Coin logos load from `app.hyperliquid.xyz/coins/*.svg`, monogram fallback.

## If live data stays on "Offline snapshot"
Some APIs reject `file://` pages (origin `null`). Run `npm install && npm run preview` and open the printed localhost URL.
# aimo-desktop
