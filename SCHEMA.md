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
  refund_amount_cents, recurring_acknowledged

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
