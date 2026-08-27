import { SITE } from '@/lib/seo';

/**
 * Facebook and Instagram, as icon links.
 *
 * One component so the footer and the visit section cannot drift, and so the
 * accessible names are written once. The icons are inline SVG rather than an
 * icon font or an image: they inherit currentColor, so they follow whatever
 * the surrounding section is doing without a second asset to load. This is a
 * web page, not an email, so SVG is safe here.
 *
 * Every link is a 44px box. The glyph inside is smaller, but the target is not,
 * which is the whole point on a phone.
 */

const LINKS = [
  {
    href: SITE.facebook,
    name: 'Facebook',
    // Single path, so it scales cleanly and there is nothing to mis-stack.
    path: 'M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2C11.54 2 9.68 3.66 9.68 6.7v2.62H6.61v3.56h3.07V22h3.68v-9.12h3.06l.46-3.56h-3.52V7.05c0-1.03.28-1.73 1.76-1.73Z',
  },
  {
    href: SITE.instagram,
    name: 'Instagram',
    path: 'M12 2c-2.72 0-3.06.01-4.12.06-1.07.05-1.8.22-2.43.46-.66.26-1.22.6-1.77 1.16-.56.55-.9 1.11-1.16 1.77-.24.63-.41 1.36-.46 2.43C2.01 8.94 2 9.28 2 12s.01 3.06.06 4.12c.05 1.07.22 1.8.46 2.43.26.66.6 1.22 1.16 1.77.55.56 1.11.9 1.77 1.16.63.24 1.36.41 2.43.46 1.06.05 1.4.06 4.12.06s3.06-.01 4.12-.06c1.07-.05 1.8-.22 2.43-.46.66-.26 1.22-.6 1.77-1.16.56-.55.9-1.11 1.16-1.77.24-.63.41-1.36.46-2.43.05-1.06.06-1.4.06-4.12s-.01-3.06-.06-4.12c-.05-1.07-.22-1.8-.46-2.43-.26-.66-.6-1.22-1.16-1.77-.55-.56-1.11-.9-1.77-1.16-.63-.24-1.36-.41-2.43-.46C15.06 2.01 14.72 2 12 2Zm0 1.8c2.67 0 2.99.01 4.04.06.97.05 1.5.21 1.86.35.47.18.8.4 1.15.75.35.35.57.68.75 1.15.14.36.3.89.35 1.86.05 1.05.06 1.37.06 4.04s-.01 2.99-.06 4.04c-.05.97-.21 1.5-.35 1.86-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.36.14-.89.3-1.86.35-1.05.05-1.37.06-4.04.06s-2.99-.01-4.04-.06c-.97-.05-1.5-.21-1.86-.35-.47-.18-.8-.4-1.15-.75-.35-.35-.57-.68-.75-1.15-.14-.36-.3-.89-.35-1.86-.05-1.05-.06-1.37-.06-4.04s.01-2.99.06-4.04c.05-.97.21-1.5.35-1.86.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.36-.14.89-.3 1.86-.35 1.05-.05 1.37-.06 4.04-.06Zm0 3.06a5.14 5.14 0 1 0 0 10.28 5.14 5.14 0 0 0 0-10.28Zm0 8.47a3.33 3.33 0 1 1 0-6.66 3.33 3.33 0 0 1 0 6.66Zm6.54-8.67a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z',
  },
] as const;

export default function SocialLinks({
  className = '',
  /** Adds the handle next to each icon. Off by default: the footer wants icons. */
  showHandle = false,
}: {
  className?: string;
  showHandle?: boolean;
}) {
  return (
    <ul className={`social ${showHandle ? 'social--labelled' : ''} ${className}`.trim()}>
      {LINKS.map((link) => (
        <li key={link.name}>
          <a
            className="social__link"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer me"
          >
            <svg
              className="social__icon"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d={link.path} />
            </svg>
            {showHandle ? (
              <span className="social__handle">{link.name}</span>
            ) : (
              // The icon alone carries no text, so the name goes to the
              // accessibility tree instead of being dropped.
              <span className="sr-only">{link.name}</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
