import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { formatCompact, formatPct, formatPrice, shortAddr } from "../lib/format";

interface Position {
  symbol: string;
  source: "pump.fun" | "dexscreener";
  entry: number;
  amountSol: number;
  pnl: number; // %
}

const SEED: Position[] = [
  { symbol: "GIGA", source: "pump.fun", entry: 0.0000041, amountSol: 0.5, pnl: 214 },
  { symbol: "AI16Z", source: "dexscreener", entry: 0.21, amountSol: 1, pnl: 46 },
  { symbol: "REDSHOT", source: "pump.fun", entry: 0.00009, amountSol: 0.5, pnl: -22 },
  { symbol: "GOAT", source: "pump.fun", entry: 0.41, amountSol: 2, pnl: 88 },
  { symbol: "BOME", source: "dexscreener", entry: 0.0019, amountSol: 0.3, pnl: 12 },
];

export default function Portfolio() {
  const { ready, authenticated, user, login } = usePrivy();
  const [positions, setPositions] = useState<Position[]>(SEED);

  // live PnL drift for a lively dashboard
  useEffect(() => {
    if (!authenticated) return;
    const id = setInterval(() => {
      setPositions((ps) =>
        ps.map((p) => ({ ...p, pnl: p.pnl + (Math.random() - 0.48) * 6 }))
      );
    }, 2500);
    return () => clearInterval(id);
  }, [authenticated]);

  const totals = useMemo(() => {
    const invested = positions.reduce((s, p) => s + p.amountSol, 0);
    const value = positions.reduce((s, p) => s + p.amountSol * (1 + p.pnl / 100), 0);
    const pnlPct = invested ? ((value - invested) / invested) * 100 : 0;
    return { invested, value, pnlPct, open: positions.length };
  }, [positions]);

  const wallet = user?.wallet?.address;

  return (
    <section className="section" id="portfolio">
      <div className="container">
        <div className="section-eyebrow">Agent Portfolio</div>
        <h2 className="section-title">
          Your sniper positions, <span className="accent">live</span>
        </h2>
        <p className="section-sub">
          Track every position your agent opens, realized and unrealized PnL, and
          the wallet powering it — all in one dashboard.
        </p>

        {!ready ? null : !authenticated ? (
          <div className="card" style={{ padding: 40, textAlign: "center", marginTop: 28 }}>
            <div style={{ fontSize: "2.6rem", marginBottom: 12 }}>🔐</div>
            <h3 style={{ fontFamily: "var(--font-display)", margin: "0 0 8px" }}>
              Connect to view your portfolio
            </h3>
            <p style={{ color: "var(--text-dim)", maxWidth: 420, margin: "0 auto 22px" }}>
              Login with your wallet, email or social via Privy to unlock your agent
              dashboard and position tracking.
            </p>
            <button className="btn btn-primary" onClick={login}>
              Connect wallet
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
              <SummaryCard label="Wallet" value={wallet ? shortAddr(wallet, 5) : "Embedded"} mono />
              <SummaryCard label="Open positions" value={String(totals.open)} />
              <SummaryCard label="Deployed" value={`${totals.invested.toFixed(2)} SOL`} />
              <SummaryCard
                label="Unrealized PnL"
                value={formatPct(totals.pnlPct)}
                accent={totals.pnlPct >= 0 ? "up" : "down"}
              />
            </div>

            <div className="card" style={{ marginTop: 18, padding: 6, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    {["Token", "Source", "Entry", "Size", "PnL", "Value"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "14px 16px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.72rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--text-mute)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const up = p.pnl >= 0;
                    const value = p.amountSol * (1 + p.pnl / 100);
                    return (
                      <tr key={p.symbol} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "13px 16px", fontWeight: 600 }}>{p.symbol}</td>
                        <td style={{ padding: "13px 16px" }}>
                          <span className={`coin-src ${p.source === "pump.fun" ? "src-pump" : "src-dex"}`}>
                            {p.source === "pump.fun" ? "pump" : "dex"}
                          </span>
                        </td>
                        <td className="mono" style={{ padding: "13px 16px", color: "var(--text-dim)" }}>
                          {formatPrice(p.entry)}
                        </td>
                        <td className="mono" style={{ padding: "13px 16px" }}>{p.amountSol} SOL</td>
                        <td
                          className="mono"
                          style={{ padding: "13px 16px", fontWeight: 700, color: up ? "var(--green)" : "var(--loss)" }}
                        >
                          {formatPct(p.pnl)}
                        </td>
                        <td className="mono" style={{ padding: "13px 16px" }}>{value.toFixed(3)} SOL</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="data-note">
              <span>ℹ️</span> Demo positions shown in paper mode. Connect a funded wallet to
              trade live.
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
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
      </div>
    </div>
  );
}
