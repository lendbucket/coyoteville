-- ============================================================================
-- Coyoteville schema
-- Food truck park and live music venue, Alice, Texas.
--
-- Run this in the Supabase SQL editor. It is safe to run more than once.
--
-- Security model: row level security is on for every table and there are no
-- anonymous insert, update or delete policies. Every write goes through a
-- Next.js route handler using the service role key, which bypasses RLS. The
-- anon key can never reach signed agreement records or subscriber emails.
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

  -- How many of each spot exist for this event. The live spots meter counts
  -- claimed rows against these. Null means capacity is not set yet, and the
  -- site says so rather than showing a made up percentage.
  booth_capacity integer,
  truck_capacity integer,

  -- Vendors who committed by phone or on Facebook rather than through the
  -- form. The live meter adds these to the website count.
  booth_claimed_offline integer not null default 0,
  truck_claimed_offline integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint events_booth_capacity_check check (booth_capacity is null or booth_capacity >= 0),
  constraint events_truck_capacity_check check (truck_capacity is null or truck_capacity >= 0)
);

-- Capacity columns were added after the first release. Add them in place on a
-- database that already ran the original schema.
alter table public.events add column if not exists booth_capacity integer;
alter table public.events add column if not exists truck_capacity integer;
alter table public.events add column if not exists booth_claimed_offline integer not null default 0;
alter table public.events add column if not exists truck_claimed_offline integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_booth_capacity_check') then
    alter table public.events
      add constraint events_booth_capacity_check
      check (booth_capacity is null or booth_capacity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_truck_capacity_check') then
    alter table public.events
      add constraint events_truck_capacity_check
      check (truck_capacity is null or truck_capacity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_booth_offline_check') then
    alter table public.events
      add constraint events_booth_offline_check check (booth_claimed_offline >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_truck_offline_check') then
    alter table public.events
      add constraint events_truck_offline_check check (truck_claimed_offline >= 0);
  end if;
end $$;

comment on column public.events.booth_capacity is
  'Number of vendor booth spots for this event. Null means not set, and the site shows a neutral state instead of a percentage.';
comment on column public.events.truck_capacity is
  'Number of food truck spots for this event. Null means not set.';
comment on column public.events.booth_claimed_offline is
  'Booth vendors who committed by phone or Facebook rather than through the form. Added to the website count by the live meter. Decrement this when one of them registers on the site, or they are counted twice.';
comment on column public.events.truck_claimed_offline is
  'Food truck vendors who committed by phone or Facebook rather than through the form. Decrement when one registers on the site.';

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

  -- the signed agreement record, this is the auditable part
  waiver_accepted       boolean     not null default false,
  permits_confirmed     boolean     not null default false,
  signature_name        text        not null,
  signed_date           date        not null,
  signed_at             timestamptz not null default now(),
  agreement_version     text        not null,
  signer_ip             text,
  signer_user_agent     text,

  -- uploads. These are storage object paths, never public URLs. The admin
  -- view mints a short lived signed URL when someone actually looks at one.
  logo_path             text,
  photo_paths           text[]      not null default '{}',
  permit_path           text,
  serves_food           boolean     not null default false,

  -- money
  amount_cents          integer     not null default 0,
  payment_status        text        not null default 'unpaid',
  -- How the fee was taken. 'online' is Square checkout, 'offline' is a vendor
  -- who paid by phone or in person and registered through the prepaid link.
  payment_method        text,
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

  constraint vendor_applications_payment_method_check
    check (payment_method is null or payment_method in ('online', 'offline')),

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
  'Vendor applications with the signed Vendor Participation Agreement record attached. Never delete rows here, cancel them instead.';
comment on column public.vendor_applications.agreement_version is
  'Version string of the Vendor Participation Agreement the vendor actually agreed to. Matches AGREEMENT_VERSION in components/VendorAgreement.tsx. Stamped server side, never accepted from the client.';
comment on column public.vendor_applications.signer_ip is
  'Captured at signing to support the electronic signature record under Texas UETA.';
comment on column public.vendor_applications.square_order_id is
  'Square order id. The order carries reference_id = this row id, which is how the webhook maps a completed payment back here.';
comment on column public.vendor_applications.square_payment_link_id is
  'Square payment link id, kept so a link can be looked up or voided later.';

-- Migration from the v1 waiver to the v2 Vendor Participation Agreement.
-- The column above is created as agreement_version on a fresh database. On a
-- database that already ran the v1 schema the column exists as waiver_version,
-- so rename it in place. Signed rows keep their original version string, which
-- is the point: an old signature still points at the language it was given.
-- Renaming carries the column through the event_roster view automatically.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'vendor_applications'
      and column_name  = 'waiver_version'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'vendor_applications'
      and column_name  = 'agreement_version'
  ) then
    alter table public.vendor_applications
      rename column waiver_version to agreement_version;
  end if;
end $$;

-- Upload columns were added after the first release.
alter table public.vendor_applications add column if not exists logo_path    text;
alter table public.vendor_applications add column if not exists photo_paths  text[] not null default '{}';
alter table public.vendor_applications add column if not exists permit_path  text;
alter table public.vendor_applications add column if not exists serves_food  boolean not null default false;
alter table public.vendor_applications add column if not exists payment_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendor_applications_payment_method_check'
  ) then
    alter table public.vendor_applications
      add constraint vendor_applications_payment_method_check
      check (payment_method is null or payment_method in ('online', 'offline'));
  end if;
end $$;

comment on column public.vendor_applications.payment_method is
  'online for Square checkout, offline for vendors who paid outside the site and registered through the prepaid link. Null on rows created before this column existed.';

comment on column public.vendor_applications.permit_path is
  'Storage path of the food handler permit in the private coyoteville-permits bucket. Never expose this directly, mint a signed URL.';
comment on column public.vendor_applications.photo_paths is
  'Storage paths of business photos used for social spotlights.';

create index if not exists vendor_applications_event_idx
  on public.vendor_applications (event_slug, created_at desc);

-- Counting claimed spots per type is the hot query behind the live meter.
create index if not exists vendor_applications_spot_count_idx
  on public.vendor_applications (event_slug, spot_type, payment_status);

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
  a.payment_method,
  a.approval_status,
  a.paid_at,
  a.signature_name,
  a.signed_date,
  a.agreement_version,
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
-- select policy at all on vendor_applications or subscribers. Signed agreements,
-- phone numbers and email addresses stay server side.

revoke all on public.vendor_applications from anon, authenticated;
revoke all on public.subscribers         from anon, authenticated;
revoke all on public.event_roster        from anon, authenticated;

-- ----------------------------------------------------------------- seed ---

insert into public.events (slug, name, starts_at, ends_at, display_date, display_time, blurb, booth_capacity, truck_capacity)
values (
  'tailgate-kickoff-2026-08-28',
  'Tailgate Kickoff',
  '2026-08-28 16:00:00-05',
  '2026-08-28 22:00:00-05',
  'Friday, August 28, 2026',
  '4:00 PM',
  'First home game of the season. We open at 4:00 PM.',
  20,
  14
)
on conflict (slug) do update
  set name         = excluded.name,
      starts_at    = excluded.starts_at,
      ends_at      = excluded.ends_at,
      display_date = excluded.display_date,
      display_time = excluded.display_time,
      blurb        = excluded.blurb,
      booth_capacity = excluded.booth_capacity,
      truck_capacity = excluded.truck_capacity;
-- booth_claimed_offline and truck_claimed_offline are deliberately absent from
-- that update list. They are maintained by hand, and re-running this file must
-- not reset them to zero.

-- -------------------------------------------------------------- storage ---
-- Two buckets, both private.
--
--   coyoteville-permits  food handler permits. Sensitive. Never public.
--   coyoteville-media    business logos and spotlight photos.
--
-- Neither is marked public, so the only way to read an object is a signed URL
-- minted server side by the service role. The admin view does that on demand
-- with a short expiry. If you later want logos to be shareable straight from a
-- link, flip coyoteville-media to public here; leave the permits bucket alone.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'coyoteville-permits',
    'coyoteville-permits',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
  ),
  (
    'coyoteville-media',
    'coyoteville-media',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies for anon or authenticated on purpose. Uploads go through
-- the API route using the service role key, which bypasses RLS, and reads go
-- through signed URLs. An anonymous client cannot list, read or write either
-- bucket. Drop any policy an earlier run may have left behind.
drop policy if exists "coyoteville media public read" on storage.objects;
drop policy if exists "coyoteville anon upload"       on storage.objects;


-- --------------------------------------------------- prepaid registration ---
-- Vendors who paid by phone or in person are already counted in
-- booth_claimed_offline / truck_claimed_offline. When one of them registers
-- through the prepaid link their application starts counting on its own, so the
-- offline tally has to come down by one at the same moment. Doing both in one
-- function body puts them in a single transaction: either the application and
-- the decrement both land, or neither does, and the meter never double counts.
--
-- Called only by the API route with the service role key. Execute is revoked
-- from anon and authenticated below.

create or replace function public.register_prepaid_vendor(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  new_id     uuid;
  v_spot     text := payload->>'spot_type';
  v_event    text := payload->>'event_slug';
begin
  insert into public.vendor_applications (
    id, business_name, contact_name, phone, email, spot_type, event_slug, sells, notes,
    waiver_accepted, permits_confirmed, signature_name, signed_date, signed_at,
    agreement_version, signer_ip, signer_user_agent, serves_food,
    logo_path, photo_paths, permit_path,
    amount_cents, payment_status, payment_method, paid_at,
    approval_status, admin_notes
  )
  values (
    coalesce((payload->>'id')::uuid, gen_random_uuid()),
    payload->>'business_name',
    payload->>'contact_name',
    payload->>'phone',
    payload->>'email',
    v_spot,
    v_event,
    payload->>'sells',
    payload->>'notes',
    true,
    true,
    payload->>'signature_name',
    (payload->>'signed_date')::date,
    now(),
    payload->>'agreement_version',
    payload->>'signer_ip',
    payload->>'signer_user_agent',
    coalesce((payload->>'serves_food')::boolean, false),
    payload->>'logo_path',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(payload->'photo_paths')),
      '{}'
    ),
    payload->>'permit_path',
    coalesce((payload->>'amount_cents')::integer, 0),
    'paid',
    'offline',
    now(),
    'approved',
    payload->>'admin_notes'
  )
  returning id into new_id;

  if v_spot = 'booth' then
    update public.events
       set booth_claimed_offline = greatest(0, booth_claimed_offline - 1)
     where slug = v_event;
  elsif v_spot = 'truck' then
    update public.events
       set truck_claimed_offline = greatest(0, truck_claimed_offline - 1)
     where slug = v_event;
  end if;

  return new_id;
end $$;

comment on function public.register_prepaid_vendor(jsonb) is
  'Inserts a prepaid vendor application and decrements the matching offline counter in one transaction, so a vendor who already paid is never counted twice on the live meter.';

revoke all on function public.register_prepaid_vendor(jsonb) from anon, authenticated;
