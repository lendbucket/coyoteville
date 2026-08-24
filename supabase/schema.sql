-- ============================================================================
-- Coyoteville schema
-- Food truck park and live music venue, Alice, Texas.
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- Security model: row level security is on for every table and there are no
-- anonymous insert, update or delete policies. Every write goes through a
-- Next.js route handler using the service role key, which bypasses RLS. The
-- anon key can never reach signed waiver records or subscriber emails.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- events ---

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null unique,
  name          text        not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  display_date  text,
  display_time  text,
  blurb         text,
  location_name text        not null default 'Coyoteville',
  is_published  boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.events is 'Event calendar. The slug is what the application form submits.';

create index if not exists events_starts_at_idx on public.events (starts_at desc);
create index if not exists events_published_idx on public.events (is_published, starts_at desc);

-- ------------------------------------------------- vendor applications ---

create table if not exists public.vendor_applications (
  id                    uuid primary key default gen_random_uuid(),

  -- what the vendor filled out
  business_name         text        not null,
  contact_name          text        not null,
  phone                 text        not null,
  email                 text        not null,
  spot_type             text        not null,
  event_slug            text        not null,
  sells                 text        not null,
  notes                 text,

  -- the signed waiver record, this is the auditable part
  waiver_accepted       boolean     not null default false,
  permits_confirmed     boolean     not null default false,
  signature_name        text        not null,
  signed_date           date        not null,
  signed_at             timestamptz not null default now(),
  waiver_version        text        not null,
  signer_ip             text,
  signer_user_agent     text,

  -- money
  amount_cents          integer     not null default 0,
  payment_status        text        not null default 'unpaid',
  square_order_id        text,
  square_payment_link_id text,
  paid_at               timestamptz,

  -- what we do with it
  approval_status       text        not null default 'pending',
  spot_number           text,
  admin_notes           text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint vendor_applications_spot_type_check
    check (spot_type in ('booth', 'truck', 'free')),

  constraint vendor_applications_payment_status_check
    check (payment_status in ('unpaid', 'paid', 'not_required', 'expired', 'refunded')),

  constraint vendor_applications_approval_status_check
    check (approval_status in ('pending', 'approved', 'waitlist', 'declined', 'cancelled')),

  constraint vendor_applications_amount_check
    check (amount_cents >= 0),

  -- A record is only valid if both boxes were actually checked and the vendor
  -- typed a name. The API enforces this too. Belt and suspenders.
  constraint vendor_applications_waiver_signed_check
    check (waiver_accepted is true and permits_confirmed is true and length(btrim(signature_name)) >= 2)
);

comment on table public.vendor_applications is
  'Vendor applications with the signed waiver record attached. Never delete rows here, cancel them instead.';
comment on column public.vendor_applications.waiver_version is
  'Version string of the waiver text the vendor actually agreed to. Matches WAIVER_VERSION in components/Waiver.tsx.';
comment on column public.vendor_applications.signer_ip is
  'Captured at signing to support the electronic signature record under Texas UETA.';
comment on column public.vendor_applications.square_order_id is
  'Square order id. The order carries reference_id = this row id, which is how the webhook maps a completed payment back here.';
comment on column public.vendor_applications.square_payment_link_id is
  'Square payment link id, kept so a link can be looked up or voided later.';

create index if not exists vendor_applications_event_idx
  on public.vendor_applications (event_slug, created_at desc);

create index if not exists vendor_applications_payment_idx
  on public.vendor_applications (payment_status);

create index if not exists vendor_applications_approval_idx
  on public.vendor_applications (approval_status, event_slug);

create index if not exists vendor_applications_email_idx
  on public.vendor_applications (lower(email));

create index if not exists vendor_applications_created_idx
  on public.vendor_applications (created_at desc);

create unique index if not exists vendor_applications_square_order_idx
  on public.vendor_applications (square_order_id)
  where square_order_id is not null;

create index if not exists vendor_applications_payment_link_idx
  on public.vendor_applications (square_payment_link_id)
  where square_payment_link_id is not null;

-- ----------------------------------------------------------- subscribers ---

create table if not exists public.subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           text        not null,
  source          text        not null default 'homepage',
  signup_ip       text,
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.subscribers is 'Event announcement list. One email before each event.';

create unique index if not exists subscribers_email_key on public.subscribers (email);
create index if not exists subscribers_active_idx
  on public.subscribers (created_at desc)
  where unsubscribed_at is null;

-- ------------------------------------------------------- updated_at hook ---

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists vendor_applications_touch_updated_at on public.vendor_applications;
create trigger vendor_applications_touch_updated_at
  before update on public.vendor_applications
  for each row execute function public.touch_updated_at();

drop trigger if exists subscribers_touch_updated_at on public.subscribers;
create trigger subscribers_touch_updated_at
  before update on public.subscribers
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------ run sheet ---
-- Everything you need to walk the lot on event day, in setup order.

create or replace view public.event_roster with (security_invoker = true) as
select
  e.slug                as event_slug,
  e.name                as event_name,
  e.starts_at           as event_starts_at,
  a.id                  as application_id,
  a.spot_number,
  a.spot_type,
  a.business_name,
  a.contact_name,
  a.phone,
  a.email,
  a.sells,
  a.notes,
  a.amount_cents,
  a.payment_status,
  a.approval_status,
  a.paid_at,
  a.signature_name,
  a.signed_date,
  a.waiver_version,
  a.created_at          as applied_at
from public.events e
join public.vendor_applications a
  on a.event_slug = e.slug
where a.approval_status = 'approved'
  and a.payment_status in ('paid', 'not_required')
order by
  e.starts_at desc,
  a.spot_type,
  a.spot_number nulls last,
  a.created_at;

comment on view public.event_roster is
  'Run sheet. Approved and settled vendors per event, ready to print.';

-- ------------------------------------------------------------------ RLS ---
-- On for everything. No anonymous policies at all. The service role key used
-- by the API routes bypasses RLS, so writes still work from the server.

alter table public.events              enable row level security;
alter table public.vendor_applications enable row level security;
alter table public.subscribers         enable row level security;

alter table public.events              force row level security;
alter table public.vendor_applications force row level security;
alter table public.subscribers         force row level security;

-- Published events are the only thing safe to read publicly, and only if you
-- decide to fetch them from the browser later. Drop this policy if you would
-- rather every read go through the server too.
drop policy if exists "events public read published" on public.events;
create policy "events public read published"
  on public.events
  for select
  to anon, authenticated
  using (is_published is true);

-- Deliberately no insert, update or delete policies on any table, and no
-- select policy at all on vendor_applications or subscribers. Signed waivers,
-- phone numbers and email addresses stay server side.

revoke all on public.vendor_applications from anon, authenticated;
revoke all on public.subscribers         from anon, authenticated;
revoke all on public.event_roster        from anon, authenticated;

-- ----------------------------------------------------------------- seed ---

insert into public.events (slug, name, starts_at, ends_at, display_date, display_time, blurb)
values (
  'tailgate-kickoff-2026-08-28',
  'Tailgate Kickoff',
  '2026-08-28 16:00:00-05',
  '2026-08-28 22:00:00-05',
  'Friday, August 28, 2026',
  '4:00 PM',
  'First home game of the season. We open at 4:00 PM.'
)
on conflict (slug) do update
  set name         = excluded.name,
      starts_at    = excluded.starts_at,
      ends_at      = excluded.ends_at,
      display_date = excluded.display_date,
      display_time = excluded.display_time,
      blurb        = excluded.blurb;
