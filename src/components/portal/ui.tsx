import Link from 'next/link';
import type { ReactNode } from 'react';
import { programmes } from '@/lib/school';
export type Kid = {
  id: string;
  firstName: string;
  lastName: string;
  classLevel?: string;
};
export const fullName = (student?: { firstName: string; lastName: string } | null) =>
  student ? student.firstName + ' ' + student.lastName : 'Unknown learner';
export function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  tone?: 'warn' | 'good';
}) {
  const body = (
    <>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </>
  );
  return (
    <div className={'stat' + (tone ? ' stat-' + tone : '')}>
      {href ? <Link href={href}>{body}</Link> : body}
    </div>
  );
}
export function Table({
  head,
  children,
  empty,
}: {
  head: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) return <p className="empty">Nothing recorded yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
// Plain GET filter so pages stay shareable and work without JavaScript.
export function Filter({
  day,
  level,
  extra,
  allLevels = true,
}: {
  day?: string;
  level?: string;
  extra?: ReactNode;
  allLevels?: boolean;
}) {
  return (
    <form method="get" className="filter-bar no-print">
      {day !== undefined && (
        <label className="field">
          <span>Date</span>
          <input type="date" name="day" defaultValue={day} />
        </label>
      )}
      {level !== undefined && (
        <label className="field">
          <span>Class level</span>
          <select name="level" defaultValue={level}>
            {allLevels && <option value="">All levels</option>}
            {programmes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      )}
      {extra}
      <button className="button secondary" type="submit">
        Show
      </button>
    </form>
  );
}
export function StudentOptions({
  students,
  placeholder = 'Choose a learner',
}: {
  students: Kid[];
  placeholder?: string;
}) {
  return (
    <>
      <option value="">{placeholder}</option>
      {students.map((student) => (
        <option key={student.id} value={student.id}>
          {fullName(student)}
          {student.classLevel ? ' (' + student.classLevel + ')' : ''}
        </option>
      ))}
    </>
  );
}
export function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="module-section" id={id}>
      <h2 className="h3">{title}</h2>
      {children}
    </section>
  );
}
export const levelParam = (value?: string) =>
  (programmes as readonly string[]).includes(value || '')
    ? (value as (typeof programmes)[number])
    : undefined;
