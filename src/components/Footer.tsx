import { useState } from "react";
import Logo from "./Logo";

const X_URL = "https://x.com/luffagent/";
const TG_URL = "https://t.me/luffagent/";

export default function Footer() {
  const [showTerms, setShowTerms] = useState(false);

  return (
    <footer className="footer" id="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Logo />
            <p>
              LUFF AGENT is an autonomous Solana trading agent with a realtime sniper for
              pump.fun and Dexscreener. Track the market, snipe new launches, and manage
              positions — all non-custodial.
            </p>
            <div className="socials">
              <a className="social-link" href={X_URL} target="_blank" rel="noreferrer">
                <XIcon /> Follow on X
              </a>
              <a className="social-link" href={TG_URL} target="_blank" rel="noreferrer">
                <TelegramIcon /> Join Telegram
              </a>
            </div>
          </div>

          <div className="footer-col">
            <h5>Product</h5>
            <a href="#markets">Markets</a>
            <a href="#sniper">Sniper</a>
            <a href="#portfolio">Portfolio</a>
            <a href="#how-to">How to use</a>
          </div>

          <div className="footer-col">
            <h5>Project</h5>
            <a href="#project">Detail Project</a>
            <a href={X_URL} target="_blank" rel="noreferrer">
              X (Twitter)
            </a>
            <a href={TG_URL} target="_blank" rel="noreferrer">
              Telegram
            </a>
            <button onClick={() => setShowTerms(true)}>Terms &amp; Service</button>
          </div>
        </div>

        <div className="footer-bottom">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="copy">© {new Date().getFullYear()} LUFF AGENT. All rights reserved.</span>
          </div>
          <div className="footer-mini">
            <button onClick={() => setShowTerms(true)}>Terms &amp; Service</button>
            <a href={X_URL} target="_blank" rel="noreferrer">
              X
            </a>
            <a href={TG_URL} target="_blank" rel="noreferrer">
              Telegram
            </a>
          </div>
        </div>
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </footer>
  );
}

function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo size={36} showText={false} />
            <div>
              <strong style={{ fontSize: "1.15rem", fontFamily: "var(--font-display)" }}>
                Terms &amp; Service
              </strong>
              <div style={{ color: "var(--text-mute)", fontSize: "0.8rem" }}>
                Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="terms-body">
          <p>
            Welcome to LUFF AGENT ("the Platform", "we", "us"). By connecting a wallet,
            logging in, or using any feature of the Platform — including the market tracker,
            sniper engine and portfolio dashboard — you ("the User", "you") agree to these
            Terms &amp; Service in full. If you do not agree, do not use the Platform.
          </p>

          <h4>1. Nature of the service</h4>
          <p>
            LUFF AGENT is a non-custodial, software-only tool that helps users monitor
            Solana tokens and automate trade execution based on rules the user configures.
            We do not operate an exchange, broker, custodian or investment adviser. We never
            take custody of your funds or private keys; all transactions are signed by your
            own connected wallet via Privy.io.
          </p>

          <h4>2. No financial advice</h4>
          <p>
            Nothing on the Platform constitutes financial, investment, legal or tax advice.
            Market data, charts, "top coins", "movers" and any labels are provided for
            informational purposes only and may be delayed, incomplete or inaccurate. You are
            solely responsible for your own trading decisions and their outcomes.
          </p>

          <h4>3. Extreme risk acknowledgement</h4>
          <p>
            Sniping newly launched tokens on pump.fun and Dexscreener is <b>extremely high
            risk</b>. New tokens are frequently illiquid, manipulated, or outright scams
            ("rug pulls"). You may lose 100% of any funds you deploy. By using the sniper you
            acknowledge and accept that:
          </p>
          <ul>
            <li>You may lose your entire deployed balance instantly and irreversibly.</li>
            <li>Anti-rug screening reduces but does not eliminate the risk of loss or fraud.</li>
            <li>Automated execution may buy tokens that later prove worthless.</li>
            <li>Network congestion, slippage or failed transactions may affect fills and fees.</li>
            <li>You will only deploy funds you can afford to lose entirely.</li>
          </ul>

          <h4>4. User responsibilities</h4>
          <p>
            You are responsible for the security of your wallet and login credentials, for
            configuring your own strategy parameters (buy size, slippage, filters, take-profit
            and stop-loss), and for complying with all laws and regulations applicable to you.
            You confirm you are of legal age and not barred from using such services in your
            jurisdiction.
          </p>

          <h4>5. Automated execution</h4>
          <p>
            When you arm the sniper, you authorize the agent to submit transactions on your
            behalf according to the rules you set, until you disarm it. You remain fully
            responsible for every transaction executed while the sniper is armed. Live
            on-chain execution requires an explicit connected, funded wallet and transaction
            approval; the default paper/simulation mode places no real orders.
          </p>

          <h4>6. No warranty</h4>
          <p>
            The Platform is provided "as is" and "as available" without warranties of any
            kind, express or implied, including merchantability, fitness for a particular
            purpose, uptime, accuracy of data, or that execution will be timely, profitable or
            error-free. Third-party data (pump.fun, Dexscreener) and infrastructure may fail
            or change at any time.
          </p>

          <h4>7. Limitation of liability</h4>
          <p>
            To the maximum extent permitted by law, LUFF AGENT and its contributors shall not
            be liable for any direct, indirect, incidental, consequential, or exemplary
            damages — including loss of funds, profits, or data — arising from your use of, or
            inability to use, the Platform, even if advised of the possibility of such damages.
          </p>

          <h4>8. Third-party services</h4>
          <p>
            The Platform integrates third-party services including Privy.io (authentication),
            pump.fun and Dexscreener (market data), and Solana RPC providers. Your use of
            those services is subject to their own terms and privacy policies. We are not
            responsible for their availability, content or conduct.
          </p>

          <h4>9. Prohibited use</h4>
          <p>
            You may not use the Platform for money laundering, market manipulation, fraud, or
            any activity that is illegal in your jurisdiction, nor attempt to attack, reverse
            engineer maliciously, or disrupt the Platform or its users.
          </p>

          <h4>10. Changes to these terms</h4>
          <p>
            We may update these Terms &amp; Service at any time. Continued use of the Platform
            after changes constitutes acceptance of the revised terms. Material changes will be
            reflected by the "Last updated" date above.
          </p>

          <h4>11. Contact</h4>
          <p>
            Questions? Reach the LUFF AGENT community on{" "}
            <a href={X_URL} target="_blank" rel="noreferrer" style={{ color: "var(--red-soft)" }}>
              X
            </a>{" "}
            or{" "}
            <a href={TG_URL} target="_blank" rel="noreferrer" style={{ color: "var(--red-soft)" }}>
              Telegram
            </a>
            .
          </p>
        </div>

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-primary btn-block" onClick={onClose}>
            I understand &amp; accept
          </button>
        </div>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}
