'use strict';

/**
 * A PostgREST shaped enough to render the tracker.
 *
 * The parity gate has to compare what /admin puts on a desktop against what it
 * puts on a phone, and most of what is worth comparing only exists when there
 * are rows: a game with no organization working it has no Print QR button, and
 * a vendor list with nobody in it has no vendor to open. Rendering the page
 * against an empty database would let the gate pass while every data driven
 * control on it was missing from both widths.
 *
 * So the gate points NEXT_PUBLIC_SUPABASE_URL at this instead. Every read goes
 * through the real @supabase/supabase-js client, the real lib/admin-data
 * queries and the real page: only the rows are invented. It answers a GET on
 * /rest/v1/<table> with that table's fixtures and ignores the filters, which is
 * the right trade for a layout gate. What is on screen is what matters, not
 * whether the where clause narrowed it.
 *
 * Writes are accepted and discarded. Nothing here should ever be pointed at
 * anything real, which is why it binds to loopback and invents its own key.
 */

const http = require('node:http');

/* A game that is on, a game that is not yet drawn, and a game in the past, so
   the Organizations panel renders all three of its states at once. */
const TODAY = '2026-09-11';

const ORG_ID = '11111111-2222-4333-8444-555555555555';
const ORG_ID_2 = '22222222-3333-4444-8555-666666666666';

function iso(daysFromNow, hour = 17, minute = 30) {
  const d = new Date(Date.UTC(2026, 8, 11, hour + 5, minute, 0));
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString();
}

const events = [
  {
    id: 'e1',
    slug: 'home-game-2026-09-11',
    name: 'Alice Home Game',
    starts_at: iso(0),
    ends_at: iso(0, 22, 0),
    display_date: 'September 11',
    display_time: '5:30 PM',
    blurb: 'Friday night football and a full lot.',
    location_name: 'Coyoteville',
    is_published: true,
    booth_capacity: 12,
    truck_capacity: 6,
    created_at: iso(-30),
    updated_at: iso(-1),
    booth_claimed_offline: 1,
    truck_claimed_offline: 0,
    signup_closes_at: iso(-2),
  },
  {
    id: 'e2',
    slug: 'home-game-2026-10-02',
    name: 'Homecoming',
    starts_at: iso(21),
    ends_at: iso(21, 22, 0),
    display_date: 'October 2',
    display_time: '5:30 PM',
    blurb: 'Homecoming.',
    location_name: 'Coyoteville',
    is_published: true,
    booth_capacity: 12,
    truck_capacity: 6,
    created_at: iso(-30),
    updated_at: iso(-1),
    booth_claimed_offline: 0,
    truck_claimed_offline: 0,
    signup_closes_at: iso(19),
  },
];

/**
 * One vendor per state the card and the sheet can be in.
 *
 * Approved and paid, pending review, unpaid, cash owed, a day booking, a
 * monthly on a card, and a returning vendor. Between them they light up every
 * filter chip and every action in the sheet, which is the point: an action that
 * no fixture reaches is an action the gate cannot compare.
 */
function vendor(over) {
  return {
    id: 'v-' + Math.random().toString(16).slice(2, 10),
    business_name: 'Cold Sips',
    contact_name: 'Ada Reyes',
    phone: '3615550101',
    email: 'ada@example.test',
    spot_type: 'booth',
    event_slug: 'home-game-2026-09-11',
    sells: 'Aguas frescas',
    notes: null,
    waiver_accepted: true,
    permits_confirmed: true,
    signature_name: 'Ada Reyes',
    signed_date: '2026-09-01',
    signed_at: iso(-10),
    agreement_version: 'v1.3-2026',
    signer_ip: '203.0.113.9',
    signer_user_agent: 'fixture',
    logo_path: null,
    photo_paths: [],
    permit_path: null,
    serves_food: false,
    amount_cents: 5000,
    payment_status: 'paid',
    square_order_id: 'ord_1',
    square_payment_link_id: 'lnk_1',
    paid_at: iso(-9),
    approval_status: 'approved',
    spot_number: 'Booth 3',
    admin_notes: null,
    created_at: iso(-11),
    updated_at: iso(-9),
    payment_method: 'online',
    upload_issues: null,
    booking_kind: 'event',
    booking_date: null,
    subscription_status: null,
    square_subscription_id: null,
    square_customer_id: null,
    square_card_id: null,
    subscription_started_at: null,
    subscription_next_billing_at: null,
    subscription_canceled_at: null,
    approved_at: iso(-9),
    denied_at: null,
    denial_reason: null,
    refund_status: null,
    refunded_at: null,
    square_refund_id: null,
    reviewed_at: iso(-9),
    amount_received_cents: 5000,
    monthly_amount_cents: null,
    subscription_cancel_at_period_end: false,
    failed_payment_count: 0,
    refund_error: null,
    last_invoice_status: null,
    last_invoice_at: null,
    square_payment_id: 'pay_1',
    refund_amount_cents: null,
    recurring_acknowledged: false,
    amount_received_at: iso(-9),
    vendor_id: null,
    ...over,
  };
}

