import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useConnectedStandardWallets, useStandardSignAndSendTransaction } from "@privy-io/react-auth/solana";
import {
  DEFAULT_CONFIG,
  evaluateCoin,
  PLATFORM_FEE_PCT,
  PLATFORM_FEE_WALLET,
  type SniperConfig,
  type SniperSource,
} from "../lib/sniper";
import type { Coin } from "../lib/market";
import { joinHub, getRecentCoins, pinMints, type TradeUpdate } from "../lib/pumphub";
import { pumpPortalTradeTx, submitTx, solscanTx, SOL_MINT, jupiterQuote, jupiterSwapTx, buildSolTransfer } from "../lib/txn";
import { fetchSolBalance } from "../lib/wallet";
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
  txSig?: string;
}

// Build a real BUY transaction for a coin. Pump-origin tokens route through
// PumpPortal (bonding curve + migrated pools); others fall back to Jupiter.
async function buildBuyTx(coin: Coin, wallet: string, cfg: SniperConfig) {
  if (coin.source === "pump.fun" || coin.isBondingCurve) {
    return pumpPortalTradeTx({
      wallet,
      mint: coin.address,
      action: "buy",
      amount: cfg.amountSol,
      denominatedInSol: true,
      slippage: cfg.slippage,
      priorityFee: cfg.priorityFee,
      pool: "auto",
    });
  }
  const raw = BigInt(Math.round(cfg.amountSol * 1e9)).toString();
  const q = await jupiterQuote(SOL_MINT, coin.address, raw, Math.round(cfg.slippage * 100));
  return q ? jupiterSwapTx(q, wallet) : null;
}

// Build a real SELL (100%) transaction to close a position on-chain.
async function buildSellTx(pos: Position, wallet: string, cfg: SniperConfig) {
  return pumpPortalTradeTx({
    wallet,
    mint: pos.id,
    action: "sell",
    amount: "100%",
    denominatedInSol: false,
    slippage: cfg.slippage,
    priorityFee: cfg.priorityFee,
    pool: "auto",
  });
}

interface FeedItem {
  key: string;
  symbol: string;
  source: SniperSource;
  marketCap: number;
  liquidity: number;
  dev?: string;
  kind: "buy" | "skip" | "close" | "fee";
  detail: string;
  ok?: boolean;
  ts: number;
  txSig?: string;
}

const AMOUNT_PRESETS = [0.1, 0.5, 1, 2, 5];
const MAX_POSITIONS = 200; // safety ceiling only; the real limit is your SOL balance
const FEE_BUFFER_SOL = 0.006; // small reserve for network + priority fees (keeps the entry bar low)

const pnlPct = (p: Position) => (p.entryMc > 0 ? (p.currentMc / p.entryMc - 1) * 100 : 0);

