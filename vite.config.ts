import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    target: "es2020",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Split heavy vendors into separate chunks so the build uses less
        // peak memory and ships smaller, cacheable files.
        manualChunks: {
          react: ["react", "react-dom"],
          solana: ["@solana/web3.js", "@solana/spl-token"],
          charts: ["lightweight-charts"],
          qr: ["qrcode"],
        },
      },
    },
  },
});