const vendor_applications = [
  vendor({ id: 'v1' }),
  vendor({
    id: 'v2',
    business_name: 'MuddyWaterz',
    contact_name: 'Bo Vela',
    email: 'bo@example.test',
    spot_type: 'truck',
    serves_food: true,
    spot_number: 'Truck 2',
    approval_status: 'pending',
    reviewed_at: null,
    approved_at: null,
  }),
  vendor({
    id: 'v3',
    business_name: 'Tres Hermanas Tacos',
    contact_name: 'Cruz Peña',
    email: 'cruz@example.test',
    spot_type: 'truck',
    serves_food: true,
    payment_status: 'unpaid',
    paid_at: null,
    amount_received_cents: null,
    amount_received_at: null,
    square_payment_id: null,
    spot_number: null,
  }),
  vendor({
    id: 'v4',
    business_name: 'Rio Kettle Corn',
    contact_name: 'Dee Salas',
    email: 'dee@example.test',
    payment_method: 'cash',
    amount_received_cents: null,
    amount_received_at: null,
    spot_number: 'Booth 7',
  }),
  vendor({
    id: 'v5',
    business_name: 'Alice Honey Co',
    contact_name: 'Eli Cantu',
    email: 'eli@example.test',
    event_slug: null,
    booking_kind: 'day',
    booking_date: TODAY,
    spot_number: 'Booth 9',
  }),
  vendor({
    id: 'v6',
    business_name: 'Coastal Bend Coffee',
    contact_name: 'Fran Ortiz',
    email: 'fran@example.test',
    event_slug: null,
    booking_kind: 'monthly',
    booking_date: null,
    monthly_amount_cents: 20000,
    subscription_status: 'active',
    square_subscription_id: 'sub_1',
    square_customer_id: 'cus_1',
    square_card_id: 'card_1',
    subscription_started_at: iso(-60),
    subscription_next_billing_at: iso(20),
    recurring_acknowledged: true,
    spot_number: 'Booth 11',
  }),
  /* The same business at an earlier event, which is what makes v1 returning. */
  vendor({
    id: 'v7',
    event_slug: 'home-game-2026-08-14',
    created_at: iso(-40),
    spot_number: 'Booth 3',
  }),
  /* Denied, so the deny path has a row and the excluded set is not empty. */
  vendor({
    id: 'v8',
    business_name: 'Late Signup BBQ',
    contact_name: 'Gus Reyna',
    email: 'gus@example.test',
    approval_status: 'denied',
    denied_at: iso(-3),
    denial_reason: 'No room left in trucks.',
    spot_number: null,
  }),
];

const org_applications = [
  {
    id: ORG_ID,
    org_name: 'Velocity Vipers Softball',
    org_type: 'school_team',
    contact_name: 'Hana Guerra',
    email: 'hana@example.test',
    phone: '3615550188',
    ein: null,
    is_501c3: false,
    volunteer_count: 14,
    story: 'Travel costs for the fall season.',
    logo_path: null,
    event_slugs: ['home-game-2026-09-11'],
    status: 'approved',
    terms_accepted: true,
    terms_version: 'fundraiser-v1.2-2026',
    signature_name: 'Hana Guerra',
    signed_at: iso(-6),
    signer_ip: '203.0.113.20',
    signer_user_agent: 'fixture',
    admin_notes: null,
    created_at: iso(-7),
    updated_at: iso(-6),
  },
  {
    id: ORG_ID_2,
    org_name: 'Alice Band Boosters',
    org_type: 'booster_club',
    contact_name: 'Ivan Longoria',
    email: 'ivan@example.test',
    phone: '3615550199',
    ein: '00-0000000',
    is_501c3: true,
    volunteer_count: 22,
    story: 'New sousaphone.',
    logo_path: null,
    event_slugs: ['home-game-2026-10-02'],
    status: 'pending',
    terms_accepted: false,
    terms_version: null,
    signature_name: null,
    signed_at: null,
    signer_ip: null,
    signer_user_agent: null,
    admin_notes: null,
    created_at: iso(-4),
    updated_at: iso(-4),
  },
];

/* One game already drawn and unpaid, which is the state tomorrow night is in
   and the one that carries the most buttons. */
