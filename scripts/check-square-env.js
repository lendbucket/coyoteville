#!/usr/bin/env node
'use strict';

/**
 * Do the two Square environment variables agree, and does the rest match?
 *
 * The environment is decided in two independent places and they were not the
 * same place:
 *
 *   SQUARE_ENVIRONMENT decides which API the server talks to, so it decides
 *   whether a payment link is real money or play money.
 *
 *   NEXT_PUBLIC_SQUARE_ENVIRONMENT decides which SDK host the card field loads
 *   and which pair of hosts the CSP in next.config.js allows.
 *
 * Neither has ever known about the other. A deployment with the public one set
 * and the server one missing serves a production looking checkout backed by
 * sandbox, which is what happened: coyoteville.com created sandbox payment
 * links against a real account, drivers were bounced to the thank you page
 * without being charged, and one payment went through all night. Nothing in the
 * build, the types, or the tests could see it, because separately each variable
 * was valid.
 *
 * So they are checked against each other, and against the one identifier that
 * cannot lie about which Square account it belongs to: the application id.
 * Square issues production ids as sq0idp-... and sandbox ids as
 * sandbox-sq0idb-..., so an id is proof of environment in a way that a
 * variable somebody typed is not.
 *
 * Agreeing is not enough on its own. The outage was both variables agreeing on
 * sandbox, which this would have called fine, so there is a second rule: a
 * build that Vercel says is the production deployment must be on production
 * Square. VERCEL_ENV is set by the platform and is 'production' only for the
 * real site, so previews and local work stay on sandbox without an exemption
 * anybody has to remember.
 *
 * Whether the deployed site is still live on the real Square, after somebody
 * edits a variable without redeploying, is a question about a running
 * deployment rather than a build. scripts/healthcheck.js answers that one
 * against coyoteville.com itself, every six hours and after every deploy.
 */

const SERVER = 'SQUARE_ENVIRONMENT';
const PUBLIC = 'NEXT_PUBLIC_SQUARE_ENVIRONMENT';
const APP_ID = 'NEXT_PUBLIC_SQUARE_APPLICATION_ID';

/** Square's own prefixes. Production ids never contain the word sandbox. */
const PRODUCTION_APP_ID = /^sq0idp-/;
const SANDBOX_APP_ID = /^sandbox-sq0idb-/;

const failures = [];
const notes = [];

/** Anything that is not exactly 'production' resolves to sandbox, per lib/square. */
function resolve(value) {
  return value === 'production' ? 'production' : 'sandbox';
}

const serverRaw = process.env[SERVER];
const publicRaw = process.env[PUBLIC];
const appId = (process.env[APP_ID] ?? '').trim();

const server = resolve(serverRaw);
const publicEnv = resolve(publicRaw);

/* ------------------------------------------------- 1. the two must agree */

if (server !== publicEnv) {
  failures.push(
    `${SERVER} resolves to ${server} and ${PUBLIC} resolves to ${publicEnv}.\n` +
      `    ${SERVER}=${JSON.stringify(serverRaw ?? null)}\n` +
      `    ${PUBLIC}=${JSON.stringify(publicRaw ?? null)}\n` +
      '    One decides whether real money moves, the other decides which card\n' +
      '    SDK and which CSP hosts the page gets. They must name the same Square.'
  );
}

/* --------------------------- 2. an unset variable is not the same as sandbox */

/* Both default to sandbox when missing, which is the safe direction and is why
   this is only worth saying out loud when the other one is set to production:
   that is somebody who meant production and set one of the pair. */
for (const [name, raw, other] of [
  [SERVER, serverRaw, publicEnv],
  [PUBLIC, publicRaw, server],
]) {
  if (raw === undefined && other === 'production') {
    failures.push(
      `${name} is not set at all, while the other variable says production. ` +
        'Unset falls back to sandbox, so this deployment is half live.'
    );
  }
}

/* ------------------ 3. the production deployment must be on production */

