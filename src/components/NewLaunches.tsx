import { useEffect, useRef, useState } from "react";
import type { Coin } from "../lib/market";
import { joinHub, getRecentCoins, type TradeUpdate } from "../lib/pumphub";
import { formatCompact, timeAgo, shortAddr } from "../lib/format";
import Socials from "./Socials";

type Src = "all" | "pump.fun" | "dexscreener";

interface Props {
  onSnipe?: (coin: Coin) => void;
  onOpen?: (coin: Coin) => void;
}

// Realtime feed of brand-new coins from the shared hub. Truly-new
// bonding-curve mints stream in live over WebSocket + fast pump.fun poll;
// each coin's bonding-curve progress updates live on every trade.
export default function NewLaunches({ onSnipe, onOpen }: Props) {
  const [coins, setCoins] = useState<Coin[]>(() => getRecentCoins());
  const [src, setSrc] = useState<Src>("all");
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [loading, setLoading] = useState(() => getRecentCoins().length === 0);
  const [streamOpen, setStreamOpen] = useState(false);
  const [dataLive, setDataLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [, forceAge] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set(getRecentCoins().map((c) => c.id)));
  const ready = useRef(false);
  const pendingTrades = useRef<Map<string, TradeUpdate>>(new Map());

  function upsertOne(coin: Coin) {
    setCoins((prev) => {
      const map = new Map<string, Coin>();
      map.set(coin.id, coin);
      for (const c of prev) if (!map.has(c.id)) map.set(c.id, c);
      else if (c.id === coin.id) map.set(c.id, { ...c, ...coin });
      return [...map.values()]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 80);
    });
  }

  function markFresh(ids: string[]) {
    if (!ids.length) return;
    setFresh((f) => new Set(f).add(ids[0]));
    setTimeout(() => {
      setFresh((f) => {
        const n = new Set(f);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }, 2800);
  }

  function markPulse(ids: string[]) {
    if (!ids.length) return;
    setPulse((p) => {
      const n = new Set(p);
      ids.forEach((id) => n.add(id));
      return n;
    });
    setTimeout(() => {
      setPulse((p) => {
        const n = new Set(p);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }, 900);
  }

  useEffect(() => {
    const leave = joinHub({
      onStatus: setStreamOpen,
      onCoin: (coin) => {
        const isNew = !seen.current.has(coin.id);
        seen.current.add(coin.id);
        upsertOne(coin);
        setDataLive(true);
        setLoading(false);
        setUpdatedAt(Date.now());
        if (isNew && ready.current) markFresh([coin.id]);
      },
      onTrade: (t) => {
        pendingTrades.current.set(t.mint, t);
      },
    });

    const readyT = setTimeout(() => (ready.current = true), 700);
    const ager = setInterval(() => forceAge((x) => x + 1), 1000);
    const flush = setInterval(() => {
      if (!pendingTrades.current.size) return;
      const updates = pendingTrades.current;
      pendingTrades.current = new Map();
      const ids = [...updates.keys()];
      setCoins((prev) =>
        prev.map((c) => {
          const u = updates.get(c.id);
          if (!u) return c;
          return {
            ...c,
            marketCap: u.marketCap,
            liquidity: u.liquidity || c.liquidity,
            bondingProgress: u.bondingProgress,
            isBondingCurve: u.bondingProgress < 100,
          };
        })
      );
      markPulse(ids);
      setUpdatedAt(Date.now());
    }, 650);

    return () => {
      leave();
      clearTimeout(readyT);
      clearInterval(ager);
      clearInterval(flush);
    };
  }, []);

  const filtered = coins
    .filter((c) => (src === "all" ? true : c.source === src))
    .sort((a, b) =>
      sort === "hot"
        ? (b.potentialScore || 0) - (a.potentialScore || 0)
        : (b.createdAt || 0) - (a.createdAt || 0)
    );
  const counts = {
    all: coins.length,
    "pump.fun": coins.filter((c) => c.source === "pump.fun").length,
    dexscreener: coins.filter((c) => c.source === "dexscreener").length,
  };
  const live = streamOpen || dataLive;

  return (
    <div className="card nl-panel">
      <div className="nl-head">
        <div className="nl-title">
          <span className="live-dot" style={{ background: live ? "#22e39a" : "#ffb547" }} />
          🚀 New Launches — Realtime
          <span className="nl-count">{filtered.length} coins</span>
          {streamOpen && (
            <span className="nl-count" style={{ color: "#22e39a", borderColor: "rgba(34,227,154,0.4)" }}>
              ● LIVE stream
            </span>
          )}
        </div>
        <div className="nl-controls">
          {(["all", "pump.fun", "dexscreener"] as Src[]).map((s) => (
            <button
              key={s}
              className={`nl-filter ${src === s ? "active" : ""}`}
              onClick={() => setSrc(s)}
            >
              {s === "all" ? "All" : s === "pump.fun" ? "pump.fun" : "Dexscreener"}
              <span style={{ opacity: 0.7 }}> · {counts[s]}</span>
            </button>
          ))}
          <span className="nl-sort-sep" />
          <button className={`nl-filter ${sort === "new" ? "active" : ""}`} onClick={() => setSort("new")}>
            Newest
          </button>
          <button className={`nl-filter ${sort === "hot" ? "active" : ""}`} onClick={() => setSort("hot")}>
            🔥 Hot
          </button>
        </div>
      </div>

      {loading && coins.length === 0 ? (
        <div className="nl-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="nl-card">
              <div className="skeleton" style={{ height: 32, width: 32, borderRadius: 9, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 12, width: "70%", marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 28, width: "100%" }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="nl-empty">
          Listening for new launches — the feed updates live as coins are minted.
        </div>
      ) : (
        <div className="nl-grid">
          {filtered.map((c) => (
            <NLCard
              key={c.id}
              coin={c}
              fresh={fresh.has(c.id)}
              pulsing={pulse.has(c.id)}
              onSnipe={onSnipe}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <div className="data-note">
        <span>📡</span>
        Live bonding-curve stream + fast pump.fun &amp; Dexscreener polling
        {updatedAt ? ` · updated ${timeAgo(updatedAt)}` : ""}. Falls back to samples if a
        source is unreachable.
      </div>
    </div>
  );
}

function potClass(score: number): string {
  return score >= 66 ? "pot-high" : score >= 33 ? "pot-mid" : "pot-low";
}

function NLCard({
  coin,
  fresh,
  pulsing,
  onSnipe,
  onOpen,
}: {
  coin: Coin;
  fresh: boolean;
  pulsing?: boolean;
  onSnipe?: (c: Coin) => void;
  onOpen?: (c: Coin) => void;
}) {
  const prog = coin.bondingProgress;
  const showProg = coin.isBondingCurve && typeof prog === "number";
  return (
    <div className={`nl-card ${fresh ? "fresh" : ""}`}>
      <div className="nl-card-head">
        {coin.imageUrl ? (
          <img
            className="nl-logo"
            src={coin.imageUrl}
            alt=""
            loading="lazy"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <div className="nl-logo">{coin.symbol.slice(0, 3)}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="nl-sym">
            {coin.symbol}{" "}
            <span className={`coin-src ${coin.source === "pump.fun" ? "src-pump" : "src-dex"}`}>
              {coin.source === "pump.fun" ? "pump" : "dex"}
            </span>
          </div>
          <div className="nl-name">{coin.name}</div>
        </div>
        {coin.createdAt ? <span className="nl-age">{timeAgo(coin.createdAt)}</span> : null}
      </div>

      {typeof coin.potentialScore === "number" && (
        <div className="nl-potential" title="Live profit-potential score (buy pressure, growth, volume)">
          <span className="nl-pot-label">🔥 Potential</span>
          <div className="nl-pot-bar">
            <span
              className={potClass(coin.potentialScore)}
              style={{ width: `${Math.max(3, coin.potentialScore)}%` }}
            />
          </div>
          <span className={`nl-pot-score ${potClass(coin.potentialScore)}`}>{coin.potentialScore}</span>
        </div>
      )}

      {showProg && (
        <div className="nl-bonding" title="Live bonding-curve progress toward graduation">
          <div className={`nl-bonding-bar ${pulsing ? "pulse" : ""}`}>
            <span style={{ width: `${Math.max(2, Math.min(100, prog!))}%` }} />
          </div>
          <span className="nl-bonding-pct">
            {pulsing && <span className="nl-live-dot" />}
            {prog! >= 100 ? "graduated" : `${prog!.toFixed(1)}%`}
          </span>
        </div>
      )}

      <div className="nl-meta">
        <span>
          MC <b>{formatCompact(coin.marketCap)}</b>
        </span>
        <span>
          Liq <b>{formatCompact(coin.liquidity)}</b>
        </span>
      </div>

      {(coin.twitter || coin.telegram || coin.website || coin.devAddress) && (
        <div className="nl-social-row">
          <Socials coin={coin} />
          {coin.devAddress && (
            <span className="nl-dev" title={`Dev: ${coin.devAddress}`}>
              dev {shortAddr(coin.devAddress, 4)}
            </span>
          )}
        </div>
      )}

      <div className="nl-actions">
        <button className="nl-snipe" onClick={() => onSnipe?.(coin)}>
          🎯 Snipe
        </button>
        {onOpen && (
          <button className="nl-link" title="Live chart" onClick={() => onOpen(coin)}>
            📈
          </button>
        )}
        {coin.url && (
          <a
            className="nl-link"
            href={coin.url}
            target="_blank"
            rel="noreferrer"
            title="Open source"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}