const org_event_awards = [
  {
    id: 'a1',
    event_slug: 'home-game-2026-09-11',
    org_application_id: ORG_ID,
    picked_at: iso(-5),
    picked_from_count: 3,
    parking_gross_cents: 47000,
    payout_cents: 31236,
    paid_at: null,
    paid_method: null,
    published_at: iso(-5),
    notes: null,
    created_at: iso(-5),
    updated_at: iso(-5),
  },
];

const parking_payments = Array.from({ length: 47 }, (_, i) => ({
  id: 'p' + i,
  event_slug: 'home-game-2026-09-11',
  amount_cents: i % 6 === 0 ? 500 : 1000,
  vehicle_count: i % 6 === 0 ? 0 : 1,
  source: 'qr',
  kind: i % 6 === 0 ? 'donation' : 'parking',
  square_fee_cents: i < 44 ? 37 : null,
  square_payment_id: 'sqpay_' + i,
  square_order_id: 'sqord_' + i,
  recorded_by: null,
  note: null,
  created_at: iso(0, 18, i % 60),
}));

const volunteer_waivers = Array.from({ length: 9 }, (_, i) => ({
  id: 'w' + i,
  event_slug: 'home-game-2026-09-11',
  org_application_id: ORG_ID,
  full_name: 'Volunteer ' + (i + 1),
  phone: '361555020' + i,
  email: null,
  date_of_birth: i < 7 ? '1990-04-02' : '2010-04-02',
  is_adult: i < 7,
  guardian_name: i < 7 ? null : 'Parent ' + i,
  guardian_phone: i < 7 ? null : '3615550300',
  guardian_signature_name: i < 7 ? null : 'Parent ' + i,
  emergency_contact_name: 'Emergency ' + i,
  emergency_contact_phone: '3615550400',
  waiver_version: 'vol-v1.0-2026',
  signature_name: 'Volunteer ' + (i + 1),
  signed_at: iso(0, 16, i),
  signer_ip: '203.0.113.30',
  signer_user_agent: 'fixture',
  created_at: iso(0, 16, i),
}));

const waitlist = [
  {
    id: 'wl1',
    event_slug: 'home-game-2026-09-11',
    position: 1,
    business_name: 'Kolache Kart',
    contact_name: 'Jo Trevino',
    phone: '3615550222',
    email: 'jo@example.test',
    spot_type: 'truck',
    sells: 'Kolaches',
    notes: null,
    status: 'waiting',
    offered_at: null,
    admin_notes: null,
    created_at: iso(-2),
    updated_at: iso(-2),
    booking_date: null,
    booking_kind: 'event',
  },
];

const day_availability = [
  {
    booking_date: TODAY,
    is_open: true,
    booth_capacity: 8,
    truck_capacity: 4,
    note: null,
    created_at: iso(-20),
    updated_at: iso(-2),
  },
];

const vendors = [
  {
    id: 'ven1',
    auth_user_id: null,
    email: 'ada@example.test',
    business_name: 'Cold Sips',
    contact_name: 'Ada Reyes',
    phone: '3615550101',
    sells: 'Aguas frescas',
    serves_food: false,
    logo_path: null,
    photo_paths: [],
    permit_path: null,
    permit_expires_at: null,
    claimed_at: null,
    invited_at: null,
    created_at: iso(-40),
    updated_at: iso(-40),
  },
];

const TABLES = {
  events,
  vendor_applications,
  vendors,
  waitlist,
  day_availability,
  org_applications,
  org_event_awards,
  parking_payments,
  volunteer_waivers,
  subscribers: [],
  subscription_events: [],
};

/**
 * Start it, and hand back the URL and a way to stop it.
 *
 * Filters are ignored on purpose. A gate that compared two widths of the same
 * page does not care which rows came back, only that both widths got the same
 * ones, and reimplementing PostgREST's operator grammar would be a second
 * source of bugs sitting between the gate and the thing it is checking.
 */
function startFixtureDb() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const table = url.pathname.replace(/^\/rest\/v1\//, '').replace(/\/$/, '');
      const rows = TABLES[table] ?? [];

      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        /* .single() and .maybeSingle() ask for one object rather than a list,
           and PostgREST answers 406 when the count is wrong. Returning the
           first row keeps both happy; returning null for an empty table is
           what maybeSingle expects. */
        const wantsObject = String(req.headers.accept || '').includes('pgrst.object');
        const payload = req.method === 'GET' ? (wantsObject ? (rows[0] ?? null) : rows) : [];

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
        });
        res.end(JSON.stringify(payload));
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        key: 'fixture-service-role-key',
        stop: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

module.exports = { startFixtureDb, TABLES, ORG_ID };
