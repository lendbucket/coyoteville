/**
 * StringLights
 *
 * Cafe festoon lights drawn as an SVG. The wire is a run of quadratic bezier
 * swags. Every bulb is placed by evaluating that same quadratic at a given t,
 * so the bulbs sit on the wire instead of near it.
 *
 * Quadratic bezier point:
 *   B(t) = (1 - t)^2 * P0  +  2 * (1 - t) * t * P1  +  t^2 * P2
 *
 * The control point is dropped to twice the sag depth, because at the midpoint
 * B(0.5) pulls only half of the control point offset. That makes the `sag` prop
 * mean the real depth of the low point in user units.
 *
 * This is a server component. No hooks, no client JS. The twinkle is pure CSS
 * with a per bulb delay, and it turns itself off under prefers-reduced-motion.
 */

type Tone = 'dark' | 'light';
type Variant = 'top' | 'divider';

export interface StringLightsProps {
  /** Tone of the section the lights sit on. Controls the wire color. */
  tone?: Tone;
  /** `top` hangs inside a section. `divider` pulls up to straddle a seam. */
  variant?: Variant;
  /** How many swags across the full width. */
  swags?: number;
  /** Depth of each swag in viewBox units. */
  sag?: number;
  /** Bulbs hung on each swag, not counting the anchor points. */
  bulbsPerSwag?: number;
  /** Unique per instance so the gradient ids never collide. */
  id?: string;
  className?: string;
}

const VIEW_W = 1200;
const ANCHOR_Y = 7;
const STEM = 7;
const BULB_RX = 7;
const BULB_RY = 9;

/** Deterministic pseudo random in [0, 1). Same value on server and client. */
function jitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

export default function StringLights({
  tone = 'dark',
  variant = 'top',
  swags = 5,
  sag = 34,
  bulbsPerSwag = 7,
  id = 'sl',
  className,
}: StringLightsProps) {
  const swagCount = Math.max(1, Math.round(swags));
  const perSwag = Math.max(1, Math.round(bulbsPerSwag));
  const span = VIEW_W / swagCount;

  // Room for the deepest bulb plus its halo, which reaches further than the
  // glass does. Without the halo allowance the glow clips at the bottom edge.
  const HALO_R = BULB_RY * 2.9;
  const height = Math.ceil(ANCHOR_Y + sag + STEM + BULB_RY + HALO_R + 5);

  const wireColor =
    tone === 'dark' ? 'rgba(183, 155, 114, 0.62)' : 'rgba(21, 18, 16, 0.42)';

  // One continuous path across every swag.
  let path = `M 0 ${ANCHOR_Y}`;
  for (let s = 0; s < swagCount; s += 1) {
    const x0 = s * span;
    const x2 = x0 + span;
    const xc = x0 + span / 2;
    path += ` Q ${xc.toFixed(2)} ${(ANCHOR_Y + sag * 2).toFixed(2)} ${x2.toFixed(2)} ${ANCHOR_Y}`;
  }

  type Bulb = { x: number; y: number; delay: number; dur: number; key: string };
  const bulbs: Bulb[] = [];

  for (let s = 0; s < swagCount; s += 1) {
    const x0 = s * span;
    const x2 = x0 + span;
    const xc = x0 + span / 2;
    const y0 = ANCHOR_Y;
    const yc = ANCHOR_Y + sag * 2;

    for (let i = 1; i <= perSwag; i += 1) {
      const t = i / (perSwag + 1);
      const seed = s * 31 + i * 7;
      bulbs.push({
        x: quadAt(x0, xc, x2, t),
        y: quadAt(y0, yc, y0, t),
        // Stagger by position, then break up the wave with a stable jitter.
        delay: Number((((s * perSwag + i) * 0.19 + jitter(seed) * 1.7) % 3.4).toFixed(3)),
        dur: Number((2.6 + jitter(seed + 101) * 1.9).toFixed(3)),
        key: `${s}-${i}`,
      });
    }
  }

  const glowId = `${id}-glow`;
  const bulbId = `${id}-bulb`;

  return (
    <div
      className={['string-lights', `string-lights--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        role="presentation"
        focusable="false"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E8A13C" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#E8A13C" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#E8A13C" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={bulbId} cx="38%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#FFE0A8" />
            <stop offset="42%" stopColor="#E8A13C" />
            <stop offset="100%" stopColor="#C4552B" />
          </radialGradient>
        </defs>

        <path d={path} fill="none" stroke={wireColor} strokeWidth="2" strokeLinecap="round" />

        {bulbs.map((b) => {
          const cy = b.y + STEM + BULB_RY;
          const style = {
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
          } as React.CSSProperties;

          return (
            <g key={b.key} className="sl-lamp">
              {/* stem from the wire down to the bulb */}
              <line
                x1={b.x}
                y1={b.y}
                x2={b.x}
                y2={b.y + STEM}
                stroke={wireColor}
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              {/* soft halo behind the glass */}
              <circle
                className="sl-halo"
                cx={b.x}
                cy={cy}
                r={HALO_R}
                fill={`url(#${glowId})`}
                style={style}
              />
              {/* the bulb */}
              <ellipse
                className="sl-bulb"
                cx={b.x}
                cy={cy}
                rx={BULB_RX}
                ry={BULB_RY}
                fill={`url(#${bulbId})`}
                style={style}
              />
              {/* highlight */}
              <ellipse
                className="sl-shine"
                cx={b.x - BULB_RX * 0.34}
                cy={cy - BULB_RY * 0.36}
                rx={BULB_RX * 0.26}
                ry={BULB_RY * 0.22}
                fill="#FFF3D6"
                opacity="0.75"
                style={style}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