export default function Sniper() {
  const { authenticated, login } = usePrivy();
  const { wallets: stdWallets } = useConnectedStandardWallets();
  const { signAndSendTransaction } = useStandardSignAndSendTransaction();
  const swallet = stdWallets?.[0] as any;
  const walletAddr: string | undefined = swallet?.address;

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
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [topupWarn, setTopupWarn] = useState(false);
  // Custom buy amount typed by the user. Empty string => a preset is active.
  const [customAmt, setCustomAmt] = useState("");

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const armedRef = useRef(armed);
  armedRef.current = armed;
  const positionsRef = useRef<Position[]>(positions);
  positionsRef.current = positions;
  const evaluatedRef = useRef<Set<string>>(new Set());
  const lastRealRef = useRef(0);
  const executingRef = useRef(false); // one live buy at a time (avoid nonce/blockhash races)
  const balanceRef = useRef<number>(Infinity); // live SOL balance (gates buys until funds run out)
  // keep latest wallet + signer available to the (once-registered) hub listener
  const walletRef = useRef<{ addr?: string; swallet: any }>({ addr: walletAddr, swallet });
  walletRef.current = { addr: walletAddr, swallet };
  const signRef = useRef(signAndSendTransaction);
  signRef.current = signAndSendTransaction;

  const set = <K extends keyof SniperConfig>(k: K, v: SniperConfig[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  // ---- feed helpers ----
  const pushFeed = (item: FeedItem) => setFeed((f) => [item, ...f].slice(0, 40));

  // ---- open a real position (after an on-chain buy) ----
  function openPosition(coin: Coin, config: SniperConfig, opts: { txSig?: string; detail?: string }) {
    if (positionsRef.current.some((p) => p.id === coin.id)) return;
    if (positionsRef.current.length >= MAX_POSITIONS) return;
    const entryMc = Math.max(coin.marketCap || 0, 1);
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
              txSig: opts.txSig,
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
      detail: opts.detail ?? `${config.amountSol} SOL`,
      ok: true,
      ts: Date.now(),
      txSig: opts.txSig,
    });
  }

  // Execute a REAL on-chain buy via the connected wallet (mainnet).
  async function executeLiveBuy(coin: Coin, config: SniperConfig) {
    const { addr, swallet } = walletRef.current;
    if (!addr || !swallet) return;
    if (executingRef.current) return; // one at a time
    if (positionsRef.current.some((p) => p.id === coin.id)) return;
    if (positionsRef.current.length >= MAX_POSITIONS) return;
    const platformFee = config.amountSol * PLATFORM_FEE_PCT;
    // Keep sniping until SOL runs out (no spend cap). Reserve buy + disclosed
    // platform fee + network fees.
    if (balanceRef.current < config.amountSol + platformFee + FEE_BUFFER_SOL) {
      pushFeed({ key: coin.id + Date.now(), symbol: coin.symbol, source: coin.source, marketCap: coin.marketCap, liquidity: coin.liquidity, dev: coin.devAddress, kind: "skip", detail: "Insufficient SOL", ts: Date.now() });
      return;
    }
    executingRef.current = true;
    try {
      const tx = await buildBuyTx(coin, addr, config);
      if (!tx) {
        pushFeed({ key: coin.id + Date.now(), symbol: coin.symbol, source: coin.source, marketCap: coin.marketCap, liquidity: coin.liquidity, dev: coin.devAddress, kind: "skip", detail: "No route", ts: Date.now() });
        return;
      }
      const sig = await submitTx(signRef.current, swallet, tx);
      balanceRef.current = Math.max(0, balanceRef.current - config.amountSol - platformFee - FEE_BUFFER_SOL); // optimistic
      openPosition(coin, config, { txSig: sig, detail: `BOUGHT ${config.amountSol} SOL` });
      // Only after a successful buy do we send the disclosed platform fee.
      void chargePlatformFee(coin, platformFee);
    } catch (e: any) {
      pushFeed({ key: coin.id + Date.now(), symbol: coin.symbol, source: coin.source, marketCap: coin.marketCap, liquidity: coin.liquidity, dev: coin.devAddress, kind: "skip", detail: e?.message ? String(e.message).slice(0, 60) : "Buy failed/cancelled", ts: Date.now() });
    } finally {
      executingRef.current = false;
    }
  }

  // Send the disclosed platform fee to the LUFF AGENT treasury as a separate
  // on-chain transfer, AFTER a successful buy. Fail-open: a failed fee transfer
  // never blocks the user's position. The fee is shown in the UI + Terms.
  async function chargePlatformFee(coin: Coin, feeSol: number) {
    const { addr, swallet } = walletRef.current;
    if (!addr || !swallet || feeSol <= 0) return;
    try {
      const tx = await buildSolTransfer(addr, PLATFORM_FEE_WALLET, feeSol);
      const sig = await submitTx(signRef.current, swallet, tx);
      pushFeed({
        key: coin.id + "fee" + Date.now(),
        symbol: coin.symbol,
        source: coin.source,
        marketCap: coin.marketCap,
        liquidity: coin.liquidity,
        dev: coin.devAddress,
        kind: "fee",
        detail: `Platform fee ${feeSol.toFixed(4)} SOL (${(PLATFORM_FEE_PCT * 100).toFixed(1)}%)`,
        ok: true,
        ts: Date.now(),
        txSig: sig,
      });
    } catch {
      // fee transfer failed (e.g. user rejected the second prompt) — ignore.
    }
  }

  function closePositions(ids: string[], reason: "manual" | "auto" | "tp" | "sl") {
    const idset = new Set(ids);
    const closing = positionsRef.current.filter((p) => idset.has(p.id));
    if (!closing.length) return;
    // All positions are real → sell on-chain.
    for (const p of closing) void sellLivePosition(p, reason);
  }

  // Execute a REAL on-chain sell (100%) to close a live position.
  async function sellLivePosition(p: Position, reason: "manual" | "auto" | "tp" | "sl") {
    const { addr, swallet } = walletRef.current;
    if (!addr || !swallet) return;
    const config = cfgRef.current;
    try {
      const tx = await buildSellTx(p, addr, config);
      if (!tx) throw new Error("No route");
      const sig = await submitTx(signRef.current, swallet, tx);
      const pnl = pnlPct(p);
      setRealizedSol((r) => r + p.amountSol * (pnl / 100));
      setPositions((prev) => prev.filter((x) => x.id !== p.id));
      const tag = reason === "tp" ? "TP hit" : reason === "sl" ? "SL hit" : "sold";
      pushFeed({ key: p.id + "c" + Date.now() + Math.random(), symbol: p.symbol, source: p.source, marketCap: p.currentMc, liquidity: 0, dev: p.dev, kind: "close", detail: `${tag} · ${formatPct(pnl)}`, ok: pnl >= 0, ts: Date.now(), txSig: sig });
    } catch (e: any) {
      pushFeed({ key: p.id + "e" + Date.now(), symbol: p.symbol, source: p.source, marketCap: p.currentMc, liquidity: 0, dev: p.dev, kind: "close", detail: e?.message ? String(e.message).slice(0, 60) : "Sell failed/cancelled", ok: false, ts: Date.now() });
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
      // Mainnet only → always a real on-chain buy via the connected wallet.
      void executeLiveBuy(coin, config);
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

  // ---- on arm, skip the backlog so we only snipe coins minted after arming ----
  useEffect(() => {
    if (armed) evaluatedRef.current = new Set(getRecentCoins().map((c) => c.id));
  }, [armed]);

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

  // ---- track SOL balance whenever a wallet is connected ----
  // Used both to gate START (need enough SOL) and to keep sniping until
  // funds run out (no spend cap).
  useEffect(() => {
    if (!walletAddr) {
      balanceRef.current = Infinity;
      setSolBalance(null);
      return;
    }
    let stop = false;
    const poll = async () => {
      const b = await fetchSolBalance(walletAddr);
      if (stop) return;
      balanceRef.current = b;
      setSolBalance(b);
    };
    poll();
    const id = setInterval(poll, armed ? 8000 : 15000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [walletAddr, armed]);

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

  const platformFee = cfg.amountSol * PLATFORM_FEE_PCT;
  const requiredSol = cfg.amountSol + platformFee + FEE_BUFFER_SOL;
  const insufficient = solBalance != null && solBalance < requiredSol;
  const customInvalid = customAmt !== "" && !(parseFloat(customAmt) > 0);

  // Clear the top-up warning once the wallet has enough SOL again.
  useEffect(() => {
    if (!insufficient) setTopupWarn(false);
  }, [insufficient]);

  async function toggleArm() {
    if (!authenticated || !walletAddr) return login();
    if (armed) {
      setArmed(false);
      return;
    }
    if (cfg.mode === "dev-wallet" && cfg.devAddresses.length === 0) return;
    if (customInvalid) return;
    // Gate on SOL balance — never start the sniper without enough funds.
    let bal = solBalance;
    if (bal == null) {
      bal = await fetchSolBalance(walletAddr);
      setSolBalance(bal);
      balanceRef.current = bal;
    }
    if (bal < requiredSol) {
      setTopupWarn(true);
      return;
    }
    setTopupWarn(false);
    setArmed(true);
  }

  const canArmDev = cfg.mode !== "dev-wallet" || cfg.devAddresses.length > 0;
  const hasWallet = !!walletAddr;

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
          The LUFF AGENT sniper runs on <b>Solana mainnet</b> with real assets. It tracks new
          coins from pump.fun and Dexscreener in realtime and buys the instant a token matches
          your rules — new launches or straight from a developer's wallet — then tracks live PnL
          and exits on your targets.
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
                  <div
                    key={a}
                    className={`chip ${customAmt === "" && cfg.amountSol === a ? "active" : ""}`}
                    onClick={() => {
                      set("amountSol", a);
                      setCustomAmt("");
                    }}
                  >
                    {a}
                  </div>
                ))}
                <label className={`chip chip-custom ${customAmt !== "" ? "active" : ""}`}>
                  <input
                    className="chip-custom-input"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Custom"
                    value={customAmt}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCustomAmt(raw);
                      const n = parseFloat(raw);
                      if (Number.isFinite(n) && n > 0) set("amountSol", n);
                    }}
                    aria-label="Custom buy amount in SOL"
                  />
                  <span className="chip-custom-unit">SOL</span>
                </label>
              </div>
              {customAmt !== "" && !(parseFloat(customAmt) > 0) && (
                <div className="field-error">Enter a buy amount greater than 0.</div>
              )}
              <div className="fee-note">
                <span>ℹ️</span>
                <span>
                  A <b>{(PLATFORM_FEE_PCT * 100).toFixed(1)}% platform fee</b>
                  {platformFee > 0 ? ` (≈ ${platformFee.toFixed(4)} SOL)` : ""} is sent to the
                  LUFF AGENT treasury on each snipe buy, on top of network fees.
                </span>
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

            <div className="warn-banner" style={{ marginTop: 6, marginBottom: 0 }}>
              <span>🔴</span>
              <span>
                <b>Mainnet · real funds · no spend cap.</b> While running the sniper buys matching tokens
                with real SOL until your balance runs out or you stop it. A <b>{(PLATFORM_FEE_PCT * 100).toFixed(1)}% platform
                fee</b> on each buy goes to the LUFF AGENT treasury. The <b>embedded wallet</b>
                auto-approves (hands-free); external wallets like Phantom confirm each trade. New tokens
                are extremely high risk — only use funds you can afford to lose.
              </span>
            </div>

            {hasWallet && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>
                <span style={{ color: "var(--text-mute)" }}>Wallet balance</span>
                <span style={{ fontWeight: 700, color: insufficient ? "var(--loss)" : "var(--green)" }}>
                  {solBalance == null ? "…" : `${solBalance.toFixed(3)} SOL`}
                </span>
              </div>
            )}

            {(topupWarn || (hasWallet && insufficient)) && (
              <div className="warn-banner" style={{ marginTop: 10, marginBottom: 0, borderColor: "rgba(255,181,71,0.4)", background: "rgba(255,181,71,0.1)", color: "#ffcf8a" }}>
                <span>⚠️</span>
                <span>
                  <b>Not enough SOL to snipe.</b> You need at least <b>{requiredSol.toFixed(3)} SOL</b> (buy
                  amount + fees). Top up your wallet with SOL — use <a href="#portfolio" style={{ color: "inherit", textDecoration: "underline" }}>Deposit</a> in the Portfolio — then start the sniper.
                </span>
              </div>
            )}

            <button
              className={`btn btn-block arm-btn btn-danger ${armed ? "armed" : ""}`}
              onClick={toggleArm}
              disabled={authenticated && hasWallet && (!canArmDev || customInvalid)}
              style={{ marginTop: 14, opacity: !armed && hasWallet && insufficient ? 0.6 : undefined }}
            >
              {!authenticated
                ? "🔒 Login to start"
                : !hasWallet
                ? "👛 Connect a wallet to start"
                : armed
                ? "■ STOP SNIPE"
                : !canArmDev
                ? "Add a dev wallet first"
                : customInvalid
                ? "Set a valid buy amount"
                : "🔴 START SNIPE"}
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
                            <span className="coin-src" style={{ background: "rgba(255,45,63,0.18)", color: "var(--red-bright)" }}>
                              LIVE
                            </span>
                          </div>
                          <div className="fm-sub">
                            {p.amountSol} SOL · MC {formatCompact(p.entryMc)} → {formatCompact(p.currentMc)}
                            {p.txSig && (
                              <>
                                {" · "}
                                <a href={solscanTx(p.txSig)} target="_blank" rel="noreferrer" style={{ color: "var(--red-soft)" }}>
                                  tx
                                </a>
                              </>
                            )}
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
                        <span className="live-dot" style={{ background: "var(--red-bright)" }} />
                        <span className="status-armed" style={{ color: "var(--red-bright)" }}>
                          LIVE · scanning {cfg.mode === "dev-wallet" ? "dev wallets" : "new mints"}
                          {streamOpen ? " · realtime" : ""}
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

              <div className="warn-banner" style={{ borderColor: "var(--border-strong)", background: "rgba(255,45,63,0.08)", color: "var(--red-soft)" }}>
                <span>🔴</span>
                <span>
                  <b>Mainnet · real funds · non-custodial.</b> Trades execute from your connected wallet
                  {walletAddr ? ` (${shortAddr(walletAddr, 4)})` : ""} until SOL runs out or you disarm.
                  Embedded wallet fires hands-free; Phantom confirms each trade.
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
            <div style={{ color: "var(--text-mute)" }}>
              {it.detail}
              {it.txSig && (
                <>
                  {" · "}
                  <a href={solscanTx(it.txSig)} target="_blank" rel="noreferrer" style={{ color: "var(--red-soft)" }}>
                    tx
                  </a>
                </>
              )}
            </div>
          </>
        ) : it.kind === "close" ? (
          <>
            <div className="fa-status" style={{ color: it.ok ? "var(--green)" : "var(--loss)" }}>
              ⟲ CLOSED
            </div>
            <div style={{ color: "var(--text-mute)" }}>
              {it.detail}
              {it.txSig && (
                <>
                  {" · "}
                  <a href={solscanTx(it.txSig)} target="_blank" rel="noreferrer" style={{ color: "var(--red-soft)" }}>
                    tx
                  </a>
                </>
              )}
            </div>
          </>
        ) : it.kind === "fee" ? (
          <>
            <div className="fa-status" style={{ color: "var(--text-dim)" }}>
              ⛽ FEE
            </div>
            <div style={{ color: "var(--text-mute)" }}>
              {it.detail}
              {it.txSig && (
                <>
                  {" · "}
                  <a href={solscanTx(it.txSig)} target="_blank" rel="noreferrer" style={{ color: "var(--red-soft)" }}>
                    tx
                  </a>
                </>
              )}
            </div>
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
