import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Logo from "./Logo";
import { shortAddr } from "../lib/format";

const NAV = [
  { label: "Portfolio", href: "#portfolio" },
  { label: "Sniper", href: "#sniper" },
  { label: "Markets", href: "#markets" },
];

export default function Header() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const wallet = user?.wallet?.address;
  const handle =
    user?.twitter?.username ||
    user?.email?.address ||
    (wallet ? shortAddr(wallet, 4) : "Agent");
  const initial = handle.charAt(0).toUpperCase();

  return (
    <header className={`header ${scrolled ? "scrolled" : ""}`}>
      <div className="container header-inner">
        <Logo onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />

        <nav className={`nav ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)}>
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>

        <div className="header-right">
          {!ready ? (
            <button className="btn btn-ghost btn-sm" disabled>
              Loading…
            </button>
          ) : authenticated ? (
            <div className="wallet-chip">
              <span className="addr">{handle}</span>
              <button
                className="avatar"
                title="Log out"
                onClick={logout}
                style={{ border: "none", cursor: "pointer" }}
              >
                {initial}
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={login}>
              <LockIcon />
              Login
            </button>
          )}

          <button
            className="burger"
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>
    </header>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 10V8a6 6 0 1112 0v2m-9 0h6a3 3 0 013 3v5a3 3 0 01-3 3H9a3 3 0 01-3-3v-5a3 3 0 013-3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
