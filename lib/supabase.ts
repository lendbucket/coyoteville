import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service role key.
 *
 * Row level security is on for every table and there are no anonymous insert
 * policies, so all writes have to come through this client inside a route
 * handler. Never import this file from a client component.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { 'x-application-name': 'coyoteville-web' },
      /**
       * Never serve a database read out of Next's Data Cache.
       *
       * 2026-09-11, mid event. Velocity Vipers' live page sat at one vehicle
       * and an empty ledger while five rows and fifty dollars were in the
       * table. No query filtered them out. PostgREST reads are GETs, Next
       * patches global fetch, and supabase-js was using that patched fetch, so
       * every distinct select URL became its own cache entry and froze at
       * whatever the table held the first time it was asked. The totals and
       * the ledger are separate URLs, which is why they froze at different
       * row counts and gave two different wrong answers on one page.
       *
       * force-dynamic on the route is not enough. It changes a default that
       * only applies to fetches the route itself makes, and this one is made
       * several layers down inside a library, on a client built once and held
       * in module memory across every request the lambda serves.
       *
       * So it is set here rather than at a call site. This client reads money
       * and writes rows; there is no query it makes whose answer is safe to
       * reuse from a previous request, and a rule that has to be remembered at
       * each call site is one that will be missed at the next one.
       */
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });

  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
