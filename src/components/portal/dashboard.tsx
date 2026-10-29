import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
export async function Dashboard() {
  const user = await requireUser();
  const students = await db.student.findMany({
    where: user.role === 'parent' ? { parentEmail: user.email } : {},
    orderBy: { createdAt: 'desc' },
    take: user.role === 'parent' ? 100 : 8,
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
        {user.role === 'parent'
          ? 'Your child’s school records and next steps.'
          : 'School records, applications and daily administration.'}
      </PageTitle>
      <div className="card-grid three">
        <article className="record-card">
          <h3>
            {user.role === 'parent' ? 'Applications and children' : 'Student register'}
          </h3>
          <p>View child records and their enrolment status.</p>
          <Link href={user.role === 'parent' ? '/parent/admission' : '/admin/students'}>
            {user.role === 'parent' ? 'Start an application' : 'Open student register'}
          </Link>
        </article>
        {['parent', 'admin', 'bursar'].includes(user.role) && (
          <article className="record-card">
            <h3>Fees and payments</h3>
            <p>View invoices, balances and verified payments.</p>
            <Link href={user.role === 'parent' ? '/parent/fees' : '/admin/fees'}>
              Open fee records
            </Link>
          </article>
        )}
        {['parent', 'admin', 'teacher'].includes(user.role) && (
          <article className="record-card">
            <h3>Learning reports</h3>
            <p>
              {user.role === 'parent'
                ? 'Read your child’s published reports.'
                : 'Prepare and review term reports.'}
            </p>
            <Link href={user.role === 'parent' ? '/parent/reports' : '/admin/reports'}>
              Open reports
            </Link>
          </article>
        )}
      </div>
      <h2 className="h3">
        {user.role === 'parent' ? 'Your children' : 'Recent applications'}
      </h2>
      {students.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Child</th>
                <th>Programme</th>
                <th>Status</th>
                <th>Admission number</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>
                    {user.role === 'bursar' ? (
                      student.firstName + ' ' + student.lastName
                    ) : (
                      <Link
                        href={
                          '/' +
                          (user.role === 'parent' ? 'parent' : 'admin') +
                          '/students/' +
                          student.id
                        }
                      >
                        {student.firstName} {student.lastName}
                      </Link>
                    )}
                  </td>
                  <td>{student.classLevel}</td>
                  <td>
                    <span className="status">{student.status}</span>
                  </td>
                  <td>{student.admissionNumber || 'Awaiting admission'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No applications yet.</p>
      )}
    </>
  );
}
