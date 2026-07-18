import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useExportWallet, useFundWallet, useStandardSignAndSendTransaction } from "@privy-io/react-auth/solana";
import type { Asset } from "../lib/wallet";
import {
  buildSolTransfer,
  buildSplTransfer,
  base58,
  jupiterQuote,
  jupiterSwapTx,
  serializeTx,
  solscanTx,
  SOL_MINT,
} from "../lib/txn";
import { PublicKey } from "@solana/web3.js";

interface Props {
  wallet: string;
  swallet: any; // ConnectedStandardSolanaWallet (embedded or external, e.g. Phantom)
  isEmbedded: boolean;
  holdings: Asset[];
  onDone: () => void;
}

// Sign + send a built transaction with the active standard wallet (works for
// both Privy embedded wallets and external wallets like Phantom).
async function signSend(
  signAndSend: any,
  swallet: any,
  tx: any
): Promise<string> {
  const res = await signAndSend({
    transaction: serializeTx(tx),
    wallet: swallet,
    chain: "solana:mainnet",
  });
  const sigBytes: Uint8Array = res?.signature ?? res;
  return sigBytes instanceof Uint8Array ? base58(sigBytes) : String(sigBytes || "");
}

type Modal = null | "deposit" | "withdraw" | "swap";

const SWAP_TARGETS = [
  { symbol: "SOL", mint: SOL_MINT, decimals: 9 },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
  { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 },
];

function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s.trim());
    return true;
  } catch {
    return false;
  }
}

