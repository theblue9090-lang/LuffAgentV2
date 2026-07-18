const STEPS = [
  {
    ico: "🔗",
    title: "Connect your wallet",
    desc: "Click Login in the header and authenticate with Privy — connect a Solana wallet, or sign in with email or socials to spin up an embedded wallet. Fund it with SOL.",
  },
  {
    ico: "🎯",
    title: "Pick a snipe mode",
    desc: "Choose New Launches to hunt every fresh mint, or Dev Wallet to auto-buy whenever a specific creator deploys a token. You can switch anytime.",
  },
  {
    ico: "⚙️",
    title: "Set your rules",
    desc: "Define buy amount, min liquidity, market-cap range, max age, slippage and priority fee. Toggle the anti-rug shield and your take-profit / stop-loss targets.",
  },
  {
    ico: "▶️",
    title: "Arm the sniper",
    desc: "Hit Arm Sniper. The agent begins tracking new coins from pump.fun and Dexscreener in realtime and shows every candidate it scans in the live tracker.",
  },
  {
    ico: "⚡",
    title: "Auto-execution",
    desc: "The instant a token matches all your filters, the agent fires the buy for you — no clicking, no delay. Every fill lands in your live feed with its latency.",
  },
  {
    ico: "📈",
    title: "Manage & exit",
    desc: "Watch positions in your Portfolio. With auto-sell on, take-profit and stop-loss close trades automatically. Disarm the sniper whenever you want to pause.",
  },
];

export default function HowToUse() {
  return (
    <section className="section" id="how-to">
      <div className="container">
        <div className="section-eyebrow">Guide</div>
        <h2 className="section-title">
          How to use the <span className="accent">sniper</span>
        </h2>
        <p className="section-sub">
          Six steps from connecting your wallet to fully automated sniping. Configure
          once — the agent does the rest.
        </p>

        <div className="steps">
          {STEPS.map((s) => (
            <div className="card step" key={s.title}>
              <div className="s-ico">{s.ico}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28 }} className="warn-banner">
          <span>⚠️</span>
          <span>
            Sniping new tokens is high-risk. Only deploy funds you can afford to lose, start
            with small buy sizes, and always keep the anti-rug shield on. LUFF AGENT is a tool,
            not financial advice.
          </span>
        </div>
      </div>
    </section>
  );
}
