export type AssetType = "crypto" | "stock" | "forex" | "futures" | "commodity";

export interface CoinData {
  symbol: string;
  name: string;
  basePrice: number;
  marketCap: number;
  volume: number;
  logoUrl: string;
  description: string;
  assetType: AssetType;
}

export const COINS: CoinData[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    basePrice: 67500,
    marketCap: 1330000000000,
    volume: 28000000000,
    logoUrl: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    description: "Bitcoin is a decentralized digital currency created in 2009. It is the first and most well-known cryptocurrency, operating without a central authority.",
    assetType: "crypto",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    basePrice: 3520,
    marketCap: 423000000000,
    volume: 15000000000,
    logoUrl: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
    description: "Ethereum is a decentralized platform that enables smart contracts and decentralized applications (DApps) to be built and run without downtime or fraud.",
    assetType: "crypto",
  },
  {
    symbol: "SOL",
    name: "Solana",
    basePrice: 178,
    marketCap: 83000000000,
    volume: 4200000000,
    logoUrl: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
    description: "Solana is a high-performance blockchain supporting fast transactions and low fees, designed for decentralized apps and crypto markets.",
    assetType: "crypto",
  },
  {
    symbol: "BNB",
    name: "BNB",
    basePrice: 598,
    marketCap: 87000000000,
    volume: 1800000000,
    logoUrl: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    description: "BNB is the native token of the BNB Chain ecosystem, used for paying transaction fees and participating in token sales on Binance.",
    assetType: "crypto",
  },
  {
    symbol: "XRP",
    name: "XRP",
    basePrice: 0.62,
    marketCap: 35000000000,
    volume: 1500000000,
    logoUrl: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
    description: "XRP is a digital payment protocol and cryptocurrency designed for fast, low-cost international money transfers between financial institutions.",
    assetType: "crypto",
  },
  {
    symbol: "ADA",
    name: "Cardano",
    basePrice: 0.48,
    marketCap: 17000000000,
    volume: 480000000,
    logoUrl: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
    description: "Cardano is a proof-of-stake blockchain platform designed with security and sustainability in mind, built on peer-reviewed research.",
    assetType: "crypto",
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    basePrice: 38,
    marketCap: 15800000000,
    volume: 420000000,
    logoUrl: "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    description: "Avalanche is a layer one blockchain that functions as a platform for decentralized applications and custom blockchain networks.",
    assetType: "crypto",
  },
  {
    symbol: "DOT",
    name: "Polkadot",
    basePrice: 7.4,
    marketCap: 10500000000,
    volume: 310000000,
    logoUrl: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
    description: "Polkadot is a multi-chain platform that enables different blockchains to transfer messages and value in a trust-free fashion.",
    assetType: "crypto",
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    basePrice: 18.2,
    marketCap: 11200000000,
    volume: 520000000,
    logoUrl: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
    description: "Chainlink is a decentralized oracle network that connects smart contracts with real-world data, APIs, and payment systems.",
    assetType: "crypto",
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    basePrice: 0.165,
    marketCap: 24000000000,
    volume: 1200000000,
    logoUrl: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
    description: "Dogecoin is a cryptocurrency that started as a meme but has grown into a widely-used digital currency with a passionate community.",
    assetType: "crypto",
  },
];

