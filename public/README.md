# public

Drop `logo.png` in this folder.

It gets used in three places:

1. The nav brand mark, rendered at 38 by 38.
2. The favicon and the Apple touch icon.
3. The Open Graph and Twitter card image.

For the social card to look right in Facebook and iMessage, make it **1200 by 630**.
If you want a tighter square mark for the nav as well, add `logo-mark.png` and point
`components/Brand.tsx` at it.

Until the file exists the nav falls back to a rust colored circle with a C in it,
so nothing breaks and nothing shows a broken image icon.
