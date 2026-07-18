import { useMemo } from "react";
import type { Point } from "../lib/market";

interface Props {
  data: Point[];
  up: boolean;
  height?: number;
}

// Lightweight inline SVG sparkline with a gradient fill.
export default function Sparkline({ data, up, height = 56 }: Props) {
  const { line, area, id } = useMemo(() => {
    const w = 300;
    const h = height;
    if (!data.length) return { line: "", area: "", id: "sp" + Math.random() };
    const vals = data.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const step = w / (data.length - 1 || 1);
    const pts = data.map((d, i) => {
      const x = i * step;
      const y = h - 6 - ((d.value - min) / range) * (h - 12);
      return [x, y];
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, id: "sp" + Math.random().toString(36).slice(2, 8) };
  }, [data, height]);

  const color = up ? "#22e39a" : "#ff5468";

  return (
    <svg className="spark" viewBox={`0 0 300 ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
