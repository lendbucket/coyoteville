# Coyoteville

Food truck park and live music venue in Alice, Texas.
150 N. Stadium Road, Alice, TX 78332, on North Stadium Road between Alice High School
and the stadium.

Next.js 14 App Router, TypeScript, plain CSS. Supabase for data, Square for vendor
payments, deployed on Vercel.

---

## What is in here

```
app/
  layout.tsx                    fonts, metadata, geo tags
  page.tsx                      the whole home page
  globals.css                   the design system
  robots.ts                     crawl rules, AI crawlers allowed
  sitemap.ts
  vendors/confirmed/            post checkout landing, noindexed
  api/
    vendor-application/         validate, save, create Square payment link
    square-webhook/             mark applications paid and approved
    subscribe/                  email list upsert
components/
  StringLights.tsx              the festoon lights SVG
  VendorAgreement.tsx           renders the current agreement version
  VendorForm.tsx                the application form
  ...
lib/
  agreement/                    the agreement as data, one file per version
    versions/                   never edited, never removed
    registry.ts                 version -> text and counterparty
    pdf.tsx                     the signed agreement as a branded PDF
  seo.ts                        every site constant, price and JSON-LD schema
  supabase.ts                   server only client, service role
  square.ts                     server only client
  rate-limit.ts                 in memory IP rate limiter
supabase/
  schema.sql                    tables, indexes, RLS, event_roster view
public/
  logo.png                      you add this
```

**`lib/seo.ts` is the single source of truth.** Address, coordinates, pricing, the
event list, the FAQ and every schema come from that file. Change a price there and
the pricing cards, the checkout amount, the Event schema and the footer all follow.

---

## Local setup

You need Node 18.17 or newer.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
npm run dev
```

Open http://localhost:3000.

The site runs without any environment variables set. The form and the email capture
will return a friendly "not connected yet" message instead of crashing, so you can
work on design before the backend is wired.

---

## Supabase

1. Create a project at https://supabase.com.
2. Open the **SQL Editor**, paste the whole contents of `supabase/schema.sql`, run it.
   It is idempotent, so running it again after an edit is fine. **On a fresh
   project only** — see the warning below before running it against anything live.
3. Go to **Project Settings, API** and copy:
   - **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role** secret into `SUPABASE_SERVICE_ROLE_KEY`

### SCHEMA.md is the source of truth for column names

`SCHEMA.md` at the repo root is read directly from the production database and
is the only thing to trust about what columns exist.

**`supabase/schema.sql` and `supabase/drift-fix-2026-08-29.sql` both disagree
with production.** The drift fix is permanently unapplied and must never be
executed: it would add duplicate columns alongside the real ones that already
hold live data. Three separate outages have come from code written against
those files rather than against the database.

Before writing a query, check the column against `SCHEMA.md`. To check the
whole repo:

```bash
npm run check:schema
```

It cross-checks every Supabase `select`, `insert`, `update`, filter and `order`
against `SCHEMA.md` and names the file and line of anything that does not
match. It also runs automatically as a `prebuild` step, so a query naming a
column that does not exist fails the build rather than the page: Postgres
rejects one with error 42703 and fails the whole statement.

When production genuinely changes, update `SCHEMA.md` first. The checker has no
other source of truth and will not learn a new column any other way.

### About the security model

Row level security is on and forced for every table, and there are no anonymous
insert, update or delete policies anywhere. That is on purpose. All writes go through
the API route handlers using the service role key, which bypasses RLS. Signed waiver
records, phone numbers and subscriber emails are never reachable with the anon key.

Never put the service role key in a `NEXT_PUBLIC_` variable and never import
`lib/supabase.ts` from a client component. It is marked `server-only` so the build
will stop you.

### Pulling a run sheet

The `event_roster` view joins events to approved and settled applications:

```sql
select spot_number, business_name, contact_name, phone, sells, spot_type
from event_roster
where event_slug = 'tailgate-kickoff-2026-08-28'
order by spot_type, spot_number nulls last;
```

Assign spots by setting `spot_number` on the application rows.

---

## Square

1. Go to https://developer.squareup.com/apps and open (or create) your application.
2. Pick the **Sandbox** or **Production** credentials tab depending on what you are
   wiring up, then copy:
   - **Access token** into `SQUARE_ACCESS_TOKEN`
   - **Location ID** into `SQUARE_LOCATION_ID` (Locations tab, or Square Dashboard
     under Account and Settings, Business, Locations)
3. Set `SQUARE_ENVIRONMENT` to `sandbox` or `production`.

There are no Square catalog items to create. The payment link builds its line item
inline from `PRICING` in `lib/seo.ts`.

### Why a full order instead of quick pay

`quickPay` is the shorter call, but it cannot carry a `reference_id`. The checkout is
built as a full `order` so `reference_id` can be set to the application UUID. That id
is the only thing tying a completed Square payment back to the right row, and the
webhook reads it off the order. Do not switch this to `quickPay` without replacing
that link some other way.

`SQUARE_ENVIRONMENT` has to be exactly `production` to hit live Square. Anything else
resolves to sandbox, so a typo cannot charge a real card.

### Webhook endpoint

The webhook is what actually marks an application paid and approved. Without it,
vendors pay and their row stays `unpaid`.

**Production:**

1. Developer Dashboard, your app, **Webhooks, Subscriptions, Add subscription**.
2. URL: `https://yourdomain.com/api/square-webhook`
3. API version: leave it on the current default.
4. Subscribe to **`payment.updated`**.
5. Copy the **Signature key** for that subscription into
   `SQUARE_WEBHOOK_SIGNATURE_KEY`.

