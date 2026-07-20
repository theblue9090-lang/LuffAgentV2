import { Buffer } from "buffer";
// Polyfill Buffer for @solana/web3.js in the browser (needed before any web3 usage).
if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import App from "./App";
import "./index.css";

// Privy App ID for LUFF AGENT login.
const PRIVY_APP_ID = "cmrpmbbsc00f50djv46ahai5g";

// Enable external Solana wallets (Phantom, Solflare, Backpack, …) via the
// Solana wallet-standard. Without this, only embedded/email/social login work.
const solanaConnectors = toSolanaWalletConnectors();

// Mainnet RPC used by Privy's standard sign-AND-send hooks. Without this,
// signAndSendTransaction throws "No RPC configuration found for chain
// solana:mainnet" and the sniper can never broadcast a buy. Override the
// endpoints in Vercel via VITE_SOLANA_RPC / VITE_SOLANA_WS for a dedicated
// (non-rate-limited) provider.
const RPC_HTTP =
  (import.meta as any).env?.VITE_SOLANA_RPC || "https://solana-rpc.publicnode.com";
const RPC_WS =
  (import.meta as any).env?.VITE_SOLANA_WS || RPC_HTTP.replace(/^http/, "ws");
const solanaRpcs = {
  "solana:mainnet": {
    rpc: createSolanaRpc(RPC_HTTP),
    rpcSubscriptions: createSolanaRpcSubscriptions(RPC_WS),
    blockExplorerUrl: "https://solscan.io",
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#ff2d3f",
          logo: "/logo.webp",
          walletChainType: "solana-only",
          showWalletLoginFirst: false,
        },
        loginMethods: ["wallet", "email", "google", "twitter"],
        // Register external Solana wallet connectors so Phantom, Solflare,
        // Backpack, etc. can connect and log in.
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        // Solana mainnet RPC for the standard sign-and-send hooks (used by the
        // sniper to broadcast real on-chain buys/sells).
        solana: {
          rpcs: solanaRpcs,
        },
        // Give every account exactly ONE embedded SOLANA wallet (not EVM).
        // Privy embedded wallets are deterministic per account and persist
        // across logout / login, so a user always returns to the same wallet.
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "users-without-wallets" },
          // Sign & send WITHOUT a confirmation popup, so the sniper can
          // auto-execute hands-free with the embedded wallet. (External
          // wallets like Phantom always prompt — that's enforced by the wallet.)
          showWalletUIs: false,
        },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);
