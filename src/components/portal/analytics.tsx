import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { PrintButton } from '@/components/print-button';
import { viewers } from '@/lib/permissions';
import { currency, programmes } from '@/lib/school';
import { getSettings } from '@/lib/settings';
import { cbcLevels } from '@/lib/cbc';
import { invoiceTotals } from '@/lib/invoice-totals';
import { range, termOf, reportNames, reportRoles, type ReportQuery } from '@/lib/reports';
import { Table, Section, fullName } from './ui';
const titles: Record<string, string> = {
  students: 'Learner register',
  attendance: 'Attendance',
  fees: 'Fee balances',
  payments: 'Payments',
  assessments: 'Competency assessments',
  incidents: 'Incidents',
  immunizations: 'Immunisations',
  pickups: 'Collection records',
};
export async function AnalyticsPage({ query }: { query: ReportQuery }) {
  const user = await requireUser(viewers('analytics'));
  const settings = await getSettings();
  const { from, to } = range(query);
  const period = termOf(query, {
    year: settings.currentYear,
    term: settings.currentTerm,
  });
  const finance = ['admin', 'headteacher', 'bursar'].includes(user.role);
  const school = ['admin', 'headteacher'].includes(user.role);
  const [students, attendance, invoices, assessments] = await Promise.all([
    db.student.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classLevel: true,
        status: true,
      },
    }),
    school
      ? db.attendance.findMany({ where: { day: { gte: from, lte: to } } })
      : Promise.resolve([]),
    finance ? db.invoice.findMany({ where: period }) : Promise.resolve([]),
    school ? db.competencyAssessment.findMany({ where: period }) : Promise.resolve([]),
  ]);
  const payments = invoices.length
    ? await db.payment.findMany({ where: { invoice: { in: invoices.map((i) => i.id) } } })
    : [];
  const statuses = [...new Set(students.map((s) => s.status))];
  const byLearner = students
    .filter((s) => ['Admitted', 'Active'].includes(s.status))
    .map((s) => {
      const mine = attendance.filter((a) => a.student === s.id);
      const present = mine.filter((a) => a.status !== 'Absent').length;
      return {
        s,
        present,
        late: mine.filter((a) => a.status === 'Late').length,
        absent: mine.length - present,
        rate: mine.length ? Math.round((present / mine.length) * 100) : null,
      };
    })
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
  const params = new URLSearchParams({
    from,
    to,
    year: String(period.year),
    term: String(period.term),
  }).toString();
  return (
    <>
      <PageTitle title="School reports">
        Student, attendance, financial and academic reports. Print to PDF or download CSV
        files that open in Excel.
      </PageTitle>
      <form method="get" className="filter-bar no-print">
        <label className="field">
          <span>From</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label className="field">
          <span>Year</span>
          <input type="number" name="year" defaultValue={period.year} />
        </label>
        <label className="field">
          <span>Term</span>
          <select name="term" defaultValue={period.term}>
            {[1, 2, 3].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <button className="button secondary">Update</button>
      </form>
      <PrintButton />
      <Section title="Downloads (Excel / CSV)">
        <p className="no-print">
          {reportNames
            .filter((name) => reportRoles[name].includes(user.role))
            .map((name) => (
              <a
                key={name}
                className="button secondary small"
                href={'/admin/export/' + name + '?' + params}
                style={{ marginRight: 8, marginBottom: 8 }}
              >
                {titles[name]}
              </a>
            ))}
        </p>
      </Section>
      <Section title="Enrolment by level">
        <Table head={['Level', ...statuses, 'Total']}>
          {programmes.map((level) => (
            <tr key={level}>
              <td>{level}</td>
              {statuses.map((status) => (
                <td key={status}>
                  {
                    students.filter((s) => s.classLevel === level && s.status === status)
                      .length
                  }
                </td>
              ))}
              <td>{students.filter((s) => s.classLevel === level).length}</td>
            </tr>
          ))}
        </Table>
      </Section>
      {finance && (
        <Section title={'Fees · ' + period.year + ' Term ' + period.term}>
          <Table
            head={[
              'Level',
              'Invoices',
              'Billed',
              'Collected',
              'Outstanding',
              'Collection rate',
            ]}
          >
            {programmes.map((level) => {
              const mine = invoices.filter(
                (i) => students.find((s) => s.id === i.student)?.classLevel === level,
              );
              const t = mine.reduce(
                (sum, i) => {
                  const x = invoiceTotals(i, payments);
                  return {
                    billed: sum.billed + x.total,
                    paid: sum.paid + x.paid,
                    balance: sum.balance + x.balance,
                  };
                },
                { billed: 0, paid: 0, balance: 0 },
              );
              return (
                <tr key={level}>
                  <td>{level}</td>
                  <td>{mine.length}</td>
                  <td>{currency(t.billed)}</td>
                  <td>{currency(t.paid)}</td>
                  <td>{currency(t.balance)}</td>
                  <td>{t.billed ? Math.round((t.paid / t.billed) * 100) + '%' : '—'}</td>
                </tr>
              );
            })}
          </Table>
          <Table head={['Payment method', 'Verified payments', 'Amount']}>
            {[
              ...new Set(
                payments.filter((p) => p.status === 'Paid').map((p) => p.method),
              ),
            ].map((method) => {
              const list = payments.filter(
                (p) => p.status === 'Paid' && p.method === method,
              );
              return (
                <tr key={method}>
                  <td>{method}</td>
                  <td>{list.length}</td>
                  <td>{currency(list.reduce((sum, p) => sum + p.amount, 0))}</td>
                </tr>
              );
            })}
          </Table>
        </Section>
      )}
      {school && (
        <>
          <Section title={'Attendance ' + from + ' to ' + to + ' (lowest first)'}>
            <Table
              head={['Learner', 'Level', 'Days present', 'Late', 'Absent', 'Rate']}
              empty={!byLearner.length}
            >
              {byLearner.slice(0, 100).map(({ s, present, late, absent, rate }) => (
                <tr key={s.id}>
                  <td>{fullName(s)}</td>
                  <td>{s.classLevel}</td>
                  <td>{present}</td>
                  <td>{late}</td>
                  <td>{absent}</td>
                  <td>{rate === null ? 'No records' : rate + '%'}</td>
                </tr>
              ))}
            </Table>
          </Section>
          <Section title={'Competency profile · ' + period.year + ' Term ' + period.term}>
            <Table
              head={['Learning area', ...cbcLevels.map((l) => l.code), 'Assessments']}
              empty={!assessments.length}
            >
              {[...new Set(assessments.map((a) => a.learningArea))].map((area) => {
                const list = assessments.filter((a) => a.learningArea === area);
                return (
                  <tr key={area}>
                    <td>{area}</td>
                    {cbcLevels.map((l) => (
                      <td key={l.code}>
                        {list.filter((a) => a.level === l.code).length}
                      </td>
                    ))}
                    <td>{list.length}</td>
                  </tr>
                );
              })}
            </Table>
          </Section>
        </>
      )}
    </>
  );
}
