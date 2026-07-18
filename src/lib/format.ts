// Formatting helpers for prices, market caps and time.

export function formatPrice(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "—";
  if (v === 0) return "$0";
  if (v >= 1000) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return "$" + v.toFixed(3);
  if (v >= 0.01) return "$" + v.toFixed(4);
  // very small — show significant digits after leading zeros
  const str = v.toFixed(12);
  const match = str.match(/^0\.0*(\d)/);
  if (match) {
    const zeros = str.indexOf(match[1]) - 2;
    if (zeros >= 4) {
      const sig = v.toExponential(3);
      const [mant, exp] = sig.split("e");
      return `$${mant}e${exp}`;
    }
  }
  return "$" + v.toPrecision(3);
}

export function formatCompact(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "—";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}

export function formatPct(v: number | undefined | null): string {
  if (v == null || isNaN(v)) return "0.00%";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export function shortAddr(addr: string, size = 4): string {
  if (!addr) return "";
  if (addr.length <= size * 2 + 2) return addr;
  return `${addr.slice(0, size)}…${addr.slice(-size)}`;
}

export function timeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
