import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { PageTitle } from '@/components/portal-shell';
import { PrintButton } from '@/components/print-button';
import { saveReport, publishReport } from '@/actions/records';
import { areas, ratings, date } from '@/lib/school';
import { objectId } from '@/lib/validation';
export async function ReportsPage({ parent }: { parent: boolean }) {
  const user = await requireUser(parent ? ['parent'] : ['admin', 'teacher']);
  const students = await db.student.findMany({
    where: parent ? { parentEmail: user.email } : {},
    select: { id: true, firstName: true, lastName: true },
  });
  const reports = await db.report.findMany({
    where: parent
      ? { student: { in: students.map((student) => student.id) }, status: 'Published' }
      : {},
    orderBy: [{ year: 'desc' }, { term: 'desc' }],
    take: 500,
  });
  return (
    <>
      <PageTitle title="Learning reports">
        {parent
          ? 'Reports become visible here after school approval.'
          : 'Prepare a draft. Only an administrator can publish it.'}
      </PageTitle>
      {!parent && (
        <Link className="button" href="/admin/reports/new">
          New report
        </Link>
      )}
      {reports.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Child</th>
                <th>Year / term</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const student = students.find((student) => student.id === report.student);
                return (
                  <tr key={report.id}>
                    <td>
                      {student?.firstName} {student?.lastName}
                    </td>
                    <td>
                      {report.year} / Term {report.term}
                    </td>
                    <td>
                      <span className="status">{report.status}</span>
                    </td>
                    <td>
                      <Link
                        href={
                          '/' + (parent ? 'parent' : 'admin') + '/reports/' + report.id
                        }
                      >
                        View
                      </Link>
                      {!parent &&
                        report.status === 'Draft' &&
                        (user.role === 'admin' || report.teacher === user.id) && (
                          <>
                            {' '}
                            /{' '}
                            <Link href={'/admin/reports/' + report.id + '/edit'}>
                              Edit
                            </Link>
                          </>
                        )}
                      {user.role === 'admin' && (
                        <ActionForm
                          action={publishReport}
                          className="stack"
                          label={
                            report.status === 'Draft' ? 'Publish' : 'Return to draft'
                          }
                        >
                          <Hidden name="id" value={report.id} />
                          <Hidden
                            name="mode"
                            value={report.status === 'Draft' ? 'publish' : 'unpublish'}
                          />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No reports available.</p>
      )}
    </>
  );
}
export async function ReportForm({ id }: { id?: string }) {
  const user = await requireUser(['admin', 'teacher']);
  if (id && !objectId.safeParse(id).success) notFound();
  const report = id ? await db.report.findUnique({ where: { id } }) : null;
  if (
    id &&
    (!report ||
      report.status !== 'Draft' ||
      (user.role !== 'admin' && report.teacher !== user.id))
  )
    notFound();
  const students = await db.student.findMany({
    where: report ? { id: report.student } : { status: { in: ['Admitted', 'Active'] } },
    select: { id: true, firstName: true, lastName: true },
  });
  return (
    <>
      <PageTitle title={report ? 'Edit learning report' : 'New learning report'} />
      <ActionForm action={saveReport} label="Save draft">
        {report && <Hidden name="id" value={report.id} />}
        <div className="form-grid">
          <Field name="studentId" label="Student" required defaultValue={report?.student}>
            <option value="">Choose a student</option>
            {students.map((student) => (
              <option value={student.id} key={student.id}>
                {student.firstName} {student.lastName}
              </option>
            ))}
          </Field>
          <Field
            name="year"
            label="Year"
            type="number"
            min={2000}
            max={2100}
            required
            defaultValue={report?.year ?? new Date().getFullYear()}
          />
          <Field name="term" label="Term" defaultValue={report?.term} required>
            {[1, 2, 3].map((term) => (
              <option key={term}>{term}</option>
            ))}
          </Field>
          <Field
            name="daysPresent"
            label="Days present"
            type="number"
            min={0}
            max={366}
            required
            defaultValue={report?.daysPresent}
          />
          <Field
            name="daysPossible"
            label="Possible school days"
            type="number"
            min={0}
            max={366}
            required
            defaultValue={report?.daysPossible}
          />
          {areas.map((area, index) => (
            <Field
              key={area}
              name={'rating' + index}
              label={area}
              required
              defaultValue={
                report?.assessments.find((item) => item.area === area)?.rating
              }
            >
              <option value="">Choose rating</option>
              {ratings.map((rating) => (
                <option key={rating}>{rating}</option>
              ))}
            </Field>
          ))}
        </div>
        <Field
          name="comments"
          label="Teacher comments"
          type="textarea"
          maxLength={3000}
          defaultValue={report?.comments ?? ''}
        />
      </ActionForm>
    </>
  );
}
export async function ReportView({ id, parent }: { id: string; parent: boolean }) {
  await requireUser(parent ? ['parent'] : ['admin', 'teacher']);
  const user = await requireUser();
  if (!objectId.safeParse(id).success) notFound();
  const report = await db.report.findUnique({ where: { id } });
  const student =
    report && (await db.student.findUnique({ where: { id: report.student } }));
  if (
    !report ||
    !student ||
    (parent && (report.status !== 'Published' || student.parentEmail !== user.email))
  )
    notFound();
  const teacher = await db.user.findUnique({
    where: { id: report.teacher },
    select: { name: true },
  });
  return (
    <>
      <PageTitle
        title={student.firstName + ' ' + student.lastName + ' - Learning report'}
      >
        {report.classLevel +
          ' / ' +
          report.year +
          ' term ' +
          report.term +
          ' / ' +
          report.status}
      </PageTitle>
      <PrintButton />
      <div className="record-card">
        <h2 className="h3">Progress and development</h2>
        <dl className="record-details">
          {report.assessments.map((item) => (
            <div key={item.area}>
              <dt>{item.area}</dt>
              <dd>{item.rating}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="record-card">
        <h2 className="h3">Attendance and comments</h2>
        <p>
          {report.daysPresent} days present out of {report.daysPossible} possible school
          days.
        </p>
        <p className="preserve-lines">{report.comments || 'No additional comments.'}</p>
        <p className="muted small-text">
          Teacher: {teacher?.name || 'School teacher'}
          <br />
          Published: {date(report.publishedAt)}
        </p>
      </div>
    </>
  );
}