export const STOCKS: CoinData[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    basePrice: 185.5,
    marketCap: 2900000000000,
    volume: 58000000,
    logoUrl: "",
    description: "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.",
    assetType: "stock",
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    basePrice: 200.0,
    marketCap: 638000000000,
    volume: 95000000,
    logoUrl: "",
    description: "Tesla designs and manufactures electric vehicles, battery energy storage, solar panels, and related products and services.",
    assetType: "stock",
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    basePrice: 420.0,
    marketCap: 3120000000000,
    volume: 22000000,
    logoUrl: "",
    description: "Microsoft develops, licenses, and supports software, services, devices, and solutions for individuals and businesses worldwide.",
    assetType: "stock",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    basePrice: 875.0,
    marketCap: 2150000000000,
    volume: 45000000,
    logoUrl: "",
    description: "NVIDIA designs and manufactures graphics processing units (GPUs) and system-on-chip units for gaming, AI, and data centers.",
    assetType: "stock",
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    basePrice: 175.0,
    marketCap: 2180000000000,
    volume: 25000000,
    logoUrl: "",
    description: "Alphabet is the parent company of Google, operating businesses in internet search, advertising, cloud computing, and AI.",
    assetType: "stock",
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    basePrice: 195.0,
    marketCap: 2050000000000,
    volume: 38000000,
    logoUrl: "",
    description: "Amazon is a global e-commerce and cloud computing company, operating the world's largest online marketplace and AWS cloud platform.",
    assetType: "stock",
  },
  {
    symbol: "META",
    name: "Meta Platforms",
    basePrice: 510.0,
    marketCap: 1310000000000,
    volume: 18000000,
    logoUrl: "",
    description: "Meta Platforms operates social media platforms including Facebook, Instagram, and WhatsApp, and is investing heavily in the metaverse.",
    assetType: "stock",
  },
  {
    symbol: "NFLX",
    name: "Netflix Inc.",
    basePrice: 680.0,
    marketCap: 292000000000,
    volume: 5000000,
    logoUrl: "",
    description: "Netflix is a streaming entertainment service offering TV series, films, and games across 190+ countries.",
    assetType: "stock",
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    basePrice: 165.0,
    marketCap: 267000000000,
    volume: 48000000,
    logoUrl: "",
    description: "AMD designs and markets microprocessors, GPUs, and CPUs for PCs, servers, and data centers, competing with Intel and NVIDIA.",
    assetType: "stock",
  },
  {
    symbol: "JPM",
    name: "JPMorgan Chase",
    basePrice: 210.0,
    marketCap: 605000000000,
    volume: 10000000,
    logoUrl: "",
    description: "JPMorgan Chase is the largest U.S. bank by assets, offering investment banking, financial services, and asset management globally.",
    assetType: "stock",
  },
];

export const FOREX: CoinData[] = [
  {
    symbol: "EURUSD",
    name: "EUR/USD",
    basePrice: 1.0850,
    marketCap: 0,
    volume: 760000000000,
    logoUrl: "",
    description: "Euro vs US Dollar — the most traded currency pair in the world, representing the Eurozone and United States economies.",
    assetType: "forex",
  },
  {
    symbol: "GBPUSD",
    name: "GBP/USD",
    basePrice: 1.2750,
    marketCap: 0,
    volume: 422000000000,
    logoUrl: "",
    description: "British Pound vs US Dollar — also called 'Cable', one of the oldest and most widely traded foreign exchange pairs.",
    assetType: "forex",
  },
  {
    symbol: "USDJPY",
    name: "USD/JPY",
    basePrice: 149.50,
    marketCap: 0,
    volume: 577000000000,
    logoUrl: "",
    description: "US Dollar vs Japanese Yen — a major safe-haven pair closely watched during risk-on and risk-off market environments.",
    assetType: "forex",
  },
  {
    symbol: "AUDUSD",
    name: "AUD/USD",
    basePrice: 0.6510,
    marketCap: 0,
    volume: 158000000000,
    logoUrl: "",
    description: "Australian Dollar vs US Dollar — heavily influenced by commodity prices, particularly iron ore and gold.",
    assetType: "forex",
  },
  {
    symbol: "USDCAD",
    name: "USD/CAD",
    basePrice: 1.3620,
    marketCap: 0,
    volume: 123000000000,
    logoUrl: "",
    description: "US Dollar vs Canadian Dollar — closely tied to crude oil prices due to Canada's oil-driven economy.",
    assetType: "forex",
  },
  {
    symbol: "USDCHF",
    name: "USD/CHF",
    basePrice: 0.8970,
    marketCap: 0,
    volume: 113000000000,
    logoUrl: "",
    description: "US Dollar vs Swiss Franc — the Swiss Franc is considered a safe-haven currency, making this pair sensitive to global risk sentiment.",
    assetType: "forex",
  },
  {
    symbol: "NZDUSD",
    name: "NZD/USD",
    basePrice: 0.6080,
    marketCap: 0,
    volume: 69000000000,
    logoUrl: "",
    description: "New Zealand Dollar vs US Dollar — also called the 'Kiwi', influenced by dairy prices and Asia-Pacific trade flows.",
    assetType: "forex",
  },
  {
    symbol: "XAUUSD",
    name: "Gold / USD",
    basePrice: 2350.0,
    marketCap: 0,
    volume: 145000000000,
    logoUrl: "https://assets.coingecko.com/coins/images/944/large/old_xaut_logo.png",
    description: "Gold vs US Dollar — the world's premier safe-haven asset, used as a store of value and hedge against inflation.",
    assetType: "forex",
  },
];

