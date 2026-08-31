import { Inter } from 'next/font/google';

/**
 * The tracker's own type.
 *
 * Inter, self hosted through next/font, and loaded in this layout rather than
 * the root one so it is only fetched on /admin. The public site keeps its
 * display and body faces and never downloads this.
 *
 * The variable font, not the static cuts: one file covers 400, 500 and 600
 * instead of three, and the weights the interface uses can be tuned later
 * without another request.
 *
 * display: swap with next/font's size adjusted fallback. next/font measures the
 * real face and generates a local fallback with matching metrics, so the swap
 * happens without the reflow that normally makes swap a bad trade. The font is
 * preloaded, which is the default here and is what we want: it is behind a
 * login on a page that is all text.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // Metric compatible fallbacks, so nothing moves when the real face lands.
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  /* display: contents so this wrapper carries the font variable without
     becoming a box in the layout. The shell below it is sized against the
     viewport and must stay a direct participant in that. */
  return (
    <div className={inter.variable} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
