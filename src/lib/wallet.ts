// ============================================================
// LUFF AGENT — Read a user's real Solana wallet assets
// SOL balance + SPL token holdings via public RPC, priced with
// Dexscreener. No demo data — only what's actually in the wallet.
// ============================================================

import { fetchSolPrice, fetchTokenMeta } from "./market";

const RPC_ENDPOINTS: string[] = [
  (import.meta as any).env?.VITE_SOLANA_RPC,
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface Asset {
  mint: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  amount: number;
  decimals: number;
  priceUsd: number;
  valueUsd: number;
}

export interface WalletPortfolio {
  address: string;
  solBalance: number;
  solPriceUsd: number;
  holdings: Asset[];
  totalUsd: number;
  ok: boolean;
}

async function rpcCall<T = any>(method: string, params: any[]): Promise<T | null> {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const j = await res.json();
      if (j?.error) continue;
      if (j?.result !== undefined) return j.result as T;
    } catch {
      /* try next endpoint */
    }
  }
  return null;
}

async function getTokenAccounts(
  address: string,
  programId: string
): Promise<{ mint: string; amount: number; decimals: number }[]> {
  const res = await rpcCall<any>("getTokenAccountsByOwner", [
    address,
    { programId },
    { encoding: "jsonParsed" },
  ]);
  const list = res?.value || [];
  return list
    .map((a: any) => {
      const info = a?.account?.data?.parsed?.info;
      return {
        mint: info?.mint as string,
        amount: Number(info?.tokenAmount?.uiAmount) || 0,
        decimals: Number(info?.tokenAmount?.decimals) || 0,
      };
    })
    .filter((t: any) => t.mint && t.amount > 0);
}

// Current SOL balance of a wallet (used by the live sniper to keep going
// until funds run out).
export async function fetchSolBalance(address: string): Promise<number> {
  const r = await rpcCall<any>("getBalance", [address]);
  return r?.value ? Number(r.value) / 1e9 : 0;
}

export async function fetchWalletPortfolio(address: string): Promise<WalletPortfolio> {
  const [balRes, solPrice, classic, t2022] = await Promise.all([
    rpcCall<any>("getBalance", [address]),
    fetchSolPrice(),
    getTokenAccounts(address, TOKEN_PROGRAM),
    getTokenAccounts(address, TOKEN_2022),
  ]);

  // If the balance RPC and both token queries all failed, report not-ok.
  const rpcOk = balRes !== null || classic.length > 0 || t2022.length > 0;

  const solBalance = balRes?.value ? Number(balRes.value) / 1e9 : 0;
  const tokens = [...classic, ...t2022];
  const meta = await fetchTokenMeta(tokens.map((t) => t.mint));

  const holdings: Asset[] = [];
  if (solBalance > 0) {
    holdings.push({
      mint: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      name: "Solana",
      amount: solBalance,
      decimals: 9,
      priceUsd: solPrice,
      valueUsd: solBalance * solPrice,
    });
  }
  for (const t of tokens) {
    const m = meta.get(t.mint);
    const price = m?.priceUsd || 0;
    holdings.push({
      mint: t.mint,
      symbol: m?.symbol || t.mint.slice(0, 4).toUpperCase(),
      name: m?.name || "Unknown token",
      imageUrl: m?.imageUrl,
      amount: t.amount,
      decimals: t.decimals,
      priceUsd: price,
      valueUsd: t.amount * price,
    });
  }

  holdings.sort((a, b) => b.valueUsd - a.valueUsd);
  const totalUsd = holdings.reduce((s, h) => s + h.valueUsd, 0);

  return { address, solBalance, solPriceUsd: solPrice, holdings, totalUsd, ok: rpcOk };
}
