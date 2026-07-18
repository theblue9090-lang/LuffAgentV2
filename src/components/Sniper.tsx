import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  DEFAULT_CONFIG,
  evaluate,
  generateCandidate,
  simulateExecution,
  type Candidate,
  type Decision,
  type SniperConfig,
  type ExecutionResult,
} from "../lib/sniper";
import type { Coin } from "../lib/market";
import { formatCompact, shortAddr } from "../lib/format";
import NewLaunches from "./NewLaunches";
import CoinChart from "./CoinChart";

interface FeedItem {
  key: string;
  c: Candidate;
  decision: Decision;
  exec?: ExecutionResult;
  ts: number;
}

const AMOUNT_PRESETS = [0.1, 0.5, 1, 2, 5];

export default function Sniper() {
  const { authenticated, login, user } = usePrivy();
  const [cfg, setCfg] = useState<SniperConfig>(DEFAULT_CONFIG);
  const [armed, setArmed] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState({ scanned: 0, sniped: 0, filled: 0 });
  const [devInput, setDevInput] = useState("");
  const [chartCoin, setChartCoin] = useState<Coin | null>(null);
  const [target, setTarget] = useState<string>("");

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // Snipe a coin picked from the New Launches feed: pre-fill the strategy
  // and scroll the user to the config so they can arm it immediately.
  function handleSnipeNew(coin: Coin) {
    setTarget(coin.symbol);
    if (coin.devAddress) {
      setCfg((p) => ({ ...p, mode: "dev-wallet" }));
      setDevInput((prev) =>
        prev.includes(coin.devAddress!) ? prev : (prev ? prev.trim() + "\n" : "") + coin.devAddress
      );
    } else {
      setCfg((p) => ({ ...p, mode: "new-launches" }));
    }
    setTimeout(() => {
      document.querySelector(".sniper-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  const set = <K extends keyof SniperConfig>(k: K, v: SniperConfig[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  // parse dev addresses when in dev-wallet mode
  useEffect(() => {
    const list = devInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 24);
    set("devAddresses", list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devInput]);

  // main sniper loop
  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => {
      const config = cfgRef.current;
      const c = generateCandidate(config);
      const decision = evaluate(c, config);
      setStats((s) => ({ ...s, scanned: s.scanned + 1 }));

      if (decision.action === "buy") {
        const exec = simulateExecution(c, config);
        setStats((s) => ({ ...s, sniped: s.sniped + 1, filled: s.filled + (exec.filled ? 1 : 0) }));
        pushFeed({ key: c.id, c, decision, exec, ts: Date.now() });
      } else {
        // only surface a portion of skips to avoid noise
        if (Math.random() > 0.55) pushFeed({ key: c.id, c, decision, ts: Date.now() });
      }
    }, 1400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  function pushFeed(item: FeedItem) {
    setFeed((f) => [item, ...f].slice(0, 40));
  }

  function toggleArm() {
    if (!authenticated) {
      login();
      return;
    }
    if (cfg.mode === "dev-wallet" && cfg.devAddresses.length === 0) {
      return;
    }
    setArmed((a) => !a);
  }

  const canArmDev = cfg.mode !== "dev-wallet" || cfg.devAddresses.length > 0;

  return (
    <section className="section" id="sniper">
      <div className="container">
        <div className="section-eyebrow">Sniper Engine</div>
        <h2 className="section-title">
          Configure once. <span className="accent">Snipe automatically.</span>
        </h2>
        <p className="section-sub">
          The LUFF AGENT sniper tracks new coins from pump.fun and Dexscreener in
          realtime and executes the instant a token matches your rules — including
          sniping straight from a developer's wallet.
        </p>

        {/* ---------------- NEW LAUNCHES (realtime, top of sniper) ---------------- */}
        <div style={{ marginTop: 26 }}>
          <NewLaunches onSnipe={handleSnipeNew} onOpen={setChartCoin} />
        </div>

        <div className="sniper-layout">
          {/* ---------------- CONFIG PANEL ---------------- */}
          <div className="card sniper-panel">
            <div className="panel-title">🎯 Strategy</div>
            <div className="panel-sub">
              {target ? (
                <>
                  Target locked: <b style={{ color: "var(--red-soft)" }}>${target}</b> — review
                  rules and arm.
                </>
              ) : (
                "Rules run on every new mint, 24/7."
              )}
            </div>

            {/* Mode */}
            <div className="field">
              <label>Snipe mode</label>
              <div className="chip-row">
                <div
                  className={`chip ${cfg.mode === "new-launches" ? "active" : ""}`}
                  onClick={() => set("mode", "new-launches")}
                >
                  New launches
                </div>
                <div
                  className={`chip ${cfg.mode === "dev-wallet" ? "active" : ""}`}
                  onClick={() => set("mode", "dev-wallet")}
                >
                  Dev wallet
                </div>
              </div>
            </div>

            {cfg.mode === "dev-wallet" ? (
              <div className="field">
                <label>
                  Dev wallet address(es)
                  <span className="hint">{cfg.devAddresses.length} tracked</span>
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Paste one or more dev/creator addresses…"
                  value={devInput}
                  onChange={(e) => setDevInput(e.target.value)}
                  style={{ resize: "vertical", fontFamily: "var(--font-mono)" }}
                />
              </div>
            ) : (
              <div className="field">
                <label>Data sources</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <Toggle
                    label="pump.fun"
                    desc="Track new bonding-curve mints"
                    on={cfg.sources.pumpfun}
                    onChange={(v) => set("sources", { ...cfg.sources, pumpfun: v })}
                  />
                  <Toggle
                    label="Dexscreener"
                    desc="Track new pairs across DEXes"
                    on={cfg.sources.dexscreener}
                    onChange={(v) => set("sources", { ...cfg.sources, dexscreener: v })}
                  />
                </div>
              </div>
            )}

            {/* Buy amount */}
            <div className="field">
              <label>
                Buy amount <span className="hint">SOL per snipe</span>
              </label>
              <div className="chip-row">
                {AMOUNT_PRESETS.map((a) => (
                  <div
                    key={a}
                    className={`chip ${cfg.amountSol === a ? "active" : ""}`}
                    onClick={() => set("amountSol", a)}
                  >
                    {a}
                  </div>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="row-2">
              <div className="field">
                <label>Min liquidity ($)</label>
                <input
                  className="input"
                  type="number"
                  value={cfg.minLiquidity}
                  onChange={(e) => set("minLiquidity", +e.target.value)}
                />
              </div>
              <div className="field">
                <label>Max age (s)</label>
                <input
                  className="input"
                  type="number"
                  value={cfg.maxAgeSec}
                  onChange={(e) => set("maxAgeSec", +e.target.value)}
                />
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label>Min market cap ($)</label>
                <input
                  className="input"
                  type="number"
                  value={cfg.minMarketCap}
                  onChange={(e) => set("minMarketCap", +e.target.value)}
                />
              </div>
              <div className="field">
                <label>Max market cap ($)</label>
                <input
                  className="input"
                  type="number"
                  value={cfg.maxMarketCap}
                  onChange={(e) => set("maxMarketCap", +e.target.value)}
                />
              </div>
            </div>

            {/* Execution */}
            <div className="row-2">
              <div className="field">
                <label>Slippage (%)</label>
                <input
                  className="input"
                  type="number"
                  value={cfg.slippage}
                  onChange={(e) => set("slippage", +e.target.value)}
                />
              </div>
              <div className="field">
                <label>Priority fee (SOL)</label>
                <input
                  className="input"
                  type="number"
                  step="0.0001"
                  value={cfg.priorityFee}
                  onChange={(e) => set("priorityFee", +e.target.value)}
                />
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label>Take profit (%)</label>
                <input
                  className="input"
                  type="number"
                  value={cfg.takeProfit}
                  onChange={(e) => set("takeProfit", +e.target.value)}
                />
              </div>
              <div className="field">
                <label>Stop loss (%)</label>
                <input
                  className="input"
                  type="number"
                  value={cfg.stopLoss}
                  onChange={(e) => set("stopLoss", +e.target.value)}
                />
              </div>
            </div>

            <Toggle
              label="Anti-rug shield"
              desc="Require revoked mint, burned LP, no whale"
              on={cfg.antiRug}
              onChange={(v) => set("antiRug", v)}
            />
            <Toggle
              label="Auto take-profit / stop-loss"
              desc="Exit positions automatically"
              on={cfg.autoSell}
              onChange={(v) => set("autoSell", v)}
            />

            <button
              className={`btn btn-primary btn-block arm-btn ${armed ? "armed" : ""}`}
              onClick={toggleArm}
              disabled={!canArmDev && authenticated}
              style={{ marginTop: 14 }}
            >
              {!authenticated
                ? "🔒 Login to arm sniper"
                : armed
                ? "■ Disarm sniper"
                : !canArmDev
                ? "Add a dev wallet first"
                : "▶ Arm sniper"}
            </button>
          </div>

          {/* ---------------- LIVE FEED ---------------- */}
          <div className="card sniper-feed">
            <div className="feed-head">
              <div>
                <div className="panel-title" style={{ marginBottom: 2 }}>
                  Realtime tracker
                </div>
                <div className="feed-status">
                  {armed ? (
                    <>
                      <span className="live-dot" />
                      <span className="status-armed">ARMED · scanning new mints</span>
                    </>
                  ) : (
                    <span className="status-idle">● Idle — arm the sniper to start</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 18 }}>
                <MiniStat label="Scanned" value={stats.scanned} />
                <MiniStat label="Sniped" value={stats.sniped} accent />
                <MiniStat label="Filled" value={stats.filled} />
              </div>
            </div>

            <div className="warn-banner">
              <span>🛡️</span>
              <span>
                Running in <b>secure simulation (paper) mode</b>. Live on-chain execution
                activates only after you connect a funded wallet and approve signing — your
                keys never leave your wallet.
              </span>
            </div>

            {feed.length === 0 ? (
              <div className="feed-empty">
                <div className="big">🎯</div>
                <div>
                  {armed
                    ? "Waiting for the next launch…"
                    : "No activity yet. Configure your rules and arm the sniper."}
                </div>
              </div>
            ) : (
              <div className="feed-list">
                {feed.map((it) => (
                  <FeedRow key={it.key} it={it} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {chartCoin && <CoinChart coin={chartCoin} onClose={() => setChartCoin(null)} />}
    </section>
  );
}

function FeedRow({ it }: { it: FeedItem }) {
  const buy = it.decision.action === "buy";
  const filled = it.exec?.filled;
  return (
    <div className={`feed-item ${buy && filled ? "hit" : ""}`}>
      <div className="feed-icon">{it.c.symbol.slice(0, 3)}</div>
      <div className="feed-main">
        <div className="fm-top">
          {it.c.symbol}
          <span className={`coin-src ${it.c.source === "pump.fun" ? "src-pump" : "src-dex"}`}>
            {it.c.source === "pump.fun" ? "pump" : "dex"}
          </span>
        </div>
        <div className="fm-sub">
          MC {formatCompact(it.c.marketCap)} · Liq {formatCompact(it.c.liquidity)} · {it.c.ageSec}s
          {" · dev "}
          {shortAddr(it.c.dev, 4)}
        </div>
      </div>
      <div className="feed-action">
        {buy ? (
          filled ? (
            <>
              <div className="fa-status fa-buy">✔ SNIPED</div>
              <div style={{ color: "var(--text-mute)" }}>{it.exec?.latencyMs}ms fill</div>
            </>
          ) : (
            <>
              <div className="fa-status fa-scan">↻ MISSED</div>
              <div style={{ color: "var(--text-mute)" }}>retry pool</div>
            </>
          )
        ) : (
          <>
            <div className="fa-status fa-skip">— SKIP</div>
            <div style={{ color: "var(--text-mute)" }}>{it.decision.reason}</div>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="t-label">{label}</div>
        <div className="t-desc">{desc}</div>
      </div>
      <div className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
        <div className="knob" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        className="mono"
        style={{ fontSize: "1.2rem", fontWeight: 700, color: accent ? "var(--red-bright)" : "var(--text)" }}
      >
        {value}
      </div>
      <div className="mono" style={{ fontSize: "0.66rem", color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}
