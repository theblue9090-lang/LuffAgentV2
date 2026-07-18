import { useEffect, useRef, useState } from "react";
import type { Coin } from "../lib/market";
import { fetchNewLaunches } from "../lib/market";
import { formatCompact, timeAgo } from "../lib/format";

type Src = "all" | "pump.fun" | "dexscreener";

interface Props {
  onSnipe?: (coin: Coin) => void;
  onOpen?: (coin: Coin) => void;
}

const REFRESH_MS = 15000;

// Realtime feed of brand-new coins from pump.fun + Dexscreener,
// shown at the top of the sniper. Newest first, deduped, live-aged.
export default function NewLaunches({ onSnipe, onOpen }: Props) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [src, setSrc] = useState<Src>("all");
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [, forceAge] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const data = await fetchNewLaunches(60);
      setLive(true);
      setUpdatedAt(Date.now());

      const newlyFresh = new Set<string>();
      for (const c of data) if (!seen.current.has(c.id)) newlyFresh.add(c.id);

      setCoins((prev) => {
        const map = new Map<string, Coin>();
        for (const c of data) map.set(c.id, c);
        // keep older ones we already had (so the list grows, not flickers)
        for (const c of prev) if (!map.has(c.id)) map.set(c.id, c);
        return [...map.values()]
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .slice(0, 80);
      });

      for (const c of data) seen.current.add(c.id);
      if (newlyFresh.size && seen.current.size > newlyFresh.size) {
        setFresh(newlyFresh);
        setTimeout(() => setFresh(new Set()), 2600);
      }
    } catch {
      setLive(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, REFRESH_MS);
    const ager = setInterval(() => forceAge((x) => x + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(ager);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = coins.filter((c) => (src === "all" ? true : c.source === src));
  const counts = {
    all: coins.length,
    "pump.fun": coins.filter((c) => c.source === "pump.fun").length,
    dexscreener: coins.filter((c) => c.source === "dexscreener").length,
  };

  return (
    <div className="card nl-panel">
      <div className="nl-head">
        <div className="nl-title">
          <span className="live-dot" style={{ background: live ? "#22e39a" : "#ffb547" }} />
          🚀 New Launches — Realtime
          <span className="nl-count">{filtered.length} coins</span>
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
          No new launches detected right now — the feed refreshes every {REFRESH_MS / 1000}s.
        </div>
      ) : (
        <div className="nl-grid">
          {filtered.map((c) => (
            <NLCard
              key={c.id}
              coin={c}
              fresh={fresh.has(c.id)}
              onSnipe={onSnipe}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <div className="data-note">
        <span>📡</span>
        Streaming new mints &amp; pairs live from pump.fun and Dexscreener
        {updatedAt ? ` · updated ${timeAgo(updatedAt)}` : ""}. Falls back to samples if a
        source is unreachable.
      </div>
    </div>
  );
}

function NLCard({
  coin,
  fresh,
  onSnipe,
  onOpen,
}: {
  coin: Coin;
  fresh: boolean;
  onSnipe?: (c: Coin) => void;
  onOpen?: (c: Coin) => void;
}) {
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

      <div className="nl-meta">
        <span>
          MC <b>{formatCompact(coin.marketCap)}</b>
        </span>
        <span>
          Liq <b>{formatCompact(coin.liquidity)}</b>
        </span>
      </div>

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
          <a className="nl-link" href={coin.url} target="_blank" rel="noreferrer" title="Open source" onClick={(e) => e.stopPropagation()}>
            ↗
          </a>
        )}
      </div>
    </div>
  );
}
