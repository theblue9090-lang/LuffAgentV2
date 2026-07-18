import { useEffect, useMemo, useRef, useState } from "react";
import type { Coin } from "../lib/market";
import { fetchTopCoins, fetchMovers, fetchNewLaunches, buildSeries, nextLivePrice } from "../lib/market";
import { formatPrice, formatCompact, formatPct, timeAgo } from "../lib/format";
import Sparkline from "./Sparkline";
import CoinChart from "./CoinChart";

type Tab = "top" | "movers" | "new";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "top", label: "Top Coins · Trending", icon: "🏆" },
  { id: "movers", label: "Gainers", icon: "📈" },
  { id: "new", label: "New Launches", icon: "✨" },
];

export default function Markets() {
  const [tab, setTab] = useState<Tab>("top");
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<Coin | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  // live micro-price ticks applied on top of fetched prices
  const [tickPrices, setTickPrices] = useState<Record<string, number>>({});
  const tickRef = useRef<Record<string, number>>({});

  async function load(t: Tab) {
    setLoading(true);
    try {
      const fn = t === "top" ? fetchTopCoins : t === "movers" ? fetchMovers : fetchNewLaunches;
      const data = await fn();
      setCoins(data);
      setLive(true);
      setUpdatedAt(Date.now());
      // reset live ticks to fetched prices
      const seed: Record<string, number> = {};
      data.forEach((c) => (seed[c.id] = c.priceUsd));
      tickRef.current = seed;
      setTickPrices(seed);
    } catch {
      setLive(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab);
    const poll = setInterval(() => load(tab), 20000); // refresh real data
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // realtime micro-ticks between polls for a live feel
  useEffect(() => {
    const id = setInterval(() => {
      const cur = tickRef.current;
      const next: Record<string, number> = {};
      for (const k in cur) next[k] = nextLivePrice(cur[k], 0.005);
      tickRef.current = next;
      setTickPrices({ ...next });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="section" id="markets">
      <div className="container">
        <div className="section-eyebrow">Realtime Markets</div>
        <h2 className="section-title">
          Top coins &amp; movers from <span className="accent">pump.fun</span> &amp;{" "}
          <span className="accent">Dexscreener</span>
        </h2>
        <p className="section-sub">
          Live prices, market caps and momentum — with a realtime chart on every coin.
          Tap any card to open the full live feed.
        </p>

        <div className="market-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`market-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
          <span className="data-note" style={{ marginLeft: "auto", marginTop: 0 }}>
            <span className="live-dot" style={{ background: live ? "#22e39a" : "#ffb547" }} />
            {live ? "Live" : "Reconnecting"}
            {updatedAt ? ` · ${timeAgo(updatedAt)}` : ""}
          </span>
        </div>

        <div className="coin-grid">
          {loading && coins.length === 0
            ? Array.from({ length: 8 }).map((_, i) => <CoinSkeleton key={i} />)
            : coins.map((c) => (
                <CoinCard
                  key={c.id}
                  coin={c}
                  livePrice={tickPrices[c.id] ?? c.priceUsd}
                  onOpen={() => setSelected(c)}
                />
              ))}
        </div>

        <div className="data-note">
          <span>⚡</span>
          Data via Dexscreener &amp; pump.fun public APIs. Prices refresh every 45s with
          live micro-ticks in between. Not financial advice.
        </div>
      </div>

      {selected && <CoinChart coin={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function CoinCard({ coin, livePrice, onOpen }: { coin: Coin; livePrice: number; onOpen: () => void }) {
  // Live 24h %: re-anchor the known 24h-ago price and recompute against the
  // ticking live price, so the percentage moves in realtime with the price.
  const price24hAgo = useMemo(() => {
    const denom = 1 + (coin.change24h || 0) / 100;
    return denom > 0 ? coin.priceUsd / denom : coin.priceUsd;
  }, [coin.priceUsd, coin.change24h]);
  const liveChange =
    price24hAgo > 0 ? (livePrice / price24hAgo - 1) * 100 : coin.change24h || 0;
  const up = liveChange >= 0;
  const series = useMemo(() => buildSeries(coin, 40), [coin.id, coin.change24h]);
  const hasChange = coin.change24h !== 0 || !!coin.marketCap;

  return (
    <div className="card coin-card" onClick={onOpen}>
      <div className="coin-head">
        {coin.imageUrl ? (
          <img
            className="coin-logo"
            src={coin.imageUrl}
            alt=""
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="coin-logo">{coin.symbol.slice(0, 3)}</div>
        )}
        <div className="coin-id">
          <div className="coin-symbol">
            {coin.symbol}
          </div>
          <div className="coin-name">{coin.name}</div>
        </div>
        <span className={`coin-src ${coin.source === "pump.fun" ? "src-pump" : "src-dex"}`}>
          {coin.source === "pump.fun" ? "pump" : "dex"}
        </span>
      </div>

      <div className="coin-price-row">
        <span className="coin-price">{formatPrice(livePrice)}</span>
        {hasChange ? (
          <span className={`chg ${up ? "up" : "down"}`}>{formatPct(liveChange)}</span>
        ) : (
          <span className="pill">{coin.createdAt ? timeAgo(coin.createdAt) : "new"}</span>
        )}
      </div>

      <Sparkline data={series} up={up} />

      <div className="coin-meta">
        <div>
          <div className="m-lbl">MCap</div>
          <div className="m-val">{formatCompact(coin.marketCap)}</div>
        </div>
        <div>
          <div className="m-lbl">Liq</div>
          <div className="m-val">{formatCompact(coin.liquidity)}</div>
        </div>
        <div>
          <div className="m-lbl">Vol 24h</div>
          <div className="m-val">{formatCompact(coin.volume24h)}</div>
        </div>
      </div>
    </div>
  );
}

function CoinSkeleton() {
  return (
    <div className="card coin-card">
      <div className="coin-head">
        <div className="coin-logo skeleton" />
        <div className="coin-id" style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 10, width: "80%" }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 22, width: "50%", marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 56, width: "100%", marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 34, width: "100%" }} />
    </div>
  );
}
