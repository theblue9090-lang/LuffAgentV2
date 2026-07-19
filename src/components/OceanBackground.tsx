import { useEffect, useRef } from "react";

// Full-screen background using the exact One Piece sunset artwork. It stays
// 100% faithful to the image and comes alive with motion: a slow vertical
// parallax pan across the whole scene as you scroll (sky/moon → ship/sun →
// water reflections → foreground), plus a gentle continuous drift. Fixed
// behind all content, pointer-events none, respects reduced-motion.
const IMG_W = 896;
const IMG_H = 1280;
const AR = IMG_H / IMG_W;

export default function OceanBackground() {
  const parallaxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const parallax = parallaxRef.current;
    const img = imgRef.current;
    if (!parallax || !img) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let vw = 0;
    let vh = 0;
    let maxPan = 0;

    function layout() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      // cover the viewport; prefer width-sizing (taller than screen) so we can
      // pan vertically through the whole portrait artwork on scroll.
      let w = vw;
      let h = vw * AR;
      if (h < vh) {
        h = vh;
        w = vh / AR;
      }
      img!.style.width = w + "px";
      img!.style.height = h + "px";
      img!.style.left = (vw - w) / 2 + "px";
      img!.style.top = "0px";
      maxPan = Math.max(0, h - vh);
    }
    layout();
    window.addEventListener("resize", layout);

    function apply(ty: number, sway: number) {
      parallax!.style.transform = `translate3d(${sway}px, ${ty}px, 0)`;
    }

    function progress() {
      const doc = document.documentElement;
      const max = Math.max(1, (doc.scrollHeight || vh) - vh);
      return Math.min(1, Math.max(0, (window.scrollY || 0) / max));
    }

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
      const ty = -progress() * maxPan + Math.sin(t * 0.5) * 7; // pan + gentle bob
      const sway = Math.sin(t * 0.32) * 5;
      apply(ty, sway);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
    };
  }, []);

  return (
    <div className="ocean-scene" aria-hidden="true">
      <div ref={parallaxRef} className="ocean-parallax">
        <img ref={imgRef} src="/scene.png" alt="" className="ocean-photo" draggable={false} />
      </div>
      <div className="ocean-scrim" />
    </div>
  );
}
