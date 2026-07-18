import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

const TICKERS = [
  ["SOL/USD", "+4.2%"],
  ["NEW MINT", "detected"],
  ["SNIPE", "filled 312ms"],
  ["WIF/USD", "+8.9%"],
  ["LP BURN", "verified"],
];

export default function Hero() {
  const { authenticated, login } = usePrivy();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % TICKERS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero container" id="top">
      <div className="hero-grid">
        <div>
          <div className="hero-badge">
            <span className="live-dot" /> LIVE ON SOLANA · PUMP.FUN + DEXSCREENER
          </div>
          <h1>
            Hunt every launch.
            <br />
            <span className="grad">Snipe it in one shot.</span>
          </h1>
          <p className="lead">
            LUFF AGENT is an AI-powered crypto agent that tracks top coins, movers
            and brand-new launches in realtime — then executes your sniper strategy
            the instant a token matches your rules.
          </p>
          <div className="hero-cta">
            {!authenticated && (
              <button className="btn btn-primary" onClick={login}>
                Connect &amp; Launch Agent
              </button>
            )}
            <a className="btn btn-ghost" href="#sniper">
              Open Sniper →
            </a>
            <a className="btn btn-ghost" href="#markets">
              View Markets
            </a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="num">&lt;350ms</div>
              <div className="lbl">Median snipe fill</div>
            </div>
            <div className="hero-stat">
              <div className="num">2</div>
              <div className="lbl">Realtime sources</div>
            </div>
            <div className="hero-stat">
              <div className="num">24/7</div>
              <div className="lbl">Autonomous tracking</div>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-hidden>
          <div className="scanline" />
          <div className="reticle">
            <div className="ring r1" />
            <div className="ring r2" />
            <div className="ring r3" />
            <div className="cross-v" />
            <div className="cross-h" />
            <div className="core" />
          </div>
          <div className="hero-ticker">
            <span className="tk-label">{TICKERS[tick][0]}</span>
            <span className="tk-val">{TICKERS[tick][1]}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
