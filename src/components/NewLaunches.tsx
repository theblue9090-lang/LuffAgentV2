import { useEffect, useRef, useState } from "react";
import type { Coin } from "../lib/market";
import { fetchNewLaunches, fetchSolPrice } from "../lib/market";
import { subscribeNewTokens } from "../lib/pumpstream";
import { formatCompact, timeAgo, shortAddr } from "../lib/format";
import Socials from "./Socials";

type Src = "all" | "pump.fun" | "dexscreener";

interface Props {
  onSnipe?: (coin: Coin) => void;
  onOpen?: (coin: Coin) => void;
}

const REFRESH_MS = 6000;

// Realtime feed of brand-new coins. Truly-new bonding-curve mints stream in
// live over WebSocket (pump.fun), backed by REST polling from pump.fun +
// Dexscreener. Newest first, deduped, live-aged.
export default function NewLaunches({ onSnipe, onOpen }: Props) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [src, setSrc] = useState<Src>("all");
  const [loading, setLoading] = useState(true);
  const [restLive, setRestLive] = useState(false);
  const [streamOpen, setStreamOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [, forceAge] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Merge coins into the list, newest-first, deduped, capped.
  function upsert(incoming: Coin[]) {
    setCoins((prev) => {
      const map = new Map<string, Coin>();
      for (const c of incoming) map.set(c.id, c);
      for (const c of prev) if (!map.has(c.id)) map.set(c.id, c);
      return [...map.values()]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 80);
    });
  }

  function markFresh(ids: string[]) {
    if (!ids.length) return;
    setFresh((f) => {
      const n = new Set(f);
      ids.forEach((id) => n.add(id));
      return n;
    });
    setTimeout(() => {
      setFresh((f) => {
        const n = new Set(f);
        ids.forEach((id) => n.delete(id));
        return n;
      });
    }, 2800);
  }

  async function loadRest() {
    try {
      const data = await fetchNewLaunches(60);
      setRestLive(true);
      setUpdatedAt(Date.now());
      const newlyFresh = data.filter((c) => !seen.current.has(c.id)).map((c) => c.id);
      upsert(data);
      for (const c of data) seen.current.add(c.id);
      // don't flash on the very first load (everything is "new" then)
      if (seen.current.size > newlyFresh.length) markFresh(newlyFresh);
    } catch {
      setRestLive(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSolPrice();
    loadRest();
    const poll = setInterval(loadRest, REFRESH_MS);
    const price = setInterval(fetchSolPrice, 30000);
    const ager = setInterval(() => forceAge((x) => x + 1), 1000);

    // Live WebSocket stream of brand-new bonding-curve mints.
    const stream = subscribeNewTokens({
      onStatus: setStreamOpen,
      onToken: (coin) => {
        if (seen.current.has(coin.id)) return;
        seen.current.add(coin.id);
        upsert([coin]);
        markFresh([coin.id]);
        setUpdatedAt(Date.now());
      },
    });

    return () => {
      clearInterval(poll);
      clearInterval(price);
      clearInterval(ager);
      stream.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = coins.filter((c) => (src === "all" ? true : c.source === src));
  const counts = {
    all: coins.length,
    "pump.fun": coins.filter((c) => c.source === "pump.fun").length,
    dexscreener: coins.filter((c) => c.source === "dexscreener").length,
  };
  const live = streamOpen || restLive;

  return (
    <div className="card nl-panel">
      <div className="nl-head">
        <div className="nl-title">
          <span className="live-dot" style={{ background: live ? "#22e39a" : "#ffb547" }} />
          🚀 New Launches — Realtime
          <span className="nl-count">{filtered.length} coins</span>
          {streamOpen && (
            <span className="nl-count" style={{ color: "#22e39a", borderColor: "rgba(34,227,154,0.4)" }}>
              ● LIVE bonding-curve stream
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
              onSnipe={onSnipe}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <div className="data-note">
        <span>📡</span>
        Live bonding-curve stream + REST from pump.fun and Dexscreener
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

      {showProg && (
        <div className="nl-bonding" title="Bonding curve progress toward graduation">
          <div className="nl-bonding-bar">
            <span style={{ width: `${Math.max(2, Math.min(100, prog!))}%` }} />
          </div>
          <span className="nl-bonding-pct">{prog! >= 100 ? "graduated" : `${prog!.toFixed(0)}%`}</span>
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
