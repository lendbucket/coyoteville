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

The map is capped at 1100px and fills the content column, so at a 390px
viewport it renders at **0.295 scale**. Measured, not estimated. That means:

- a label of 41 viewBox units reads as 12px
- a label of 55 viewBox units reads as 16px

Anything around 22 units comes out at 6.5px, which is not readable on a phone.
People screenshot this map and send it to each other, so it has to survive
being looked at on a phone with no zooming.

No distance is drawn on the map, by design. The course is not USATF certified
and the page says approximately 3.1 miles in words instead.
