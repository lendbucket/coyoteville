# Production schema

**Read directly from the production Supabase database. This file is the ONLY
source of truth for column names.**

`supabase/schema.sql` and `supabase/drift-fix-2026-08-29.sql` are both known to
disagree with production and must not be trusted. Neither describes what is
live. `drift-fix-2026-08-29.sql` is permanently unapplied and must never be
executed.

Check every Supabase select, insert, update, filter, order and row type against
the lists below. A column that is not named here does not exist, and a query
that references one fails the whole statement with Postgres error 42703.

`npm run check:schema` checks the repo against this file, and runs
automatically before `npm run build`. See "Checking the schema" below.

Last verified against production: 2026-08-30.

```
day_availability
  booking_date, is_open, booth_capacity, truck_capacity, note,
  created_at, updated_at

events
  id, slug, name, starts_at, ends_at, display_date, display_time, blurb,
  location_name, is_published, booth_capacity, truck_capacity, created_at,
  updated_at, booth_claimed_offline, truck_claimed_offline, signup_closes_at

vendor_applications
  id, business_name, contact_name, phone, email, spot_type, event_slug,
  sells, notes, waiver_accepted, permits_confirmed, signature_name,
  signed_date, signed_at, agreement_version, signer_ip, signer_user_agent,
  logo_path, photo_paths, permit_path, serves_food, amount_cents,
  payment_status, square_order_id, square_payment_link_id, paid_at,
  approval_status, spot_number, admin_notes, created_at, updated_at,
  payment_method, upload_issues, booking_kind, booking_date,
  subscription_status, square_subscription_id, square_customer_id,
  square_card_id, subscription_started_at, subscription_next_billing_at,
  subscription_canceled_at, approved_at, denied_at, denial_reason,
  refund_status, refunded_at, square_refund_id, reviewed_at,
  amount_received_cents, monthly_amount_cents,
  subscription_cancel_at_period_end, failed_payment_count, refund_error,
  last_invoice_status, last_invoice_at, square_payment_id,
  refund_amount_cents, recurring_acknowledged, amount_received_at

waitlist
  id, event_slug, position, business_name, contact_name, phone, email,
  spot_type, sells, notes, status, offered_at, admin_notes, created_at,
  updated_at, booking_date, booking_kind

subscribers
  id, email, source, signup_ip, confirmed_at, unsubscribed_at,
  created_at, updated_at

subscription_events
  id, application_id, square_subscription_id, event_type, amount_cents,
  occurred_at, square_invoice_id, raw, created_at

postgres functions (bodies NOT in this repo):
  join_waitlist(payload jsonb)
  register_prepaid_vendor(payload jsonb)
  touch_updated_at()
  os_set_updated_at()
```

`waitlist` has no `declined_at` and no `converted_at`. A waitlist entry's state
is `status` alone.

On `vendor_applications`, `paid_at` and `amount_received_at` are not the same
thing and must not be used interchangeably. `register_prepaid_vendor` stamps
`paid_at` at submission, before anyone has collected anything, so on an offline
row it means "submitted". `amount_received_at` is when cash was actually counted
and recorded, and is the only timestamp that means money arrived.

## Checking the schema

```
npm run check:schema
```

`scripts/check-schema.js` reads the column lists out of the block above and
cross-checks every Supabase `select`, `insert`, `update`, filter and `order` in
the repo against them. It runs as a `prebuild` step, so a query naming a column
that does not exist fails the build rather than the page.

When production genuinely changes, update the block above first. The checker
has no other source of truth and will not learn a new column any other way.

Two things it cannot see, which no amount of static checking will fix:

- the bodies of the Postgres functions listed above, which are not in this repo
  and write columns of their own
- anything reached other than through a `.from('table')` chain

## Monthly vendors and event capacity

**Not a bug today. It becomes an oversell the moment the first permanent spot
sells, and selling them is the near term priority.**

### Where it stands

A permanent monthly vendor is a `vendor_applications` row with
`booking_kind = 'monthly'`, no `event_slug` and no `booking_date`. They occupy a
space at every event by definition, so they are not in any event's own rows and
would not be counted by the corrected capacity rule on their own.

They are counted, by a separate addend: `getMonthlyHolders()` in
`lib/days.ts:291` returns a flat booth and truck count, and `lib/spots.ts`
adds it as the third argument to `line()` for each type. So the meter does
subtract them.

### What is actually wrong with it

**The count has no date awareness.** `getMonthlyHolders` filters on
`booking_kind`, `approval_status` and `subscription_status` and nothing else. A
monthly vendor who signs up in December is subtracted from an event in
September, and one who cancelled in October is not subtracted from an event in
September that they did attend. The subscription columns needed to fix that
already exist: `subscription_started_at`, `subscription_next_billing_at`,
`subscription_canceled_at`.

Two smaller things fall out of the same query:

- A monthly row at `approval_status = 'pending'` is counted. It has no Square
  subscription yet, because approving is what creates one, so it is holding a
  space at every future event on the strength of an application nobody has
  looked at.
- `subscription_status = 'past_due'` is counted, which is right: a failed card
  is not a vacated space. Worth stating because it looks like an omission.

### How it should count

A monthly vendor should consume a spot of their type on an event if their
subscription was active on that event's date:

    started_at <= event.starts_at
      AND (canceled_at IS NULL OR canceled_at >= event.starts_at)
      AND approval_status = 'approved'

For a future event, "active on the date" means active now and not already
cancelling to a period end before it.

### What would change

- `lib/days.ts:291` — `getMonthlyHolders()` takes an event date and filters on
  the subscription window. It currently takes no arguments.
- `lib/days.ts:283` — `MonthlyHolders` is unchanged, still booth and truck.
- `lib/spots.ts:~300` — `loadSnapshot` passes the event's `starts_at` when it
  calls `getMonthlyHolders()`. It already has the slug; it would need the date,
  which `lib/seo.ts` has in `EventConfig.startISO`.
- `lib/days.ts:119` — the day calendar calls the same helper for a booking date
  and gets the same fix for free.
- No schema change. Every column needed is already live.

### Recommendation

**Make `getMonthlyHolders` date-aware before the first permanent spot sells,
and exclude `pending` monthly rows from it.**

The date filter is the substantive fix and it is maybe twenty lines. The
`pending` exclusion is a one word change and is arguably wrong today: a monthly
application nobody has approved is holding a space at every event on the
calendar.

I would not do it in the same change as anything else. It moves a number the
event meter depends on, and it should land on its own where it can be checked
against a real subscription rather than against zero of them.

One thing it cannot fix, worth knowing before the first one sells: a monthly
vendor holds a *type*, not a numbered space. Two monthly booth vendors and
twenty booth capacity leaves eighteen sellable, but nothing in the system says
which two footprints are theirs. Spot numbers are assigned by hand in the
tracker, so this works as long as whoever lays out the lot knows the monthly
vendors are there. The meter can only stop the lot being oversold; it cannot
stop two vendors being sent to the same square of gravel.
