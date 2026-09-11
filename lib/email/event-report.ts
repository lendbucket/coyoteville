import { esc, logoHeader, preheader } from './shared';
import type { EventReport } from '../event-report';

/**
 * The night, in full, once the lot has closed.
 *
 * The opposite of the per payment alert: that one is a number on a lock screen,
 * this one is read sitting down with a coffee the next morning and has to
 * answer every question without a second query. So it carries the arithmetic,
 * the shape of the evening, who still owes money, who has no spot, whether the
 * volunteer minimum was met, and anything that looks wrong.
 *
 * The flat 3.25% and Square's own fee sit next to each other with the
 * difference stated in words, because the payout is computed on the flat rate
 * and the difference is real money that Coyoteville either kept or covered.
 *
 * Passes check-email-copy: no dashes beyond the hyphen, no emoji.
 */

const BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const RULE = 'border-top:1px solid #E4E4E7;';

function money(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.abs(Math.round(cents)) : 0;
  return `$${(safe / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function heading(text: string): string {
  return `<p style="margin:26px 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6B6B72;">${esc(text)}</p>`;
}

function rows(pairs: [string, string, boolean?][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${BODY};font-size:15px;">
${pairs
  .map(
    ([k, v, strong]) =>
      `  <tr><td style="padding:7px 0;${RULE}color:#444448;">${esc(k)}</td>` +
      `<td align="right" style="padding:7px 0;${RULE}font-weight:bold;color:${strong ? '#C4552B' : '#111111'};${strong ? 'font-size:17px;' : ''}">${esc(v)}</td></tr>`
  )
  .join('\n')}
</table>`;
}

