import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets, useConnectedStandardWallets } from "@privy-io/react-auth/solana";
import { fetchWalletPortfolio, type WalletPortfolio } from "../lib/wallet";
import { formatCompact, formatPrice, shortAddr } from "../lib/format";
import WalletActions from "./WalletActions";

// Format a token balance compactly.
function amt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export default function Portfolio() {
  const { ready, authenticated, login } = usePrivy();
  // All connected Solana wallets — embedded AND external (Phantom, Solflare…).
  const { wallets: stdWallets } = useConnectedStandardWallets();
  // Embedded-only list (for wallet creation + detecting the embedded wallet).
  const { wallets: solWallets, createWallet } = useSolanaWallets();
  const active = stdWallets?.[0] as any;
  const wallet: string | undefined = active?.address ?? solWallets?.[0]?.address;
  const embeddedAddrs = new Set((solWallets || []).map((w) => w.address));
  const isEmbedded = wallet ? embeddedAddrs.has(wallet) : false;

  const [data, setData] = useState<WalletPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (address: string) => {
    setLoading(true);
    setError(false);
    try {
      const p = await fetchWalletPortfolio(address);
      setData(p);
      if (!p.ok) setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated || !wallet) {
      setData(null);
      return;
    }
    load(wallet);
    const poll = setInterval(() => load(wallet), 30000);
    return () => clearInterval(poll);
  }, [authenticated, wallet, load]);

  return (
    <section className="section" id="portfolio">
      <div className="container">
        <div className="section-eyebrow">Agent Portfolio</div>
        <h2 className="section-title">
          Your wallet, <span className="accent">live on-chain</span>
        </h2>
        <p className="section-sub">
          LUFF AGENT reads the real assets in your connected Solana wallet — SOL and every
          SPL token — priced live. Nothing is stored; it's your wallet, on-chain.
        </p>

        {!ready ? (
          <div className="card" style={{ padding: 40, textAlign: "center", marginTop: 28, color: "var(--text-mute)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }} className="mono">
              <span className="live-dot" style={{ background: "var(--amber)" }} /> Connecting to wallet…
            </div>
          </div>
        ) : !authenticated ? (
          <div className="card" style={{ padding: 40, textAlign: "center", marginTop: 28 }}>
            <div style={{ fontSize: "2.6rem", marginBottom: 12 }}>🔐</div>
            <h3 style={{ fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
              Connect to view your portfolio
            </h3>
            <p style={{ color: "var(--text-dim)", maxWidth: 440, margin: "0 auto 22px" }}>
              Login with your wallet, email or social via Privy. LUFF AGENT will read your
              Solana balances directly from the chain — read-only, non-custodial.
            </p>
            <button className="btn btn-primary" onClick={login}>
              Connect wallet
            </button>
          </div>
        ) : !wallet ? (
          <div className="card" style={{ padding: 40, textAlign: "center", marginTop: 28 }}>
            <div style={{ fontSize: "2.6rem", marginBottom: 12 }}>👛</div>
            <h3 style={{ fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
              Setting up your wallet
            </h3>
            <p style={{ color: "var(--text-dim)", maxWidth: 440, margin: "0 auto 22px" }}>
              Your LUFF AGENT embedded Solana wallet is being prepared. If it doesn't appear,
              create it now — you'll always return to this same wallet.
            </p>
            <button
              className="btn btn-primary"
              disabled={creating}
              onClick={async () => {
                setCreating(true);
                try {
                  await createWallet();
                } catch {
                  /* already exists or cancelled */
                } finally {
                  setCreating(false);
                }
              }}
            >
              {creating ? "Creating…" : "Create wallet"}
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginTop: 28,
              }}
            >
              <SummaryCard label="Wallet" value={shortAddr(wallet, 5)} mono />
              <SummaryCard
                label="Total value"
                value={data ? formatCompact(data.totalUsd) : loading ? "…" : "—"}
                accent="up"
              />
              <SummaryCard
                label="SOL balance"
                value={data ? `${data.solBalance.toFixed(3)}` : loading ? "…" : "—"}
                unit="SOL"
              />
              <SummaryCard
                label="Tokens"
                value={data ? String(data.holdings.length) : loading ? "…" : "—"}
              />
            </div>

            <WalletActions
              wallet={wallet}
              swallet={active}
              isEmbedded={isEmbedded}
              holdings={data?.holdings || []}
              onDone={() => load(wallet)}
            />

            <div className="card" style={{ marginTop: 18, padding: 6, overflowX: "auto" }}>
              {error && (!data || data.holdings.length === 0) ? (
                <EmptyRow
                  icon="⚠️"
                  title="Couldn't reach a Solana RPC"
                  sub="The public RPC is busy or blocked. It will retry automatically."
                  action={<button className="btn btn-ghost btn-sm" onClick={() => wallet && load(wallet)}>Retry</button>}
                />
              ) : !data ? (
                <div style={{ padding: 30, display: "flex", flexDirection: "column", gap: 10 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 44, width: "100%" }} />
                  ))}
                </div>
              ) : data.holdings.length === 0 ? (
                <EmptyRow icon="👛" title="No assets found" sub="This wallet holds no SOL or SPL tokens yet." />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      {["Asset", "Balance", "Price", "Value"].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "14px 16px",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "var(--text-mute)",
                            textAlign: h === "Asset" ? "left" : "right",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.holdings.map((h) => (
                      <tr key={h.mint} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {h.imageUrl ? (
                              <img
                                src={h.imageUrl}
                                alt=""
                                style={{ width: 30, height: 30, borderRadius: 9, objectFit: "cover", border: "1px solid var(--border)" }}
                                onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
                              />
                            ) : (
                              <div className="coin-logo" style={{ width: 30, height: 30, fontSize: "0.7rem" }}>
                                {h.symbol.slice(0, 3)}
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>{h.symbol}</div>
                              <div style={{ fontSize: "0.76rem", color: "var(--text-mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                                {h.name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="mono" style={{ padding: "12px 16px", textAlign: "right" }}>{amt(h.amount)}</td>
                        <td className="mono" style={{ padding: "12px 16px", textAlign: "right", color: "var(--text-dim)" }}>
                          {h.priceUsd > 0 ? formatPrice(h.priceUsd) : "—"}
                        </td>
                        <td className="mono" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>
                          {h.valueUsd > 0 ? formatCompact(h.valueUsd) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="data-note">
              <span>🔒</span> Read-only, non-custodial. Balances fetched live from Solana RPC and
              priced via Dexscreener. Refreshes every 30s.
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function EmptyRow({ icon, title, sub, action }: { icon: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ color: "var(--text-mute)", fontSize: "0.88rem", marginBottom: action ? 16 : 0 }}>{sub}</div>
      {action}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  mono,
  unit,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  unit?: string;
  accent?: "up" | "down";
}) {
  const color = accent === "up" ? "var(--green)" : accent === "down" ? "var(--loss)" : "var(--text)";
  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-mute)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-display)", fontWeight: 700, fontSize: "1.35rem", color }}>
        {value}
        {unit ? <span style={{ fontSize: "0.8rem", color: "var(--text-mute)" }}> {unit}</span> : null}
      </div>
    </div>
  );
}
