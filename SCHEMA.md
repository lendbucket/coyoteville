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

Last verified against production: 2026-09-08.

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
  refund_amount_cents, recurring_acknowledged, amount_received_at, vendor_id

vendors
  id, auth_user_id, email, business_name, contact_name, phone, sells,
  serves_food, logo_path, photo_paths, permit_path, permit_expires_at,
  claimed_at, invited_at, created_at, updated_at

waitlist
  id, event_slug, position, business_name, contact_name, phone, email,
  spot_type, sells, notes, status, offered_at, admin_notes, created_at,
  updated_at, booking_date, booking_kind

org_applications
  id, org_name, org_type, contact_name, email, phone, ein, is_501c3,
  volunteer_count, story, logo_path, event_slugs, status, terms_accepted,
  terms_version, signature_name, signed_at, signer_ip, signer_user_agent,
  admin_notes, created_at, updated_at

parking_payments
  id, event_slug, amount_cents, vehicle_count, source, kind,
  square_fee_cents, square_payment_id, square_order_id, recorded_by, note,
  created_at

org_event_awards
  id, event_slug, org_application_id, picked_at, picked_from_count,
  parking_gross_cents, payout_cents, paid_at, paid_method, published_at,
  notes, created_at, updated_at

volunteer_waivers
  id, event_slug, org_application_id, full_name, phone, email,
  date_of_birth, is_adult, guardian_name, guardian_phone,
  guardian_signature_name, emergency_contact_name,
  emergency_contact_phone, waiver_version, signature_name, signed_at,
  signer_ip, signer_user_agent, created_at

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

## The booking shape

`vendor_applications.booking_kind` decides which of two columns carries the
booking, and exactly one of them is set:

| booking_kind | event_slug | booking_date | also |
| --- | --- | --- | --- |
| `event` | the slug | null | |
| `day` | null | a `YYYY-MM-DD` | |
| `monthly` | null | null | `monthly_amount_cents`, `square_customer_id`, `square_card_id`, `subscription_status = 'pending'`, `recurring_acknowledged` |

**`event_slug` is nullable, as of 2026-09-04.** It was NOT NULL in production
until then, which meant every day and every monthly signup died at the insert
with Postgres 23502 the moment the vendor pressed submit, after they had filled
in the whole form and uploaded their files. Zero day bookings and zero monthly
bookings existed in the database, and that absence was the symptom rather than a
lack of demand. The code had always sent null for those two kinds, which is
correct and is what the table now accepts.

Nothing enforces the table above in the database yet. Until it does,
`scripts/check-booking-shape.js` enforces it against the real route on every
build.

## Allowed values

**A column list is not enough. These are the values the check constraints
accept, and a literal outside them fails the whole statement with Postgres
23514 exactly the way an unknown column fails with 42703.**

This section exists because it was not here. `approval_status` allowed
`declined` while every line of code wrote `denied`, so the Deny button in the
tracker had never once worked: every press failed with 23514, and the capacity
filter `<> 'denied'` had been excluding nothing because no row could hold that
value. Nothing in a column-name check can see that. `npm run check:schema` now
reads the block below and fails the build on any literal the code writes or
compares against one of these columns that is not in its list.

```values
vendor_applications.approval_status
  pending, approved, waitlist, denied, cancelled

vendor_applications.payment_status
  unpaid, paid, not_required, refunded, expired

vendor_applications.booking_kind
  event, day, monthly

vendor_applications.spot_type
  booth, truck, free

vendor_applications.payment_method
  online, offline

vendor_applications.subscription_status
  pending, active, past_due, canceled

waitlist.status
  waiting, offered, converted, declined

waitlist.spot_type
  booth, truck, free

waitlist.booking_kind
  event, day, monthly

org_applications.status
  pending, selected, declined, withdrawn

parking_payments.source
  qr, pos, cash

parking_payments.kind
  parking, donation
```

`denied` and `cancelled` are both on `approval_status` and are not
interchangeable. `denied` is a decision somebody made and it refunds.
`cancelled` is a checkout the vendor walked away from, aged out automatically,
and there is nothing to refund because nothing was ever paid.

## Parking money

Every parking dollar, from every source, is one row in `parking_payments`. The
QR page, the organization's live page, the tracker and the public ledger all
read from that table, and nothing computes parking revenue anywhere else. Half
of this money belongs to the organization working the night, and a number shown
to them has to be one they can see the rows behind.

