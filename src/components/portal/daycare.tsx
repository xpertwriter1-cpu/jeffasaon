import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { viewers } from '@/lib/permissions';
import { addCareLog } from '@/actions/daily';
import { careKinds, eatenAmounts } from '@/lib/lists';
import { nairobiDay, isDay, time, nowHHMM } from '@/lib/day';
import { objectId } from '@/lib/validation';
import { Filter, Table, Section, fullName, levelParam } from './ui';
function LogList({
  logs,
}: {
  logs: {
    id: string;
    at: Date;
    kind: string;
    amount: string | null;
    details: string | null;
  }[];
}) {
  if (!logs.length) return <p className="small-text muted">No entries yet.</p>;
  return (
    <ul className="small-text">
      {logs.map((log) => (
        <li key={log.id}>
          <strong>{time(log.at)}</strong> {log.kind}
          {log.amount ? ': ' + log.amount : ''}
          {log.details ? ' — ' + log.details : ''}
        </li>
      ))}
    </ul>
  );
}
export async function DaycarePage({ day, level }: { day?: string; level?: string }) {
  await requireUser(viewers('daycare'));
  const selectedDay = isDay(day) ? day : nairobiDay();
  const selected = level === undefined ? 'Daycare' : levelParam(level);
  const students = await db.student.findMany({
    where: {
      status: { in: ['Admitted', 'Active'] },
      ...(selected ? { classLevel: selected } : {}),
    },
    orderBy: { firstName: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classLevel: true,
      allergies: true,
      dietaryRequirements: true,
    },
  });
  const ids = students.map((student) => student.id);
  const [logs, present] = await Promise.all([
    db.careLog.findMany({
      where: { day: selectedDay, student: { in: ids } },
      orderBy: { at: 'asc' },
    }),
    db.attendance.findMany({
      where: {
        day: selectedDay,
        student: { in: ids },
        status: { in: ['Present', 'Late'] },
      },
    }),
  ]);
  const here = students.filter((student) =>
    present.some((record) => record.student === student.id),
  );
  return (
    <>
      <PageTitle title="Daycare daily care">
        Feeding, sleeping, diaper changes and wellbeing. Parents see these entries as
        their child’s daily report.
      </PageTitle>
      <Filter day={selectedDay} level={selected || ''} />
      {!here.length && (
        <p className="empty">No checked-in learners for this day and level.</p>
      )}
      {here.map((student) => (
        <section className="record-card" key={student.id}>
          <h2 className="h3">
            {fullName(student)}{' '}
            <span className="small-text muted">{student.classLevel}</span>
          </h2>
          {(student.allergies || student.dietaryRequirements) && (
            <p className="badge badge-danger">
              {[
                student.allergies && 'Allergies: ' + student.allergies,
                student.dietaryRequirements && 'Diet: ' + student.dietaryRequirements,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <LogList logs={logs.filter((log) => log.student === student.id)} />
          <ActionForm action={addCareLog} label="Add entry" className="form-card compact">
            <Hidden name="studentId" value={student.id} />
            <Hidden name="day" value={selectedDay} />
            <div className="form-grid">
              <Field name="kind" label="Type" required>
                {careKinds.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </Field>
              <Field
                name="at"
                label="Time"
                type="time"
                required
                defaultValue={nowHHMM()}
              />
              <Field
                name="amount"
                label="Amount / duration (e.g. All, 1h30, wet)"
                maxLength={60}
              />
              <Field name="details" label="Details" maxLength={1000} />
            </div>
            <p className="small-text muted">For meals use: {eatenAmounts.join(', ')}.</p>
          </ActionForm>
        </section>
      ))}
    </>
  );
}
export async function ParentDaily({
  studentId,
  day,
}: {
  studentId?: string;
  day?: string;
}) {
  const user = await requireUser(['parent']);
  const children = await db.student.findMany({
    where: { parentEmail: user.email },
    select: { id: true, firstName: true, lastName: true, classLevel: true },
  });
  const child = children.find((item) => item.id === studentId) || children[0];
  const selectedDay = isDay(day) ? day : nairobiDay();
  const [logs, meals, observations, record] =
    child && objectId.safeParse(child.id).success
      ? await Promise.all([
          db.careLog.findMany({
            where: { student: child.id, day: selectedDay },
            orderBy: { at: 'asc' },
          }),
          db.mealPlan.findMany({
            where: { day: selectedDay, classLevel: { in: ['All', child.classLevel] } },
          }),
          db.observation.findMany({
            where: { student: child.id, day: selectedDay, sharedWithParent: true },
          }),
          db.attendance.findUnique({
            where: { student_day: { student: child.id, day: selectedDay } },
          }),
        ])
      : [[], [], [], null];
  return (
    <>
      <PageTitle title="Daily care report">
        What your child ate, slept and did today.
      </PageTitle>
      <form method="get" className="filter-bar no-print">
        <label className="field">
          <span>Child</span>
          <select name="student" defaultValue={child?.id}>
            {children.map((item) => (
              <option key={item.id} value={item.id}>
                {fullName(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" name="day" defaultValue={selectedDay} />
        </label>
        <button className="button secondary">Show</button>
      </form>
      {child && (
        <>
          <p>
            {fullName(child)} · {selectedDay} ·{' '}
            {!record
              ? 'No attendance recorded'
              : record.status === 'Absent'
                ? 'Absent'
                : 'Arrived ' +
                  time(record.checkInAt) +
                  (record.checkOutAt ? ', collected ' + time(record.checkOutAt) : '')}
          </p>
          <Section title="Care entries">
            <LogList logs={logs} />
          </Section>
          <Section title="Menu served">
            <Table head={['Meal', 'Menu']} empty={!meals.length}>
              {meals.map((meal) => (
                <tr key={meal.id}>
                  <td>{meal.meal}</td>
                  <td>{meal.menu}</td>
                </tr>
              ))}
            </Table>
          </Section>
          {observations.length > 0 && (
            <Section title="Teacher notes">
              {observations.map((item) => (
                <p key={item.id}>
                  <strong>{item.learningArea}:</strong> {item.note}
                </p>
              ))}
            </Section>
          )}
        </>
      )}
    </>
  );
}