export default function WalletActions({ wallet, swallet, isEmbedded, holdings, onDone }: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const { exportWallet } = useExportWallet();
  const { fundWallet } = useFundWallet();
  const { signAndSendTransaction } = useStandardSignAndSendTransaction();

  return (
    <>
      <div className="wallet-actions" style={isEmbedded ? undefined : { gridTemplateColumns: "repeat(3, 1fr)" }}>
        <button className="wa-btn" onClick={() => setModal("deposit")}>
          <span className="wa-ico">↓</span> Deposit
        </button>
        <button className="wa-btn" onClick={() => setModal("withdraw")}>
          <span className="wa-ico">↑</span> Withdraw
        </button>
        <button className="wa-btn" onClick={() => setModal("swap")}>
          <span className="wa-ico">⇄</span> Swap
        </button>
        {isEmbedded && (
          <button
            className="wa-btn wa-btn-ghost"
            onClick={() => exportWallet({ address: wallet }).catch(() => {})}
          >
            <span className="wa-ico">🔑</span> Export key
          </button>
        )}
      </div>

      {modal === "deposit" && (
        <DepositModal wallet={wallet} onFund={() => fundWallet(wallet).catch(() => {})} onClose={() => setModal(null)} />
      )}
      {modal === "withdraw" && (
        <WithdrawModal
          wallet={wallet}
          swallet={swallet}
          signAndSend={signAndSendTransaction}
          holdings={holdings}
          onClose={() => setModal(null)}
          onDone={onDone}
        />
      )}
      {modal === "swap" && (
        <SwapModal
          wallet={wallet}
          swallet={swallet}
          signAndSend={signAndSendTransaction}
          holdings={holdings}
          onClose={() => setModal(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

/* ---------------- DEPOSIT ---------------- */
function DepositModal({ wallet, onFund, onClose }: { wallet: string; onFund: () => void; onClose: () => void }) {
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(wallet, { margin: 1, width: 220, color: { dark: "#120a0d", light: "#fdeef0" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [wallet]);

  return (
    <ModalShell title="Deposit" onClose={onClose}>
      <p className="wa-note">Send SOL or any SPL token to your LUFF AGENT wallet on Solana.</p>
      {qr && (
        <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
          <img src={qr} alt="wallet QR" style={{ borderRadius: 12, border: "1px solid var(--border)" }} />
        </div>
      )}
      <label className="wa-label">Your wallet address</label>
      <div className="wa-addr-row">
        <span className="mono" style={{ wordBreak: "break-all" }}>{wallet}</span>
      </div>
      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: 12 }}
        onClick={() => {
          navigator.clipboard?.writeText(wallet);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "✓ Copied" : "Copy address"}
      </button>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={onFund}>
        Fund with card / exchange (Privy)
      </button>
      <p className="wa-warn">Only send assets on the Solana network. Sending other networks may lose funds.</p>
    </ModalShell>
  );
}

/* ---------------- WITHDRAW ---------------- */
function WithdrawModal({
  wallet,
  swallet,
  signAndSend,
  holdings,
  onClose,
  onDone,
}: {
  wallet: string;
  swallet: any;
  signAndSend: any;
  holdings: Asset[];
  onClose: () => void;
  onDone: () => void;
}) {
  const assets = holdings.length ? holdings : [];
  const [mint, setMint] = useState(assets[0]?.mint || SOL_MINT);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok?: boolean; msg: string; sig?: string } | null>(null);

  const asset = assets.find((a) => a.mint === mint);
  const balance = asset?.amount || 0;
  const amt = parseFloat(amount) || 0;
  const validAddr = isValidPubkey(to);
  const canSend = !busy && amt > 0 && amt <= balance && validAddr;

  async function submit() {
    if (!canSend || !asset) return;
    setBusy(true);
    setStatus(null);
    try {
      const tx =
        asset.mint === SOL_MINT
          ? await buildSolTransfer(wallet, to.trim(), amt)
          : await buildSplTransfer(wallet, to.trim(), asset.mint, amt, asset.decimals);
      const sig = await signSend(signAndSend, swallet, tx);
      setStatus({ ok: true, msg: "Withdrawal sent", sig: sig || undefined });
      onDone();
    } catch (e: any) {
      setStatus({ ok: false, msg: e?.message ? String(e.message).slice(0, 140) : "Transaction failed or cancelled" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Withdraw" onClose={onClose}>
      {assets.length === 0 ? (
        <p className="wa-note">No assets to withdraw.</p>
      ) : (
        <>
          <label className="wa-label">Asset</label>
          <select className="select" value={mint} onChange={(e) => setMint(e.target.value)}>
            {assets.map((a) => (
              <option key={a.mint} value={a.mint}>
                {a.symbol} — {a.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
              </option>
            ))}
          </select>

          <label className="wa-label" style={{ marginTop: 12 }}>
            Amount <span className="hint" style={{ color: "var(--text-mute)" }}>bal {balance.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
          </label>
          <div style={{ position: "relative" }}>
            <input className="input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="wa-max" onClick={() => setAmount(String(balance))}>MAX</button>
          </div>

          <label className="wa-label" style={{ marginTop: 12 }}>Recipient address</label>
          <input
            className="input"
            placeholder="Solana address…"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ borderColor: to && !validAddr ? "var(--loss)" : undefined }}
          />
          {to && !validAddr && <div className="wa-err">Invalid Solana address</div>}

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

          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={!canSend} onClick={submit}>
            {busy ? "Confirm in wallet…" : "Withdraw"}
          </button>
          <p className="wa-warn">Double-check the address. On-chain transfers are irreversible.</p>
        </>
      )}
    </ModalShell>
  );
}

/* ---------------- SWAP ---------------- */
function SwapModal({
  wallet,
  swallet,
  signAndSend,
  holdings,
  onClose,
  onDone,
}: {
  wallet: string;
  swallet: any;
  signAndSend: any;
  holdings: Asset[];
  onClose: () => void;
  onDone: () => void;
}) {
  const inAssets = holdings.length ? holdings : [];
  const [inMint, setInMint] = useState(inAssets[0]?.mint || SOL_MINT);
  const [outSym, setOutSym] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [out, setOut] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok?: boolean; msg: string; sig?: string } | null>(null);

  const inAsset = inAssets.find((a) => a.mint === inMint);
  const outTarget = SWAP_TARGETS.find((t) => t.symbol === outSym)!;
  const amt = parseFloat(amount) || 0;
  const balance = inAsset?.amount || 0;
  const sameToken = inAsset?.mint === outTarget.mint;
  const canSwap = !busy && amt > 0 && amt <= balance && !sameToken && out !== null;

  // Live Jupiter quote (debounced)
  useEffect(() => {
    setOut(null);
    if (!inAsset || amt <= 0 || sameToken) return;
    let cancelled = false;
    setQuoting(true);
    const id = setTimeout(async () => {
      const raw = BigInt(Math.round(amt * Math.pow(10, inAsset.decimals))).toString();
      const q = await jupiterQuote(inAsset.mint, outTarget.mint, raw, 100);
      if (cancelled) return;
      setQuoting(false);
      setOut(q ? Number(q.outAmount) / Math.pow(10, outTarget.decimals) : null);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [inMint, outSym, amount, inAsset, amt, sameToken, outTarget.mint, outTarget.decimals]);

  async function submit() {
    if (!canSwap || !inAsset) return;
    setBusy(true);
    setStatus(null);
    try {
      const raw = BigInt(Math.round(amt * Math.pow(10, inAsset.decimals))).toString();
      const quote = await jupiterQuote(inAsset.mint, outTarget.mint, raw, 100);
      if (!quote) throw new Error("No route found for this swap");
      const tx = await jupiterSwapTx(quote, wallet);
      if (!tx) throw new Error("Failed to build swap transaction");
      const sig = await signSend(signAndSend, swallet, tx);
      setStatus({ ok: true, msg: "Swap submitted", sig: sig || undefined });
      onDone();
    } catch (e: any) {
      setStatus({ ok: false, msg: e?.message ? String(e.message).slice(0, 140) : "Swap failed or cancelled" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Swap" onClose={onClose}>
      {inAssets.length === 0 ? (
        <p className="wa-note">No assets to swap.</p>
      ) : (
        <>
          <label className="wa-label">From</label>
          <select className="select" value={inMint} onChange={(e) => setInMint(e.target.value)}>
            {inAssets.map((a) => (
              <option key={a.mint} value={a.mint}>
                {a.symbol} — {a.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}
              </option>
            ))}
          </select>

          <label className="wa-label" style={{ marginTop: 12 }}>
            Amount <span className="hint" style={{ color: "var(--text-mute)" }}>bal {balance.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
          </label>
          <div style={{ position: "relative" }}>
            <input className="input" type="number" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <button className="wa-max" onClick={() => setAmount(String(balance))}>MAX</button>
          </div>

          <label className="wa-label" style={{ marginTop: 12 }}>To</label>
          <select className="select" value={outSym} onChange={(e) => setOutSym(e.target.value)}>
            {SWAP_TARGETS.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol}
              </option>
            ))}
          </select>

          <div className="wa-quote">
            {sameToken ? (
              <span style={{ color: "var(--loss)" }}>Pick a different output token</span>
            ) : quoting ? (
              <span style={{ color: "var(--text-mute)" }}>Fetching best route…</span>
            ) : out !== null ? (
              <>
                You receive ≈ <b>{out.toLocaleString("en-US", { maximumFractionDigits: 6 })} {outSym}</b>
              </>
            ) : amt > 0 ? (
              <span style={{ color: "var(--text-mute)" }}>No route / quote unavailable</span>
            ) : (
              <span style={{ color: "var(--text-mute)" }}>Enter an amount for a live quote</span>
            )}
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

          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={!canSwap} onClick={submit}>
            {busy ? "Confirm in wallet…" : "Swap via Jupiter"}
          </button>
          <p className="wa-warn">Routed by Jupiter. 1% slippage. Prices move fast on new tokens.</p>
        </>
      )}
    </ModalShell>
  );
}

/* ---------------- shared modal shell ---------------- */
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" style={{ width: "min(440px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong style={{ fontSize: "1.15rem", fontFamily: "var(--font-display)" }}>{title}</strong>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
