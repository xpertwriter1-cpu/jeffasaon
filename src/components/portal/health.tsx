import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { viewers } from '@/lib/permissions';
import {
  addImmunization,
  addMedication,
  reportIncident,
  closeIncident,
  updateHealthProfile,
} from '@/actions/daily';
import { saveConsent } from '@/actions/parent';
import { date } from '@/lib/school';
import { vaccines, incidentKinds, consentKinds } from '@/lib/lists';
import { nairobiDay, time, nowHHMM } from '@/lib/day';
import { objectId } from '@/lib/validation';
import { Table, Section, fullName, StudentOptions } from './ui';
type Child = { id: string; firstName: string; lastName: string };
async function consentState(ids: string[]) {
  const all = await db.consent.findMany({
    where: { student: { in: ids } },
    orderBy: { recordedAt: 'desc' },
  });
  return (student: string, kind: string) =>
    all.find((item) => item.student === student && item.kind === kind);
}
function ConsentTable({
  child,
  current,
}: {
  child: Child;
  current: (
    student: string,
    kind: string,
  ) => { granted: boolean; recordedAt: Date } | undefined;
}) {
  return (
    <Table head={['Consent', 'Current decision', 'Change']}>
      {consentKinds.map((kind) => {
        const state = current(child.id, kind);
        return (
          <tr key={kind}>
            <td>{kind}</td>
            <td>
              {state ? (
                <>
                  <span
                    className={'badge ' + (state.granted ? 'badge-good' : 'badge-danger')}
                  >
                    {state.granted ? 'Given' : 'Refused'}
                  </span>{' '}
                  <span className="small-text muted">{date(state.recordedAt)}</span>
                </>
              ) : (
                <span className="badge badge-warn">Not recorded</span>
              )}
            </td>
            <td>
              <ActionForm
                action={saveConsent}
                label={state?.granted ? 'Withdraw' : 'Give consent'}
                className="stack"
              >
                <Hidden name="studentId" value={child.id} />
                <Hidden name="kind" value={kind} />
                <Hidden name="granted" value={state?.granted ? 'no' : 'yes'} />
              </ActionForm>
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
export async function HealthPage({ studentId }: { studentId?: string }) {
  const user = await requireUser(viewers('health'));
  const leader = ['admin', 'headteacher'].includes(user.role);
  const students = await db.student.findMany({
    where: { status: { in: ['Admitted', 'Active'] } },
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true, classLevel: true },
  });
  const [incidents, immunised] = await Promise.all([
    db.incident.findMany({ orderBy: { occurredAt: 'desc' }, take: 60 }),
    db.immunization.findMany({ select: { student: true }, distinct: ['student'] }),
  ]);
  const missing = students.filter(
    (student) => !immunised.some((item) => item.student === student.id),
  );
  const child =
    studentId && objectId.safeParse(studentId).success
      ? await db.student.findUnique({ where: { id: studentId } })
      : null;
  const [shots, medicines, current] = child
    ? await Promise.all([
        db.immunization.findMany({
          where: { student: child.id },
          orderBy: { doseDate: 'desc' },
        }),
        db.medicationLog.findMany({
          where: { student: child.id },
          orderBy: { givenAt: 'desc' },
          take: 30,
        }),
        consentState([child.id]),
      ])
    : [[], [], null];
  const name = (id: string | null) =>
    id ? fullName(students.find((student) => student.id === id)) : 'General / no learner';
  return (
    <>
      <PageTitle title="Health and safeguarding">
        Allergies, medication, immunisation and incident records. Safeguarding concerns go
        to the headteacher and are never sent to parents automatically.
      </PageTitle>
      <form method="get" className="filter-bar no-print">
        <label className="field">
          <span>Open a learner’s health record</span>
          <select name="student" defaultValue={child?.id ?? ''}>
            <StudentOptions students={students} />
          </select>
        </label>
        <button className="button secondary">Open</button>
      </form>
      {child && current && (
        <Section title={'Health record: ' + fullName(child)}>
          {leader ? (
            <ActionForm action={updateHealthProfile} label="Save health profile">
              <Hidden name="studentId" value={child.id} />
              <div className="form-grid">
                <Field
                  name="allergies"
                  label="Allergies"
                  maxLength={1000}
                  defaultValue={child.allergies ?? ''}
                />
                <Field
                  name="medicalConditions"
                  label="Medical conditions"
                  maxLength={1000}
                  defaultValue={child.medicalConditions ?? ''}
                />
                <Field
                  name="medications"
                  label="Regular medication"
                  maxLength={1000}
                  defaultValue={child.medications ?? ''}
                />
                <Field
                  name="dietaryRequirements"
                  label="Dietary requirements"
                  maxLength={1000}
                  defaultValue={child.dietaryRequirements ?? ''}
                />
                <Field
                  name="doctorName"
                  label="Doctor / clinic"
                  maxLength={120}
                  defaultValue={child.doctorName ?? ''}
                />
                <Field
                  name="doctorPhone"
                  label="Doctor phone"
                  maxLength={40}
                  defaultValue={child.doctorPhone ?? ''}
                />
              </div>
            </ActionForm>
          ) : (
            <dl className="record-details">
              {[
                ['Allergies', child.allergies],
                ['Medical conditions', child.medicalConditions],
                ['Regular medication', child.medications],
                ['Dietary requirements', child.dietaryRequirements],
                [
                  'Doctor / clinic',
                  [child.doctorName, child.doctorPhone].filter(Boolean).join(' · '),
                ],
                [
                  'Emergency contact',
                  [child.emergencyName, child.emergencyPhone].filter(Boolean).join(' · '),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || 'None recorded'}</dd>
                </div>
              ))}
            </dl>
          )}
          <h3>Immunisations</h3>
          <Table
            head={['Vaccine', 'Dose date', 'Next due', 'Card seen']}
            empty={!shots.length}
          >
            {shots.map((shot) => (
              <tr key={shot.id}>
                <td>{shot.vaccine}</td>
                <td>{date(shot.doseDate)}</td>
                <td>{shot.nextDue ? date(shot.nextDue) : '—'}</td>
                <td>{shot.cardSeen ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </Table>
          <ActionForm
            action={addImmunization}
            label="Add immunisation"
            className="form-card compact"
          >
            <Hidden name="studentId" value={child.id} />
            <div className="form-grid">
              <label className="field">
                <span>Vaccine *</span>
                <input name="vaccine" list="vaccines" required maxLength={120} />
                <datalist id="vaccines">
                  {vaccines.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
              <Field
                name="doseDate"
                label="Dose date"
                type="date"
                required
                max={nairobiDay()}
              />
              <Field name="nextDue" label="Next dose due" type="date" />
            </div>
            <label className="check">
              <input type="checkbox" name="cardSeen" value="yes" />
              <span>
                I saw the child’s immunisation card (Mother & Child Health booklet)
              </span>
            </label>
          </ActionForm>
          <h3>Medication given at school</h3>
          <Table head={['When', 'Medicine', 'Dose', 'Notes']} empty={!medicines.length}>
            {medicines.map((item) => (
              <tr key={item.id}>
                <td>
                  {date(item.givenAt)} {time(item.givenAt)}
                </td>
                <td>{item.medicine}</td>
                <td>{item.dose}</td>
                <td>{item.notes || ''}</td>
              </tr>
            ))}
          </Table>
          <ActionForm
            action={addMedication}
            label="Record medication"
            className="form-card compact"
          >
            <Hidden name="studentId" value={child.id} />
            <div className="form-grid">
              <Field name="medicine" label="Medicine" required maxLength={120} />
              <Field name="dose" label="Dose" required maxLength={120} />
              <Field
                name="at"
                label="Time given"
                type="time"
                required
                defaultValue={nowHHMM()}
              />
              <Field name="notes" label="Notes" maxLength={1000} />
            </div>
            <label className="check">
              <input type="checkbox" name="parentConsent" value="yes" required />
              <span>The parent authorised this medicine and dose in writing.</span>
            </label>
          </ActionForm>
          <h3>Parent consents</h3>
          <ConsentTable child={child} current={current} />
        </Section>
      )}
      <Section title="Report an incident">
        <ActionForm action={reportIncident} label="Save incident report">
          <div className="form-grid">
            <Field name="studentId" label="Learner (optional)">
              <StudentOptions students={students} placeholder="General / no learner" />
            </Field>
            <Field
              name="day"
              label="Date"
              type="date"
              required
              defaultValue={nairobiDay()}
            />
            <Field name="at" label="Time" type="time" required defaultValue={nowHHMM()} />
            <Field name="kind" label="Type" required>
              {incidentKinds.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </Field>
            <Field name="severity" label="Severity" required>
              {['Minor', 'Moderate', 'Serious'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Field>
          </div>
          <Field
            name="description"
            label="What happened"
            type="textarea"
            required
            maxLength={3000}
          />
          <Field
            name="actionTaken"
            label="Action taken / first aid"
            type="textarea"
            required
            maxLength={3000}
          />
          <label className="check">
            <input type="checkbox" name="notifyParent" value="yes" defaultChecked />
            <span>Notify the parent now (not used for safeguarding concerns)</span>
          </label>
        </ActionForm>
      </Section>
      <Section title="Incident register">
        <Table
          head={['When', 'Learner', 'Type', 'Details', 'Status']}
          empty={!incidents.length}
        >
          {incidents.map((item) => (
            <tr key={item.id}>
              <td>
                {date(item.occurredAt)} {time(item.occurredAt)}
              </td>
              <td>{name(item.student)}</td>
              <td>
                {item.kind}
                <br />
                <span
                  className={
                    'badge ' +
                    (item.severity === 'Serious' || item.kind === 'Safeguarding concern'
                      ? 'badge-danger'
                      : 'badge-warn')
                  }
                >
                  {item.severity}
                </span>
              </td>
              <td className="small-text">
                {item.description.slice(0, 200)}
                <br />
                <em>Action: {item.actionTaken.slice(0, 160)}</em>
                <br />
                Parent notified:{' '}
                {item.parentNotifiedAt ? date(item.parentNotifiedAt) : 'No'}
              </td>
              <td>
                {item.status}
                {leader && item.status === 'Open' && (
                  <ActionForm action={closeIncident} label="Close" className="stack">
                    <Hidden name="id" value={item.id} />
                  </ActionForm>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title={'Learners without an immunisation record (' + missing.length + ')'}>
        <p className="small-text">
          {missing.map((student) => fullName(student)).join(', ') ||
            'All learners have at least one record.'}
        </p>
      </Section>
    </>
  );
}
export async function ParentHealth() {
  const user = await requireUser(['parent']);
  const children = await db.student.findMany({ where: { parentEmail: user.email } });
  const ids = children.map((child) => child.id);
  const [shots, medicines, incidents, current] = await Promise.all([
    db.immunization.findMany({
      where: { student: { in: ids } },
      orderBy: { doseDate: 'desc' },
    }),
    db.medicationLog.findMany({
      where: { student: { in: ids } },
      orderBy: { givenAt: 'desc' },
      take: 50,
    }),
    db.incident.findMany({
      where: { student: { in: ids }, kind: { not: 'Safeguarding concern' } },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    }),
    consentState(ids),
  ]);
  return (
    <>
      <PageTitle title="Health and consent">
        Your child’s health information held by the school, and the permissions you have
        given. Ask the school office to correct anything that is wrong.
      </PageTitle>
      {children.map((child) => (
        <Section key={child.id} title={fullName(child)}>
          <dl className="record-details">
            {[
              ['Allergies', child.allergies],
              ['Medical conditions', child.medicalConditions],
              ['Regular medication', child.medications],
              ['Dietary requirements', child.dietaryRequirements],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || 'None recorded'}</dd>
              </div>
            ))}
          </dl>
          <h3>Immunisations on record</h3>
          <Table
            head={['Vaccine', 'Date', 'Next due']}
            empty={!shots.some((item) => item.student === child.id)}
          >
            {shots
              .filter((item) => item.student === child.id)
              .map((item) => (
                <tr key={item.id}>
                  <td>{item.vaccine}</td>
                  <td>{date(item.doseDate)}</td>
                  <td>{item.nextDue ? date(item.nextDue) : '—'}</td>
                </tr>
              ))}
          </Table>
          <h3>Medication given and incidents</h3>
          <ul className="small-text">
            {medicines
              .filter((item) => item.student === child.id)
              .map((item) => (
                <li key={item.id}>
                  {date(item.givenAt)} {time(item.givenAt)}: {item.medicine} ({item.dose})
                </li>
              ))}
            {incidents
              .filter((item) => item.student === child.id)
              .map((item) => (
                <li key={item.id}>
                  {date(item.occurredAt)}: {item.kind} ({item.severity}). Action:{' '}
                  {item.actionTaken}
                </li>
              ))}
          </ul>
          <h3>Consents</h3>
          <ConsentTable child={child} current={current} />
        </Section>
      ))}
    </>
  );
}
