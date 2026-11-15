import Link from 'next/link';
import { UnreadCount } from './unread-count';
import { canView, modules, type ModuleName } from '@/lib/permissions';
const parentLinks = [
  ['dashboard', 'Overview'],
  ['attendance', 'Attendance'],
  ['daily', 'Daily care'],
  ['learning', 'Learning'],
  ['messages', 'Messages'],
  ['pickups', 'Collection'],
  ['health', 'Health & consent'],
  ['timetable', 'Timetable'],
  ['fees', 'Fees'],
  ['payments', 'Payments'],
  ['reports', 'Report cards'],
  ['admission', 'New application'],
];
export function PortalNav({ role }: { role: string }) {
  const parent = role === 'parent';
  const links = parent
    ? parentLinks
    : (Object.keys(modules) as ModuleName[])
        .filter((name) => canView(role, name))
        .map((name) => [name, modules[name].label]);
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
