// ============================================================
// LUFF AGENT — Realtime pump.fun bonding-curve stream
// Subscribes to brand-new token *creation* events over WebSocket
// (PumpPortal `subscribeNewToken`), so freshly launched bonding-curve
// coins appear in the feed the instant they are minted — no polling lag.
// Falls back silently if the socket can't connect (e.g. blocked host).
// ============================================================

import type { Coin } from "./market";
import { cachedSolPrice, GRADUATION_MC_USD, normalizeUri } from "./market";

const WS_URL = "wss://pumpportal.fun/api/data";

export interface StreamHandle {
  close: () => void;
  isOpen: () => boolean;
}

interface Options {
  onToken: (coin: Coin) => void;
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

export function subscribeNewTokens(opts: Options): StreamHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let open = false;
  let retry = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
      try {
        ws?.send(JSON.stringify({ method: "subscribeNewToken" }));
      } catch {
        /* ignore */
      }
    };

    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        // creation events carry txType 'create'; ignore trade/other messages
        if (d?.txType && d.txType !== "create") return;
        if (!d?.mint) return;
        const coin = eventToCoin(d);
        if (!coin) return;
        opts.onToken(coin); // show instantly
        if (d.uri) enqueueEnrich({ uri: d.uri, base: coin, emit: opts.onToken }); // then add logo + socials

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
