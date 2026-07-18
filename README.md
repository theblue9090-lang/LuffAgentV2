# 🎯 LUFF AGENT

**An AI-powered crypto agent with a powerful realtime sniper for pump.fun & Dexscreener.**

LUFF AGENT is an interactive, non-custodial trading-agent website for Solana. It tracks
top coins, movers and brand-new launches in realtime, renders a live chart on every coin,
and lets each user configure a precision sniper that executes automatically the instant a
token matches their rules — including sniping straight from a developer's wallet.

Built with **React + Vite + TypeScript**, authenticated with **Privy.io**, and themed as a
modern red crypto-agent UI.

---

## ✨ Features

| Section | What it does |
| --- | --- |
| **Header** | Logo + LUFF AGENT wordmark, nav (Portfolio / Sniper / Markets), and a **Privy.io login** button (App ID `cmrpmbbsc00f50djv46ahai5g`). Supports wallet, email & social login. |
| **Markets** | Top coins, movers and new launches from **pump.fun** and **Dexscreener** with live prices, market cap, liquidity, volume and inline sparklines. Every coin opens a **realtime chart** modal. |
| **Sniper** | A configurable, powerful sniper engine. Set buy amount, liquidity/market-cap/age filters, slippage, priority fee, take-profit & stop-loss, anti-rug shield — then **arm** it to auto-execute on new mints. Includes a **Dev-wallet** mode to snipe from any creator's address. A live tracker shows every candidate scanned, sniped or skipped. |
| **Portfolio** | Login-gated agent dashboard with live positions and PnL. |
| **Detail Project** | Explains what LUFF AGENT is, its 4-stage pipeline (Detect → Screen → Execute → Manage), a feature grid and a full spec sheet. |
| **How to use** | Six-step guide from connecting a wallet to fully automated sniping. |
| **Footer** | Logo + LUFF AGENT, product/project links, a detailed **Terms & Service** modal, and clickable **X** and **Telegram** links. |

## 🔗 Links

- **X (Twitter):** https://x.com/luffagent/
- **Telegram:** https://t.me/luffagent/

## 🧱 Tech stack

- [React 18](https://react.dev/) + [Vite 5](https://vitejs.dev/) + TypeScript
- [@privy-io/react-auth](https://privy.io/) — authentication & embedded wallets
- [lightweight-charts](https://tradingview.github.io/lightweight-charts/) — realtime charts
- [Dexscreener](https://docs.dexscreener.com/api/reference) & [pump.fun](https://pump.fun/) public APIs — live market data

## 🚀 Getting started

```bash
npm install       # install dependencies
npm run dev       # start the dev server (http://localhost:5173)
npm run build     # production build → dist/
npm run preview   # preview the production build
```

## 📡 Data & realtime

- **Top coins** — a curated set of liquid Solana majors/memes via the Dexscreener tokens API.
- **Movers** — Dexscreener boosted/trending tokens ranked by 24h movement.
- **New launches** — freshest mints from the pump.fun API plus Dexscreener's latest token profiles.
- Prices refresh every ~45s with live micro-ticks in between. If a public API is temporarily
  unreachable, the UI falls back to sample data so it always stays alive.
- Charts reconstruct a realistic 24h path from real price-change anchors, then append live
  price updates.

## 🛡️ Safety & execution mode

The sniper ships in **secure simulation (paper) mode** by default so strategies can be tuned
risk-free. Live on-chain execution activates only after a user connects a **funded wallet**
and approves signing — **keys never leave the user's wallet** (non-custodial via Privy).

> ⚠️ Sniping newly launched tokens is extremely high risk. This project is a tool, **not
> financial advice**. Only deploy funds you can afford to lose.

## 📁 Structure

```
src/
├── main.tsx              # entry + PrivyProvider (App ID configured here)
├── App.tsx               # page composition
├── index.css             # red crypto-agent design system
├── components/           # Header, Hero, Markets, CoinChart, Sniper,
│                         # Portfolio, ProjectDetails, HowToUse, Footer, …
└── lib/                  # market data engine, sniper engine, formatters
```

---

© LUFF AGENT — All rights reserved.
