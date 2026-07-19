import { useEffect, useRef } from "react";

// Full-screen One Piece sunset artwork brought to life:
//  • the crisp HD image stays 100% faithful (no blur on sky/ship),
//  • the water + reflections ripple like real moving waves (SVG displacement),
//  • seagulls fly and flap across the sky,
//  • the whole scene parallax-pans on scroll with a gentle continuous drift.
const IMG_W = 896;
const IMG_H = 1280;
const AR = IMG_H / IMG_W;

export default function OceanBackground() {
  const parallaxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rippleRef = useRef<HTMLImageElement>(null);

  const reduce =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const enableRipple = !reduce && typeof window !== "undefined" && window.innerWidth >= 760;

  useEffect(() => {
    const parallax = parallaxRef.current;
    const img = imgRef.current;
    if (!parallax || !img) return;

    let vw = 0;
    let vh = 0;
    let maxPan = 0;

    function sizeImg(el: HTMLImageElement | null, w: number, h: number, left: number) {
      if (!el) return;
      el.style.width = w + "px";
      el.style.height = h + "px";
      el.style.left = left + "px";
      el.style.top = "0px";
    }

    function layout() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      let w = vw;
      let h = vw * AR;
      if (h < vh) {
        h = vh;
        w = vh / AR;
      }
      const left = (vw - w) / 2;
      sizeImg(img, w, h, left);
      sizeImg(rippleRef.current, w, h, left);
      maxPan = Math.max(0, h - vh);
    }
    layout();
    window.addEventListener("resize", layout);

    const progress = () => {
      const doc = document.documentElement;
      const max = Math.max(1, (doc.scrollHeight || vh) - vh);
      return Math.min(1, Math.max(0, (window.scrollY || 0) / max));
    };
    const apply = (ty: number, sway: number) =>
      (parallax.style.transform = `translate3d(${sway}px, ${ty}px, 0)`);

    let raf = 0;
    if (reduce) {
      const onScroll = () => apply(-progress() * maxPan, 0);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      return () => {
        window.removeEventListener("resize", layout);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    }

    const loop = (tms: number) => {
      const t = tms / 1000;
      apply(-progress() * maxPan + Math.sin(t * 0.5) * 7, Math.sin(t * 0.32) * 5);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
    };
  }, [reduce]);

  return (
    <div className="ocean-scene" aria-hidden="true">
      <div ref={parallaxRef} className="ocean-parallax">
        <img ref={imgRef} className="ocean-photo" src="/scene.png" alt="" draggable={false} />
        {enableRipple && (
          <img ref={rippleRef} className="ocean-photo ocean-ripple" src="/scene.png" alt="" draggable={false} />
        )}
      </div>

      {!reduce && (
        <div className="ocean-birds">
          {[
            { top: "16%", size: 40, dur: 34, delay: 0, dir: 1, drop: 4, flap: 0.46 },
            { top: "26%", size: 28, dur: 46, delay: 6, dir: 1, drop: 3, flap: 0.54 },
            { top: "12%", size: 22, dur: 52, delay: 12, dir: -1, drop: 5, flap: 0.42 },
            { top: "34%", size: 34, dur: 40, delay: 3, dir: -1, drop: 3, flap: 0.6 },
            { top: "21%", size: 18, dur: 60, delay: 20, dir: 1, drop: 6, flap: 0.5 },
          ].map((b, i) => (
            <div
              key={i}
              className="gull"
              style={{
                top: b.top,
                width: b.size,
                animationDuration: `${b.dur}s`,
                animationDelay: `${b.delay}s`,
                animationDirection: b.dir === 1 ? "normal" : "reverse",
                // @ts-ignore custom prop
                "--drop": `${b.drop}vh`,
              }}
            >
              <div
                className="gull-flap"
                style={{
                  animationDuration: `${b.flap}s`,
                  // @ts-ignore custom prop — flip composes inside the flap keyframes
                  "--flip": b.dir === -1 ? -1 : 1,
                }}
              >
                <svg viewBox="0 0 64 26" width="100%" height="100%">
                  <path d="M32 15 C22 3 12 5 3 12 C13 11 24 13 32 17 Z" fill="rgba(245,245,250,0.92)" />
                  <path d="M32 15 C42 3 52 5 61 12 C51 11 40 13 32 17 Z" fill="rgba(245,245,250,0.92)" />
                  <path d="M6 12 C10 11 12 12 14 12 L11 14 C9 13.5 7 13 6 12 Z" fill="rgba(30,20,26,0.85)" />
                  <path d="M58 12 C54 11 52 12 50 12 L53 14 C55 13.5 57 13 58 12 Z" fill="rgba(30,20,26,0.85)" />
                  <ellipse cx="32" cy="16" rx="3.4" ry="2" fill="rgba(235,235,240,0.95)" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ocean-scrim" />

      {/* water ripple displacement filter */}
      <svg className="ocean-defs" width="0" height="0" aria-hidden="true">
        <filter id="waterRipple" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.010 0.028" numOctaves="2" seed="7" result="noise">
            <animate
              attributeName="baseFrequency"
              dur="16s"
              values="0.010 0.026; 0.013 0.034; 0.010 0.026"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </div>
  );
}
