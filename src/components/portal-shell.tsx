import Link from 'next/link';
import { UnreadCount } from './unread-count';
export function PortalNav({ role }: { role: string }) {
  const parent = role === 'parent';
  const links = parent
    ? [
        ['dashboard', 'Overview'],
        ['admission', 'New application'],
        ['fees', 'Fee balances'],
        ['payments', 'Payments'],
        ['reports', 'Reports'],
      ]
    : [
        ['dashboard', 'Overview'],
        ['students', 'Students'],
        ...(['admin'].includes(role)
          ? [
              ['admissions', 'Admission approvals'],
              ['enquiries', 'Enquiries'],
              ['users', 'Staff accounts'],
            ]
          : []),
        ...(['admin', 'bursar'].includes(role)
          ? [
              ['fees', 'Fees'],
              ['payments', 'Payments'],
            ]
          : []),
        ...(['admin', 'teacher'].includes(role) ? [['reports', 'Reports']] : []),
      ];
  return (
    <nav className="portal-nav no-print" aria-label="School portal">
      {links.map(([path, label]) => (
        <Link key={path} href={'/' + (parent ? 'parent' : 'admin') + '/' + path}>
          {label} {path === 'enquiries' && role === 'admin' && <UnreadCount />}
        </Link>
      ))}
    </nav>
  );
}
export function PageTitle({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">Jeffersons school portal</span>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
