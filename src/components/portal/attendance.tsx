import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { viewers } from '@/lib/permissions';
import { checkIn, markAbsent } from '@/actions/daily';
import { nairobiDay, isDay, time, addDays } from '@/lib/day';
import { Filter, Table, Section, fullName, levelParam } from './ui';
const badge = (status?: string) =>
  !status ? (
    <span className="badge badge-warn">Not marked</span>
  ) : (
    <span
      className={
        'badge ' +
        (status === 'Absent'
          ? 'badge-danger'
          : status === 'Late'
            ? 'badge-warn'
            : 'badge-good')
      }
    >
      {status}
    </span>
  );
export async function AttendancePage({ day, level }: { day?: string; level?: string }) {
  await requireUser(viewers('attendance'));
  const selectedDay = isDay(day) ? day : nairobiDay();
  const selected = levelParam(level);
  const students = await db.student.findMany({
    where: {
      status: { in: ['Admitted', 'Active'] },
      ...(selected ? { classLevel: selected } : {}),
    },
    orderBy: [{ classLevel: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classLevel: true,
      allergies: true,
    },
  });
  const records = await db.attendance.findMany({
    where: { day: selectedDay, student: { in: students.map((student) => student.id) } },
  });
  const today = selectedDay === nairobiDay();
  return (
    <>
      <PageTitle title="Daily attendance">
        Check learners in on arrival, record lateness and absences. Children are checked
        out only through verified collection.
      </PageTitle>
      <Filter day={selectedDay} level={level || ''} />
      {!today && (
        <p className="notice">
          You are viewing {selectedDay}. Only the headteacher or administrator can change
          another day.
        </p>
      )}
      <Table
        head={['Learner', 'Status', 'Arrival', 'Departure', 'Record']}
        empty={!students.length}
      >
        {students.map((student) => {
          const record = records.find((item) => item.student === student.id);
          return (
            <tr key={student.id}>
              <td>
                {fullName(student)}
                <br />
                <span className="small-text muted">{student.classLevel}</span>
                {student.allergies && (
                  <>
                    <br />
                    <span className="badge badge-danger">
                      Allergy: {student.allergies.slice(0, 40)}
                    </span>
                  </>
                )}
              </td>
              <td>{badge(record?.status)}</td>
              <td>
                {time(record?.checkInAt)}
                {record?.droppedOffBy && (
                  <>
                    <br />
                    <span className="small-text">by {record.droppedOffBy}</span>
                  </>
                )}
                {record?.absenceReason && (
                  <span className="small-text">{record.absenceReason}</span>
                )}
              </td>
              <td>
                {record?.checkOutAt ? (
                  time(record.checkOutAt)
                ) : record?.checkInAt ? (
                  <Link href="/admin/pickup">Release at collection</Link>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {!record?.checkOutAt && (
                  <div className="inline-actions">
                    {!record?.checkInAt && (
                      <ActionForm action={checkIn} label="Check in" className="stack">
                        <Hidden name="studentId" value={student.id} />
                        <Hidden name="day" value={selectedDay} />
                        <Field name="droppedOffBy" label="Brought by" maxLength={120} />
                        <label className="check">
                          <input type="checkbox" name="late" value="yes" />
                          <span>Arrived late</span>
                        </label>
                      </ActionForm>
                    )}
                    {!record?.checkInAt && record?.status !== 'Absent' && (
                      <ActionForm
                        action={markAbsent}
                        label="Mark absent"
                        className="stack"
                      >
                        <Hidden name="studentId" value={student.id} />
                        <Hidden name="day" value={selectedDay} />
                        <Field name="reason" label="Reason (if known)" maxLength={300} />
                      </ActionForm>
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
export async function ParentAttendance() {
  const user = await requireUser(['parent']);
  const children = await db.student.findMany({
    where: { parentEmail: user.email },
    select: { id: true, firstName: true, lastName: true },
  });
  const since = addDays(nairobiDay(), -60);
  const records = await db.attendance.findMany({
    where: { student: { in: children.map((child) => child.id) }, day: { gte: since } },
    orderBy: { day: 'desc' },
  });
  return (
    <>
      <PageTitle title="Attendance">
        Arrival and collection times for the last 60 days.
      </PageTitle>
      {children.map((child) => {
        const mine = records.filter((record) => record.student === child.id);
        const present = mine.filter((record) => record.status !== 'Absent').length;
        return (
          <Section
            key={child.id}
            title={
              fullName(child) +
              ' · ' +
              present +
              ' of ' +
              mine.length +
              ' recorded days attended'
            }
          >
            <Table head={['Date', 'Status', 'Arrived', 'Collected']} empty={!mine.length}>
              {mine.map((record) => (
                <tr key={record.id}>
                  <td>{record.day}</td>
                  <td>{badge(record.status)}</td>
                  <td>{time(record.checkInAt)}</td>
                  <td>{time(record.checkOutAt)}</td>
                </tr>
              ))}
            </Table>
          </Section>
        );
      })}
    </>
  );
}
