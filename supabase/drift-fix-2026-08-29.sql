-- ============================================================================
-- Drift fix, audited 2026-08-29 against project fsaryeciduszuahgjbly.
--
-- Brings the live database in line with what the deployed code actually reads
-- and writes. Every statement is idempotent and safe to run more than once.
--
-- Checked against the live data before writing: all 28 vendor_applications
-- rows are event bookings with a slug and no booking_date, none are
-- 'declined', and no subscription or refund columns are populated. So every
-- constraint added below validates against existing rows and every backfill is
-- a no-op today. Re-run the PRE-FLIGHT block first if that may have changed.
--
-- Run it in one go in the SQL editor. It is written top to bottom in dependency
-- order: the not-null drop and the value migration come before the constraints
-- that depend on them.
-- ============================================================================


-- ------------------------------------------------------------- PRE-FLIGHT ---
-- Expect every count to be 0. Anything else means data has changed since the
-- audit and the constraints further down will fail rather than corrupt.

select
  count(*) filter (where approval_status = 'declined')                        as must_migrate_declined,
  count(*) filter (where booking_kind = 'event' and booking_date is not null) as bad_event_rows,
  count(*) filter (where booking_kind = 'day'   and booking_date is null)     as bad_day_rows,
  count(*) filter (where booking_kind = 'monthly' and booking_date is not null) as bad_monthly_rows
from public.vendor_applications;


-- =============================================================== 1. columns ==
-- 12 columns the code reads or writes that do not exist. These are what took
-- the tracker, the review flow and the Square webhook down.

alter table public.vendor_applications add column if not exists square_payment_id                 text;
alter table public.vendor_applications add column if not exists reviewed_at                       timestamptz;
alter table public.vendor_applications add column if not exists refund_id                         text;
alter table public.vendor_applications add column if not exists refund_amount_cents               integer;
alter table public.vendor_applications add column if not exists refund_error                      text;
alter table public.vendor_applications add column if not exists monthly_amount_cents              integer;
alter table public.vendor_applications add column if not exists subscription_period_end           date;
alter table public.vendor_applications add column if not exists subscription_cancel_at_period_end boolean not null default false;
alter table public.vendor_applications add column if not exists failed_payment_count              integer not null default 0;
alter table public.vendor_applications add column if not exists last_invoice_status               text;
alter table public.vendor_applications add column if not exists last_invoice_at                   timestamptz;
alter table public.vendor_applications add column if not exists recurring_acknowledged            boolean not null default false;

alter table public.waitlist add column if not exists converted_at timestamptz;
alter table public.waitlist add column if not exists declined_at  timestamptz;


-- ============================================================== 2. backfills ==
-- The live database grew a parallel set of names for the same facts. Carry the
-- values across so nothing is lost, rather than leaving two half-populated
-- sets of columns. All no-ops against today's data.

-- approved_at / denied_at collapse into one reviewed_at, which is what the code
-- stamps whichever way the decision went.
update public.vendor_applications
   set reviewed_at = coalesce(approved_at, denied_at)
 where reviewed_at is null
   and coalesce(approved_at, denied_at) is not null;

-- subscription_next_billing_at is a timestamptz; the code wants the date the
-- period ends, read in the park's timezone so a late evening renewal does not
-- land on the following day.
update public.vendor_applications
   set subscription_period_end = (subscription_next_billing_at at time zone 'America/Chicago')::date
 where subscription_period_end is null
   and subscription_next_billing_at is not null;

update public.vendor_applications
   set refund_id = square_refund_id
 where refund_id is null
   and square_refund_id is not null;

-- Anything already monthly agreed to the recurring charge to get that far.
update public.vendor_applications
   set recurring_acknowledged = true
 where booking_kind = 'monthly'
   and recurring_acknowledged is false;


-- ============================================ 3. event_slug must accept null ==
-- A day booking has a date and no event; a monthly one has neither. The code
-- writes null for both, and the not null is why every non-event signup fails
-- at the insert.

alter table public.vendor_applications alter column event_slug drop not null;


-- ================================================= 4. 'declined' -> 'denied' ==
-- The tracker, the emails and the code all say denied. The live constraint only
-- allows declined, so every denial is rejected. Rows move before the constraint
-- is swapped, or the swap fails against them.

update public.vendor_applications
   set approval_status = 'denied'
 where approval_status = 'declined';

alter table public.vendor_applications
  drop constraint if exists vendor_applications_approval_status_check;

alter table public.vendor_applications
  add constraint vendor_applications_approval_status_check
  check (approval_status in ('pending', 'approved', 'waitlist', 'denied', 'cancelled'));