export const FUTURES: CoinData[] = [
  {
    symbol: "BTC-PERP",
    name: "Bitcoin Perpetual",
    basePrice: 67500,
    marketCap: 0,
    volume: 18000000000,
    logoUrl: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    description: "Bitcoin perpetual futures contract — no expiry date, with up to 10x leverage. P&L is magnified by the leverage multiplier.",
    assetType: "futures",
  },
  {
    symbol: "ETH-PERP",
    name: "Ethereum Perpetual",
    basePrice: 3520,
    marketCap: 0,
    volume: 9000000000,
    logoUrl: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
    description: "Ethereum perpetual futures contract — leveraged exposure to ETH price without expiry.",
    assetType: "futures",
  },
  {
    symbol: "SOL-PERP",
    name: "Solana Perpetual",
    basePrice: 178,
    marketCap: 0,
    volume: 2100000000,
    logoUrl: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
    description: "Solana perpetual futures — high-volatility leveraged contract on SOL price movements.",
    assetType: "futures",
  },
  {
    symbol: "BNB-PERP",
    name: "BNB Perpetual",
    basePrice: 598,
    marketCap: 0,
    volume: 900000000,
    logoUrl: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
    description: "BNB perpetual futures — leveraged contract tracking BNB spot price with no expiry.",
    assetType: "futures",
  },
  {
    symbol: "XRP-PERP",
    name: "XRP Perpetual",
    basePrice: 0.62,
    marketCap: 0,
    volume: 780000000,
    logoUrl: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
    description: "XRP perpetual futures — leveraged exposure to XRP price with funding rate mechanics.",
    assetType: "futures",
  },
  {
    symbol: "AVAX-PERP",
    name: "Avalanche Perpetual",
    basePrice: 38,
    marketCap: 0,
    volume: 410000000,
    logoUrl: "https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
    description: "Avalanche perpetual futures — leveraged AVAX contract tracking spot price movements.",
    assetType: "futures",
  },
  {
    symbol: "DOGE-PERP",
    name: "Dogecoin Perpetual",
    basePrice: 0.165,
    marketCap: 0,
    volume: 620000000,
    logoUrl: "https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
    description: "Dogecoin perpetual futures — high-volatility leveraged contract on DOGE.",
    assetType: "futures",
  },
  {
    symbol: "ES-FUT",
    name: "S&P 500 E-mini Futures",
    basePrice: 5615,
    marketCap: 0,
    volume: 1600000,
    logoUrl: "",
    description: "E-mini S&P 500 futures — leveraged exposure to the 500 largest US companies. The most liquid equity index futures contract in the world.",
    assetType: "futures",
  },
  {
    symbol: "NQ-FUT",
    name: "Nasdaq 100 E-mini Futures",
    basePrice: 20350,
    marketCap: 0,
    volume: 620000,
    logoUrl: "",
    description: "E-mini Nasdaq 100 futures — leveraged exposure to the top 100 non-financial Nasdaq companies, dominated by big tech.",
    assetType: "futures",
  },
  {
    symbol: "YM-FUT",
    name: "Dow Jones E-mini Futures",
    basePrice: 40120,
    marketCap: 0,
    volume: 210000,
    logoUrl: "",
    description: "E-mini Dow Jones futures — leveraged exposure to 30 blue-chip US industrial companies.",
    assetType: "futures",
  },
  {
    symbol: "AAPL-FUT",
    name: "Apple Futures",
    basePrice: 186.2,
    marketCap: 0,
    volume: 340000,
    logoUrl: "",
    description: "Apple single-stock futures — leveraged exposure to AAPL share price movements with 10x simulated leverage.",
    assetType: "futures",
  },
  {
    symbol: "TSLA-FUT",
    name: "Tesla Futures",
    basePrice: 201.5,
    marketCap: 0,
    volume: 520000,
    logoUrl: "",
    description: "Tesla single-stock futures — high-volatility leveraged contract on TSLA share price.",
    assetType: "futures",
  },
  {
    symbol: "NVDA-FUT",
    name: "NVIDIA Futures",
    basePrice: 878.0,
    marketCap: 0,
    volume: 410000,
    logoUrl: "",
    description: "NVIDIA single-stock futures — leveraged exposure to NVDA, the leading AI chipmaker.",
    assetType: "futures",
  },
];

