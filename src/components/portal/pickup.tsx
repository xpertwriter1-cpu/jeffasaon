import { db } from '@/lib/db';
import { notCollected } from '@/lib/settings';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { viewers } from '@/lib/permissions';
import { addPickupPerson, reviewPickupPerson, releaseChild } from '@/actions/daily';
import { nairobiDay, time, addDays } from '@/lib/day';
import { date } from '@/lib/school';
import { Table, Section, fullName, StudentOptions } from './ui';
function CollectorForm({
  studentId,
  students,
}: {
  studentId?: string;
  students?: { id: string; firstName: string; lastName: string }[];
}) {
  return (
    <ActionForm action={addPickupPerson} label="Add authorised collector">
      <div className="form-grid">
        {studentId ? (
          <Hidden name="studentId" value={studentId} />
        ) : (
          <Field name="studentId" label="Child" required>
            <StudentOptions students={students || []} />
          </Field>
        )}
        <Field name="name" label="Full name (as on ID)" required maxLength={120} />
        <Field
          name="relationship"
          label="Relationship to child"
          required
          maxLength={60}
        />
        <Field name="phone" label="Phone number" type="tel" required maxLength={30} />
        <Field
          name="idNumber"
          label="National ID or passport number"
          required
          maxLength={30}
        />
      </div>
      <p className="small-text muted">
        Staff check this ID at every collection. Only the last four digits are displayed.
      </p>
    </ActionForm>
  );
}
export async function PickupPage() {
  const user = await requireUser(viewers('pickup'));
  const leader = ['admin', 'headteacher'].includes(user.role);
  const today = nairobiDay();
  const onSite = await db.attendance.findMany({
    where: { day: today, status: { in: ['Present', 'Late'] }, ...notCollected },
  });
  const students = await db.student.findMany({
    where: { status: { in: ['Admitted', 'Active'] } },
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true, classLevel: true },
  });
  const [collectors, pending, log] = await Promise.all([
    db.authorizedPickup.findMany({
      where: {
        student: { in: onSite.map((record) => record.student) },
        status: 'Approved',
      },
    }),
    leader
      ? db.authorizedPickup.findMany({
          where: { status: 'Pending' },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    db.pickupRecord.findMany({ where: { day: today }, orderBy: { at: 'desc' } }),
  ]);
  const learner = (id: string) => students.find((student) => student.id === id);
  return (
    <>
      <PageTitle title="Secure child collection">
        Release a child only to an approved collector whose ID matches. Every release and
        refusal is recorded and the parent is notified.
      </PageTitle>
      {pending.length > 0 && (
        <Section title="Collector requests from parents">
          <Table head={['Child', 'Collector', 'Requested', 'Decision']}>
            {pending.map((person) => (
              <tr key={person.id}>
                <td>{fullName(learner(person.student))}</td>
                <td>
                  {person.name} ({person.relationship})
                  <br />
                  {person.phone} · ID …{person.idLast4}
                </td>
                <td>{date(person.createdAt)}</td>
                <td>
                  <div className="inline-actions">
                    {(['Approved', 'Revoked'] as const).map((decision) => (
                      <ActionForm
                        key={decision}
                        action={reviewPickupPerson}
                        label={decision === 'Approved' ? 'Approve' : 'Decline'}
                        className="stack"
                      >
                        <Hidden name="id" value={person.id} />
                        <Hidden name="decision" value={decision} />
                      </ActionForm>
                    ))}
                  </div>
                  <p className="small-text muted">
                    Confirm with the parent by phone before approving.
                  </p>
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
      <Section title={'Children on site now (' + onSite.length + ')'}>
        <Table head={['Child', 'Arrived', 'Release']} empty={!onSite.length}>
          {onSite.map((record) => {
            const child = learner(record.student);
            const allowed = collectors.filter(
              (person) => person.student === record.student,
            );
            return (
              <tr key={record.id}>
                <td>
                  {fullName(child)}
                  <br />
                  <span className="small-text muted">{child?.classLevel}</span>
                </td>
                <td>{time(record.checkInAt)}</td>
                <td>
                  {allowed.length ? (
                    <ActionForm
                      action={releaseChild}
                      label="Verify ID and release"
                      className="stack"
                    >
                      <Hidden name="studentId" value={record.student} />
                      <Hidden name="mode" value="listed" />
                      <Field name="pickupPerson" label="Collector" required>
                        <option value="">Choose</option>
                        {allowed.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name} ({person.relationship}, ID …{person.idLast4})
                          </option>
                        ))}
                      </Field>
                      <Field
                        name="idNumber"
                        label="ID number shown"
                        required
                        maxLength={30}
                      />
                    </ActionForm>
                  ) : (
                    <p className="badge badge-danger">No approved collectors on record</p>
                  )}
                  {leader && (
                    <details>
                      <summary className="small-text">
                        Exception (headteacher/admin only)
                      </summary>
                      <ActionForm
                        action={releaseChild}
                        label="Authorise exception"
                        className="stack"
                      >
                        <Hidden name="studentId" value={record.student} />
                        <Hidden name="mode" value="override" />
                        <Field
                          name="collectorName"
                          label="Collector’s full name"
                          required
                          maxLength={120}
                        />
                        <Field
                          name="notes"
                          label="How the parent confirmed (who you called, when)"
                          type="textarea"
                          required
                          maxLength={1000}
                        />
                      </ActionForm>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Section>
      <Section title="Today’s collection log">
        <Table
          head={['Time', 'Child', 'Collector', 'Verification', 'Outcome']}
          empty={!log.length}
        >
          {log.map((item) => (
            <tr key={item.id}>
              <td>{time(item.at)}</td>
              <td>{fullName(learner(item.student))}</td>
              <td>
                {item.collectorName}
                {item.relationship ? ' (' + item.relationship + ')' : ''}
              </td>
              <td>{item.verification}</td>
              <td>
                <span
                  className={
                    'badge ' +
                    (item.outcome === 'Released' ? 'badge-good' : 'badge-danger')
                  }
                >
                  {item.outcome}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      {leader && (
        <Section title="Add a collector directly (school-verified)">
          <CollectorForm students={students} />
        </Section>
      )}
    </>
  );
}
export async function ParentPickups() {
  const user = await requireUser(['parent']);
  const children = await db.student.findMany({
    where: { parentEmail: user.email },
    select: { id: true, firstName: true, lastName: true },
  });
  const ids = children.map((child) => child.id);
  const [people, history] = await Promise.all([
    db.authorizedPickup.findMany({
      where: { student: { in: ids }, status: { not: 'Revoked' } },
      orderBy: { createdAt: 'asc' },
    }),
    db.pickupRecord.findMany({
      where: { student: { in: ids }, day: { gte: addDays(nairobiDay(), -30) } },
      orderBy: { at: 'desc' },
    }),
  ]);
  return (
    <>
      <PageTitle title="Who can collect my child">
        Add yourself and every person allowed to collect your child. The school confirms
        each new person with you before they can collect.
      </PageTitle>
      {children.map((child) => (
        <Section key={child.id} title={fullName(child)}>
          <Table
            head={['Collector', 'ID', 'Status', '']}
            empty={!people.some((person) => person.student === child.id)}
          >
            {people
              .filter((person) => person.student === child.id)
              .map((person) => (
                <tr key={person.id}>
                  <td>
                    {person.name} ({person.relationship})<br />
                    {person.phone}
                  </td>
                  <td>…{person.idLast4}</td>
                  <td>
                    <span
                      className={
                        'badge ' +
                        (person.status === 'Approved' ? 'badge-good' : 'badge-warn')
                      }
                    >
                      {person.status === 'Pending'
                        ? 'Awaiting school confirmation'
                        : person.status}
                    </span>
                  </td>
                  <td>
                    <ActionForm
                      action={reviewPickupPerson}
                      label="Remove"
                      className="stack"
                    >
                      <Hidden name="id" value={person.id} />
                      <Hidden name="decision" value="Revoked" />
                    </ActionForm>
                  </td>
                </tr>
              ))}
          </Table>
          <CollectorForm studentId={child.id} />
        </Section>
      ))}
      <Section title="Collection history (30 days)">
        <Table
          head={['Date', 'Child', 'Collected by', 'Outcome']}
          empty={!history.length}
        >
          {history.map((item) => (
            <tr key={item.id}>
              <td>
                {item.day} {time(item.at)}
              </td>
              <td>{fullName(children.find((child) => child.id === item.student))}</td>
              <td>{item.collectorName}</td>
              <td>{item.outcome}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
