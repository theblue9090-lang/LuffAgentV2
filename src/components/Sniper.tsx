import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  DEFAULT_CONFIG,
  evaluateCoin,
  generateSyntheticCoin,
  type SniperConfig,
  type SniperSource,
} from "../lib/sniper";
import type { Coin } from "../lib/market";
import { joinHub, getRecentCoins, pinMints, type TradeUpdate } from "../lib/pumphub";
import { formatCompact, formatPct, shortAddr } from "../lib/format";
import NewLaunches from "./NewLaunches";
import CoinChart from "./CoinChart";

interface Position {
  id: string; // mint
  symbol: string;
  name: string;
  source: SniperSource;
  imageUrl?: string;
  dev?: string;
  amountSol: number;
  entryMc: number;
  currentMc: number;
  openedAt: number;
  simulated: boolean;
}

interface FeedItem {
  key: string;
  symbol: string;
  source: SniperSource;
  marketCap: number;
  liquidity: number;
  dev?: string;
  kind: "buy" | "skip" | "close";
  detail: string;
  ok?: boolean;
  ts: number;
}

const AMOUNT_PRESETS = [0.1, 0.5, 1, 2, 5];
const MAX_POSITIONS = 24;

const pnlPct = (p: Position) => (p.entryMc > 0 ? (p.currentMc / p.entryMc - 1) * 100 : 0);

