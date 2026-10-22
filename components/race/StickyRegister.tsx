'use client';

import { useEffect, useState } from 'react';

/**
 * The phone only sticky bar: today's price and a Register button.
 *
 * On a page this long, somebody who reads to the bottom has to scroll back up
 * to act, and somebody who is convinced in the hero has nothing to tap once
 * they have scrolled past it. This is the one element that fixes both.
 *
 * Shown once the hero has gone and hidden again when the form itself is on
 * screen, because a sticky bar covering the form it points at is just a bar
 * over a button.
 *
 * Takes the label as a string. The price in it is computed on the server from
 * the same clock the checkout charges on, so this component holds no pricing
 * logic and cannot drift from it.
 */
export default function StickyRegister({ label }: { label: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.querySelector('.racehero');
    const form = document.getElementById('register');
    if (!hero || !form || typeof IntersectionObserver === 'undefined') return;

    /* Two independent facts, combined on each change: is the hero gone, and is
       the form in view. */
    let heroGone = false;
    let formHere = false;

    const apply = () => setShow(heroGone && !formHere);

    const heroWatch = new IntersectionObserver(
      ([e]) => {
        heroGone = !e.isIntersecting;
        apply();
      },
      { threshold: 0 }
    );

    const formWatch = new IntersectionObserver(
      ([e]) => {
        formHere = e.isIntersecting;
        apply();
      },
      { threshold: 0 }
    );

    heroWatch.observe(hero);
    formWatch.observe(form);

    return () => {
      heroWatch.disconnect();
      formWatch.disconnect();
    };
  }, []);

  return (
    <div className="stickyreg" data-show={show ? 'yes' : 'no'} aria-hidden={!show}>
      <a className="btn btn--primary stickyreg__btn" href="#register" tabIndex={show ? 0 : -1}>
        {label}
      </a>
    </div>
  );
}
