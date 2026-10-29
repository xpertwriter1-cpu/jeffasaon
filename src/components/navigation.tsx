'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { signOut } from '@/actions/auth';
const sections = [
  ['home', 'Home'],
  ['about', 'About'],
  ['programs', 'Programmes'],
  ['admissions', 'Admissions'],
  ['contact', 'Contact'],
];
export function Navigation({ user }: { user: { name: string; role: string } | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="container navigation">
        <Link className="brand" href="/#home">
          <span className="brand-mark" aria-hidden="true">
            J
          </span>
          <span>
            Jeffersons<small>Preschool</small>
          </span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
        <nav
          id="site-menu"
          className={open ? 'site-menu is-open' : 'site-menu'}
          aria-label="Main navigation"
        >
          {sections.map(([id, label]) => (
            <a
              key={id}
              href={'/#' + id}
              onClick={(event) => {
                setOpen(false);
                if (pathname === '/') {
                  event.preventDefault();
                  requestAnimationFrame(() => {
                    history.pushState(null, '', '#' + id);
                    document.getElementById(id!)?.scrollIntoView({ block: 'start' });
                  });
                }
              }}
            >
              {label}
            </a>
          ))}
          {user ? (
            <>
              <Link
                className="button small"
                href={user.role === 'parent' ? '/parent/dashboard' : '/admin/dashboard'}
                onClick={() => setOpen(false)}
              >
                My portal
              </Link>
              <form action={signOut}>
                <button className="text-button">Sign out</button>
              </form>
            </>
          ) : (
            <Link
              className="button small"
              href="/auth/login"
              onClick={() => setOpen(false)}
            >
              Parent & staff login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
