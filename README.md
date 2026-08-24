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
  Waiver.tsx                    waiver text plus WAIVER_VERSION
  VendorForm.tsx                the application form
  ...
lib/
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
   It is idempotent, so running it again after an edit is fine.
3. Go to **Project Settings, API** and copy:
   - **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role** secret into `SUPABASE_SERVICE_ROLE_KEY`

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

## Prepaid registration link

For vendors who committed and paid off the site. Lives at `/r/<token>`, is not
linked from anywhere, is excluded from the sitemap, and is `noindex, nofollow`.
A token that does not match returns a real 404, so the response looks the same
as any route that does not exist.

Deliberately **not** listed in `robots.txt`. Putting a secret path in a public
file advertises it. The same reasoning applies to `/admin`.

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

## The waiver

`components/Waiver.tsx` holds the waiver text and exports `WAIVER_VERSION`.

Every signed application stores that version string, the typed signature, the date,
a server timestamp, the signer IP and the user agent. That is the record that makes a
typed name a binding electronic signature under the Texas Uniform Electronic
Transactions Act.

**If you change one word of the waiver, bump `WAIVER_VERSION`.** Old rows keep
pointing at the version they actually agreed to. Do not edit the text in place
without bumping, or your older records stop being auditable.

The version string is stamped server side in the API route, never taken from the
browser.

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