**The notification URL has to match byte for byte.** Square computes the signature
over the notification URL concatenated with the raw request body, so the URL
registered in the dashboard and the one this app derives from `NEXT_PUBLIC_SITE_URL`
must be identical. A trailing slash, `http` instead of `https`, or an apex versus
`www` mismatch all produce a valid looking request that fails verification. That is
the first thing to check if webhooks 400.

**Locally**, expose the port and register that URL as a sandbox subscription:

```bash
npx localtunnel --port 3000
# or: ngrok http 3000
```

Then set `NEXT_PUBLIC_SITE_URL` in `.env.local` to the tunnel URL, register
`https://<tunnel>/api/square-webhook` in the Square sandbox dashboard, and use the
**Send test event** button on the subscription to fire a `payment.updated`.

Sandbox test card at checkout: `4111 1111 1111 1111`, any future expiry, CVV `111`,
postal code `94103`.

---

## Vercel

The repo is already linked. Add the environment variables under
**Project Settings, Environment Variables**:

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | your live domain | the preview URL | no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | yes | secret |
| `SQUARE_ACCESS_TOKEN` | production token | sandbox token | secret |
| `SQUARE_LOCATION_ID` | production location | sandbox location | |
| `SQUARE_ENVIRONMENT` | `production` | `sandbox` | |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | production subscription key | sandbox subscription key | secret |

With the CLI:

```bash
vercel env add SQUARE_ACCESS_TOKEN production
vercel env pull .env.local
```

`NEXT_PUBLIC_SITE_URL` matters more than it looks. It sets canonical tags, Open Graph
URLs, the sitemap, the Square redirect URL, and the webhook notification URL that the
signature is computed against. Get it wrong in production and both the checkout
redirect and webhook verification break.

**Change it and you must redeploy.** The home page is statically prerendered, so its
canonical tag, Open Graph URLs and the sitemap bake the value in at build time. The
API routes are dynamic and read it at runtime. Editing the variable in the Vercel
dashboard without triggering a new build leaves those two out of sync: the webhook
would verify against the new URL while the page still advertises the old one.

### Deploy flow

Push to `main` and Vercel builds production. Any other branch gets a preview URL.

```bash
git push origin main
```

Or from the CLI:

```bash
vercel          # preview
vercel --prod   # production
```

After the first production deploy:

1. Point the Square webhook at the real domain and swap in that endpoint signature key.
2. Submit `https://yourdomain.com/sitemap.xml` in Google Search Console.
3. Run the home page through the Rich Results Test to confirm the LocalBusiness,
   Event and FAQPage schemas are picked up.

---

## Email

