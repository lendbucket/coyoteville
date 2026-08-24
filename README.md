# Coyoteville

Food truck park and live music venue in Alice, Texas.
150 N. Stadium Road, Alice, TX 78332, on North Stadium Road between Alice High School
and the stadium.

Next.js 14 App Router, TypeScript, plain CSS. Supabase for data, Stripe for vendor
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
    vendor-application/         validate, save, create Stripe checkout
    stripe-webhook/             mark applications paid and approved
    subscribe/                  email list upsert
components/
  StringLights.tsx              the festoon lights SVG
  Waiver.tsx                    waiver text plus WAIVER_VERSION
  VendorForm.tsx                the application form
  ...
lib/
  seo.ts                        every site constant, price and JSON-LD schema
  supabase.ts                   server only client, service role
  stripe.ts                     server only client
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

## Stripe

1. Get your secret key from https://dashboard.stripe.com/apikeys into
   `STRIPE_SECRET_KEY`. Use the test key locally.
2. There are no Stripe Products to create. The checkout session builds the line item
   inline from `PRICING` in `lib/seo.ts`.

### Webhook endpoint

The webhook is what actually marks an application paid and approved. Without it,
vendors pay and their row stays `unpaid`.

**Production:**

1. Stripe Dashboard, **Developers, Webhooks, Add endpoint**.
2. URL: `https://yourdomain.com/api/stripe-webhook`
3. Select these events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.refunded`
4. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

**Locally**, use the Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

That prints a `whsec_...` for your `.env.local`. In another terminal:

```bash
stripe trigger checkout.session.completed
```

Test card at checkout: `4242 4242 4242 4242`, any future expiry, any CVC.

---

## Vercel

The repo is already linked. Add the environment variables under
**Project Settings, Environment Variables**:

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | your live domain | the preview URL | no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | yes | secret |
| `STRIPE_SECRET_KEY` | live key | test key | secret |
| `STRIPE_WEBHOOK_SECRET` | live endpoint secret | test endpoint secret | secret |

With the CLI:

```bash
vercel env add STRIPE_SECRET_KEY production
vercel env pull .env.local
```

`NEXT_PUBLIC_SITE_URL` matters more than it looks. It sets canonical tags, Open Graph
URLs, the sitemap and the Stripe success and cancel URLs. Get it wrong in production
and checkout sends people to the wrong host.

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

1. Point the Stripe webhook at the real domain.
2. Submit `https://yourdomain.com/sitemap.xml` in Google Search Console.
3. Run the home page through the Rich Results Test to confirm the LocalBusiness,
   Event and FAQPage schemas are picked up.

---

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

Free applications skip Stripe entirely. The API returns `checkoutUrl: null`, the form
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
