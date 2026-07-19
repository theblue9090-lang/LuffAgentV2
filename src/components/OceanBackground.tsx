import { useEffect, useRef } from "react";

// Animated One Piece-style sea + ship background. Waves drift continuously and
// every layer (red sun, ship, wave bands) parallaxes at its own speed on scroll.
// Rendered on a fixed full-viewport canvas behind all content. Self-contained
// (no external images), red-themed, and respects prefers-reduced-motion.
export default function OceanBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let dpr = 1;

    const scroll = { y: window.scrollY || 0 };
    const onScroll = () => (scroll.y = window.scrollY || 0);
    window.addEventListener("scroll", onScroll, { passive: true });

    // deterministic star field
    const stars = Array.from({ length: 90 }, (_, i) => {
      const s = (i * 2654435761) >>> 0;
      return {
        x: ((s % 1000) / 1000),
        y: (((s >> 10) % 1000) / 1000) * 0.6,
        r: 0.4 + ((s >> 5) % 100) / 100,
        tw: ((s >> 3) % 100) / 100,
      };
    });

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = Math.floor(W * dpr);
      canvas!.height = Math.floor(H * dpr);
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // ---- draw one billowing wave band across the screen ----
    function wave(yBase: number, amp: number, len: number, phase: number, color: string) {
      ctx!.beginPath();
      ctx!.moveTo(0, H);
      for (let x = 0; x <= W; x += 14) {
        const y = yBase + Math.sin(x / len + phase) * amp + Math.sin(x / (len * 0.5) + phase * 1.7) * amp * 0.35;
        ctx!.lineTo(x, y);
      }
      ctx!.lineTo(W, H);
      ctx!.closePath();
      ctx!.fillStyle = color;
      ctx!.fill();
    }

    // ---- draw the One Piece-style ship silhouette ----
    function ship(x: number, y: number, scale: number, tilt: number, rim: string) {
      ctx!.save();
      ctx!.translate(x, y);
      ctx!.rotate(tilt);
      ctx!.scale(scale, scale);

      const hull = "#080a12";
      // hull
      ctx!.beginPath();
      ctx!.moveTo(-62, -4);
      ctx!.quadraticCurveTo(-54, 16, -30, 20);
      ctx!.lineTo(34, 20);
      ctx!.quadraticCurveTo(56, 16, 66, -4);
      ctx!.quadraticCurveTo(40, 4, 0, 4);
      ctx!.quadraticCurveTo(-40, 4, -62, -4);
      ctx!.closePath();
      ctx!.fillStyle = hull;
      ctx!.fill();
      ctx!.lineWidth = 1.4;
      ctx!.strokeStyle = rim;
      ctx!.stroke();

      // bowsprit
      ctx!.beginPath();
      ctx!.moveTo(56, -6);
      ctx!.lineTo(84, -18);
      ctx!.strokeStyle = hull;
      ctx!.lineWidth = 3;
      ctx!.stroke();

      // masts + sails
      const masts = [
        { mx: -20, h: 82 },
        { mx: 18, h: 96 },
      ];
      for (const m of masts) {
        ctx!.beginPath();
        ctx!.moveTo(m.mx, 4);
        ctx!.lineTo(m.mx, -m.h);
        ctx!.strokeStyle = hull;
        ctx!.lineWidth = 3;
        ctx!.stroke();
        // billowing sail
        ctx!.beginPath();
        ctx!.moveTo(m.mx, -m.h + 8);
        ctx!.quadraticCurveTo(m.mx + 34, -m.h * 0.55, m.mx + 6, -14);
        ctx!.lineTo(m.mx, -14);
        ctx!.closePath();
        const g = ctx!.createLinearGradient(m.mx, -m.h, m.mx + 34, -14);
        g.addColorStop(0, "rgba(255,120,130,0.14)");
        g.addColorStop(1, "rgba(20,10,14,0.6)");
        ctx!.fillStyle = g;
        ctx!.fill();
        ctx!.strokeStyle = "rgba(255,120,130,0.28)";
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }

      // straw-hat flag on the tallest mast (Luffy nod)
      const fx = 18;
      const fy = -96;
      ctx!.beginPath();
      ctx!.moveTo(fx, fy);
      ctx!.lineTo(fx + 26, fy + 5);
      ctx!.lineTo(fx, fy + 12);
      ctx!.closePath();
      ctx!.fillStyle = "#e11d2a";
      ctx!.fill();
      // tiny hat emblem
      ctx!.fillStyle = "#f0c04a";
      ctx!.beginPath();
      ctx!.ellipse(fx + 11, fy + 6, 5, 1.7, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.ellipse(fx + 11, fy + 5, 2.4, 2, 0, Math.PI, 0);
      ctx!.fill();

      ctx!.restore();
    }

    function frame(tms: number) {
      const t = reduce ? 0 : tms / 1000;
      const s = scroll.y;

      // parallax offsets
      const horizon = H * 0.6 - s * 0.06;

      // sky
      const sky = ctx!.createLinearGradient(0, 0, 0, horizon + 60);
      sky.addColorStop(0, "#070305");
      sky.addColorStop(0.55, "#1a060c");
      sky.addColorStop(1, "#4a0f18");
      ctx!.fillStyle = sky;
      ctx!.fillRect(0, 0, W, horizon + 60);

      // stars
      for (const st of stars) {
        const alpha = 0.25 + 0.55 * Math.abs(Math.sin(t * 0.8 + st.tw * 6.28));
        ctx!.globalAlpha = alpha * (1 - st.y / 0.6) * 0.9;
        ctx!.fillStyle = "#ffd7dc";
        ctx!.fillRect(st.x * W, st.y * H - s * 0.02, st.r, st.r);
      }
      ctx!.globalAlpha = 1;

      // red sun / moon near the horizon
      const sunX = W * 0.76;
      const sunY = horizon - 46 - s * 0.05;
      const sunR = Math.min(W, H) * 0.11;
      const glow = ctx!.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3.2);
      glow.addColorStop(0, "rgba(255,90,104,0.5)");
      glow.addColorStop(1, "rgba(255,45,63,0)");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, W, horizon + 80);
      const disc = ctx!.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR);
      disc.addColorStop(0, "#ff6b78");
      disc.addColorStop(1, "#c1121f");
      ctx!.fillStyle = disc;
      ctx!.beginPath();
      ctx!.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx!.fill();

      // sea base
      const sea = ctx!.createLinearGradient(0, horizon, 0, H);
      sea.addColorStop(0, "#3a0c14");
      sea.addColorStop(0.4, "#160309");
      sea.addColorStop(1, "#070204");
      ctx!.fillStyle = sea;
      ctx!.fillRect(0, horizon, W, H - horizon);

      // shimmering reflection of the sun on the water
      ctx!.save();
      ctx!.globalCompositeOperation = "screen";
      for (let i = 0; i < 22; i++) {
        const ry = horizon + 6 + i * ((H - horizon) / 22);
        const sway = Math.sin(t * 1.4 + i * 0.6) * (6 + i);
        const w = sunR * (0.5 + i * 0.06);
        ctx!.globalAlpha = 0.05 + 0.05 * Math.sin(t * 2 + i);
        ctx!.fillStyle = "#ff5a68";
        ctx!.fillRect(sunX - w / 2 + sway, ry, w, 2.2);
      }
      ctx!.restore();
      ctx!.globalAlpha = 1;

      // distant ship on the horizon
      ship(W * 0.2 + Math.sin(t * 0.15) * 20 - s * 0.03, horizon - 6, 0.42, Math.sin(t * 0.6) * 0.03, "rgba(255,120,130,0.25)");

      // far wave band
      wave(horizon + (H - horizon) * 0.18 - s * 0.03, 10, 220, t * 0.5, "#1e0710");

      // main ship riding a mid wave
      const shipX = W * 0.44 + Math.sin(t * 0.25) * 26 - s * 0.09;
      const midY = horizon + (H - horizon) * 0.42 - s * 0.05;
      const bob = Math.sin(t * 1.1) * 6;
      ship(shipX, midY + bob - 14, 0.9, Math.sin(t * 1.1) * 0.05, "rgba(255,120,130,0.35)");

      // mid wave (in front of ship base)
      wave(midY - s * 0.02, 16, 180, t * 0.8 + 1, "#12060b");

      // near / foreground wave
      wave(horizon + (H - horizon) * 0.72 - s * 0.02, 26, 150, t * 1.15 + 2, "#0a0407");

      // faint tech grid overlay (crypto ↔ sea fusion)
      ctx!.globalAlpha = 0.05;
      ctx!.strokeStyle = "#ff4d5e";
      ctx!.lineWidth = 1;
      const grid = 46;
      const gy = -(s * 0.1) % grid;
      ctx!.beginPath();
      for (let x = 0; x <= W; x += grid) {
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, horizon);
      }
      for (let y = gy; y <= horizon; y += grid) {
        ctx!.moveTo(0, y);
        ctx!.lineTo(W, y);
      }
      ctx!.stroke();
      ctx!.globalAlpha = 1;

      // vignette + top darken for text legibility
      const vig = ctx!.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H * 0.5, H * 0.85);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(3,1,2,0.6)");
      ctx!.fillStyle = vig;
      ctx!.fillRect(0, 0, W, H);
      const topFade = ctx!.createLinearGradient(0, 0, 0, H * 0.35);
      topFade.addColorStop(0, "rgba(5,2,4,0.55)");
      topFade.addColorStop(1, "rgba(5,2,4,0)");
      ctx!.fillStyle = topFade;
      ctx!.fillRect(0, 0, W, H * 0.35);
    }

    let raf = 0;
    if (reduce) {
      frame(0);
      const rerender = () => frame(0);
      window.addEventListener("scroll", rerender, { passive: true });
      window.addEventListener("resize", rerender);
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", resize);
        window.removeEventListener("scroll", rerender);
        window.removeEventListener("resize", rerender);
      };
    }

    const loop = (tms: number) => {
      frame(tms);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="ocean-bg" aria-hidden="true" />;
}
