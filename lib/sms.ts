import 'server-only';

/**
 * One text message, through Twilio.
 *
 * The health check has sent SMS since it was built, but from a script rather
 * than from the app, so this is the first time the site itself does. Written as
 * its own module rather than added to lib/notify, which is a file about email
 * templates: a text is not a template, it is one line and a number.
 *
 * Never throws. Every caller here is doing something else that already
 * succeeded, and a failed text must not roll back a link that was also emailed.
 * The caller is told whether it went, and says so.
 */

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM
  );
}

/** Digits only, with the country code North America leaves off. */
export function toE164(phone: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export async function sendSms(
  to: string,
  body: string
): Promise<{ ok: boolean; error: string | null }> {
  if (!isSmsConfigured()) return { ok: false, error: 'Text messaging is not configured.' };

  const number = toE164(to);
  if (!number) return { ok: false, error: 'That phone number does not look right.' };

  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM as string;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      /* Capped so a long link plus a long organization name cannot become three
         billed segments by accident. */
      body: new URLSearchParams({ From: from, To: number, Body: body.slice(0, 320) }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error('twilio refused a message', res.status, detail);
      return { ok: false, error: `Twilio returned ${res.status}.` };
    }

    return { ok: true, error: null };
  } catch (err) {
    console.error('could not send an SMS', err);
    return { ok: false, error: 'Could not reach Twilio.' };
  }
}