export default function Sniper() {
  const { authenticated, login } = usePrivy();
  const [cfg, setCfg] = useState<SniperConfig>(DEFAULT_CONFIG);
  const [armed, setArmed] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [realizedSol, setRealizedSol] = useState(0);
  const [stats, setStats] = useState({ scanned: 0, sniped: 0 });
  const [devInput, setDevInput] = useState("");
  const [chartCoin, setChartCoin] = useState<Coin | null>(null);
  const [target, setTarget] = useState<string>("");
  const [streamOpen, setStreamOpen] = useState(false);

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const positionsRef = useRef<Position[]>(positions);
  positionsRef.current = positions;
  const evaluatedRef = useRef<Set<string>>(new Set());
  const lastRealRef = useRef(0);

  const set = <K extends keyof SniperConfig>(k: K, v: SniperConfig[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  // ---- feed helpers ----
  const pushFeed = (item: FeedItem) => setFeed((f) => [item, ...f].slice(0, 40));

  // ---- open / close positions ----
  function openPosition(coin: Coin, config: SniperConfig) {
    if (positionsRef.current.some((p) => p.id === coin.id)) return;
    if (positionsRef.current.length >= MAX_POSITIONS) return;
    const entryMc = Math.max(coin.marketCap || 0, 1);
    const latency = 170 + Math.floor(Math.random() * 650);
    setPositions((prev) =>
      prev.some((p) => p.id === coin.id)
        ? prev
        : [
            {
              id: coin.id,
              symbol: coin.symbol,
              name: coin.name,
              source: coin.source,
              imageUrl: coin.imageUrl,
              dev: coin.devAddress,
              amountSol: config.amountSol,
              entryMc,
              currentMc: entryMc,
              openedAt: Date.now(),
              simulated: coin.id.endsWith("-sim"),
            },
            ...prev,
          ]
    );
    setStats((s) => ({ ...s, sniped: s.sniped + 1 }));
    pushFeed({
      key: coin.id + Date.now(),
      symbol: coin.symbol,
      source: coin.source,
      marketCap: coin.marketCap,
      liquidity: coin.liquidity,
      dev: coin.devAddress,
      kind: "buy",
      detail: `${config.amountSol} SOL · ${latency}ms`,
      ok: true,
      ts: Date.now(),
    });
  }

  function closePositions(ids: string[], reason: "manual" | "auto" | "tp" | "sl") {
    const idset = new Set(ids);
    const closing = positionsRef.current.filter((p) => idset.has(p.id));
    if (!closing.length) return;
    const realized = closing.reduce((s, p) => s + p.amountSol * (pnlPct(p) / 100), 0);
    setRealizedSol((r) => r + realized);
    setPositions((prev) => prev.filter((p) => !idset.has(p.id)));
    for (const p of closing) {
      const pnl = pnlPct(p);
      const tag = reason === "tp" ? "TP hit" : reason === "sl" ? "SL hit" : reason === "auto" ? "auto" : "closed";
      pushFeed({
        key: p.id + "close" + Date.now() + Math.random(),
        symbol: p.symbol,
        source: p.source,
        marketCap: p.currentMc,
        liquidity: 0,
        dev: p.dev,
        kind: "close",
        detail: `${tag} · ${formatPct(pnl)}`,
        ok: pnl >= 0,
        ts: Date.now(),
      });
    }
  }

  // ---- process one candidate coin against the rules ----
  function processCoin(coin: Coin) {
    if (!armedRef.current) return;
    if (evaluatedRef.current.has(coin.id)) return;
    evaluatedRef.current.add(coin.id);
    const config = cfgRef.current;
    const decision = evaluateCoin(coin, config);
    setStats((s) => ({ ...s, scanned: s.scanned + 1 }));
    if (decision.action === "buy") {
      openPosition(coin, config);
    } else if (Math.random() > 0.6) {
      pushFeed({
        key: coin.id + Date.now(),
        symbol: coin.symbol,
        source: coin.source,
        marketCap: coin.marketCap,
        liquidity: coin.liquidity,
        dev: coin.devAddress,
        kind: "skip",
        detail: decision.reason,
        ts: Date.now(),
      });
    }
  }

  // ---- dev address parsing ----
  useEffect(() => {
    const list = devInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 24);
    set("devAddresses", list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devInput]);

  // ---- join the shared realtime hub (once) ----
  useEffect(() => {
    const leave = joinHub({
      onStatus: setStreamOpen,
      onCoin: (coin) => {
        if (!coin.id.endsWith("-sim")) lastRealRef.current = Date.now();
        processCoin(coin);
      },
      onTrade: (t: TradeUpdate) => {
        setPositions((prev) => {
          let changed = false;
          const next = prev.map((p) => {
            if (p.id !== t.mint) return p;
            changed = true;
            return { ...p, currentMc: t.marketCap || p.currentMc };
          });
          return changed ? next : prev;
        });
      },
    });
    return leave;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- fallback synthetic scanning when armed & no live coins flowing ----
  useEffect(() => {
    if (!armed) return;
    // skip the backlog so we only snipe coins minted after arming
    evaluatedRef.current = new Set(getRecentCoins().map((c) => c.id));
    const id = setInterval(() => {
      if (Date.now() - lastRealRef.current < 4000) return; // real data flowing
      processCoin(generateSyntheticCoin(cfgRef.current));
    }, 1700);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  // ---- drift simulated positions for a live PnL feel ----
  useEffect(() => {
    const id = setInterval(() => {
      setPositions((prev) => {
        if (!prev.some((p) => p.simulated)) return prev;
        return prev.map((p) =>
          p.simulated
            ? { ...p, currentMc: Math.max(p.currentMc * (1 + (Math.random() - 0.45) * 0.1), p.entryMc * 0.15) }
            : p
        );
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // ---- auto take-profit / stop-loss ----
  useEffect(() => {
    const id = setInterval(() => {
      const config = cfgRef.current;
      if (!config.autoSell) return;
      const tp: string[] = [];
      const sl: string[] = [];
      for (const p of positionsRef.current) {
        const pnl = pnlPct(p);
        if (pnl >= config.takeProfit) tp.push(p.id);
        else if (pnl <= -config.stopLoss) sl.push(p.id);
      }
      if (tp.length) closePositions(tp, "tp");
      if (sl.length) closePositions(sl, "sl");
    }, 1300);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keep the hub watching our open positions' trades ----
  useEffect(() => {
    pinMints(positions.map((p) => p.id));
  }, [positions]);

  // ---- snipe a coin picked from New Launches ----
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

  function toggleArm() {
    if (!authenticated) return login();
    if (cfg.mode === "dev-wallet" && cfg.devAddresses.length === 0) return;
    setArmed((a) => !a);
  }

  const canArmDev = cfg.mode !== "dev-wallet" || cfg.devAddresses.length > 0;

  // ---- aggregate PnL ----
  const deployed = positions.reduce((s, p) => s + p.amountSol, 0);
  const unrealized = positions.reduce((s, p) => s + p.amountSol * (pnlPct(p) / 100), 0);
  const totalPnl = unrealized + realizedSol;

  return (
    <section className="section" id="sniper">
      <div className="container">
        <div className="section-eyebrow">Sniper Engine</div>
        <h2 className="section-title">
          Configure once. <span className="accent">Snipe automatically.</span>
        </h2>
        <p className="section-sub">
          The LUFF AGENT sniper tracks new coins from pump.fun and Dexscreener in
          realtime and executes the instant a token matches your rules — new launches
          or straight from a developer's wallet — then tracks live PnL on every fill.
        </p>

        {/* NEW LAUNCHES (realtime, top of sniper) */}
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
                  Target locked: <b style={{ color: "var(--red-soft)" }}>${target}</b> — review rules and arm.
                </>
              ) : (
                "Rules run on every new mint, 24/7."
              )}
            </div>

            <div className="field">
              <label>Snipe mode</label>
              <div className="chip-row">
                <div className={`chip ${cfg.mode === "new-launches" ? "active" : ""}`} onClick={() => set("mode", "new-launches")}>
                  New launches
                </div>
                <div className={`chip ${cfg.mode === "dev-wallet" ? "active" : ""}`} onClick={() => set("mode", "dev-wallet")}>
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
                <Toggle label="pump.fun" desc="Track new bonding-curve mints" on={cfg.sources.pumpfun} onChange={(v) => set("sources", { ...cfg.sources, pumpfun: v })} />
                <Toggle label="Dexscreener" desc="Track new pairs across DEXes" on={cfg.sources.dexscreener} onChange={(v) => set("sources", { ...cfg.sources, dexscreener: v })} />
              </div>
            )}

            <div className="field">
              <label>
                Buy amount <span className="hint">SOL per snipe</span>
              </label>
              <div className="chip-row">
                {AMOUNT_PRESETS.map((a) => (
                  <div key={a} className={`chip ${cfg.amountSol === a ? "active" : ""}`} onClick={() => set("amountSol", a)}>
                    {a}
                  </div>
                ))}
              </div>
            </div>

            <div className="row-2">
              <div className="field">
                <label>Min liquidity ($)</label>
                <input className="input" type="number" value={cfg.minLiquidity} onChange={(e) => set("minLiquidity", +e.target.value)} />
              </div>
              <div className="field">
                <label>Max age (s)</label>
                <input className="input" type="number" value={cfg.maxAgeSec} onChange={(e) => set("maxAgeSec", +e.target.value)} />
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label>Min market cap ($)</label>
                <input className="input" type="number" value={cfg.minMarketCap} onChange={(e) => set("minMarketCap", +e.target.value)} />
              </div>
              <div className="field">
                <label>Max market cap ($)</label>
                <input className="input" type="number" value={cfg.maxMarketCap} onChange={(e) => set("maxMarketCap", +e.target.value)} />
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label>Slippage (%)</label>
                <input className="input" type="number" value={cfg.slippage} onChange={(e) => set("slippage", +e.target.value)} />
              </div>
              <div className="field">
                <label>Priority fee (SOL)</label>
                <input className="input" type="number" step="0.0001" value={cfg.priorityFee} onChange={(e) => set("priorityFee", +e.target.value)} />
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label>Take profit (%)</label>
                <input className="input" type="number" value={cfg.takeProfit} onChange={(e) => set("takeProfit", +e.target.value)} />
              </div>
              <div className="field">
                <label>Stop loss (%)</label>
                <input className="input" type="number" value={cfg.stopLoss} onChange={(e) => set("stopLoss", +e.target.value)} />
              </div>
            </div>

            <Toggle label="Anti-rug shield" desc="Skip thin-liquidity / risky mints" on={cfg.antiRug} onChange={(v) => set("antiRug", v)} />
            <Toggle label="Auto take-profit / stop-loss" desc="Exit positions automatically" on={cfg.autoSell} onChange={(v) => set("autoSell", v)} />

            <button className={`btn btn-primary btn-block arm-btn ${armed ? "armed" : ""}`} onClick={toggleArm} disabled={!canArmDev && authenticated} style={{ marginTop: 14 }}>
              {!authenticated ? "🔒 Login to arm sniper" : armed ? "■ Disarm sniper" : !canArmDev ? "Add a dev wallet first" : "▶ Arm sniper"}
            </button>
          </div>

          {/* ---------------- RIGHT: POSITIONS + ACTIVITY ---------------- */}
          <div className="sniper-right">
            {/* POSITIONS + PNL */}
            <div className="card sniper-feed" style={{ minHeight: 0 }}>
              <div className="pos-head">
                <div>
                  <div className="panel-title" style={{ marginBottom: 2 }}>
                    Open positions
                  </div>
                  <div className="feed-status">
                    <span className="mono" style={{ color: "var(--text-mute)" }}>
                      Total PnL{" "}
                      <b style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--loss)" }}>
                        {totalPnl >= 0 ? "+" : ""}
                        {totalPnl.toFixed(3)} SOL
                      </b>
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => closePositions(positions.map((p) => p.id), "manual")}
                  disabled={!positions.length}
                >
                  ✕ Close all positions
                </button>
              </div>

              <div className="pos-stats">
                <PosStat label="Open" value={String(positions.length)} />
                <PosStat label="Deployed" value={`${deployed.toFixed(2)}`} unit="SOL" />
                <PosStat label="Unrealized" value={`${unrealized >= 0 ? "+" : ""}${unrealized.toFixed(3)}`} unit="SOL" tone={unrealized >= 0 ? "up" : "down"} />
                <PosStat label="Realized" value={`${realizedSol >= 0 ? "+" : ""}${realizedSol.toFixed(3)}`} unit="SOL" tone={realizedSol >= 0 ? "up" : "down"} />
              </div>

              {positions.length === 0 ? (
                <div className="feed-empty" style={{ minHeight: 120 }}>
                  <div className="big">📭</div>
                  <div>No open positions yet. Arm the sniper or snipe a coin from New Launches.</div>
                </div>
              ) : (
                <div className="pos-list">
                  {positions.map((p) => {
                    const pnl = pnlPct(p);
                    const up = pnl >= 0;
                    return (
                      <div className="pos-row" key={p.id}>
                        <div className="feed-icon">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: 9, objectFit: "cover" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                          ) : (
                            p.symbol.slice(0, 3)
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="fm-top">
                            {p.symbol}
                            <span className={`coin-src ${p.source === "pump.fun" ? "src-pump" : "src-dex"}`}>
                              {p.source === "pump.fun" ? "pump" : "dex"}
                            </span>
                          </div>
                          <div className="fm-sub">
                            {p.amountSol} SOL · MC {formatCompact(p.entryMc)} → {formatCompact(p.currentMc)}
                          </div>
                        </div>
                        <div className="mono" style={{ textAlign: "right", fontWeight: 700, color: up ? "var(--green)" : "var(--loss)" }}>
                          {formatPct(pnl)}
                        </div>
                        <button className="pos-close-btn" onClick={() => closePositions([p.id], "manual")}>
                          Close
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ACTIVITY FEED */}
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
                        <span className="status-armed">
                          ARMED · scanning {cfg.mode === "dev-wallet" ? "dev wallets" : "new mints"}
                          {streamOpen ? " · live" : ""}
                        </span>
                      </>
                    ) : (
                      <span className="status-idle">● Idle — arm the sniper to start</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 18 }}>
                  <MiniStat label="Scanned" value={stats.scanned} />
                  <MiniStat label="Sniped" value={stats.sniped} accent />
                </div>
              </div>

              <div className="warn-banner">
                <span>🛡️</span>
                <span>
                  Running in <b>secure simulation (paper) mode</b>. Live on-chain execution activates only
                  after you connect a funded wallet and approve signing — your keys never leave your wallet.
                </span>
              </div>

              {feed.length === 0 ? (
                <div className="feed-empty">
                  <div className="big">🎯</div>
                  <div>{armed ? "Waiting for the next launch…" : "No activity yet. Configure your rules and arm the sniper."}</div>
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
      </div>

      {chartCoin && <CoinChart coin={chartCoin} onClose={() => setChartCoin(null)} />}
    </section>
  );
}

function FeedRow({ it }: { it: FeedItem }) {
  return (
    <div className={`feed-item ${it.kind === "buy" && it.ok ? "hit" : ""}`}>
      <div className="feed-icon">{it.symbol.slice(0, 3)}</div>
      <div className="feed-main">
        <div className="fm-top">
          {it.symbol}
          <span className={`coin-src ${it.source === "pump.fun" ? "src-pump" : "src-dex"}`}>
            {it.source === "pump.fun" ? "pump" : "dex"}
          </span>
        </div>
        <div className="fm-sub">
          MC {formatCompact(it.marketCap)}
          {it.liquidity ? ` · Liq ${formatCompact(it.liquidity)}` : ""}
          {it.dev ? ` · dev ${shortAddr(it.dev, 4)}` : ""}
        </div>
      </div>
      <div className="feed-action">
        {it.kind === "buy" ? (
          <>
            <div className="fa-status fa-buy">✔ SNIPED</div>
            <div style={{ color: "var(--text-mute)" }}>{it.detail}</div>
          </>
        ) : it.kind === "close" ? (
          <>
            <div className="fa-status" style={{ color: it.ok ? "var(--green)" : "var(--loss)" }}>
              ⟲ CLOSED
            </div>
            <div style={{ color: "var(--text-mute)" }}>{it.detail}</div>
          </>
        ) : (
          <>
            <div className="fa-status fa-skip">— SKIP</div>
            <div style={{ color: "var(--text-mute)" }}>{it.detail}</div>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
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
      <div className="mono" style={{ fontSize: "1.2rem", fontWeight: 700, color: accent ? "var(--red-bright)" : "var(--text)" }}>
        {value}
      </div>
      <div className="mono" style={{ fontSize: "0.66rem", color: "var(--text-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}

function PosStat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "var(--green)" : tone === "down" ? "var(--loss)" : "var(--text)";
  return (
    <div className="pos-stat">
      <div className="l">{label}</div>
      <div className="v" style={{ color }}>
        {value}
        {unit ? <span style={{ fontSize: "0.7rem", color: "var(--text-mute)" }}> {unit}</span> : null}
      </div>
    </div>
  );
}
