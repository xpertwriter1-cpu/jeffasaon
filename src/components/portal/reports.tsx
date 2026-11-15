import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { PageTitle } from '@/components/portal-shell';
import { PrintButton } from '@/components/print-button';
import { saveReport, publishReport } from '@/actions/records';
import { date } from '@/lib/school';
import {
  reportAreasFor,
  reportRatingsFor,
  cbcLevels,
  coreCompetencies,
  isCbcLevel,
} from '@/lib/cbc';
import { getSettings } from '@/lib/settings';
import { nairobiDay } from '@/lib/day';
import { objectId } from '@/lib/validation';
export async function ReportsPage({ parent }: { parent: boolean }) {
  const user = await requireUser(
    parent ? ['parent'] : ['admin', 'headteacher', 'teacher'],
  );
  const leader = ['admin', 'headteacher'].includes(user.role);
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
          : 'Prepare a draft. Only the headteacher or an administrator can publish it.'}
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
                        (leader || report.teacher === user.id) && (
                          <>
                            {' '}
                            /{' '}
                            <Link href={'/admin/reports/' + report.id + '/edit'}>
                              Edit
                            </Link>
                          </>
                        )}
                      {leader && (
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
export async function ReportForm({ id, studentId }: { id?: string; studentId?: string }) {
  const user = await requireUser(['admin', 'headteacher', 'teacher']);
  if (id && !objectId.safeParse(id).success) notFound();
  const report = id ? await db.report.findUnique({ where: { id } }) : null;
  if (
    id &&
    (!report ||
      report.status !== 'Draft' ||
      (!['admin', 'headteacher'].includes(user.role) && report.teacher !== user.id))
  )
    notFound();
  const chosen =
    report?.student ??
    (studentId && objectId.safeParse(studentId).success ? studentId : undefined);
  const student = chosen ? await db.student.findUnique({ where: { id: chosen } }) : null;
  if (!student) {
    const students = await db.student.findMany({
      where: { status: { in: ['Admitted', 'Active'] } },
      orderBy: [{ classLevel: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, classLevel: true },
    });
    return (
      <>
        <PageTitle title="New learning report">
          Choose the learner first. The report uses the learning areas for their level.
        </PageTitle>
        <form method="get" className="filter-bar">
          <label className="field">
            <span>Learner</span>
            <select name="student" required defaultValue="">
              <option value="">Choose a learner</option>
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.firstName} {item.lastName} ({item.classLevel})
                </option>
              ))}
            </select>
          </label>
          <button className="button">Continue</button>
        </form>
      </>
    );
  }
  const settings = await getSettings();
  const year = report?.year ?? settings.currentYear;
  const term = report?.term ?? settings.currentTerm;
  const termDates = await db.academicTerm.findUnique({
    where: { year_term: { year, term } },
  });
  const attendance = termDates
    ? await db.attendance.findMany({
        where: {
          student: student.id,
          day: {
            gte: nairobiDay(termDates.startDate),
            lte: nairobiDay(termDates.endDate),
          },
        },
        select: { status: true },
      })
    : [];
  const suggestedPresent = attendance.filter(
    (record) => record.status !== 'Absent',
  ).length;
  const assessments = await db.competencyAssessment.findMany({
    where: { student: student.id, year, term },
    orderBy: { assessedOn: 'desc' },
  });
  const areas = reportAreasFor(student.classLevel);
  const ratings = reportRatingsFor(student.classLevel);
  return (
    <>
      <PageTitle
        title={
          (report ? 'Edit' : 'New') +
          ' learning report · ' +
          student.firstName +
          ' ' +
          student.lastName
        }
      >
        {student.classLevel} ·{' '}
        {isCbcLevel(student.classLevel)
          ? 'CBC learning areas and rubric'
          : 'Early years developmental areas'}
      </PageTitle>
      {assessments.length > 0 && (
        <div className="record-card">
          <h2 className="h3">Assessments recorded this term</h2>
          <ul className="small-text">
            {assessments.map((item) => (
              <li key={item.id}>
                {item.learningArea} › {item.strand}: <strong>{item.level}</strong>
                {item.comment ? ' — ' + item.comment : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ActionForm action={saveReport} label="Save draft">
        {report && <Hidden name="id" value={report.id} />}
        <Hidden name="studentId" value={student.id} />
        <div className="form-grid">
          <Field
            name="year"
            label="Year"
            type="number"
            min={2000}
            max={2100}
            required
            defaultValue={year}
          />
          <Field name="term" label="Term" defaultValue={term} required>
            {[1, 2, 3].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Field>
          <Field
            name="daysPresent"
            label={
              'Days present' + (termDates ? ' (register: ' + suggestedPresent + ')' : '')
            }
            type="number"
            min={0}
            max={366}
            required
            defaultValue={
              report?.daysPresent ?? (termDates ? suggestedPresent : undefined)
            }
          />
          <Field
            name="daysPossible"
            label={
              'Possible school days' +
              (termDates ? ' (register: ' + attendance.length + ')' : '')
            }
            type="number"
            min={0}
            max={366}
            required
            defaultValue={
              report?.daysPossible ?? (termDates ? attendance.length : undefined)
            }
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
          label="Teacher comments (strengths, core competencies and next steps)"
          type="textarea"
          maxLength={3000}
          defaultValue={report?.comments ?? ''}
        />
      </ActionForm>
    </>
  );
}
export async function ReportView({ id, parent }: { id: string; parent: boolean }) {
  await requireUser(parent ? ['parent'] : ['admin', 'headteacher', 'teacher']);
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
  const strands = await db.competencyAssessment.findMany({
    where: { student: student.id, year: report.year, term: report.term },
    orderBy: [{ learningArea: 'asc' }, { assessedOn: 'asc' }],
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
      {strands.length > 0 && (
        <div className="record-card">
          <h2 className="h3">Strand assessments</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Learning area</th>
                  <th>Strand</th>
                  <th>Level</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {strands.map((item) => (
                  <tr key={item.id}>
                    <td>{item.learningArea}</td>
                    <td>{item.strand}</td>
                    <td>
                      {cbcLevels.find((level) => level.code === item.level)?.label ||
                        item.level}
                    </td>
                    <td>{item.comment || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isCbcLevel(report.classLevel) && (
            <p className="small-text muted">
              Core competencies developed through these activities:{' '}
              {coreCompetencies.join(', ')}.
            </p>
          )}
        </div>
      )}
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