export const COMMODITIES: CoinData[] = [
  {
    symbol: "WTI",
    name: "Crude Oil (WTI)",
    basePrice: 82.4,
    marketCap: 0,
    volume: 950000,
    logoUrl: "",
    description: "West Texas Intermediate crude oil — the US benchmark for oil prices, driven by global supply, demand, and geopolitics.",
    assetType: "commodity",
  },
  {
    symbol: "BRENT",
    name: "Brent Crude Oil",
    basePrice: 86.1,
    marketCap: 0,
    volume: 820000,
    logoUrl: "",
    description: "Brent crude oil — the international oil benchmark used to price two-thirds of the world's traded crude.",
    assetType: "commodity",
  },
  {
    symbol: "NATGAS",
    name: "Natural Gas",
    basePrice: 2.85,
    marketCap: 0,
    volume: 480000,
    logoUrl: "",
    description: "Henry Hub natural gas — highly seasonal energy commodity sensitive to weather, storage levels, and LNG exports.",
    assetType: "commodity",
  },
  {
    symbol: "SILVER",
    name: "Silver",
    basePrice: 31.2,
    marketCap: 0,
    volume: 390000,
    logoUrl: "",
    description: "Silver — precious metal with dual roles as a store of value and industrial input for electronics and solar panels.",
    assetType: "commodity",
  },
  {
    symbol: "COPPER",
    name: "Copper",
    basePrice: 4.52,
    marketCap: 0,
    volume: 310000,
    logoUrl: "",
    description: "Copper — 'Dr. Copper' is a bellwether for global economic health, essential for construction, EVs, and the power grid.",
    assetType: "commodity",
  },
  {
    symbol: "PLATINUM",
    name: "Platinum",
    basePrice: 985,
    marketCap: 0,
    volume: 120000,
    logoUrl: "",
    description: "Platinum — rare precious metal used in catalytic converters, jewelry, and industrial applications.",
    assetType: "commodity",
  },
  {
    symbol: "WHEAT",
    name: "Wheat",
    basePrice: 5.92,
    marketCap: 0,
    volume: 260000,
    logoUrl: "",
    description: "Chicago wheat — staple agricultural commodity influenced by weather, harvests, and global food demand.",
    assetType: "commodity",
  },
  {
    symbol: "CORN",
    name: "Corn",
    basePrice: 4.38,
    marketCap: 0,
    volume: 340000,
    logoUrl: "",
    description: "Corn — the most widely grown US crop, used for food, animal feed, and ethanol production.",
    assetType: "commodity",
  },
];

export const ALL_ASSETS: CoinData[] = [...COINS, ...STOCKS, ...FOREX, ...FUTURES, ...COMMODITIES];

const priceCache = new Map<string, { price: number; updatedAt: number }>();

export function getLivePrice(symbol: string, basePrice: number): number {
  const cached = priceCache.get(symbol);
  const now = Date.now();
  if (cached && now - cached.updatedAt < 10000) {
    return cached.price;
  }
  const variation = (Math.random() - 0.5) * 0.02;
  const newPrice = cached
    ? cached.price * (1 + variation)
    : basePrice * (1 + (Math.random() - 0.5) * 0.05);
  priceCache.set(symbol, { price: newPrice, updatedAt: now });
  return newPrice;
}

export function get24hChange(symbol: string): number {
  const seed = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = Math.sin(seed + Math.floor(Date.now() / 3600000)) * 10000;
  return ((rng - Math.floor(rng)) - 0.5) * 16;
}