Registration email goes out through [Resend](https://resend.com). Two messages
per registration: a notification to `ceo@36west.org` and a short confirmation to
the vendor.

Set two variables:

- `RESEND_API_KEY` — from the Resend dashboard, starts with `re_`.
- `FROM_EMAIL` — the sender, e.g. `Coyoteville <vendors@coyoteville.com>`.

**The sending domain has to be verified in Resend or the emails fail silently.**
Add the domain under Domains in Resend, publish the DKIM and SPF records it
gives you, and wait for it to show as verified. Until then Resend accepts the
API call and simply does not deliver, so nothing throws and nothing arrives.
Sending from a domain you do not control fails the same way.

Timing differs by path, on purpose:

- **Paid applications** send from the Square webhook when the payment settles,
  not when the form is submitted. Someone who abandons checkout never generates
  a notification. The webhook only sends on the transition out of `unpaid`, so a
  Square retry cannot send twice.
- **Free Alice organization spots** send at submission. There is no payment to
  wait on.
- **Prepaid link registrations** send at submission for the same reason.

A failed send is logged and never fails a registration. If `RESEND_API_KEY` or
`FROM_EMAIL` is missing the send is skipped with a warning and everything else
works normally.

## Prepaid registration link, removed

There used to be a hidden registration link at `/r/<token>` for vendors who had
paid off the site. It took no payment and the database function behind it
stamped the row `payment_status = 'paid'`, `paid_at = now()` and
`approval_status = 'approved'` on the strength of the form being submitted.

It was built for the August 28 launch event. The token went to eighteen vendors
and kept working afterwards, and one of them used it to register for the
September event, producing a row that said paid and approved with no money
behind it.

**The route and its page are deleted, not flagged off.** There is no token check
left, no environment variable, and no database call on `/r/<anything>`: it
renders a notice pointing at the ordinary signup. Bringing it back means writing
the route again, which is the intended cost. A feature flag would have been one
dashboard edit from live, and the people holding the old link are exactly the
people who would find it.

Still in place on purpose:

- `register_prepaid_vendor` in the database. Nothing calls it. Dropping it
  would be a schema change to delete a function that is already unreachable.
- The eighteen `payment_method = 'offline'` rows. Real vendors and real records
  for August 28, and the tracker reconciles cash received against them.

With the link gone, nothing in the application can create a new offline row. See
"Recording cash" below before assuming that is fine.

## Recording cash

The tracker records what was actually collected against an offline row:
`amount_received_cents` and `amount_received_at`, entered in dollars in the
vendor sheet, kept apart from `amount_cents` so booked money and money in hand
are two different numbers. The revenue strip shows both and flags rows that say
paid with nothing counted against them.

**It only works on rows that are already `payment_method = 'offline'`.** The
gate in `app/api/admin/update/route.ts` checks the stored payment method, so an
online row cannot be typed over: Square already has the last word on what it
took.

With the prepaid link removed, **nothing in the application creates an offline
row.** Every remaining writer of `payment_method` sets `'online'`:
`app/api/vendor-application` on insert and `app/api/square-webhook` on
settlement. So the feature still matters for the eighteen August 28 rows, which
have never been reconciled, and there is no way to add a nineteenth.

That is a gap, not a decision. A vendor who walks up on the night and pays cash
cannot be entered at all. Three ways to close it, smallest first:

1. **Let the tracker change the payment method.** `/api/admin/update` already
   takes a patch and already checks the admin session; it would accept
   `payment_method` alongside the fields it has, and the sheet would offer
   "paid cash at the gate" on an unpaid row. Smallest change, and it only helps
   a vendor who already applied through the site and never paid.
2. **An admin-side add-vendor form.** A cut-down version of the vendor form,
   behind the admin session, writing the row directly with
   `payment_method = 'offline'` and `approval_status = 'approved'`. Handles a
   true walk-up with no prior application. Needs the agreement to be signed
   somehow, which is the hard part: the signature record is what the PDF is
   built from, and a row with no signature is a vendor with no agreement.
3. **Bring back a token link with the payment lie fixed.** Rejected for now.
   The thing that made the old one dangerous was the database function stamping
   paid and approved without evidence, and that function is still there.

Option 1 is the recommendation if the goal is only to stop losing cash from
vendors who applied and did not pay. Option 2 is the recommendation if walk-ups
with no application need to exist at all, and it should be scoped as its own
piece of work because of the agreement problem.

Three variables:

- `PREPAID_ACCESS_TOKEN` — the whole credential. Long and random.
- `PREPAID_LINK_EXPIRES_AT` — ISO timestamp. Nothing is accepted after it. An
  unreadable value is treated as expired, which fails closed.
- `PREPAID_MAX_REGISTRATIONS` — cap, counted from rows with
  `payment_method = 'offline'` for the current event.

Both gates are checked when the page renders and again in the API route, so a
stale tab or a direct post gets neither.

These registrations write to `vendor_applications` like any other, with the same
agreement, uploads and server side stamping. The difference is payment:
`payment_status = 'paid'`, `payment_method = 'offline'`,
`approval_status = 'approved'`, and Square is never called.

Because those vendors are already counted in `booth_claimed_offline` /
`truck_claimed_offline`, a successful registration decrements the matching
counter inside the same transaction as the insert, through the
`register_prepaid_vendor` function. Without that they would be counted twice on
the live meter.

## The agreement

The Vendor Participation Agreement is data, not markup. `lib/agreement/versions`
holds one file per version ever issued, `lib/agreement/current.ts` points at the
one that is live, and `components/VendorAgreement.tsx` renders that on the signing
page. The signed PDF in the tracker renders the same files.

Every signed application stores the version string, the typed signature, the date,
a server timestamp, the signer IP and the user agent. That is the record that makes a
typed name a binding electronic signature under the Texas Uniform Electronic
Transactions Act. The version string is stamped server side in the API route, never
taken from the browser.

**Changing the agreement means adding a version, never editing one.** Write a new
file under `lib/agreement/versions`, point `current.ts` at it, and add it to
`lib/agreement/registry.ts`. Nothing under `versions/` is ever edited in place and
nothing is ever removed: a row signed under v3.0-2026 resolves to the v3.0-2026 file,
and the day someone disputes that agreement is the day that text has to still exist,
several versions later.

The registry also carries the counterparty for each version, because it is not the
same counterparty throughout. Anything signed under v2.0-2026 contracted with Reyna
Title LLC d/b/a Coyoteville; v3.0-2026 onward is Coyoteville Alice LLC. Each PDF names
the entity that was contracting when its version was live.

### Signed agreement PDFs

The tracker renders a branded PDF of any signed agreement, server side and behind the
admin session, at `/api/admin/agreement?id=<row>`. `/api/admin/agreements?event=<scope>`
zips every signed agreement in the current scope with a manifest. Both refuse rather
than substitute: a row stamped with a version the codebase has no text for produces an
error, never the current text under an older version's name.

The conspicuous provisions — release, indemnity, assumption of risk, acknowledgment —
keep their border, bold, capitals and larger size in the PDF. That is a legal
requirement rather than styling; see the note above `.agreement__box` in
`app/globals.css`.

The brand faces are committed as TrueType under `lib/agreement/fonts` and read off
disk, and `next.config.js` traces them and `public/logo.png` into those two routes.
Nothing is fetched at render time, so a PDF produced during a network blip is the same
document as one produced on a good day.

### Why the PDF routes need explicit tracing

pdfkit loads its standard fonts through a Node subpath import,
`#standard-fonts/Helvetica`, resolved against pdfkit's own `package.json` at
runtime. Next's output file tracing cannot follow that, so it bundles the entry
and none of the fonts. Every local check passes, because a development machine
has the whole of `node_modules`, and the route 500s with `MODULE_NOT_FOUND` on
its first request in production.

pdfkit loads Helvetica on every document whether or not anything uses it:
`initFonts` defaults to it and react-pdf does not override that. So the fonts
are needed even though all our type is set in registered faces, and no amount
of embedding our own fonts removes the dependency.

`experimental.outputFileTracingIncludes` in `next.config.js` covers it, for
every route that renders a PDF. To check:

```bash
npm run check:pdf-bundle
```

It reads the tracer's own manifest, then copies only the traced files somewhere
clean and renders a PDF there with all fourteen standard faces. If an asset is
missing it fails in the same way production did. It runs as a `postbuild` step,
so this cannot ship broken twice.

---

## Pricing and free spots

| Spot | Fee |
| --- | --- |
| Vendor booth | $25 per event |
| Food truck spot | $50 per event |
| Coyote groups, booster clubs, nonprofits | Free |

Flat rate. No commission on sales.

Free applications skip Square entirely. The API returns `checkoutUrl: null`, the form
shows a confirmation in place, and the row is written with
`payment_status = 'not_required'` and `approval_status = 'approved'`.

---

## Adding an event

1. Add it to `EVENTS` in `lib/seo.ts`. The first entry in the array drives the orange
   event bar, the hero and the `Event` JSON-LD.
2. Insert the matching row in `public.events` so `event_roster` can join to it.

Keep the slug identical in both places.

---

## Rate limiting

`lib/rate-limit.ts` is an in memory fixed window counter. On Vercel that is per
function instance, so it slows down a single abusive client rather than guaranteeing
a global cap. Applications are 5 per 10 minutes per IP, subscribes are 8 per 10
minutes. If volume ever justifies it, swap the map for Upstash Redis. The call site
signature stays the same.

---

## Writing style

Copy on this site is written plain. Short sentences. No em dashes, no en dashes, no
emojis. If you add a section, match that.