`amount_cents` is checked `> 0`. `vehicle_count` defaults to 1 and is 1 on every
row today, because one scan of the QR is one vehicle; it stays a column rather
than an assumption so the money, the vehicles and the row count are three
separate numbers if that ever stops being true.

`square_payment_id` is unique, which is what stops Square booking the same ten
dollars twice: it redelivers a webhook until it gets a 2xx. It is nullable
because the column permits a row with no Square payment behind it, though
nothing writes one today.

Parking is QR only. Every payment comes through /park and the Square hosted
link, so every row is `source = 'qr'`. The constraint still permits `pos` and
`cash` and nothing writes them.

`kind` separates the two things that arrive through the same table. `parking`
is somebody buying a space, and half of it goes to the organization working the
night. `donation` is a gift to that organization, and **all** of it goes to
them, never split. They live in one table because they are one night's money and
the organization is shown both, and they are one column apart because they are
paid out under two different rules.

### The Square fee

`square_fee_cents` is what Square actually charged on that payment, taken off
the payment object, never computed from a percentage. A rate constant would be
a guess that drifts the day Square changes a card present rate or a payment
comes in on a different funding source, and this number is shown to an
organization as the reason their net is lower than their gross.

**Square does not have the fee when the payment completes.** `processing_fee`
is calculated after settlement and is usually absent on the first
`payment.updated` delivery. Square then sends a further `payment.updated` for
the same payment once the fee is known, normally within minutes and sometimes
the next day. So:

- the first delivery inserts the row with `square_fee_cents` null
- a later delivery for a row that already exists fills the fee in
- a row whose fee never arrives keeps null, and the pages say fees are still
  settling rather than showing a zero

That is why `recordParkingPayment` is not a plain "insert if new". It is
idempotent on `square_payment_id` for the money and still writes the fee when a
later delivery brings one.

RLS is enabled with no policies, so only the service role reaches it.

## The volunteer waiver

Every individual who works a game signs one on their phone at the lot, before
they start. `event_slug` is NOT NULL and references `events.slug`, so a waiver
is always for one night: signing once does not cover the season.
`org_application_id` is nullable because the QR code carries it and somebody
who types the URL by hand will not have it, and a signed waiver with no
organization against it is still a signed waiver.

`is_adult` is computed on the server from `date_of_birth` against the event
date, never taken from the form. A volunteer is not asked to declare it. When it
is false the guardian columns are required, and `guardian_signature_name` is the
parent's signature rather than the minor's.

RLS is enabled with no policies, so only the service role reaches it. Nothing
about a volunteer's date of birth or their emergency contact should be readable
by an anonymous key.

## The events table is the calendar

There is no event list in code. `lib/seo.ts` used to hold an `EVENTS` array
that had to be edited in lockstep with this table, and it has been deleted:
`lib/events-source.ts` reads `events` and everything else reads that, cached
per render pass so a page whose hero, ticker, countdown and structured data all
ask for the next event does one query rather than five.

A hand maintained copy of a database table is a second source of truth, and the
two drift the moment somebody inserts a row. That is not hypothetical here.
Three home games sat in this table while the site advertised one, which is the
same shape of bug as NEXT_EVENT once naming an event that had already happened.

Four published home games as of 2026-09-07:

| slug | name | date |
| --- | --- | --- |
| `home-game-2026-09-11` | Alice Home Game | Sep 11 |
| `home-game-2026-09-18` | Alice vs King Tailgate | Sep 18 |
| `home-game-2026-10-16` | Alice vs Hidalgo Early College | Oct 16 |
| `home-game-2026-11-06` | Alice vs Zapata Tailgate | Nov 6 |

November 6 falls after daylight saving ends, so its UTC offset differs from the
other three. Nothing in the code hardcodes an offset: display strings and the
signup cutoff are derived from `starts_at` and `signup_closes_at` through
`America/Chicago`, so the Central times read correctly either side of the change.

There is no static fallback if this table cannot be read, deliberately. The
homepage is ISR at revalidate 60, so a regeneration that fails leaves the
previous page in place and a transient outage is absorbed by the cache rather
than by a copy of the calendar somebody has to remember to edit.

## Vendor profiles

