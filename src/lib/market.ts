// ============================================================
// LUFF AGENT — Live market data engine
// Real data from Dexscreener (CORS-enabled public API) and
// pump.fun, with graceful fallbacks so the UI always stays alive.
// ============================================================

export type CoinSource = "pump.fun" | "dexscreener";

export interface Coin {
  id: string;
  address: string;
  pairAddress?: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change5m?: number;
  change1h?: number;
  change6h?: number;
  change24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  fdv?: number;
  imageUrl?: string;
  source: CoinSource;
  dexId?: string;
  chainId: string;
  url?: string;
  createdAt?: number;
  txns24h?: number;
  devAddress?: string;
}

const DS = "https://api.dexscreener.com";

// Curated set of liquid Solana majors / blue-chip memes for the "Top" board.
const TOP_MINTS: string[] = [
  "So11111111111111111111111111111111111111112", // SOL
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
  "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv", // PENGU
  "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump", // FARTCOIN
  "2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump", // PNUT
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", // MEW
  "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC", // AI16Z
  "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9", // GIGA
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ7tbGU", // BOME
];

async function getJson<T>(url: string, timeoutMs = 9000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function num(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && !isNaN(n) ? n : 0;
}

// Choose the deepest-liquidity pair for a token and map it to a Coin.
function pairToCoin(pair: any, source: CoinSource): Coin {
  const dexId: string = pair.dexId || "";
  const isPump = dexId.includes("pump") || source === "pump.fun";
  return {
    id: pair.pairAddress || pair.baseToken?.address,
    address: pair.baseToken?.address || "",
    pairAddress: pair.pairAddress,
    symbol: (pair.baseToken?.symbol || "?").toUpperCase(),
    name: pair.baseToken?.name || pair.baseToken?.symbol || "Unknown",
    priceUsd: num(pair.priceUsd),
    change5m: num(pair.priceChange?.m5),
    change1h: num(pair.priceChange?.h1),
    change6h: num(pair.priceChange?.h6),
    change24h: num(pair.priceChange?.h24),
    volume24h: num(pair.volume?.h24),
    liquidity: num(pair.liquidity?.usd),
    marketCap: num(pair.marketCap) || num(pair.fdv),
    fdv: num(pair.fdv),
    imageUrl: pair.info?.imageUrl,
    source: isPump ? "pump.fun" : "dexscreener",
    dexId,
    chainId: pair.chainId || "solana",
    url: pair.url,
    createdAt: pair.pairCreatedAt,
    txns24h: num(pair.txns?.h24?.buys) + num(pair.txns?.h24?.sells),
  };
}

function bestPairPerToken(pairs: any[]): any[] {
  const byToken = new Map<string, any>();
  for (const p of pairs || []) {
    const addr = p.baseToken?.address;
    if (!addr) continue;
    const existing = byToken.get(addr);
    if (!existing || num(p.liquidity?.usd) > num(existing.liquidity?.usd)) {
      byToken.set(addr, p);
    }
  }
  return [...byToken.values()];
}

// ---- TOP COINS -------------------------------------------------
export async function fetchTopCoins(): Promise<Coin[]> {
  const data = await getJson<{ pairs: any[] }>(`${DS}/latest/dex/tokens/${TOP_MINTS.join(",")}`);
  if (!data?.pairs?.length) return SAMPLE_TOP;
  const coins = bestPairPerToken(data.pairs).map((p) => pairToCoin(p, "dexscreener"));
  coins.sort((a, b) => b.volume24h - a.volume24h);
  return coins.slice(0, 12);
}

// ---- MOVERS (boosted / trending) -------------------------------
export async function fetchMovers(): Promise<Coin[]> {
  const boosts = await getJson<any[]>(`${DS}/token-boosts/top/v1`);
  const sol = (boosts || []).filter((b) => b.chainId === "solana").slice(0, 20);
  if (!sol.length) return SAMPLE_MOVERS;
  const addrs = sol.map((b) => b.tokenAddress).slice(0, 20);
  const data = await getJson<{ pairs: any[] }>(`${DS}/latest/dex/tokens/${addrs.join(",")}`);
  if (!data?.pairs?.length) return SAMPLE_MOVERS;
  const coins = bestPairPerToken(data.pairs).map((p) => pairToCoin(p, "dexscreener"));
  // biggest absolute 24h movement first
  coins.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
  return coins.slice(0, 12);
}

// Batch-fetch pair data for many token addresses (Dexscreener caps at 30/req).
async function fetchPairsForAddresses(addresses: string[]): Promise<any[]> {
  const uniq = [...new Set(addresses.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 30) chunks.push(uniq.slice(i, i + 30));
  const results = await Promise.all(
    chunks.map((chunk) => getJson<{ pairs: any[] }>(`${DS}/latest/dex/tokens/${chunk.join(",")}`))
  );
  return results.flatMap((r) => r?.pairs || []);
}

// ---- NEW LAUNCHES (pump.fun + dexscreener latest) --------------
// Pulls the freshest coins from BOTH sources in realtime, deduped and
// sorted newest-first. `limit` controls how many rows we surface.
export async function fetchNewLaunches(limit = 60): Promise<Coin[]> {
  const byId = new Map<string, Coin>();

  // 1) pump.fun freshest coins (may be CORS-blocked on some hosts).
  const pump = await getJson<any[]>(
    "https://frontend-api-v3.pump.fun/coins?offset=0&limit=60&sort=created_timestamp&order=DESC&includeNsfw=false"
  );
  if (Array.isArray(pump)) {
    for (const c of pump) {
      if (!c?.mint) continue;
      const mc = num(c.usd_market_cap) || num(c.market_cap);
      byId.set(c.mint, {
        id: c.mint,
        address: c.mint,
        symbol: (c.symbol || "?").toUpperCase(),
        name: c.name || c.symbol || "New Launch",
        priceUsd: mc && c.total_supply ? mc / (num(c.total_supply) / 1e6) : 0,
        change24h: 0,
        volume24h: 0,
        liquidity: num(c.virtual_sol_reserves) / 1e9 || 0,
        marketCap: mc,
        imageUrl: c.image_uri,
        source: "pump.fun",
        dexId: "pumpfun",
        chainId: "solana",
        url: `https://pump.fun/${c.mint}`,
        createdAt: num(c.created_timestamp),
        devAddress: c.creator,
      });
    }
  }

  // 2) Dexscreener newest token profiles (all Solana) + latest boosts.
  const [profiles, boosts] = await Promise.all([
    getJson<any[]>(`${DS}/token-profiles/latest/v1`),
    getJson<any[]>(`${DS}/token-boosts/latest/v1`),
  ]);
  const solAddrs = [
    ...(profiles || []).filter((p) => p.chainId === "solana").map((p) => p.tokenAddress),
    ...(boosts || []).filter((b) => b.chainId === "solana").map((b) => b.tokenAddress),
  ];
  if (solAddrs.length) {
    const pairs = await fetchPairsForAddresses(solAddrs);
    for (const p of bestPairPerToken(pairs)) {
      const coin = pairToCoin(p, p.dexId?.includes("pump") ? "pump.fun" : "dexscreener");
      // don't overwrite a richer pump.fun record with a dex duplicate
      if (!byId.has(coin.address)) byId.set(coin.address, coin);
    }
  }

  const out = [...byId.values()];
  if (!out.length) return SAMPLE_NEW;
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out.slice(0, limit);
}

// ============================================================
// Chart series — reconstruct a realistic 24h path from the known
// price-change anchors, then the chart appends live points.
// ============================================================
export interface Point {
  time: number; // unix seconds
  value: number;
}

export function buildSeries(coin: Coin, points = 96): Point[] {
  const now = Math.floor(Date.now() / 1000);
  const span = 24 * 3600;
  const price = coin.priceUsd || 0.0001;
  const p24 = price / (1 + (coin.change24h || 0) / 100);
  const p6 = price / (1 + (coin.change6h || 0) / 100);
  const p1 = price / (1 + (coin.change1h || 0) / 100);

  // anchor points across the window (fraction of window from start -> price)
  const anchors: [number, number][] = [
    [0, p24],
    [0.75, p6],
    [0.958, p1],
    [1, price],
  ];

  const series: Point[] = [];
  let seed = hashStr(coin.id) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967295;
  };

  for (let i = 0; i < points; i++) {
    const f = i / (points - 1);
    // piecewise-linear interpolation between anchors
    let base = price;
    for (let a = 0; a < anchors.length - 1; a++) {
      const [f0, v0] = anchors[a];
      const [f1, v1] = anchors[a + 1];
      if (f >= f0 && f <= f1) {
        const t = f1 === f0 ? 0 : (f - f0) / (f1 - f0);
        base = v0 + (v1 - v0) * t;
        break;
      }
    }
    // organic noise, decaying toward the present so latest matches price
    const noise = (rand() - 0.5) * base * 0.04 * (1 - f * 0.85);
    let v = base + noise;
    if (i === points - 1) v = price;
    series.push({ time: now - Math.round(span * (1 - f)), value: Math.max(v, base * 0.5) });
  }
  // enforce strictly increasing unique timestamps
  for (let i = 1; i < series.length; i++) {
    if (series[i].time <= series[i - 1].time) series[i].time = series[i - 1].time + 1;
  }
  return series;
}

export function nextLivePrice(last: number, volatility = 0.012): number {
  const drift = (Math.random() - 0.5) * 2 * volatility;
  return Math.max(last * (1 + drift), last * 0.6);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h;
}

// ============================================================
// Fallback samples (used only if the network/API is unavailable)
// ============================================================
function mk(partial: Partial<Coin> & { symbol: string; name: string; priceUsd: number }): Coin {
  return {
    id: partial.symbol + "-sample",
    address: "So1" + partial.symbol + "1111111111111111111111111111111",
    change24h: 0,
    volume24h: 0,
    liquidity: 0,
    marketCap: 0,
    source: "dexscreener",
    chainId: "solana",
    ...partial,
  } as Coin;
}

export const SAMPLE_TOP: Coin[] = [
  mk({ symbol: "SOL", name: "Solana", priceUsd: 168.4, change24h: 4.2, change1h: 0.8, change6h: 2.1, volume24h: 2.1e9, liquidity: 48e6, marketCap: 79e9 }),
  mk({ symbol: "BONK", name: "Bonk", priceUsd: 0.0000232, change24h: -3.1, change1h: -0.4, change6h: -1.2, volume24h: 142e6, liquidity: 22e6, marketCap: 1.7e9 }),
  mk({ symbol: "WIF", name: "dogwifhat", priceUsd: 2.41, change24h: 8.9, change1h: 1.5, change6h: 4.4, volume24h: 310e6, liquidity: 28e6, marketCap: 2.4e9 }),
  mk({ symbol: "JUP", name: "Jupiter", priceUsd: 0.92, change24h: 1.7, change1h: 0.2, change6h: 0.9, volume24h: 88e6, liquidity: 31e6, marketCap: 2.8e9 }),
  mk({ symbol: "POPCAT", name: "Popcat", priceUsd: 0.71, change24h: 12.4, change1h: 2.1, change6h: 6.0, volume24h: 74e6, liquidity: 12e6, marketCap: 700e6 }),
  mk({ symbol: "PENGU", name: "Pudgy Penguins", priceUsd: 0.031, change24h: -5.6, change1h: -1.1, change6h: -2.8, volume24h: 120e6, liquidity: 18e6, marketCap: 1.9e9 }),
  mk({ symbol: "FARTCOIN", name: "Fartcoin", priceUsd: 1.12, change24h: 15.8, change1h: 3.2, change6h: 8.1, volume24h: 210e6, liquidity: 20e6, marketCap: 1.1e9, source: "pump.fun", dexId: "pumpfun" }),
  mk({ symbol: "PNUT", name: "Peanut the Squirrel", priceUsd: 0.34, change24h: -2.2, change1h: 0.5, change6h: -0.9, volume24h: 65e6, liquidity: 9e6, marketCap: 340e6, source: "pump.fun", dexId: "pumpfun" }),
  mk({ symbol: "MEW", name: "cat in a dogs world", priceUsd: 0.0072, change24h: 6.3, change1h: 1.0, change6h: 3.1, volume24h: 41e6, liquidity: 8e6, marketCap: 640e6 }),
];

export const SAMPLE_MOVERS: Coin[] = [
  mk({ symbol: "GIGA", name: "Gigachad", priceUsd: 0.041, change24h: 42.6, change1h: 6.1, change6h: 22.0, volume24h: 58e6, liquidity: 7e6, marketCap: 410e6, source: "pump.fun", dexId: "pumpfun" }),
  mk({ symbol: "MOODENG", name: "Moo Deng", priceUsd: 0.19, change24h: -28.4, change1h: -4.2, change6h: -12.1, volume24h: 33e6, liquidity: 5e6, marketCap: 190e6, source: "pump.fun", dexId: "pumpfun" }),
  mk({ symbol: "AI16Z", name: "ai16z", priceUsd: 0.28, change24h: 33.1, change1h: 5.0, change6h: 18.4, volume24h: 71e6, liquidity: 11e6, marketCap: 310e6 }),
  mk({ symbol: "BOME", name: "Book of Meme", priceUsd: 0.0021, change24h: 24.9, change1h: 3.4, change6h: 12.2, volume24h: 44e6, liquidity: 6e6, marketCap: 150e6 }),
  mk({ symbol: "ZEREBRO", name: "Zerebro", priceUsd: 0.14, change24h: -19.3, change1h: -2.8, change6h: -9.4, volume24h: 27e6, liquidity: 4e6, marketCap: 140e6, source: "pump.fun", dexId: "pumpfun" }),
  mk({ symbol: "GOAT", name: "Goatseus Maximus", priceUsd: 0.52, change24h: 18.7, change1h: 2.6, change6h: 9.9, volume24h: 39e6, liquidity: 8e6, marketCap: 520e6, source: "pump.fun", dexId: "pumpfun" }),
];

export const SAMPLE_NEW: Coin[] = [
  mk({ symbol: "LUFFX", name: "Luff Runner", priceUsd: 0.00042, change24h: 61.0, volume24h: 240e3, liquidity: 34e3, marketCap: 42e3, source: "pump.fun", dexId: "pumpfun", createdAt: Date.now() - 40000, devAddress: "9xQeWv...pump" }),
  mk({ symbol: "REDSHOT", name: "Red Shot", priceUsd: 0.00011, change24h: 12.5, volume24h: 88e3, liquidity: 21e3, marketCap: 18e3, source: "pump.fun", dexId: "pumpfun", createdAt: Date.now() - 120000, devAddress: "Dkp2Lm...pump" }),
  mk({ symbol: "SNIPE", name: "Sniper Coin", priceUsd: 0.00087, change24h: 4.4, volume24h: 61e3, liquidity: 44e3, marketCap: 60e3, source: "dexscreener", createdAt: Date.now() - 300000 }),
];
