/**
 * Food truck illustration for the hero.
 *
 * Server component, no JS. The steam is three CSS animated paths offset from
 * each other, and the whole animation stops under prefers-reduced-motion.
 * Gradient ids are namespaced so a second instance on the page cannot capture
 * the first one's fills.
 */
export default function FoodTruck({ id = 'truck' }: { id?: string }) {
  const body = `${id}-body`;
  const cab = `${id}-cab`;
  const win = `${id}-win`;

  return (
    <svg
      className="truck"
      viewBox="0 0 620 340"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Illustration of a food truck with its serving window open"
    >
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3EEE5" />
          <stop offset="1" stopColor="#DCD3C3" />
        </linearGradient>
        <linearGradient id={cab} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D9542A" />
          <stop offset="1" stopColor="#A83D1B" />
        </linearGradient>
        <radialGradient id={win}>
          <stop offset="0" stopColor="#FFE9BE" />
          <stop offset="1" stopColor="#F0A94B" />
        </radialGradient>
      </defs>

      {/* steam, behind the truck so the curls rise out of the roofline */}
      <g
        className="truck__steam"
        stroke="#F3EEE5"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      >
        <path className="steam" d="M212 118 q10 -16 0 -30 q-10 -14 0 -28" />
        <path className="steam steam--2" d="M262 118 q10 -16 0 -30 q-10 -14 0 -28" />
        <path className="steam steam--3" d="M312 118 q10 -16 0 -30 q-10 -14 0 -28" />
      </g>

      <ellipse cx="310" cy="308" rx="250" ry="14" fill="#000" opacity=".35" />

      {/* box body */}
      <rect x="120" y="96" width="360" height="150" rx="10" fill={`url(#${body})`} />
      <rect
        x="120"
        y="96"
        width="360"
        height="150"
        rx="10"
        fill="none"
        stroke="#1A1713"
        strokeWidth="5"
      />

      {/* skirt stripe */}
      <rect x="120" y="212" width="360" height="34" fill="#C4552B" />
      <rect x="120" y="212" width="360" height="6" fill="#8E3517" />

      {/* serving window and counter */}
      <rect x="168" y="126" width="196" height="72" rx="5" fill={`url(#${win})`} />
      <rect
        x="168"
        y="126"
        width="196"
        height="72"
        rx="5"
        fill="none"
        stroke="#1A1713"
        strokeWidth="5"
      />
      <rect x="156" y="196" width="220" height="11" rx="4" fill="#1A1713" />

      {/* awning */}
      <g>
        <path d="M146 96 L386 96 L410 60 L122 60 Z" fill="#C4552B" />
        <path d="M186 96 L210 60 L162 60 L138 96 Z" fill="#F3EEE5" opacity=".92" />
        <path d="M266 96 L290 60 L242 60 L218 96 Z" fill="#F3EEE5" opacity=".92" />
        <path d="M346 96 L370 60 L322 60 L298 96 Z" fill="#F3EEE5" opacity=".92" />
        <path
          d="M146 96 L386 96 L410 60 L122 60 Z"
          fill="none"
          stroke="#1A1713"
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </g>

      {/* roof sign */}
      <rect x="238" y="24" width="126" height="34" rx="5" fill="#1A1713" />
      <text
        x="301"
        y="47"
        fontFamily="var(--font-display), Impact, sans-serif"
        fontSize="19"
        fill="#F0A94B"
        textAnchor="middle"
        letterSpacing="1.5"
      >
        EATS
      </text>

      {/* cab */}
      <path d="M480 132 L536 132 L576 186 L576 246 L480 246 Z" fill={`url(#${cab})`} />
      <path
        d="M480 132 L536 132 L576 186 L576 246 L480 246 Z"
        fill="none"
        stroke="#1A1713"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M492 144 L532 144 L560 184 L492 184 Z" fill="#2C3A44" />
      <path
        d="M492 144 L532 144 L560 184 L492 184 Z"
        fill="none"
        stroke="#1A1713"
        strokeWidth="4"
      />
      <rect x="556" y="196" width="22" height="12" rx="3" fill="#F0A94B" />

      {/* wheels */}
      <g>
        <circle cx="204" cy="262" r="42" fill="#15120F" />
        <circle cx="204" cy="262" r="20" fill="#8A8175" />
        <circle cx="204" cy="262" r="8" fill="#15120F" />
        <circle cx="506" cy="262" r="42" fill="#15120F" />
        <circle cx="506" cy="262" r="20" fill="#8A8175" />
        <circle cx="506" cy="262" r="8" fill="#15120F" />
      </g>
    </svg>
  );
}
