// ============================================================
// LUFF AGENT — Shared realtime hub
// A single source of truth for realtime new coins + trades, shared by
// the New Launches feed and the Sniper. Keeps ONE WebSocket connection
// (PumpPortal) plus the pump.fun/Dexscreener REST polls, and fans out
// events to all subscribers. Trade subscriptions are the union of the
// coins on screen and the sniper's open positions.
// ============================================================

import type { Coin } from "./market";
import { fetchPumpLatest, fetchNewLaunches, fetchSolPrice, scorePotential } from "./market";
import { subscribeNewTokens, type StreamHandle, type TradeUpdate } from "./pumpstream";

export type { TradeUpdate };

export interface HubSub {
  onCoin?: (c: Coin) => void;
  onTrade?: (t: TradeUpdate) => void;
  onStatus?: (open: boolean) => void;
}

const FAST_MS = 3000;
const FULL_MS = 10000;
const PRICE_MS = 30000;
const MAX_RECENT = 120;
const MAX_WATCH = 45;
const TOP_WATCH = 14;

let refs = 0;
let stream: StreamHandle | null = null;
let fastT: ReturnType<typeof setInterval> | null = null;
let fullT: ReturnType<typeof setInterval> | null = null;
let priceT: ReturnType<typeof setInterval> | null = null;
let open = false;

const subs = new Set<HubSub>();
const recent: Coin[] = [];
let pinned: string[] = []; // sniper open-position mints to keep watching

// ---- live momentum tracking ----------------------------------
// Per-mint aggregation of the realtime trade stream, used to compute each
// coin's live "profit potential" score.
interface Momentum {
  firstMc: number;
  buys: number;
  sells: number;
  buyVol: number; // SOL bought
  sellVol: number; // SOL sold
  firstSeen: number;
  lastReemit: number;
  lastScore: number;
}
const momo = new Map<string, Momentum>();

function initMomo(mint: string, mc: number): Momentum {
  let m = momo.get(mint);
  if (!m) {
    m = { firstMc: mc || 0, buys: 0, sells: 0, buyVol: 0, sellVol: 0, firstSeen: Date.now(), lastReemit: 0, lastScore: 0 };
    momo.set(mint, m);
  } else if (!m.firstMc && mc) {
    m.firstMc = mc;
  }
  return m;
}

// Attach live momentum + a fresh potential score to a coin (immutably).
function withMomentum(coin: Coin): Coin {
  const m = momo.get(coin.id);
  if (!m) return { ...coin, potentialScore: scorePotential(coin) };
  const mcGrowthPct = m.firstMc > 0 && coin.marketCap ? (coin.marketCap / m.firstMc - 1) * 100 : 0;
  const enriched: Coin = {
    ...coin,
    buys: m.buys,
    sells: m.sells,
    netVolSol: m.buyVol - m.sellVol,
    mcGrowthPct,
  };
  enriched.potentialScore = scorePotential(enriched);
  return enriched;
}

function pushRecent(coin: Coin) {
  const i = recent.findIndex((c) => c.id === coin.id);
  if (i >= 0) recent[i] = { ...recent[i], ...coin };
  else recent.unshift(coin);
  recent.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (recent.length > MAX_RECENT) {
    const removed = recent.splice(MAX_RECENT);
    for (const r of removed) if (!pinned.includes(r.id)) momo.delete(r.id); // prune stale momentum
  }
}

function refreshWatch() {
  if (!stream || !open) return;
  const top = recent
    .filter((c) => c.source === "pump.fun")
    .slice(0, TOP_WATCH)
    .map((c) => c.id);
  const union = [...new Set([...pinned, ...top])].slice(0, MAX_WATCH);
  stream.watchTrades(union);
}

function emitCoin(coin: Coin) {
  if (!coin?.id) return;
  initMomo(coin.id, coin.marketCap);
  const enriched = withMomentum(coin);
  pushRecent(enriched);
  subs.forEach((s) => s.onCoin?.(enriched));
  refreshWatch();
}

function emitTrade(t: TradeUpdate) {
  // accumulate live buy/sell momentum for this mint
  const m = initMomo(t.mint, t.marketCap);
  if (t.txType === "buy") {
    m.buys++;
    m.buyVol += t.solAmount || 0;
  } else {
    m.sells++;
    m.sellVol += t.solAmount || 0;
  }

  subs.forEach((s) => s.onTrade?.(t));

  const i = recent.findIndex((c) => c.id === t.mint);
  if (i >= 0) {
    const updated = withMomentum({
      ...recent[i],
      marketCap: t.marketCap,
      liquidity: t.liquidity || recent[i].liquidity,
      bondingProgress: t.bondingProgress,
      isBondingCurve: t.bondingProgress < 100,
    });
    recent[i] = updated;
    // Re-emit the momentum-updated coin only when its potential score actually
    // moves (and at most every 2s per mint) — mc/liquidity/bonding updates ride
    // the lighter onTrade channel, so this avoids a needless render storm.
    const now = Date.now();
    const score = updated.potentialScore || 0;
    if (now - m.lastReemit > 2000 && Math.abs(score - m.lastScore) >= 2) {
      m.lastReemit = now;
      m.lastScore = score;
      subs.forEach((s) => s.onCoin?.(updated));
    }
  }
}

function emitStatus(o: boolean) {
  open = o;
  subs.forEach((s) => s.onStatus?.(o));
  if (o) refreshWatch();
}

async function loadFast() {
  try {
    const d = await fetchPumpLatest(30);
    for (const c of d) emitCoin(c);
  } catch {
    /* ignore */
  }
}
async function loadFull() {
  try {
    const d = await fetchNewLaunches(60);
    for (const c of d) emitCoin(c);
  } catch {
    /* ignore */
  }
}

function start() {
  if (stream) return;
  fetchSolPrice();
  stream = subscribeNewTokens({ onStatus: emitStatus, onToken: emitCoin, onTrade: emitTrade });
  loadFast();
  loadFull();
  fastT = setInterval(loadFast, FAST_MS);
  fullT = setInterval(loadFull, FULL_MS);
  priceT = setInterval(fetchSolPrice, PRICE_MS);
}

function stop() {
  stream?.close();
  stream = null;
  if (fastT) clearInterval(fastT);
  if (fullT) clearInterval(fullT);
  if (priceT) clearInterval(priceT);
  fastT = fullT = priceT = null;
  open = false;
}

export function joinHub(sub: HubSub): () => void {
  subs.add(sub);
  refs++;
  if (refs === 1) start();
  sub.onStatus?.(open);
  return () => {
    subs.delete(sub);
    refs--;
    if (refs <= 0) {
      refs = 0;
      stop();
    }
  };
}

export function getRecentCoins(): Coin[] {
  return [...recent];
}
// Recent coins ranked by live profit-potential score (hottest first).
export function getHotCoins(): Coin[] {
  return [...recent].sort((a, b) => (b.potentialScore || 0) - (a.potentialScore || 0));
}
export function isHubOpen(): boolean {
  return open;
}
// Sniper registers its open-position mints so their trades keep streaming.
export function pinMints(mints: string[]) {
  pinned = [...new Set(mints.filter(Boolean))];
  refreshWatch();
}
