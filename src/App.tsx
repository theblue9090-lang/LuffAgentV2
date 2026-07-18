import { usePrivy } from "@privy-io/react-auth";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Markets from "./components/Markets";
import Sniper from "./components/Sniper";
import Portfolio from "./components/Portfolio";
import ProjectDetails from "./components/ProjectDetails";
import HowToUse from "./components/HowToUse";
import Footer from "./components/Footer";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ErrorBoundary label="Markets are unavailable">
          <Markets />
        </ErrorBoundary>
        <ErrorBoundary label="Sniper is unavailable">
          <Sniper />
        </ErrorBoundary>
        <ErrorBoundary label="Portfolio is unavailable">
          <Portfolio />
        </ErrorBoundary>
        <ProjectDetails />
        <HowToUse />
        <CtaStrip />
      </main>
      <Footer />
    </>
  );
}

function CtaStrip() {
  const { authenticated, login } = usePrivy();
  return (
    <section className="container" style={{ padding: "40px 22px" }}>
      <div className="cta-strip">
        <h2>Ready to hunt the next launch?</h2>
        <p>
          Connect your wallet, arm the sniper, and let LUFF AGENT track pump.fun and
          Dexscreener for you — 24/7, at machine speed.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          {!authenticated && (
            <button className="btn btn-primary" onClick={login}>
              Launch the agent
            </button>
          )}
          <a className="btn btn-ghost" href="#sniper">
            Open the sniper
          </a>
        </div>
      </div>
    </section>
  );
}
