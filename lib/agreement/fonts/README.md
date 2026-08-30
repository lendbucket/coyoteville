# Fonts for the signed agreement PDF

The four brand faces the PDF sets type in, committed as TrueType and read off
disk at render time. `next.config.js` traces this directory into the two
agreement routes.

They are here rather than fetched because a signed agreement is a legal record:
the document produced during a network blip has to be the same document as the
one produced on a good day, and a face that silently falls back to Helvetica
would put the vendor's signature in the wrong hand.

These are the Latin subsets Google Fonts serves, taken from the same families
`app/layout.tsx` loads for the site, so the PDF and the screen are set in the
same type.

| File                     | Family           | Used for                     | Licence      |
| ------------------------ | ---------------- | ---------------------------- | ------------ |
| `Anton-Regular.ttf`      | Anton            | Document title, block heads  | OFL 1.1      |
| `Karla-Regular.ttf`      | Karla            | Body                         | OFL 1.1      |
| `Karla-Bold.ttf`         | Karla            | Bold runs, conspicuous boxes | OFL 1.1      |
| `Yellowtail-Regular.ttf` | Yellowtail       | The typed signature          | Apache 2.0   |

All four are redistributable under those licences, which is what allows them to
be committed here and shipped in the function bundle.
