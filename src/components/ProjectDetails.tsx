const FEATURES = [
  {
    ico: "⚡",
    title: "Sub-second execution",
    desc: "A low-latency execution layer submits your buy with tuned priority fees the moment a token clears your filters — median fills under 350ms.",
  },
  {
    ico: "📡",
    title: "Dual realtime sources",
    desc: "Streams new mints from pump.fun's bonding curve and fresh pairs from Dexscreener simultaneously, so nothing slips past.",
  },
  {
    ico: "🛡️",
    title: "Anti-rug shield",
    desc: "Every candidate is screened for revoked mint authority, burned LP and whale concentration before a single lamport is spent.",
  },
  {
    ico: "🎯",
    title: "Dev-wallet sniping",
    desc: "Track any developer's address and auto-buy the instant they deploy a new token — front-run the crowd on serial launchers.",
  },
  {
    ico: "🤖",
    title: "Rule-based automation",
    desc: "Define liquidity, market-cap, age, slippage, take-profit and stop-loss once. The agent enforces them on every launch, around the clock.",
  },
  {
    ico: "🔐",
    title: "Non-custodial by design",
    desc: "Login and signing run through Privy. Your keys stay in your wallet — LUFF AGENT never holds custody of your funds.",
  },
];

const SPECS: [string, string][] = [
  ["Chain", "Solana"],
  ["Sources", "pump.fun · Dexscreener"],
  ["Auth", "Privy.io (wallet / email / social)"],
  ["Execution", "Jupiter + pump.fun swap routes"],
  ["Median fill", "< 350 ms"],
  ["Modes", "New launches · Dev wallet"],
  ["Risk controls", "Anti-rug · TP / SL · max spend"],
  ["Custody", "Non-custodial"],
];

export default function ProjectDetails() {
  return (
    <section className="section" id="project">
      <div className="container">
        <div className="section-eyebrow">Detail Project</div>
        <h2 className="section-title">
          What is <span className="accent">LUFF AGENT?</span>
        </h2>
        <p className="section-sub">
          LUFF AGENT is an autonomous on-chain trading agent built for Solana's fastest
          markets. It fuses realtime market intelligence with a precision sniper so degens
          and pros alike can act on new launches faster than manual trading ever allows.
          You stay in control of strategy and keys; the agent handles the speed.
        </p>

        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="card feature" key={f.title}>
              <div className="ico">{f.ico}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="detail-split">
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", margin: "0 0 6px" }}>
              How the agent thinks
            </h3>
            <p style={{ color: "var(--text-dim)", marginTop: 0, marginBottom: 22 }}>
              A four-stage pipeline turns raw mempool noise into disciplined, automated trades.
            </p>
            <ul className="detail-list">
              <li>
                <span className="num">1</span>
                <div>
                  <h4>Detect</h4>
                  <p>Watches pump.fun and Dexscreener for new mints and pairs the second they appear on-chain.</p>
                </div>
              </li>
              <li>
                <span className="num">2</span>
                <div>
                  <h4>Screen</h4>
                  <p>Runs liquidity, market-cap, age and anti-rug checks against your configured thresholds.</p>
                </div>
              </li>
              <li>
                <span className="num">3</span>
                <div>
                  <h4>Execute</h4>
                  <p>Submits the buy with your slippage and priority-fee settings through the fastest available route.</p>
                </div>
              </li>
              <li>
                <span className="num">4</span>
                <div>
                  <h4>Manage</h4>
                  <p>Auto take-profit and stop-loss watch each position and exit it the moment your targets hit.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="card spec-card">
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.76rem", letterSpacing: "0.14em", color: "var(--red-soft)", marginBottom: 14 }}>
              PROJECT SPECIFICATION
            </div>
            {SPECS.map(([k, v]) => (
              <div className="spec-row" key={k}>
                <span className="k">{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="arch-flow">
          <div className="arch-node">
            <div className="an-t">On-chain feed</div>
            <div className="an-s">pump.fun · Dexscreener</div>
          </div>
          <span className="arch-arrow">→</span>
          <div className="arch-node">
            <div className="an-t">Filter engine</div>
            <div className="an-s">your rules</div>
          </div>
          <span className="arch-arrow">→</span>
          <div className="arch-node">
            <div className="an-t">Executor</div>
            <div className="an-s">signed via wallet</div>
          </div>
          <span className="arch-arrow">→</span>
          <div className="arch-node">
            <div className="an-t">Position manager</div>
            <div className="an-s">TP / SL</div>
          </div>
        </div>
      </div>
    </section>
  );
}
