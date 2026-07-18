import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Coin } from "../lib/market";
import { buildSeries, nextLivePrice } from "../lib/market";
import { formatPrice, formatCompact, formatPct } from "../lib/format";
import Socials from "./Socials";

interface Props {
  coin: Coin;
  onClose: () => void;
}

// Full realtime chart shown in a modal for a selected coin.
export default function CoinChart({ coin, onClose }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart: IChartApi = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#c39aa1",
        fontFamily: "JetBrains Mono, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,77,94,0.06)" },
        horzLines: { color: "rgba(255,77,94,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(255,77,94,0.14)" },
      timeScale: { borderColor: "rgba(255,77,94,0.14)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const up = (coin.change24h || 0) >= 0;
    const color = up ? "#22e39a" : "#ff5468";
    const series: ISeriesApi<"Area"> = chart.addAreaSeries({
      lineColor: color,
      topColor: up ? "rgba(34,227,154,0.32)" : "rgba(255,84,104,0.32)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceLineColor: color,
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });

    const initial = buildSeries(coin, 120).map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    series.setData(initial);
    chart.timeScale().fitContent();

    let lastTime = initial[initial.length - 1].time as number;
    let lastVal = coin.priceUsd || initial[initial.length - 1].value;

    const tick = setInterval(() => {
      lastTime += 5;
      lastVal = nextLivePrice(lastVal, 0.008);
      series.update({ time: lastTime as UTCTimestamp, value: lastVal });
      if (priceRef.current) priceRef.current.textContent = formatPrice(lastVal);
    }, 1200);

    const onResize = () => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    window.addEventListener("resize", onResize);

    return () => {
      clearInterval(tick);
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [coin]);

  const up = (coin.change24h || 0) >= 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <CoinBadge coin={coin} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: "1.15rem" }}>{coin.symbol}</strong>
                <span className={`coin-src ${coin.source === "pump.fun" ? "src-pump" : "src-dex"}`}>
                  {coin.source}
                </span>
              </div>
              <div style={{ color: "var(--text-mute)", fontSize: "0.82rem" }}>{coin.name}</div>
              <div style={{ marginTop: 6 }}>
                <Socials coin={coin} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              <span ref={priceRef} className="mono" style={{ fontSize: "1.2rem", fontWeight: 600 }}>
                {formatPrice(coin.priceUsd)}
              </span>
              <div className={`mono ${up ? "fa-buy" : ""}`} style={{ fontSize: "0.85rem", color: up ? "#22e39a" : "#ff5468" }}>
                {formatPct(coin.change24h)} (24h)
              </div>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: "0.78rem" }} className="mono">
          <span className="live-dot" /> LIVE PRICE FEED
        </div>
        <div ref={wrapRef} className="chart-box" />

        {coin.description && (
          <p style={{ color: "var(--text-dim)", fontSize: "0.88rem", marginTop: 14, marginBottom: 0 }}>
            {coin.description.length > 240 ? coin.description.slice(0, 240) + "…" : coin.description}
          </p>
        )}

        <div className="modal-stats">
          <Stat label="Market Cap" value={formatCompact(coin.marketCap)} />
          <Stat label="Liquidity" value={formatCompact(coin.liquidity)} />
          <Stat label="24h Volume" value={formatCompact(coin.volume24h)} />
          <Stat label="24h Txns" value={coin.txns24h ? coin.txns24h.toLocaleString() : "—"} />
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <a className="btn btn-primary" href="#sniper" onClick={onClose}>
            🎯 Snipe this token
          </a>
          {coin.url && (
            <a className="btn btn-ghost" href={coin.url} target="_blank" rel="noreferrer">
              View on {coin.source} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ms">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function CoinBadge({ coin }: { coin: Coin }) {
  if (coin.imageUrl) {
    return <img className="coin-logo" src={coin.imageUrl} alt="" style={{ width: 46, height: 46 }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />;
  }
  return <div className="coin-logo" style={{ width: 46, height: 46 }}>{coin.symbol.slice(0, 3)}</div>;
}
