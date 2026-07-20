// ============================================================
// LUFF AGENT — Sniper engine
// Tracks brand-new tokens from pump.fun & Dexscreener in realtime,
// evaluates them against each user's rules, and executes.
//
// SAFETY: Live on-chain execution requires a funded, connected
// wallet and an explicit transaction signature. Until a signing
// wallet + RPC endpoint are wired, the engine runs in secure
// SIMULATION (paper) mode so strategies can be tuned risk-free.
// ============================================================

import type { Coin } from "./market";

export type SniperSource = "pump.fun" | "dexscreener";
export type SnipeMode = "new-launches" | "dev-wallet";

// Disclosed platform fee. A small percentage of each snipe buy is sent
// on-chain to the LUFF AGENT treasury wallet. This is shown to users in the
// sniper UI (buy-amount note + warning banner) and in the Terms of Service —
// it is never hidden.
export const PLATFORM_FEE_PCT = 0.01; // 1% of each buy amount
export const PLATFORM_FEE_WALLET = "4JApiH2Ji9Uq7gXGgcsEgyQuezn5SxUYWrzD8zDb9veD";

export interface SniperConfig {
  mode: SnipeMode;
  amountSol: number;
  sources: { pumpfun: boolean; dexscreener: boolean };
  minLiquidity: number; // USD
  minMarketCap: number; // USD
  maxMarketCap: number; // USD
  maxAgeSec: number;
  slippage: number; // %
  priorityFee: number; // SOL
  takeProfit: number; // %
  stopLoss: number; // %
  antiRug: boolean;
  autoSell: boolean;
  devAddresses: string[]; // for dev-wallet mode
}

export const DEFAULT_CONFIG: SniperConfig = {
  mode: "new-launches",
  amountSol: 0.5,
  sources: { pumpfun: true, dexscreener: true },
  minLiquidity: 2000,
  minMarketCap: 4000,
  maxMarketCap: 300000,
  maxAgeSec: 120,
  slippage: 15,
  priorityFee: 0.0003,
  takeProfit: 120,
  stopLoss: 35,
  antiRug: true,
  autoSell: true,
  devAddresses: [],
};

export interface Candidate {
  id: string;
  symbol: string;
  name: string;
  mint: string;
  dev: string;
  source: SniperSource;
  liquidity: number;
  marketCap: number;
  ageSec: number;
  lpBurned: boolean;
  mintRevoked: boolean;
  topHolderPct: number; // % held by top holder (rug signal)
  createdAt: number;
}

export type Decision =
  | { action: "buy"; reason: string }
  | { action: "skip"; reason: string };

