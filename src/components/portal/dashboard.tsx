import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { canView } from '@/lib/permissions';
import { currency, date, programmes } from '@/lib/school';
import { getSettings, activeAccount } from '@/lib/settings';
import { nairobiDay, time, addDays, dayStart } from '@/lib/day';
import { invoiceTotals } from '@/lib/invoice-totals';
import { Stat, Table, fullName, Section } from './ui';
import { ClockPanel } from './teachers';
const enrolled = ['Admitted', 'Active'];
export async function Dashboard() {
  const user = await requireUser();
  return user.role === 'parent' ? <ParentDashboard /> : <StaffDashboard />;
}
async function StaffDashboard() {
  const user = await requireUser();
  const role = user.role;
  const today = nairobiDay();
  const settings = await getSettings();
  const term = { year: settings.currentYear, term: settings.currentTerm };
  const soon = dayStart(addDays(today, 60));
  const [
    students,
    pending,
    attendance,
    staffCount,
    staffPresent,
    invoices,
    openIncidents,
    licences,
    immunised,
    unread,
    mpesaReview,
    pendingPayments,
    pickupRequests,
  ] = await Promise.all([
    db.student.findMany({
      where: { status: { in: enrolled } },
      select: { id: true, classLevel: true },
    }),
    db.student.count({ where: { status: 'Pending' } }),
    db.attendance.findMany({ where: { day: today } }),
    db.user.count({ where: { role: { not: 'parent' }, ...activeAccount } }),
    db.staffAttendance.count({ where: { day: today, status: 'Present' } }),
    canView(role, 'fees') ? db.invoice.findMany({ where: term }) : Promise.resolve([]),
    db.incident.findMany({ where: { status: 'Open' }, select: { kind: true } }),
    canView(role, 'compliance')
      ? db.licenceRecord.findMany({
          where: { expiryDate: { lte: soon } },
          orderBy: { expiryDate: 'asc' },
        })
      : Promise.resolve([]),
    db.immunization.findMany({ select: { student: true }, distinct: ['student'] }),
    role === 'admin'
      ? db.enquiry.count({
          where: { OR: [{ readAt: null }, { readAt: { isSet: false } }] },
        })
      : Promise.resolve(0),
    canView(role, 'payments')
      ? db.mpesaRequest.count({ where: { status: 'Needs review' } })
      : Promise.resolve(0),
    canView(role, 'payments')
      ? db.payment.count({ where: { status: 'Pending verification' } })
      : Promise.resolve(0),
    ['admin', 'headteacher'].includes(role)
      ? db.authorizedPickup.count({ where: { status: 'Pending' } })
      : Promise.resolve(0),
  ]);
  const payments = invoices.length
    ? await db.payment.findMany({
        where: { invoice: { in: invoices.map((invoice) => invoice.id) } },
      })
    : [];
  const money = invoices.reduce(
    (sum, invoice) => {
      const totals = invoiceTotals(invoice, payments);
      return {
        billed: sum.billed + totals.total,
        paid: sum.paid + totals.paid,
        balance: sum.balance + totals.balance,
      };
    },
    { billed: 0, paid: 0, balance: 0 },
  );
  const count = (status: string) =>
    attendance.filter((record) => record.status === status).length;
  const onSite = attendance.filter(
    (record) => record.checkInAt && !record.checkOutAt,
  ).length;
  const unmarked = students.length - attendance.length;
  const immunisedIds = new Set(immunised.map((item) => item.student));
  const missingImmunisation = students.filter(
    (student) => !immunisedIds.has(student.id),
  ).length;
  const safeguarding = openIncidents.filter(
    (incident) => incident.kind === 'Safeguarding concern',
  ).length;
  const mine = await db.staffAttendance.findUnique({
    where: { user_day: { user: user.id, day: today } },
  });
  const recent = await db.student.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classLevel: true,
      status: true,
      admissionNumber: true,
    },
  });
  return (
    <>
      <PageTitle title={'Welcome, ' + user.name}>
        {settings.name} · {date(new Date())} · {settings.currentYear} Term{' '}
        {settings.currentTerm}
      </PageTitle>
      <div className="record-card no-print">
        <strong>My attendance today:</strong>{' '}
        {mine
          ? mine.status +
            ' · in ' +
            time(mine.checkInAt) +
            (mine.checkOutAt ? ' · out ' + time(mine.checkOutAt) : '')
          : 'Not clocked in'}
        <ClockPanel userId={user.id} day={today} record={mine} />
      </div>
      <h2 className="h3">Learners</h2>
      <div className="stats">
        <Stat label="Enrolled learners" value={students.length} href="/admin/students" />
        {programmes.map((level) => (
          <Stat
            key={level}
            label={level}
            value={students.filter((student) => student.classLevel === level).length}
            href={canView(role, 'classes') ? '/admin/classes?level=' + level : undefined}
          />
        ))}
        {canView(role, 'admissions') && (
          <Stat
            label="Applications to review"
            value={pending}
            href="/admin/admissions"
            tone={pending ? 'warn' : undefined}
          />
        )}
      </div>
      {canView(role, 'attendance') && (
        <>
          <h2 className="h3">Today’s attendance</h2>
          <div className="stats">
            <Stat
              label="Present"
              value={count('Present')}
              href="/admin/attendance"
              tone="good"
            />
            <Stat label="Late" value={count('Late')} href="/admin/attendance" />
            <Stat label="Absent" value={count('Absent')} href="/admin/attendance" />
            <Stat
              label="Not yet marked"
              value={unmarked}
              href="/admin/attendance"
              tone={unmarked ? 'warn' : undefined}
            />
            <Stat label="On site now" value={onSite} href="/admin/pickup" />
            <Stat
              label="Staff present"
              value={staffPresent + ' / ' + staffCount}
              href={canView(role, 'teachers') ? '/admin/teachers' : undefined}
            />
          </div>
        </>
      )}
      {canView(role, 'fees') && (
        <>
          <h2 className="h3">
            Fees · {settings.currentYear} Term {settings.currentTerm}
          </h2>
          <div className="stats">
            <Stat label="Billed" value={currency(money.billed)} href="/admin/fees" />
            <Stat
              label="Collected"
              value={currency(money.paid)}
              tone="good"
              href="/admin/payments"
            />
            <Stat
              label="Outstanding"
              value={currency(money.balance)}
              tone={money.balance > 0 ? 'warn' : undefined}
              href="/admin/analytics?tab=finance"
            />
            {canView(role, 'payments') && (
              <Stat
                label="Payments to verify"
                value={pendingPayments + mpesaReview}
                href="/admin/payments"
                tone={pendingPayments + mpesaReview ? 'warn' : undefined}
              />
            )}
          </div>
        </>
      )}
      <h2 className="h3">Welfare and compliance</h2>
      <div className="stats">
        {canView(role, 'health') && (
          <Stat
            label="Open incidents"
            value={openIncidents.length}
            href="/admin/health"
            tone={openIncidents.length ? 'warn' : undefined}
          />
        )}
        {canView(role, 'health') && (
          <Stat
            label="Safeguarding concerns open"
            value={safeguarding}
            href="/admin/health"
            tone={safeguarding ? 'warn' : undefined}
          />
        )}
        {canView(role, 'health') && (
          <Stat
            label="Learners without immunisation record"
            value={missingImmunisation}
            href="/admin/health"
            tone={missingImmunisation ? 'warn' : undefined}
          />
        )}
        {pickupRequests > 0 && (
          <Stat
            label="Collector requests to approve"
            value={pickupRequests}
            href="/admin/pickup"
            tone="warn"
          />
        )}
        {canView(role, 'compliance') && (
          <Stat
            label="Licences expired or due in 60 days"
            value={licences.length}
            href="/admin/compliance"
            tone={licences.length ? 'warn' : undefined}
          />
        )}
        {role === 'admin' && (
          <Stat
            label="Unread enquiries"
            value={unread}
            href="/admin/enquiries"
            tone={unread ? 'warn' : undefined}
          />
        )}
      </div>
      <Section title="Recent applications and learners">
        <Table
          head={['Learner', 'Programme', 'Status', 'Admission number']}
          empty={!recent.length}
        >
          {recent.map((student) => (
            <tr key={student.id}>
              <td>
                {role === 'bursar' ? (
                  fullName(student)
                ) : (
                  <Link href={'/admin/students/' + student.id}>{fullName(student)}</Link>
                )}
              </td>
              <td>{student.classLevel}</td>
              <td>
                <span className="status">{student.status}</span>
              </td>
              <td>{student.admissionNumber || 'Awaiting admission'}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
async function ParentDashboard() {
  const user = await requireUser(['parent']);
  const today = nairobiDay();
  const children = await db.student.findMany({
    where: { parentEmail: user.email },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classLevel: true,
      status: true,
      admissionNumber: true,
    },
  });
  const ids = children.map((child) => child.id);
  const levels = [...new Set(children.map((child) => child.classLevel))];
  const [attendance, pickups, invoices, payments, announcements] = await Promise.all([
    db.attendance.findMany({ where: { student: { in: ids }, day: today } }),
    db.pickupRecord.findMany({
      where: { student: { in: ids }, day: today, outcome: 'Released' },
    }),
    db.invoice.findMany({ where: { student: { in: ids } } }),
    db.payment.findMany({ where: { student: { in: ids } } }),
    db.announcement.findMany({
      where: {
        OR: [
          { audience: { in: ['All parents', 'Everyone'] } },
          { audience: 'Class level', classLevel: { in: levels } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ]);
  const balance = invoices.reduce(
    (sum, invoice) => sum + invoiceTotals(invoice, payments).balance,
    0,
  );
  return (
    <>
      <PageTitle title={'Welcome, ' + user.name}>
        Today at school, messages and next steps.
      </PageTitle>
      <div className="stats">
        <Stat
          label="Fee balance"
          value={currency(balance)}
          href="/parent/fees"
          tone={balance > 0 ? 'warn' : 'good'}
        />
        <Stat label="New messages" value={announcements.length} href="/parent/messages" />
      </div>
      <Section title="Your children today">
        <Table head={['Child', 'Programme', 'Status', 'Today']} empty={!children.length}>
          {children.map((child) => {
            const record = attendance.find((item) => item.student === child.id);
            const pickup = pickups.find((item) => item.student === child.id);
            return (
              <tr key={child.id}>
                <td>
                  <Link href={'/parent/students/' + child.id}>{fullName(child)}</Link>
                  <br />
                  <span className="small-text muted">
                    {child.admissionNumber || 'Awaiting admission'}
                  </span>
                </td>
                <td>{child.classLevel}</td>
                <td>
                  <span className="status">{child.status}</span>
                </td>
                <td>
                  {!record
                    ? 'Not yet checked in'
                    : record.status === 'Absent'
                      ? 'Absent'
                      : (record.status === 'Late' ? 'Arrived late at ' : 'Arrived at ') +
                        time(record.checkInAt) +
                        (pickup
                          ? '; collected by ' +
                            pickup.collectorName +
                            ' at ' +
                            time(pickup.at)
                          : '')}
                  {record && record.status !== 'Absent' && (
                    <>
                      <br />
                      <Link href={'/parent/daily?student=' + child.id}>
                        Daily care report
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        {!children.length && (
          <p>
            <Link className="button" href="/parent/admission">
              Start an application
            </Link>
          </p>
        )}
      </Section>
      {announcements.length > 0 && (
        <Section title="Latest from the school">
          {announcements.map((item) => (
            <article className="record-card" key={item.id}>
              <h3>{item.title}</h3>
              <p className="small-text muted">{date(item.createdAt)}</p>
              <p className="preserve-lines">{item.body}</p>
            </article>
          ))}
        </Section>
      )}
    </>
  );
}
