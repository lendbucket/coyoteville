import Brand from './Brand';

export default function Nav() {
  return (
    <header className="nav">
      <nav className="shell nav__inner" aria-label="Main">
        <Brand size={132} />
        <div className="nav__links">
          <a className="nav__hide-sm" href="#about">
            About
          </a>
          <a className="nav__hide-sm" href="#vendors">
            Vendors
          </a>
          <a className="nav__hide-sm" href="#faq">
            FAQ
          </a>
          <a className="nav__hide-sm" href="#visit">
            Visit
          </a>
          <a className="nav__cta" href="#apply">
            Apply
          </a>
        </div>
      </nav>
    </header>
  );
}