`vendors` is a returning vendor's saved details, so they stop re-uploading the
same logo, photos and permit at every event.

  `id`             uuid primary key
  `auth_user_id`   uuid unique, NULL until the profile is claimed by signing in
  `email`          unique, stored lowercased. The identity for a magic link
  `photo_paths`    text[]
  `permit_expires_at`  date. NULL means unknown, which is treated as expired
  `claimed_at`     set when a magic link sign in first attaches an auth user
  `invited_at`     set when the one time invite email goes out, so it cannot
                   double send

RLS is on: an authenticated user may select and update only the row where
`auth_user_id = auth.uid()`. The service role bypasses that, and every read and
write in this codebase goes through the service role inside a route handler, so
the browser never holds a key that can reach this table.

`vendor_applications.vendor_id` is a nullable FK to `vendors.id`. Nullable
because an anonymous application is still a first class path and always will be.

Backfilled 2026-09-07: 34 profiles, one per distinct email, populated from each
vendor's most recent application, and every existing application already carries
its `vendor_id`. Nine vendors have two or more applications.

### What a profile does not hold

**No part of the signature.** `signature_name`, `signed_at`, `signed_date`,
`signer_ip`, `signer_user_agent` and `agreement_version` live on the
application and only on the application. Every application is signed fresh. A
profile must never pre-fill or skip any part of that step, because the signature
is a record of a person agreeing to a specific version of the agreement at a
specific moment, and a copied one is worth nothing.

### The permit is the one thing that expires

`permit_expires_at` is captured on every permit upload from now on, profile or
not. A stored permit may be offered for reuse only when that date is present and
falls on or after the event being booked. NULL, past, or earlier than the event
date all require a fresh upload. A profile is a convenience; a lapsed health
permit is a regulator's problem.

The application stores the file paths that were actually used on its own row, so
an application stays frozen even when the profile is edited later.

## The Friday Night Fund

Half the gross parking from each home game goes to one Alice organization, which
works the event in return: runs parking, keeps the lot clean, helps keep the
crowd in order. One org per game, drawn at random from the eligible applicants.

`org_applications` is an application to the program, not to one game.
`event_slugs` is the list of home games that org can actually work, so the
draw for a given game only considers people who said they could be there.
`status` is one of `pending`, `selected`, `declined`, `withdrawn`.

The signature block mirrors `vendor_applications` and for the same reason:
`terms_accepted`, `terms_version`, `signature_name`, `signed_at`,
`signer_ip` and `signer_user_agent` are captured per application. An
organization agrees to a specific version of the program terms at a specific
moment, and that record lives on the application.

`org_event_awards` is one row per home game once an org has been picked, and
it is the public ledger. `event_slug` is unique, which is the database
enforcing one org per game rather than the code remembering to.

`picked_from_count` records how many organizations were in the draw. It exists
so the pick can be audited afterwards: a program that says "picked at random"
and keeps no record of the pool is asking to be taken on trust.

Money is in cents, like everywhere else. `payout_cents` is fifty percent of
`parking_gross_cents`, computed when the gross is entered rather than stored as
a rate, so the arithmetic on the ledger is checkable. `published_at` is what
puts a row on the public page: a game can be paid before it is published, and
nothing appears publicly until somebody decides it should.

Both tables have RLS on with no policies, so only the service role reaches them,
the same as `vendor_applications`.

## Health check rows

The production health check completes a real signup against this database every
six hours and after every production deploy, because every live failure this
site has had happened past the point a build gate can see: a NOT NULL only the
real table had, a CSP only a real browser enforced, a font only the real Lambda
was missing. Proving the insert works means doing the insert.

Those rows are real rows in `vendor_applications`, marked:

    business_name = '__healthcheck__'
    email         = 'run-<timestamp>@healthcheck.coyoteville.invalid'

**Every read of `vendor_applications` that can return more than one row must
exclude them**, with `.neq('business_name', HEALTHCHECK_BUSINESS_NAME)` from
`lib/healthcheck`. Otherwise a health check row holds a spot, moves a capacity
meter, or turns up in the review queue as an application to look at.

`npm run check:schema` enforces this. A new multi row read that forgets fails
the build and names the file and line. Exempt: writes, and reads that already
act on one known row through `.eq('id', ...)`, `.single()` or `.maybeSingle()`.

The rows are deleted by `POST /api/admin/healthcheck-cleanup` at the end of
every run, and anything older than fifteen minutes is deleted at the start of
the next one so a crashed run cannot leave debris. That endpoint filters on
`business_name` and takes no other parameter: the worst a leaked
`HEALTHCHECK_SECRET` can do there is delete rows only the health check creates.

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
