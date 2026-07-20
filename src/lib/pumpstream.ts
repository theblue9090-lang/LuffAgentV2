// ============================================================
// LUFF AGENT — Realtime pump.fun bonding-curve stream
// Subscribes to brand-new token *creation* events over WebSocket
// (PumpPortal `subscribeNewToken`), so freshly launched bonding-curve
// coins appear in the feed the instant they are minted — no polling lag.
// Also subscribes to *token trades* for the coins on screen, so each
// coin's bonding-curve progress / market cap updates live on every buy
// and sell, exactly like pump.fun.
// Falls back silently if the socket can't connect (e.g. blocked host).
// ============================================================

import type { Coin } from "./market";
import { cachedSolPrice, GRADUATION_MC_USD, normalizeUri } from "./market";

const WS_URL = "wss://pumpportal.fun/api/data";
const MAX_WATCH = 60; // cap live trade subscriptions

export interface TradeUpdate {
  mint: string;
  marketCap: number; // USD
  liquidity: number; // USD
  bondingProgress: number; // % toward graduation
  txType: "buy" | "sell";
  solAmount: number; // SOL traded
}

export interface StreamHandle {
  close: () => void;
  isOpen: () => boolean;
  // Subscribe live trades for this exact set of mints (diffed internally).
  watchTrades: (mints: string[]) => void;
}

interface Options {
  onToken: (coin: Coin) => void;
  onTrade?: (t: TradeUpdate) => void;
  onStatus?: (open: boolean) => void;
}

function num(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && !isNaN(n) ? n : 0;
}

// Map a raw new-token creation event to a Coin.
function eventToCoin(d: any): Coin | null {
  if (!d?.mint) return null;
  const sol = cachedSolPrice() || 170;
  const mcSol = num(d.marketCapSol);
  const mcUsd = mcSol * sol;
  const liqSol = num(d.vSolInBondingCurve) || num(d.solInPool);
  return {
    id: d.mint,
    address: d.mint,
    symbol: (d.symbol || "?").toUpperCase(),
    name: d.name || d.symbol || "New Launch",
    priceUsd: 0,
    change24h: 0,
    volume24h: 0,
    liquidity: liqSol * sol,
    marketCap: mcUsd,
    source: "pump.fun",
    dexId: "pumpfun",
    chainId: "solana",
    url: `https://pump.fun/${d.mint}`,
    createdAt: Date.now(),
    devAddress: d.traderPublicKey || d.creator,
    isBondingCurve: true,
    bondingProgress: Math.min(100, (mcUsd / GRADUATION_MC_USD) * 100),
  };
}

// ---- Metadata enrichment (logo + socials) --------------------
// Freshly created tokens only carry a metadata `uri`; fetch it (light,
// concurrency-capped) to pull the coin's image, X, Telegram & website.
type EnrichJob = { uri: string; base: Coin; emit: (c: Coin) => void };
const enrichQueue: EnrichJob[] = [];
let enrichActive = 0;
const ENRICH_MAX = 5;
const ENRICH_BACKLOG = 60;

function pumpEnrich() {
  while (enrichActive < ENRICH_MAX && enrichQueue.length) {
    const job = enrichQueue.shift()!;
    enrichActive++;
    enrichOne(job).finally(() => {
      enrichActive--;
      pumpEnrich();
    });
  }
}

async function enrichOne(job: EnrichJob) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(normalizeUri(job.uri)!, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return;
    const m = await res.json();
    job.emit({
      ...job.base,
      imageUrl: normalizeUri(m.image) || job.base.imageUrl,
      description: m.description || job.base.description,
      twitter: m.twitter || m.x || job.base.twitter,
      telegram: m.telegram || job.base.telegram,
      website: m.website || job.base.website,
    });
  } catch {
    /* ignore — REST poll will enrich later */
  }
}

function enqueueEnrich(job: EnrichJob) {
  if (!job.uri || enrichQueue.length > ENRICH_BACKLOG) return;
  enrichQueue.push(job);
  pumpEnrich();
}

// Turn a trade event into a live bonding-curve update.
function eventToTrade(d: any): TradeUpdate | null {
  if (!d?.mint) return null;
  const sol = cachedSolPrice() || 170;
  const mcUsd = num(d.marketCapSol) * sol;
  const liqUsd = num(d.vSolInBondingCurve) * sol;
  return {
    mint: d.mint,
    marketCap: mcUsd,
    liquidity: liqUsd,
    bondingProgress: Math.min(100, (mcUsd / GRADUATION_MC_USD) * 100),
    txType: d.txType === "sell" ? "sell" : "buy",
    solAmount: num(d.solAmount),
  };
}

export function subscribeNewTokens(opts: Options): StreamHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let open = false;
  let retry = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let watched = new Set<string>(); // mints with live trade subscriptions

  const send = (obj: any) => {
    try {
      ws?.send(JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  };

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retry = 0;
      open = true;
      opts.onStatus?.(true);
      send({ method: "subscribeNewToken" });
      // re-arm trade subscriptions after a (re)connect
      if (watched.size) send({ method: "subscribeTokenTrade", keys: [...watched] });
    };

    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        if (!d?.mint) return;
        if (d.txType === "create") {
          const coin = eventToCoin(d);
          if (!coin) return;
          opts.onToken(coin); // show instantly
          if (d.uri) enqueueEnrich({ uri: d.uri, base: coin, emit: opts.onToken }); // logo + socials
        } else if (d.txType === "buy" || d.txType === "sell") {
          const t = eventToTrade(d);
          if (t) opts.onTrade?.(t);
        }
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      open = false;
      opts.onStatus?.(false);
      if (!closed) scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    retry = Math.min(retry + 1, 6);
    const delay = Math.min(30000, 1000 * 2 ** retry); // capped exponential backoff
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  connect();

  return {
    isOpen: () => open,
    watchTrades: (mints: string[]) => {
      const next = new Set(mints.filter(Boolean).slice(0, MAX_WATCH));
      const toAdd = [...next].filter((m) => !watched.has(m));
      const toRemove = [...watched].filter((m) => !next.has(m));
      watched = next;
      if (!open) return; // will re-arm on connect
      if (toAdd.length) send({ method: "subscribeTokenTrade", keys: toAdd });
      if (toRemove.length) send({ method: "unsubscribeTokenTrade", keys: toRemove });
    },
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
