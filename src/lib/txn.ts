// ============================================================
// LUFF AGENT — Solana transaction helpers
// Build native SOL / SPL transfers and Jupiter swaps. These are
// executed (signed) by the user's Privy embedded wallet in the UI.
// ============================================================

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

const RPC =
  (import.meta as any).env?.VITE_SOLANA_RPC || "https://solana-rpc.publicnode.com";

let conn: Connection | null = null;
export function getConnection(): Connection {
  if (!conn) conn = new Connection(RPC, "confirmed");
  return conn;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Native SOL transfer.
export async function buildSolTransfer(from: string, to: string, amountSol: number): Promise<Transaction> {
  const connection = getConnection();
  const fromPk = new PublicKey(from);
  const toPk = new PublicKey(to);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromPk,
      toPubkey: toPk,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPk;
  return tx;
}

// SPL token transfer (classic Token program). Creates the recipient ATA if missing.
export async function buildSplTransfer(
  from: string,
  to: string,
  mint: string,
  amountUi: number,
  decimals: number
): Promise<Transaction> {
  const connection = getConnection();
  const fromPk = new PublicKey(from);
  const toPk = new PublicKey(to);
  const mintPk = new PublicKey(mint);

  const fromAta = await getAssociatedTokenAddress(mintPk, fromPk);
  const toAta = await getAssociatedTokenAddress(mintPk, toPk);
  const tx = new Transaction();

  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    tx.add(createAssociatedTokenAccountInstruction(fromPk, toAta, toPk, mintPk));
  }

  const rawAmount = BigInt(Math.round(amountUi * Math.pow(10, decimals)));
  tx.add(createTransferInstruction(fromAta, toAta, fromPk, rawAmount, [], TOKEN_PROGRAM_ID));

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPk;
  return tx;
}

// ---- Jupiter swap ----
export interface JupQuote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan?: any[];
  [k: string]: any;
}

export async function jupiterQuote(
  inputMint: string,
  outputMint: string,
  rawAmount: string,
  slippageBps: number
): Promise<JupQuote | null> {
  try {
    const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}&onlyDirectRoutes=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    if (j?.error || !j?.outAmount) return null;
    return j as JupQuote;
  } catch {
    return null;
  }
}

export async function jupiterSwapTx(quote: JupQuote, userPublicKey: string): Promise<VersionedTransaction | null> {
  try {
    const res = await fetch("https://quote-api.jup.ag/v6/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j?.swapTransaction) return null;
    return VersionedTransaction.deserialize(b64ToBytes(j.swapTransaction));
  } catch {
    return null;
  }
}

export function solscanTx(sig: string): string {
  return `https://solscan.io/tx/${sig}`;
}