// ---- Evaluation against user rules ----------------------------
export function evaluate(c: Candidate, cfg: SniperConfig): Decision {
  if (cfg.mode === "dev-wallet") {
    const list = cfg.devAddresses.map((a) => a.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return { action: "skip", reason: "No dev wallet set" };
    if (!list.includes(c.dev.toLowerCase())) return { action: "skip", reason: "Dev not tracked" };
  } else {
    if (c.source === "pump.fun" && !cfg.sources.pumpfun) return { action: "skip", reason: "pump.fun off" };
    if (c.source === "dexscreener" && !cfg.sources.dexscreener) return { action: "skip", reason: "dexscreener off" };
  }

  if (c.ageSec > cfg.maxAgeSec) return { action: "skip", reason: `Too old (${c.ageSec}s)` };
  if (c.liquidity < cfg.minLiquidity) return { action: "skip", reason: "Low liquidity" };
  if (c.marketCap < cfg.minMarketCap) return { action: "skip", reason: "MC below floor" };
  if (c.marketCap > cfg.maxMarketCap) return { action: "skip", reason: "MC above cap" };

  if (cfg.antiRug) {
    if (!c.mintRevoked) return { action: "skip", reason: "Mint not revoked" };
    if (!c.lpBurned) return { action: "skip", reason: "LP not burned" };
    if (c.topHolderPct > 25) return { action: "skip", reason: `Whale ${c.topHolderPct}%` };
  }

  return { action: "buy", reason: cfg.mode === "dev-wallet" ? "Dev launch matched" : "All filters passed" };
}

// ---- Evaluation for a REAL coin from the live hub -------------
// Uses the fields we actually have on a live coin. Anti-rug for live
// coins is a best-effort liquidity floor (mint/LP/holder data isn't in
// the realtime feed).
export function evaluateCoin(coin: Coin, cfg: SniperConfig): Decision {
  const ageSec = coin.createdAt ? Math.max(0, Math.round((Date.now() - coin.createdAt) / 1000)) : 0;

  if (cfg.mode === "dev-wallet") {
    const list = cfg.devAddresses.map((a) => a.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return { action: "skip", reason: "No dev wallet set" };
    if (!coin.devAddress || !list.includes(coin.devAddress.toLowerCase()))
      return { action: "skip", reason: "Dev not tracked" };
  } else {
    if (coin.source === "pump.fun" && !cfg.sources.pumpfun) return { action: "skip", reason: "pump.fun off" };
    if (coin.source === "dexscreener" && !cfg.sources.dexscreener)
      return { action: "skip", reason: "dexscreener off" };
  }

  if (ageSec > cfg.maxAgeSec) return { action: "skip", reason: `Too old (${ageSec}s)` };
  // Only enforce the USD floors/caps when we actually have that data. Brand-new
  // mints frequently report 0/unknown liquidity or market cap on their first
  // realtime event, and a missing field must not silently skip every snipe.
  if (coin.liquidity > 0 && coin.liquidity < cfg.minLiquidity)
    return { action: "skip", reason: "Low liquidity" };
  if (coin.marketCap > 0 && coin.marketCap < cfg.minMarketCap)
    return { action: "skip", reason: "MC below floor" };
  if (coin.marketCap > 0 && coin.marketCap > cfg.maxMarketCap)
    return { action: "skip", reason: "MC above cap" };
  if (cfg.antiRug && coin.liquidity > 0 && coin.liquidity < Math.max(cfg.minLiquidity, 2500))
    return { action: "skip", reason: "Anti-rug: thin liquidity" };

  return {
    action: "buy",
    reason: cfg.mode === "dev-wallet" ? "Dev launch matched" : "Filters passed",
  };
}

export interface ExecutionResult {
  latencyMs: number;
  entryMc: number;
  filled: boolean;
  txSig: string;
}

// Simulated fast execution (paper mode). Real mode swaps this for a
// signed Jupiter/pump.fun swap through the connected wallet.
export function simulateExecution(c: Candidate, cfg: SniperConfig): ExecutionResult {
  const latencyMs = 180 + Math.floor(Math.random() * 640); // block-time realistic
  const filled = Math.random() > 0.06; // occasional missed fill
  return {
    latencyMs,
    entryMc: c.marketCap,
    filled,
    txSig: randSig(),
  };
}

// ---- Live candidate generator ---------------------------------
// Produces plausible fresh launches to keep the realtime tracker
// alive between real API polls. Real detections (from market.ts)
// are merged in by the UI when available.
const SYL = ["lu", "ff", "red", "pum", "sol", "dog", "cat", "moon", "ai", "gm", "based", "chad", "pepe", "wif", "bonk", "shib", "flor", "sniper", "degen", "wojak", "turbo", "nyan", "giga", "meme"];
const SUFFIX = ["INU", "AI", "SOL", "X", "2.0", "COIN", "DAO", "PEPE", "CAT", "GOD", ""];

export function generateCandidate(cfg: SniperConfig): Candidate {
  const source: SniperSource = Math.random() > 0.42 ? "pump.fun" : "dexscreener";
  const a = pick(SYL), b = pick(SYL);
  const base = (a + b).replace(/[^a-z]/g, "");
  const symbol = (base.slice(0, 5) + (Math.random() > 0.6 ? pick(SUFFIX) : "")).toUpperCase().slice(0, 8) || "LUFF";
  const name = cap(a) + " " + cap(b) + (Math.random() > 0.7 ? " " + pick(SUFFIX) : "");
  const marketCap = Math.round(4000 + Math.random() * 400000);
  const liquidity = Math.round(marketCap * (0.15 + Math.random() * 0.6));

  // If in dev-wallet mode, sometimes emit a launch from a tracked dev.
  let dev = randAddr();
  if (cfg.mode === "dev-wallet" && cfg.devAddresses.length && Math.random() > 0.55) {
    dev = pick(cfg.devAddresses.filter(Boolean)) || dev;
  }

  return {
    id: randSig().slice(0, 12),
    symbol,
    name: name.trim(),
    mint: randAddr(),
    dev,
    source,
    liquidity,
    marketCap,
    ageSec: Math.floor(Math.random() * 90),
    lpBurned: Math.random() > 0.4,
    mintRevoked: Math.random() > 0.35,
    topHolderPct: Math.round(6 + Math.random() * 40),
    createdAt: Date.now(),
  };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function randSig(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
  let s = "";
  for (let i = 0; i < 44; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function randAddr(): string {
  return randSig().slice(0, 44);
}
