# Course map

Two files belong here and neither is generated:

- `turkey-trot-course.svg` is inlined into `/turkey-trot` by `lib/race-course.ts`.
  Inlined rather than put in an `img` tag because the draw animation and the
  `prefers-reduced-motion` rule are CSS inside the file, and an `img` tag
  isolates both.
- `turkey-trot-course.png` is the social card fallback, used for `og:image` on
  `/turkey-trot` while the ad poster frame is not in the repo.

Until the SVG lands the page renders its placeholder instead, which is a
deliberate state and not a failure.

## What the page expects of the SVG

- A `viewBox` it can scale inside. 1197 by 640 is what the current artwork uses.
- Its own `role="img"` and a full `aria-label` describing the route in words.
  The page adds neither, so a screen reader meets exactly one label.
- The animation and the reduced motion media query inside the file.

## Legibility

Settled. The artwork carries two type scales, switched by a media query below
760px, which works only because the SVG is inlined: inside an `img` tag the
file's own media queries never see the page's width.

Measured on screen: street labels come out at **13.2px at 390** and **15.2px at
1100**.

That closes the finding this section used to record. For history, because it is
the constraint any replacement artwork still has to meet: the container is
capped at 1100px and fills the content column, so at 390px the map renders at
0.295 scale. A single fixed type scale would need 41 viewBox units to reach
12px and 55 to reach 16px, and the 22 unit labels the first draft used came out
at 6.5px. The two scale approach is what avoids that, rather than one large
scale that looks wrong on a desktop.

People screenshot this map and send it to each other, so it has to survive
being looked at on a phone with no zooming. It does.

No distance is drawn on the map, by design. The course is not USATF certified
and the page says approximately 3.1 miles in words instead.
