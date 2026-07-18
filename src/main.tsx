import { Buffer } from "buffer";
// Polyfill Buffer for @solana/web3.js in the browser (needed before any web3 usage).
if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import "./index.css";

// Privy App ID for LUFF AGENT login.
const PRIVY_APP_ID = "cmrpmbbsc00f50djv46ahai5g";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#ff2d3f",
          logo: "/logo.svg",
          walletChainType: "solana-only",
          showWalletLoginFirst: false,
        },
        loginMethods: ["wallet", "email", "google", "twitter"],
        // Give every account exactly ONE embedded SOLANA wallet (not EVM).
        // Privy embedded wallets are deterministic per account and persist
        // across logout / login, so a user always returns to the same wallet.
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "users-without-wallets" },
          showWalletUIs: true,
        },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);