-- ============================================================ 5. constraints ==
-- Shape and range checks the code assumes hold.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendor_applications_booking_shape_check') then
    alter table public.vendor_applications
      add constraint vendor_applications_booking_shape_check
      check (
        (booking_kind = 'event'   and event_slug is not null and booking_date is null)
        or (booking_kind = 'day'     and booking_date is not null)
        or (booking_kind = 'monthly' and booking_date is null)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vendor_applications_refund_amount_check') then
    alter table public.vendor_applications
      add constraint vendor_applications_refund_amount_check
      check (refund_amount_cents is null or refund_amount_cents >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'vendor_applications_failed_payment_check') then
    alter table public.vendor_applications
      add constraint vendor_applications_failed_payment_check
      check (failed_payment_count >= 0);
  end if;
end $$;


-- =============================================================== 6. indexes ==

-- The review queue. Partial, because the only question ever asked of it is
-- what is still waiting, which is a small slice of the table.
create index if not exists vendor_applications_pending_review_idx
  on public.vendor_applications (event_slug, created_at)
  where approval_status = 'pending';

create index if not exists vendor_applications_booking_day_idx
  on public.vendor_applications (booking_date, spot_type, payment_status)
  where booking_kind = 'day';

create index if not exists vendor_applications_monthly_idx
  on public.vendor_applications (subscription_status, created_at desc)
  where booking_kind = 'monthly';


-- ====================================================== 7. day_availability ==
-- Missing entirely. Without it every day comes back closed, because a failed
-- read is deliberately treated as "not bookable" rather than optimistically
-- open, so the whole daily calendar is currently dead.
--
-- Exceptions only. A day with no row here is open at the house capacity, which
-- is where most of the year sits, so there is no row-per-day to maintain. Add a
-- row to close a day or to give it a capacity that is not the usual one.

create table if not exists public.day_availability (
  day             date primary key,
  is_open         boolean not null default true,
  -- Null means "use the house number" (20 booths, 14 trucks, from
  -- DAY_CAPACITY in lib/booking.ts). Zero is a real answer meaning none of
  -- that type that day, which is not the same statement.
  booth_capacity  integer,
  truck_capacity  integer,
  -- Shown to the admin in the tracker, never to a vendor.
  note            text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint day_availability_booth_capacity_check
    check (booth_capacity is null or booth_capacity >= 0),
  constraint day_availability_truck_capacity_check
    check (truck_capacity is null or truck_capacity >= 0)
);

comment on table public.day_availability is
  'Exceptions to the ordinary open day. A day with no row is open at the house capacity; add a row to close a day or to change its capacity.';
comment on column public.day_availability.is_open is
  'False closes the day to daily bookings entirely. The calendar greys it out and the API refuses it.';

create index if not exists day_availability_closed_idx
  on public.day_availability (day)
  where is_open is false;

drop trigger if exists day_availability_touch_updated_at on public.day_availability;
create trigger day_availability_touch_updated_at
  before update on public.day_availability
  for each row execute function public.touch_updated_at();

-- Same posture as every other table: RLS on, no policies, service role only.
alter table public.day_availability enable row level security;
alter table public.day_availability force  row level security;
revoke all on public.day_availability from anon, authenticated;


-- ========================================================= 8. join_waitlist ==
-- The live function returns jsonb carrying only id, position and booking_kind.
-- The route reads business_name, contact_name, phone, email, spot_type and
-- sells off the result to build the confirmation email, so those arrive
-- undefined and the vendor gets a mail with blanks in it.
--
-- Returning the row fixes it at the source. The return type changes, so the old
-- one has to be dropped rather than replaced. The body is the live version,
-- which is good, with the return swapped.

drop function if exists public.join_waitlist(jsonb);

create function public.join_waitlist(payload jsonb)
returns public.waitlist
language plpgsql
as $$
declare
  v_kind  text := coalesce(nullif(payload->>'booking_kind', ''), 'event');
  v_event text := nullif(payload->>'event_slug', '');
  v_date  date := nullif(payload->>'booking_date', '')::date;
  v_pos   integer;
  v_key   text;
  v_row   public.waitlist;
begin
  if v_kind = 'event' then
    if v_event is null then raise exception 'event_slug required for event waitlist'; end if;
    v_key := 'coyoteville:waitlist:event:' || v_event;
  else
    if v_date is null then raise exception 'booking_date required for day waitlist'; end if;
    -- Only a lock key, never stored or indexed, so rendering the date here is
    -- safe in a way it would not be inside a unique index. Pattern is pinned
    -- rather than left to DateStyle.
    v_key := 'coyoteville:waitlist:day:' || to_char(v_date, 'YYYY-MM-DD');
  end if;

  perform pg_advisory_xact_lock(hashtext(v_key)::bigint);

  -- w.position, not bare position: POSITION is a keyword and an unqualified
  -- reference inside an aggregate can be read as the start of position(x in y).
  if v_kind = 'event' then
    select coalesce(max(w.position), 0) + 1 into v_pos
      from public.waitlist w
     where w.booking_kind = 'event' and w.event_slug = v_event;
  else
    select coalesce(max(w.position), 0) + 1 into v_pos
      from public.waitlist w
     where w.booking_kind = 'day' and w.booking_date = v_date;
  end if;

  insert into public.waitlist (
    booking_kind, event_slug, booking_date, position,
    business_name, contact_name, phone, email, spot_type, sells, notes
  ) values (
    v_kind, v_event, v_date, v_pos,
    payload->>'business_name', payload->>'contact_name',
    payload->>'phone', payload->>'email',
    payload->>'spot_type', payload->>'sells', payload->>'notes'
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.join_waitlist(jsonb) is
  'Insert a waitlist row with the next free position for its scope, an event or a date, atomically. Returns the whole row: the caller builds the confirmation email from it.';

revoke all on function public.join_waitlist(jsonb) from anon, authenticated;


-- ============================================================================
-- OPTIONAL. Not required for the code to work, and destructive, so it is
-- separated out. Run only after confirming the backfills above landed and
-- nothing else reads these.
--
-- These five columns are the live-only duplicates that the code never touches.
-- Leaving them is harmless but invites somebody writing to the wrong one.
--
--   alter table public.vendor_applications drop column approved_at;
--   alter table public.vendor_applications drop column denied_at;
--   alter table public.vendor_applications drop column subscription_next_billing_at;
--   alter table public.vendor_applications drop column refund_status;
--   alter table public.vendor_applications drop column square_refund_id;
--
-- And the redundant index superseded by waitlist_event_position_key:
--   drop index if exists public.waitlist_status_idx;
-- ============================================================================
