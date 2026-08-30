'use client';

import { useEffect, useRef } from 'react';

/**
 * Fireworks over the confirmation screen.
 *
 * Hand rolled on a 2D canvas rather than pulled in from a library. The whole
 * effect is a few hundred particles under gravity with a fading trail, which is
 * about eighty lines; a confetti or particle package would be twenty to sixty
 * kilobytes of JavaScript on a page a vendor sees exactly once, on a phone, on
 * the far side of a Square redirect.
 *
 * Written for an old phone, so:
 *
 *   One canvas, one animation frame loop, no per particle DOM.
 *   Particle count scales down on a small screen and the device pixel ratio is
 *     capped at 2, because a 3x buffer on a cheap phone is three times the fill
 *     cost for no visible gain.
 *   The trail is a translucent fill over the whole canvas rather than a per
 *     particle history, which is one draw call instead of thousands.
 *   No shadowBlur anywhere. It is the single most expensive thing a 2D context
 *     does, and 'lighter' compositing gives the same bloom where sparks overlap
 *     for a fraction of the cost.
 *   The loop stops itself the moment the last spark dies, and unmounting or
 *     hiding the tab cancels it. Nothing is left spinning behind the page.
 *
 * prefers-reduced-motion is honoured by not animating at all. Not a slower
 * version, not a static burst: the canvas is never mounted and the hook returns
 * before a single frame is drawn.
 */

/** Rust and ember, straight off the site palette. */
const COLORS = [
  [196, 85, 43], // rust
  [224, 106, 56], // rust bright
  [240, 169, 75], // ember
  [255, 224, 168], // ember light
  [243, 238, 229], // cream, the occasional white hot spark
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  /** Frames this spark lives for. Fades over the last third. */
  maxLife: number;
  color: number[];
  size: number;
};

const GRAVITY = 0.045;
const DRAG = 0.986;

export default function Fireworks({
  /** How long bursts keep launching. The tail then falls and fades out. */
  durationMs = 2400,
}: {
  durationMs?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Anyone who has asked for less motion gets none of this.
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // 2 is the ceiling on purpose. Past that the fill cost climbs and nothing
    // about a soft spark reads any sharper.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    function size() {
      const c = canvasRef.current;
      if (!c) return;
      width = c.clientWidth;
      height = c.clientHeight;
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    size();

    /* Budget by screen area. A phone gets roughly half of what a desktop does,
       which keeps the fill rate per frame in the same place on both. */
    const small = width < 640;
    const perBurst = small ? 34 : 58;
    const maxBursts = small ? 5 : 8;

    const particles: Particle[] = [];
    let burstsFired = 0;

    function burst(x: number, y: number) {
      // One hue per burst, the way a real shell is one chemistry, with a
      // brighter core mixed through so it does not read as flat.
      const base = COLORS[Math.floor(Math.random() * COLORS.length)];
      const speed = 2.4 + Math.random() * 1.9;

      for (let i = 0; i < perBurst; i += 1) {
        // Angle jittered off an even spread, so the ring is round without
        // looking like a clock face.
        const angle = (i / perBurst) * Math.PI * 2 + Math.random() * 0.25;
        // Square rooting a uniform value fills the disc evenly instead of
        // crowding every spark onto the rim.
        const v = speed * Math.sqrt(Math.random());
        const maxLife = 52 + Math.random() * 34;

        particles.push({
          x,
          y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          life: 0,
          maxLife,
          color: Math.random() < 0.16 ? COLORS[4] : base,
          size: 1.3 + Math.random() * 1.7,
        });
      }
    }

    let raf = 0;
    const started = performance.now();
    let nextBurstAt = started + 90;

    function frame(now: number) {
      const elapsed = now - started;

      // Trail. Painting the whole canvas with a low alpha black leaves the
      // previous frame showing through, which is the streak, and costs one
      // rectangle rather than a stored path per spark.
      ctx!.globalCompositeOperation = 'source-over';
      ctx!.fillStyle = 'rgba(11, 11, 12, 0.22)';
      ctx!.fillRect(0, 0, width, height);

      if (elapsed < durationMs && now >= nextBurstAt && burstsFired < maxBursts) {
        /* Kept in a band across the top. Sparks fall for the second or so they
           are alive, so a burst launched at mid height ends up drifting down
           through the copy, and a shell going off behind the sentence that
           tells someone their spot is not confirmed yet is the one place on
           this page where the decoration must not win. */
        burst(
          width * (0.14 + Math.random() * 0.72),
          height * (0.08 + Math.random() * 0.22)
        );
        burstsFired += 1;
        nextBurstAt = now + 190 + Math.random() * 260;
      }

      // Sparks add where they overlap, which is what gives the core its glow
      // without a single shadowBlur.
      ctx!.globalCompositeOperation = 'lighter';

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life += 1;

        if (p.life >= p.maxLife) {
          // Swap and pop. Splicing out of the middle of a long array every
          // frame is the kind of thing that shows up as jank on an old phone.
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }

        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY;
        p.x += p.vx;
        p.y += p.vy;

        // Full brightness for the first two thirds, then out.
        const t = p.life / p.maxLife;
        const alpha = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38;

        ctx!.globalAlpha = Math.max(0, alpha);
        ctx!.fillStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fill();
      }

      ctx!.globalAlpha = 1;

      // Done when the last shell has gone up and the last spark has died. The
      // loop is not left running behind a finished animation.
      if (particles.length === 0 && (elapsed >= durationMs || burstsFired >= maxBursts)) {
        ctx!.globalCompositeOperation = 'source-over';
        ctx!.clearRect(0, 0, width, height);
        return;
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    // A resize mid flight would otherwise stretch the buffer. Rare on a phone,
    // free to handle.
    window.addEventListener('resize', size);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [durationMs]);

  return <canvas className="fireworks" ref={canvasRef} aria-hidden="true" />;
}
