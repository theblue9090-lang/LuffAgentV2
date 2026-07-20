import { useEffect, useState } from "react";
import { useStandardSignAndSendTransaction } from "@privy-io/react-auth/solana";
import type { Asset } from "../lib/wallet";
import {
  jupiterQuote,
  jupiterSwapTx,
  pumpPortalTradeTx,
  submitTx,
  SOL_MINT,
  solscanTx,
} from "../lib/txn";

const PERCENTS = [25, 50, 100];

// Sell a single SPL token straight to SOL from the Portfolio. Liquid /
// graduated tokens route through Jupiter (best price); brand-new pump.fun
// bonding-curve coins fall back to PumpPortal. Works with the embedded wallet
// (auto-approve) or an external wallet like Phantom (confirms each trade).
export default function SellModal({
  asset,
  wallet,
  swallet,
  onClose,
  onDone,
}: {
  asset: Asset;
  wallet: string;
  swallet: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const { signAndSendTransaction } = useStandardSignAndSendTransaction();
  const [pct, setPct] = useState(100);
  const [custom, setCustom] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [solOut, setSolOut] = useState<number | null>(null);
  const [noJup, setNoJup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok?: boolean; msg: string; sig?: string } | null>(null);

  const balance = asset.amount || 0;
  const sellAmt = custom !== "" ? parseFloat(custom) || 0 : (balance * pct) / 100;
  const valid = sellAmt > 0 && sellAmt <= balance + 1e-9;

  // Live Jupiter quote (token → SOL), debounced.
  useEffect(() => {
    setSolOut(null);
    setNoJup(false);
    if (!valid) return;
    let cancelled = false;
    setQuoting(true);
    const id = setTimeout(async () => {
      const raw = BigInt(Math.round(sellAmt * Math.pow(10, asset.decimals))).toString();
      const q = await jupiterQuote(asset.mint, SOL_MINT, raw, 150);
      if (cancelled) return;
      setQuoting(false);
      if (q) setSolOut(Number(q.outAmount) / 1e9);
      else setNoJup(true);
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [asset.mint, asset.decimals, sellAmt, valid]);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const raw = BigInt(Math.round(sellAmt * Math.pow(10, asset.decimals))).toString();
      // 1) Jupiter — liquid + graduated tokens, best price.
      const q = await jupiterQuote(asset.mint, SOL_MINT, raw, 150);
      let tx = q ? await jupiterSwapTx(q, wallet) : null;
      // 2) Fallback — pump.fun bonding curve / migrated pool.
      if (!tx) {
        tx = await pumpPortalTradeTx({
          wallet,
          mint: asset.mint,
          action: "sell",
          amount: pct === 100 && custom === "" ? "100%" : sellAmt,
          denominatedInSol: false,
          slippage: 15,
          priorityFee: 0.0003,
          pool: "auto",
        });
      }
      if (!tx) throw new Error("No sell route found for this token");
      const sig = await submitTx(signAndSendTransaction, swallet, tx);
      setStatus({ ok: true, msg: `Sold ${asset.symbol} for SOL`, sig: sig || undefined });
      onDone();
    } catch (e: any) {
      setStatus({ ok: false, msg: e?.message ? String(e.message).slice(0, 140) : "Sell failed or cancelled" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" style={{ width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong style={{ fontSize: "1.15rem", fontFamily: "var(--font-display)" }}>Sell {asset.symbol}</strong>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="wa-note">
          Sell {asset.symbol} for SOL — routed via Jupiter, or pump.fun for brand-new bonding-curve coins.
        </p>

        <label className="wa-label">
          Amount to sell{" "}
          <span className="hint" style={{ color: "var(--text-mute)" }}>
            bal {balance.toLocaleString("en-US", { maximumFractionDigits: 6 })}
          </span>
        </label>
        <div className="sell-pct-row">
          {PERCENTS.map((p) => (
            <div
              key={p}
              className={`chip ${custom === "" && pct === p ? "active" : ""}`}
              onClick={() => {
                setPct(p);
                setCustom("");
              }}
            >
              {p === 100 ? "MAX" : `${p}%`}
            </div>
          ))}
        </div>
        <input
          className="input"
          type="number"
          placeholder="Custom amount (optional)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ marginTop: 10 }}
        />
        {custom !== "" && !valid && <div className="wa-err">Enter an amount up to your balance.</div>}

        <div className="wa-quote">
          {!valid ? (
            <span style={{ color: "var(--text-mute)" }}>Choose an amount to sell</span>
          ) : quoting ? (
            <span style={{ color: "var(--text-mute)" }}>Fetching best price…</span>
          ) : solOut !== null ? (
            <>
              You receive ≈ <b>{solOut.toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL</b>
            </>
          ) : noJup ? (
            <span style={{ color: "var(--text-mute)" }}>Routes via pump.fun bonding curve</span>
          ) : null}
        </div>

        {status && (
          <div className={`wa-status ${status.ok ? "ok" : "bad"}`}>
            {status.ok ? "✓ " : "✕ "}
            {status.msg}
            {status.sig && (
              <>
                {" "}
                <a href={solscanTx(status.sig)} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                  view
                </a>
              </>
            )}
          </div>
        )}

        <button className="btn btn-danger btn-block" style={{ marginTop: 14 }} disabled={!valid || busy} onClick={submit}>
          {busy ? "Confirm in wallet…" : `Sell ${asset.symbol}`}
        </button>
        <p className="wa-warn">15% max slippage. Prices move fast on new tokens.</p>
      </div>
    </div>
  );
}
