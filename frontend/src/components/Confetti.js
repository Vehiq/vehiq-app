import { useEffect, useRef } from "react";

/**
 * Lightweight canvas confetti — gold/cream/dark palette.
 * Renders an absolutely-positioned full-screen canvas overlay for ~2s.
 */
export default function Confetti({ active = true, duration = 2200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);

    const colors = ["#C9A84C", "#E8C96A", "#F4F1EC", "#9CA1C2"];
    const count = 140;
    const particles = Array.from({ length: count }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 60,
      y: h / 2,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      g: 0.35,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 0,
    }));

    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g;
        p.rot += p.vr;
        p.life = elapsed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.4);
        ctx.restore();
      });
      if (elapsed < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, duration]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[100]" data-testid="confetti-canvas" />;
}
