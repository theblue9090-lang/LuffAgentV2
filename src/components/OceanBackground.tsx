import { useEffect, useRef } from "react";

// Full-screen animated RED sea. Layered waves fill the whole viewport top to
// bottom and all drift continuously; a big One Piece-style pirate ship (with a
// straw-hat Jolly Roger) sails on the left. Everything parallaxes on scroll.
// Fixed canvas behind all content, self-contained, respects reduced-motion.
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

    const scroll = { y: window.scrollY || 0 };
    const onScroll = () => (scroll.y = window.scrollY || 0);
    window.addEventListener("scroll", onScroll, { passive: true });

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    // ---- a filled wave crest band ----
    function waveBand(y: number, amp: number, len: number, phase: number, fill: string, crest: string, thickness: number) {
      ctx!.beginPath();
      ctx!.moveTo(-20, y + amp + thickness);
      for (let x = -20; x <= W + 20; x += 16) {
        const yy = y + Math.sin(x / len + phase) * amp + Math.sin(x / (len * 0.45) + phase * 1.6) * amp * 0.4;
        ctx!.lineTo(x, yy);
      }
      ctx!.lineTo(W + 20, y + amp + thickness);
      ctx!.closePath();
      ctx!.fillStyle = fill;
      ctx!.fill();
      // bright crest line
      ctx!.beginPath();
      for (let x = -20; x <= W + 20; x += 16) {
        const yy = y + Math.sin(x / len + phase) * amp + Math.sin(x / (len * 0.45) + phase * 1.6) * amp * 0.4;
        if (x === -20) ctx!.moveTo(x, yy);
        else ctx!.lineTo(x, yy);
      }
      ctx!.strokeStyle = crest;
      ctx!.lineWidth = 1.4;
      ctx!.stroke();
    }

    // ---- big One Piece-style pirate ship ----
    function ship(cx: number, cy: number, scale: number, tilt: number) {
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(tilt);
      ctx!.scale(scale, scale);

      const dark = "#0b0507";
      const rim = "rgba(255,120,130,0.5)";
      const sailGrad = () => {
        const g = ctx!.createLinearGradient(0, -170, 0, -20);
        g.addColorStop(0, "rgba(60,20,26,0.92)");
        g.addColorStop(1, "rgba(28,10,14,0.92)");
        return g;
      };

      // rigging
      ctx!.strokeStyle = "rgba(255,120,130,0.18)";
      ctx!.lineWidth = 0.8;
      ctx!.beginPath();
      ctx!.moveTo(-120, -6); ctx!.lineTo(0, -210);
      ctx!.moveTo(120, -6); ctx!.lineTo(0, -210);
      ctx!.moveTo(-60, -4); ctx!.lineTo(-60, -150);
      ctx!.moveTo(60, -4); ctx!.lineTo(60, -150);
      ctx!.stroke();

      // three masts
      for (const mx of [-60, 0, 60]) {
        ctx!.beginPath();
        ctx!.moveTo(mx, 6);
        ctx!.lineTo(mx, mx === 0 ? -212 : -156);
        ctx!.strokeStyle = dark;
        ctx!.lineWidth = 4;
        ctx!.stroke();
      }
      // yardarms
      ctx!.strokeStyle = dark;
      ctx!.lineWidth = 3;
      ctx!.beginPath();
      ctx!.moveTo(-96, -120); ctx!.lineTo(-24, -120);
      ctx!.moveTo(-46, -168); ctx!.lineTo(46, -168);
      ctx!.moveTo(30, -120); ctx!.lineTo(96, -120);
      ctx!.stroke();

      // side square sails (billowing)
      const sideSail = (x0: number, x1: number, top: number, bot: number, dir: number) => {
        ctx!.beginPath();
        ctx!.moveTo(x0, top);
        ctx!.quadraticCurveTo((x0 + x1) / 2 + 16 * dir, (top + bot) / 2, x0, bot);
        ctx!.lineTo(x1, bot);
        ctx!.quadraticCurveTo((x0 + x1) / 2 + 34 * dir, (top + bot) / 2, x1, top);
        ctx!.closePath();
        ctx!.fillStyle = sailGrad();
        ctx!.fill();
        ctx!.strokeStyle = rim;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      };
      sideSail(-92, -28, -118, -58, 1);
      sideSail(34, 92, -118, -58, 1);

      // MAIN sail (big) with the straw-hat Jolly Roger
      ctx!.beginPath();
      ctx!.moveTo(-44, -166);
      ctx!.quadraticCurveTo(6, -150, 44, -166);
      ctx!.lineTo(44, -74);
      ctx!.quadraticCurveTo(6, -58, -44, -74);
      ctx!.closePath();
      ctx!.fillStyle = sailGrad();
      ctx!.fill();
      ctx!.strokeStyle = rim;
      ctx!.lineWidth = 1.2;
      ctx!.stroke();

      // Jolly Roger: skull + crossbones + straw hat (Straw Hat Pirates)
      const bone = "rgba(240,225,225,0.9)";
      ctx!.strokeStyle = bone;
      ctx!.lineWidth = 5;
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(-26, -132); ctx!.lineTo(26, -108);
      ctx!.moveTo(26, -132); ctx!.lineTo(-26, -108);
      ctx!.stroke();
      ctx!.fillStyle = bone;
      ctx!.beginPath();
      ctx!.arc(0, -122, 13, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.moveTo(-9, -112); ctx!.lineTo(9, -112); ctx!.lineTo(4, -104); ctx!.lineTo(-4, -104);
      ctx!.closePath(); ctx!.fill();
      // eyes
      ctx!.fillStyle = "#1a0508";
      ctx!.beginPath(); ctx!.arc(-5, -124, 3, 0, Math.PI * 2); ctx!.fill();
      ctx!.beginPath(); ctx!.arc(5, -124, 3, 0, Math.PI * 2); ctx!.fill();
      // straw hat
      ctx!.fillStyle = "#e8b34a";
      ctx!.beginPath(); ctx!.ellipse(0, -132, 20, 5, 0, 0, Math.PI * 2); ctx!.fill();
      ctx!.beginPath(); ctx!.ellipse(0, -134, 10, 8, 0, Math.PI, 0); ctx!.fill();
      ctx!.fillStyle = "#c1121f";
      ctx!.fillRect(-10, -135, 20, 2.4);

      // hull
      ctx!.beginPath();
      ctx!.moveTo(-150, -6);
      ctx!.quadraticCurveTo(-150, 30, -116, 40);
      ctx!.lineTo(118, 40);
      ctx!.quadraticCurveTo(150, 34, 156, -12);
      ctx!.lineTo(150, -30);
      ctx!.lineTo(104, -26);
      ctx!.lineTo(104, -6);
      ctx!.quadraticCurveTo(-20, 4, -150, -6);
      ctx!.closePath();
      ctx!.fillStyle = dark;
      ctx!.fill();
      ctx!.strokeStyle = rim;
      ctx!.lineWidth = 1.4;
      ctx!.stroke();

      // deck stripe + portholes
      ctx!.fillStyle = "rgba(255,90,104,0.16)";
      ctx!.fillRect(-120, -4, 224, 4);
      ctx!.fillStyle = "rgba(255,150,90,0.5)";
      for (let px = -104; px <= 96; px += 26) {
        ctx!.beginPath();
        ctx!.arc(px, 16, 3.2, 0, Math.PI * 2);
        ctx!.fill();
      }

      // figurehead + bowsprit
      ctx!.strokeStyle = dark;
      ctx!.lineWidth = 4;
      ctx!.beginPath();
      ctx!.moveTo(-140, -8); ctx!.lineTo(-182, -26);
      ctx!.stroke();

      // pennant flags
      ctx!.fillStyle = "#e11d2a";
      for (const [fx, fy] of [[0, -212], [-60, -156], [60, -156]] as const) {
        ctx!.beginPath();
        ctx!.moveTo(fx, fy);
        ctx!.lineTo(fx + 30, fy + 6);
        ctx!.lineTo(fx, fy + 12);
        ctx!.closePath();
        ctx!.fill();
      }

      ctx!.restore();
    }

    function frame(tms: number) {
      const t = reduce ? 0 : tms / 1000;
      const s = scroll.y;

      // full-height red sea gradient
      const g = ctx!.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1a0409");
      g.addColorStop(0.28, "#4a0d16");
      g.addColorStop(0.5, "#7a1420");
      g.addColorStop(0.72, "#450b14");
      g.addColorStop(1, "#120407");
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, W, H);

      // red sun glow, upper area
      const sunX = W * 0.72;
      const sunY = H * 0.24 - s * 0.05;
      const glow = ctx!.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.min(W, H) * 0.5);
      glow.addColorStop(0, "rgba(255,110,120,0.5)");
      glow.addColorStop(0.5, "rgba(255,60,74,0.14)");
      glow.addColorStop(1, "rgba(255,45,63,0)");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, W, H);
      const disc = ctx!.createRadialGradient(sunX, sunY, 6, sunX, sunY, Math.min(W, H) * 0.1);
      disc.addColorStop(0, "#ff7b86");
      disc.addColorStop(1, "#c1121f");
      ctx!.fillStyle = disc;
      ctx!.beginPath();
      ctx!.arc(sunX, sunY, Math.min(W, H) * 0.09, 0, Math.PI * 2);
      ctx!.fill();

      // FULL-HEIGHT moving wave layers (top → bottom), all drifting
      const N = 34;
      const span = H * 1.25;
      const scrollWrap = (s * 0.18) % (span / N);
      for (let i = 0; i < N; i++) {
        const f = i / N;
        let y = ((i * span) / N - scrollWrap) % span;
        if (y < -30) y += span;
        const amp = 3 + f * 12;
        const len = 130 + i * 6;
        const speed = 0.25 + f * 1.25;
        const phase = t * speed + i * 0.7;
        const a = 0.05 + f * 0.16;
        const fill = `rgba(${120 + Math.floor(f * 90)},${18 + Math.floor(f * 12)},${28 + Math.floor(f * 10)},${a})`;
        const crest = `rgba(255,${130 + Math.floor(f * 60)},${140},${0.1 + f * 0.22})`;
        waveBand(y, amp, len, phase, fill, crest, 6 + f * 10);
      }

      // shimmering sun reflection column
      ctx!.save();
      ctx!.globalCompositeOperation = "screen";
      for (let i = 0; i < 26; i++) {
        const ry = sunY + i * (H / 34);
        if (ry < sunY) continue;
        const sway = Math.sin(t * 1.5 + i * 0.55) * (5 + i * 1.3);
        const w = Math.min(W, H) * (0.04 + i * 0.01);
        ctx!.globalAlpha = 0.045 + 0.04 * Math.sin(t * 2 + i);
        ctx!.fillStyle = "#ff6b78";
        ctx!.fillRect(sunX - w / 2 + sway, ry, w, 2.4);
      }
      ctx!.restore();
      ctx!.globalAlpha = 1;

      // BIG One Piece ship on the left
      const shipScale = Math.max(0.7, Math.min(1.4, H / 620));
      const shipX = W * 0.18 + Math.sin(t * 0.22) * 20 - s * 0.08;
      const shipY = H * 0.66 - s * 0.04 + Math.sin(t * 1.05) * 8;
      ship(shipX, shipY, shipScale, Math.sin(t * 1.05) * 0.04);

      // a couple of foreground waves to seat the ship in the sea
      waveBand(H * 0.66 - s * 0.03, 20, 170, t * 1.1, "rgba(90,14,22,0.55)", "rgba(255,140,150,0.28)", 40);
      waveBand(H * 0.82 - s * 0.02, 28, 150, t * 1.35 + 1.5, "rgba(40,8,14,0.7)", "rgba(255,120,130,0.22)", 60);

      // readability: vignette + soft top/left scrim
      const vig = ctx!.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(4,1,3,0.55)");
      ctx!.fillStyle = vig;
      ctx!.fillRect(0, 0, W, H);
      const top = ctx!.createLinearGradient(0, 0, 0, H * 0.22);
      top.addColorStop(0, "rgba(6,2,4,0.5)");
      top.addColorStop(1, "rgba(6,2,4,0)");
      ctx!.fillStyle = top;
      ctx!.fillRect(0, 0, W, H * 0.22);
    }

    let raf = 0;
    const loop = (tms: number) => {
      frame(tms);
      if (!reduce) raf = requestAnimationFrame(loop);
    };
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
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="ocean-bg" aria-hidden="true" />;
}
