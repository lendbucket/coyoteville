import 'server-only';
import { SquareClient, SquareEnvironment } from 'square';

/**
 * Server-only Square client. Built lazily so a missing token never breaks the
 * build, only the request that actually needs it.
 *
 * SQUARE_ENVIRONMENT is 'production' or 'sandbox'. Anything other than
 * 'production' resolves to sandbox, so a typo can never accidentally charge a
 * real card.
 */

let cached: SquareClient | null = null;

export function getSquareEnvironment(): SquareEnvironment {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;
}

export function getSquare(): SquareClient {
  if (cached) return cached;

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Square is not configured. Set SQUARE_ACCESS_TOKEN.');
  }

  cached = new SquareClient({
    token,
    environment: getSquareEnvironment(),
  });

  return cached;
}

export function getSquareLocationId(): string {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    throw new Error('Square is not configured. Set SQUARE_LOCATION_ID.');
  }
  return locationId;
}

export function isSquareConfigured(): boolean {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}