/** The busiest half hour, as a bar somebody can read at a glance. */
function timeline(report: EventReport): string {
  if (!report.timeline.length) return '<p style="margin:0;color:#6B6B72;">No window to chart.</p>';

  const peak = Math.max(...report.timeline.map((b) => b.payments), 1);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${BODY};font-size:14px;">
${report.timeline
  .map((b) => {
    const width = Math.round((b.payments / peak) * 100);
    return (
      `  <tr><td width="70" style="padding:3px 0;color:#6B6B72;white-space:nowrap;">${esc(b.label)}</td>` +
      `<td style="padding:3px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
      `<td width="${width}%" style="background-color:${b.payments ? '#E8A33D' : 'transparent'};height:14px;font-size:0;line-height:0;">&nbsp;</td>` +
      `<td>&nbsp;</td></tr></table></td>` +
      `<td width="86" align="right" style="padding:3px 0;color:#111111;white-space:nowrap;">${esc(String(b.payments))} for ${esc(money(b.cents))}</td></tr>`
    );
  })
  .join('\n')}
</table>`;
}

function nameList(items: { name: string; contact?: string }[], empty: string): string {
  if (!items.length) return `<p style="margin:0;color:#6B6B72;">${esc(empty)}</p>`;
  return `<ul style="margin:0;padding-left:20px;color:#111111;">
${items
  .map(
    (i) =>
      `  <li style="margin:0 0 4px;">${esc(i.name)}${i.contact ? `<span style="color:#6B6B72;"> ${esc(i.contact)}</span>` : ''}</li>`
  )
  .join('\n')}
</ul>`;
}

export function renderEventReport(report: EventReport): {
  subject: string;
  html: string;
  text: string;
} {
  const m = report.money;

  /* The flat rate against what Square charged, said in words rather than left
     as two numbers to subtract. Positive means the flat rate collected more
     than Square took, which is the direction that favours Coyoteville. */
  const difference = m.flatFeeCents - m.actualFeeCents;
  const feeSentence =
    m.actualFeesPending > 0
      ? `Square has not settled ${m.actualFeesPending} of these payments yet, so the actual figure will still move.`
      : difference === 0
        ? 'The flat rate and what Square charged came out the same.'
        : difference > 0
          ? `The flat rate held back ${money(difference)} more than Square charged, which Coyoteville kept.`
          : `Square charged ${money(-difference)} more than the flat rate held back, which Coyoteville covered.`;

  const subject = `${report.event.name}, ${report.event.displayDate}: ${money(m.collectedCents)} collected, ${money(m.owedCents)} to ${report.org?.name ?? 'the organization'}`;

  const text = [
    `${report.event.name}, ${report.event.displayDate}`,
    report.org ? `Worked by ${report.org.name}` : 'No organization was awarded this game.',
    '',
    'MONEY',
    `  Parking collected: ${money(m.collectedCents)} from ${m.vehicles} vehicles`,
    `  Gifts: ${money(m.donationCents)} from ${m.donations}`,
    `  Processing fees at 3.25%: ${money(m.flatFeeCents)}`,
    `  Net after fees: ${money(m.netCents)}`,
    `  Their share: ${money(m.shareCents)}`,
    `  Total to the organization: ${money(m.owedCents)}`,
    `  Paid by: ${longDate(m.payByISO)}`,
    '',
    `  Square actually charged ${money(m.actualFeeCents)}. ${feeSentence}`,
    '',
    'WHEN THE LOT WAS BUSY',
    ...report.timeline.map((b) => `  ${b.label}  ${b.payments} for ${money(b.cents)}`),
    '',
    'VENDORS',
    `  Approved: ${report.vendors.approved}, paid: ${report.vendors.paid}`,
    `  Spot numbers: ${report.vendors.withSpot} assigned, ${report.vendors.missingSpot.length} missing`,
    ...(report.vendors.unpaid.length
      ? ['  Unpaid:', ...report.vendors.unpaid.map((v) => `    ${v.name}, ${v.contact}`)]
      : ['  Everyone approved has paid.']),
    ...(report.vendors.missingSpot.length
      ? ['  No spot number:', ...report.vendors.missingSpot.map((v) => `    ${v.name}`)]
      : []),
    ...(report.vendors.pending.length
      ? ['  Still pending:', ...report.vendors.pending.map((v) => `    ${v.name}, ${v.contact}`)]
      : ['  Nothing is waiting on review.']),
    '',
    'VOLUNTEERS',
    `  ${report.volunteers.signed} signed: ${report.volunteers.adults} adults, ${report.volunteers.minors} under 18`,
    `  Minimum is ${report.volunteers.minimum} adults. ${report.volunteers.meetsMinimum ? 'Met.' : 'Not met.'}`,
    '',
    'WORTH A LOOK',
    ...(report.flags.length
      ? report.flags.map((f) => `  ${f}`)
      : ['  Nothing looks wrong in the numbers.']),
    '',
    report.links.tracker,
    ...(report.links.live ? [report.links.live] : []),
  ].join('\n');

  const inner = `
    <p style="margin:0 0 4px;color:#6B6B72;font-size:14px;">${esc(report.event.displayDate)}</p>
    <p style="margin:0 0 4px;font-size:26px;line-height:1.15;font-weight:bold;color:#111111;">${esc(report.event.name)}</p>
    <p style="margin:0 0 6px;color:#444448;">${
      report.org
        ? `Worked by ${esc(report.org.name)}.`
        : 'No organization was awarded this game.'
    }</p>

    ${heading('The money')}
    ${rows([
      ['Parking collected', `${money(m.collectedCents)} from ${m.vehicles} vehicles`],
      ['Gifts', `${money(m.donationCents)} from ${m.donations}`],
      ['Processing fees, 3.25%', money(m.flatFeeCents)],
      ['Net after fees', money(m.netCents)],
      ['Their share of net', money(m.shareCents)],
      ['Total to the organization', money(m.owedCents), true],
      ['Paid by', longDate(m.payByISO)],
    ])}
    <p style="margin:12px 0 0;color:#444448;font-size:14px;">Square actually charged <b>${esc(money(m.actualFeeCents))}</b>. ${esc(feeSentence)}</p>

    ${heading('When the lot was busy')}
    ${timeline(report)}

    ${heading('Vendors')}
    ${rows([
      ['Approved', String(report.vendors.approved)],
      ['Paid or free', String(report.vendors.paid)],
      ['Spot numbers assigned', `${report.vendors.withSpot} of ${report.vendors.approved}`],
    ])}
    <p style="margin:14px 0 6px;font-weight:bold;color:#111111;">Unpaid</p>
    ${nameList(report.vendors.unpaid, 'Everyone approved has paid.')}
    <p style="margin:14px 0 6px;font-weight:bold;color:#111111;">No spot number</p>
    ${nameList(report.vendors.missingSpot, 'Every approved vendor has a spot.')}
    <p style="margin:14px 0 6px;font-weight:bold;color:#111111;">Still pending</p>
    ${nameList(report.vendors.pending, 'Nothing is waiting on review.')}

    ${heading('Volunteers')}
    ${rows([
      ['Waivers signed', String(report.volunteers.signed)],
      ['Adults', String(report.volunteers.adults)],
      ['Under 18', String(report.volunteers.minors)],
      [
        `Minimum of ${report.volunteers.minimum} adults`,
        report.volunteers.meetsMinimum ? 'Met' : 'Not met',
      ],
    ])}

    ${heading('Worth a look')}
    ${
      report.flags.length
        ? `<ul style="margin:0;padding-left:20px;color:#111111;">${report.flags
            .map((f) => `<li style="margin:0 0 6px;">${esc(f)}</li>`)
            .join('')}</ul>`
        : '<p style="margin:0;color:#6B6B72;">Nothing looks wrong in the numbers.</p>'
    }

    <p style="margin:26px 0 0;font-size:14px;">
      <a href="${esc(report.links.tracker)}" style="color:#C4552B;">Open the tracker</a>${
        report.links.live
          ? ` &nbsp; <a href="${esc(report.links.live)}" style="color:#C4552B;">Their live page</a>`
          : ''
      }
    </p>
    <p style="margin:10px 0 0;color:#6B6B72;font-size:13px;">Every parking payment for this event is attached as a CSV.</p>`;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#F4F4F5;">
${preheader(`${money(m.collectedCents)} collected, ${money(m.owedCents)} to the organization.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
<tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #DDDDE0;">
  ${logoHeader()}
  <tr><td style="padding:24px 22px;font-family:${BODY};font-size:15px;line-height:23px;color:#111111;">
${inner}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
