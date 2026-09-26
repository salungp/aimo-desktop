// Display names for Hyperliquid tickers. Unknown tickers fall back to the ticker itself.
export const NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano',
  AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot', LTC: 'Litecoin', BCH: 'Bitcoin Cash', TRX: 'TRON',
  TON: 'Toncoin', SUI: 'Sui', APT: 'Aptos', ARB: 'Arbitrum', OP: 'Optimism', SEI: 'SEI Network', INJ: 'Injective',
  TIA: 'Celestia', NEAR: 'NEAR Protocol', ATOM: 'Cosmos', FIL: 'Filecoin', HBAR: 'Hedera', XLM: 'Stellar',
  RENDER: 'Render', RNDR: 'Render', PEPE: 'Pepe', kPEPE: 'Pepe', SHIB: 'Shiba Inu', kSHIB: 'Shiba Inu',
  BONK: 'Bonk', kBONK: 'Bonk', WIF: 'dogwifhat', FLOKI: 'Floki', kFLOKI: 'Floki', HYPE: 'Hyperliquid',
  UNI: 'Uniswap', AAVE: 'Aave', LDO: 'Lido DAO', MKR: 'Maker', CRV: 'Curve', PENDLE: 'Pendle', ENA: 'Ethena',
  ONDO: 'Ondo', JUP: 'Jupiter', PYTH: 'Pyth Network', WLD: 'Worldcoin', FET: 'Artificial Superintelligence',
  TAO: 'Bittensor', VIRTUAL: 'Virtuals Protocol', MORPHO: 'Morpho', EIGEN: 'EigenLayer', ZRO: 'LayerZero',
  STRK: 'Starknet', IMX: 'Immutable', GALA: 'Gala', SAND: 'The Sandbox', ETC: 'Ethereum Classic',
  POL: 'Polygon', MATIC: 'Polygon', ALGO: 'Algorand', STX: 'Stacks', KAS: 'Kaspa', TRUMP: 'Official Trump',
  FARTCOIN: 'Fartcoin', POPCAT: 'Popcat', BERA: 'Berachain', S: 'Sonic', KAITO: 'Kaito', IP: 'Story',
  MOVE: 'Movement', AI16Z: 'ai16z', AIXBT: 'aixbt', PENGU: 'Pudgy Penguins', ME: 'Magic Eden', USUAL: 'Usual',
  HMSTR: 'Hamster Kombat', DYDX: 'dYdX', GMX: 'GMX', SNX: 'Synthetix', COMP: 'Compound', SUSHI: 'Sushi',
  RUNE: 'THORChain', ORDI: 'ORDI', BLUR: 'Blur', MEME: 'Memecoin', NOT: 'Notcoin', ZK: 'ZKsync', W: 'Wormhole',
  ENS: 'ENS', GRT: 'The Graph', XMR: 'Monero', ZEC: 'Zcash', ASTER: 'Aster', PUMP: 'Pump.fun', LINEA: 'Linea',
  WLFI: 'World Liberty', XPL: 'Plasma', MNT: 'Mantle', CAKE: 'PancakeSwap', OM: 'MANTRA', SPX: 'SPX6900',
  MON: 'Monad', ZORA: 'Zora', AVNT: 'Avantis', SKY: 'Sky', HEMI: 'Hemi', '0G': '0G', APEX: 'ApeX',
}

// Home chain badge (Figma "Crypto xs" overlay). Only for tokens that live on these chains.
export const CHAIN: Record<string, 'eth' | 'bnb'> = {
  LINK: 'eth', PEPE: 'eth', kPEPE: 'eth', SHIB: 'eth', kSHIB: 'eth', UNI: 'eth', AAVE: 'eth', LDO: 'eth',
  MKR: 'eth', CRV: 'eth', PENDLE: 'eth', ENA: 'eth', ONDO: 'eth', RENDER: 'eth', RNDR: 'eth', FET: 'eth',
  MORPHO: 'eth', EIGEN: 'eth', ZRO: 'eth', IMX: 'eth', GALA: 'eth', SAND: 'eth', POL: 'eth', MATIC: 'eth',
  COMP: 'eth', SNX: 'eth', ENS: 'eth', GRT: 'eth', BLUR: 'eth', SKY: 'eth', WLFI: 'eth', SPX: 'eth',
  FLOKI: 'eth', kFLOKI: 'eth', MNT: 'eth', VIRTUAL: 'eth', ARB: 'eth', OP: 'eth',
  BNB: 'bnb', CAKE: 'bnb', ASTER: 'bnb',
}

export const displaySym = (coin: string) => coin.replace(/^k(?=[A-Z])/, '')
export const displayName = (coin: string) => NAMES[coin] ?? NAMES[displaySym(coin)] ?? displaySym(coin)