export function generatePriceHistory(basePrice: number, points = 50): Array<{ timestamp: string; price: number }> {
  const history: Array<{ timestamp: string; price: number }> = [];
  let price = basePrice * (1 + (Math.random() - 0.5) * 0.15);
  const now = Date.now();
  for (let i = points - 1; i >= 0; i--) {
    const timestamp = new Date(now - i * 30 * 60 * 1000).toISOString();
    price = price * (1 + (Math.random() - 0.5) * 0.02);
    history.push({ timestamp, price });
  }
  return history;
}

// ---------------------------------------------------------------------------
// Intraday OHLC candles (simulated). The day-trade bot analyzes these candles
// and the UI renders the SAME series, so entries are cached per symbol: the
// series is regenerated at most once per CANDLE_REFRESH_MS and always anchors
// its final close to the current live price.
// ---------------------------------------------------------------------------
export interface Candle {
  time: string; // ISO timestamp of candle open
  open: number;
  high: number;
  low: number;
  close: number;
}

export const CANDLE_INTERVAL_MINUTES = 5;
export const CANDLE_COUNT = 40;
const CANDLE_REFRESH_MS = 60_000;

const candleCache = new Map<string, { candles: Candle[]; updatedAt: number; anchorClose: number }>();

// Deterministic pseudo-random in [0,1) from a symbol + bucket index, so the
// same candle window renders identically across requests within a refresh.
function seededRand(symbol: string, n: number): number {
  const seed = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const x = Math.sin(seed * 374761 + n * 668265) * 43758.5453;
  return x - Math.floor(x);
}

export function getCandles(symbol: string, basePrice: number): Candle[] {
  const now = Date.now();
  const livePrice = getLivePrice(symbol, basePrice);
  const cached = candleCache.get(symbol);
  // Serve from cache purely on TTL — re-anchoring only on refresh boundaries keeps
  // the series stable for the bot prompt and the UI within each 60s window, even
  // though the underlying live price ticks every ~10s.
  if (cached && now - cached.updatedAt < CANDLE_REFRESH_MS) {
    return cached.candles;
  }

  const intervalMs = CANDLE_INTERVAL_MINUTES * 60 * 1000;
  const lastOpen = Math.floor(now / intervalMs) * intervalMs;

  // Build a random-walk close series backwards from the live price so the
  // most recent candle always closes at what the bot/user sees as "now".
  const closes: number[] = new Array(CANDLE_COUNT);
  closes[CANDLE_COUNT - 1] = livePrice;
  for (let i = CANDLE_COUNT - 2; i >= 0; i--) {
    const bucket = Math.floor((lastOpen - (CANDLE_COUNT - 1 - i) * intervalMs) / intervalMs);
    const drift = (seededRand(symbol, bucket) - 0.5) * 0.012;
    closes[i] = closes[i + 1] / (1 + drift);
  }

  const candles: Candle[] = [];
  for (let i = 0; i < CANDLE_COUNT; i++) {
    const openTime = lastOpen - (CANDLE_COUNT - 1 - i) * intervalMs;
    const bucket = Math.floor(openTime / intervalMs);
    const open = i === 0 ? closes[0] * (1 + (seededRand(symbol, bucket - 1) - 0.5) * 0.006) : closes[i - 1];
    const close = closes[i];
    const wiggleHi = Math.abs(seededRand(symbol, bucket * 2 + 1) - 0.5) * 0.006;
    const wiggleLo = Math.abs(seededRand(symbol, bucket * 3 + 2) - 0.5) * 0.006;
    candles.push({
      time: new Date(openTime).toISOString(),
      open,
      high: Math.max(open, close) * (1 + wiggleHi),
      low: Math.min(open, close) * (1 - wiggleLo),
      close,
    });
  }

  candleCache.set(symbol, { candles, updatedAt: now, anchorClose: livePrice });
  return candles;
}

export function getCoinBySymbol(symbol: string): CoinData | undefined {
  return ALL_ASSETS.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
}

export function getAssetsByType(type: AssetType): CoinData[] {
  return ALL_ASSETS.filter((c) => c.assetType === type);
}
