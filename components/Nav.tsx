import Brand from './Brand';

/**
 * The site header.
 *
 * Every link is an absolute path with a fragment, /#about rather than #about.
 * A bare fragment resolves against whatever page you are on, so on
 * /friday-night-fund the whole nav pointed at sections that do not exist there
 * and did nothing at all. On the homepage /#about still behaves as an in page
 * anchor, so nothing about that page changes.
 *
 * applyHref exists because Apply is the one link that should not always mean
 * the same thing. On a page with its own application, sending somebody to the
 * vendor form is sending them to the wrong form.
 */
export default function Nav({
  applyHref = '/#apply',
  applyLabel = 'Apply',
}: {
  /** Where the Apply button goes. Override on a page with its own form. */
  applyHref?: string;
  applyLabel?: string;
}) {
  return (
    <header className="nav">
      <nav className="shell nav__inner" aria-label="Main">
        <Brand size={132} />
        <div className="nav__links">
          <a className="nav__hide-sm" href="/#about">
            About
          </a>
          <a className="nav__hide-sm" href="/#vendors">
            Vendors
          </a>
          <a className="nav__hide-sm" href="/friday-night-fund">
            Fundraiser
          </a>
          <a className="nav__hide-sm" href="/#faq">
            FAQ
          </a>
          <a className="nav__hide-sm" href="/#visit">
            Visit
          </a>
          <a className="nav__cta" href={applyHref}>
            {applyLabel}
          </a>
        </div>
      </nav>
    </header>
  );
}