/**
 * The rule that would have caught the outage.
 *
 * Both variables said sandbox and agreed with each other, so consistency alone
 * called it healthy while coyoteville.com created sandbox payment links against
 * a real account for a whole evening.
 *
 * VERCEL_ENV is set by the platform: 'production' for the real deployment,
 * 'preview' for a branch, 'development' locally. It cannot be forgotten the way
 * a hand set flag can, and it is absent everywhere the answer should be sandbox.
 *
 * ALLOW_SANDBOX_IN_PRODUCTION exists for one case: deliberately deploying the
 * live site against sandbox to rehearse something. It has to be typed on
 * purpose, and it says so in the output, so it cannot be left on quietly.
 */
const vercelEnv = process.env.VERCEL_ENV;
const deliberate = process.env.ALLOW_SANDBOX_IN_PRODUCTION === 'true';

if (vercelEnv === 'production' && server !== 'production') {
  if (deliberate) {
    notes.push(
      'This is the production deployment on Square SANDBOX, allowed only ' +
        'because ALLOW_SANDBOX_IN_PRODUCTION is set. No card will be charged.'
    );
  } else {
    failures.push(
      'This is the production deployment (VERCEL_ENV=production) and Square ' +
        `resolves to ${server}.\n` +
        '    A sandbox payment link on the live site looks exactly like a real\n' +
        '    one and charges nothing. That is the failure that cost most of an\n' +
        '    event: drivers scanned, paid nothing, and landed on the thank you\n' +
        '    page. Set the production values, or set\n' +
        '    ALLOW_SANDBOX_IN_PRODUCTION=true if this is deliberate.'
    );
  }
}

/* ----------------------------------- 4. the application id has to match */

if (appId) {
  const looksProduction = PRODUCTION_APP_ID.test(appId);
  const looksSandbox = SANDBOX_APP_ID.test(appId) || appId.includes('sandbox');

  if (!looksProduction && !looksSandbox) {
    notes.push(
      `${APP_ID} is not in a shape this check recognises, so it could not be ` +
        'used to confirm the environment.'
    );
  } else {
    const idSays = looksProduction ? 'production' : 'sandbox';
    if (idSays !== publicEnv) {
      failures.push(
        `${APP_ID} is a ${idSays} id while ${PUBLIC} says ${publicEnv}.\n` +
          '    The id is issued by Square and names the account it belongs to,\n' +
          '    so it is the one of the two that cannot be wrong by a typo.'
      );
    }
  }
} else if (publicEnv === 'production') {
  notes.push(
    `${APP_ID} is not set, so the environment could not be confirmed against a ` +
      'Square issued id. The card field on the permanent spot form needs it.'
  );
}

/* --------------------------------------------------------------- report */

if (failures.length) {
  console.error('\ncheck-square-env: FAILED\n');
  for (const f of failures) console.error('  ' + f + '\n');
  console.error(
    [
      'For live payments, all of these come from the production Square account:',
      '',
      '  SQUARE_ENVIRONMENT=production',
      '  NEXT_PUBLIC_SQUARE_ENVIRONMENT=production',
      '  SQUARE_ACCESS_TOKEN            production token',
      '  SQUARE_LOCATION_ID             production location',
      '  SQUARE_WEBHOOK_SIGNATURE_KEY   production webhook subscription',
      '  NEXT_PUBLIC_SQUARE_APPLICATION_ID   sq0idp-...',
      '  NEXT_PUBLIC_SQUARE_LOCATION_ID      same as SQUARE_LOCATION_ID',
      '',
      'Preview and local stay on sandbox. Mixing the two is the failure this',
      'exists to stop, in either direction.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

for (const n of notes) console.warn('check-square-env: ' + n);

console.log(
  `check-square-env: ${SERVER} and ${PUBLIC} both resolve to ${server}` +
    (appId
      ? `, and ${APP_ID} is a ${server} id.`
      : '. No application id set to confirm it against.')
);
