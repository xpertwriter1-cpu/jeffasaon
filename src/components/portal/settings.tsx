import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/fields';
import { viewers, canEdit } from '@/lib/permissions';
import {
  saveSettings,
  saveTerm,
  saveLicence,
  saveFeeStructure,
  generateInvoices,
} from '@/actions/school';
import { currency, date, feeLabels, programmes } from '@/lib/school';
import { getSettings } from '@/lib/settings';
import { licenceKinds } from '@/lib/lists';
import { nairobiDay, addDays, dayStart } from '@/lib/day';
import { PrintButton } from '@/components/print-button';
import { Table, Section, Stat, fullName } from './ui';
const iso = (value?: Date | null) => (value ? nairobiDay(value) : '');
export async function SettingsPage() {
  await requireUser(viewers('settings'));
  const settings = await getSettings();
  const terms = await db.academicTerm.findMany({
    orderBy: [{ year: 'desc' }, { term: 'asc' }],
    take: 12,
  });
  return (
    <>
      <PageTitle title="School settings">
        School details, current academic year and term, term dates and notification
        preferences.
      </PageTitle>
      <ActionForm action={saveSettings} label="Save school settings">
        <div className="form-grid">
          <Field name="name" label="School name" required defaultValue={settings.name} />
          <Field
            name="phone"
            label="Phone"
            maxLength={40}
            defaultValue={settings.phone ?? ''}
          />
          <Field
            name="email"
            label="Email"
            type="email"
            maxLength={254}
            defaultValue={settings.email ?? ''}
          />
          <Field
            name="location"
            label="Physical location"
            defaultValue={settings.location ?? ''}
          />
          <Field
            name="county"
            label="County"
            defaultValue={settings.county ?? 'Kajiado'}
            maxLength={80}
          />
          <Field
            name="subCounty"
            label="Sub-county / ward"
            defaultValue={settings.subCounty ?? ''}
            maxLength={80}
          />
          <Field
            name="registrationNumber"
            label="Ministry / county registration number"
            defaultValue={settings.registrationNumber ?? ''}
            maxLength={80}
          />
          <Field
            name="currentYear"
            label="Current academic year"
            type="number"
            min={2000}
            max={2100}
            required
            defaultValue={settings.currentYear}
          />
          <Field
            name="currentTerm"
            label="Current term"
            required
            defaultValue={settings.currentTerm}
          >
            {[1, 2, 3].map((term) => (
              <option key={term}>{term}</option>
            ))}
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            name="notifyAbsence"
            value="yes"
            defaultChecked={settings.notifyAbsence}
          />
          <span>Alert parents when a child is marked absent</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="notifyPickup"
            value="yes"
            defaultChecked={settings.notifyPickup}
          />
          <span>Alert parents when a child is collected</span>
        </label>
      </ActionForm>
      <Section title="Term dates">
        <Table head={['Year', 'Term', 'Opens', 'Closes']} empty={!terms.length}>
          {terms.map((term) => (
            <tr key={term.id}>
              <td>{term.year}</td>
              <td>{term.term}</td>
              <td>{date(term.startDate)}</td>
              <td>{date(term.endDate)}</td>
            </tr>
          ))}
        </Table>
        <ActionForm action={saveTerm} label="Save term dates">
          <div className="form-grid">
            <Field
              name="year"
              label="Year"
              type="number"
              required
              defaultValue={settings.currentYear}
              min={2000}
              max={2100}
            />
            <Field name="term" label="Term" required>
              {[1, 2, 3].map((term) => (
                <option key={term}>{term}</option>
              ))}
            </Field>
            <Field name="startDate" label="Opening date" type="date" required />
            <Field name="endDate" label="Closing date" type="date" required />
          </div>
          <p className="small-text muted">
            Use the Ministry of Education calendar for the year. Term dates are used for
            report card attendance totals.
          </p>
        </ActionForm>
      </Section>
    </>
  );
}
export async function FeeStructures() {
  const user = await requireUser(['admin', 'headteacher', 'bursar']);
  const settings = await getSettings();
  const structures = await db.feeStructure.findMany({
    where: { year: settings.currentYear },
    orderBy: [{ term: 'asc' }, { classLevel: 'asc' }],
  });
  const edit = ['admin', 'bursar'].includes(user.role);
  return (
    <Section title={'Fee structures · ' + settings.currentYear}>
      <Table head={['Term', 'Level', 'Items', 'Total']} empty={!structures.length}>
        {structures.map((item) => (
          <tr key={item.id}>
            <td>{item.term}</td>
            <td>{item.classLevel}</td>
            <td className="small-text">
              {item.items
                .map((fee) => fee.label + ' ' + currency(fee.amount))
                .join(' · ')}
            </td>
            <td>{currency(item.items.reduce((sum, fee) => sum + fee.amount, 0))}</td>
          </tr>
        ))}
      </Table>
      {edit && (
        <>
          <ActionForm action={saveFeeStructure} label="Save fee structure">
            <div className="form-grid">
              <Field
                name="year"
                label="Year"
                type="number"
                required
                defaultValue={settings.currentYear}
                min={2000}
                max={2100}
              />
              <Field
                name="term"
                label="Term"
                required
                defaultValue={settings.currentTerm}
              >
                {[1, 2, 3].map((term) => (
                  <option key={term}>{term}</option>
                ))}
              </Field>
              <Field name="classLevel" label="Level" required>
                {programmes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Field>
              {feeLabels.map((label, index) => (
                <Field
                  key={label}
                  name={'fee' + index}
                  label={label + ' (KES)'}
                  type="number"
                  defaultValue="0"
                  min={0}
                  step="0.01"
                />
              ))}
            </div>
          </ActionForm>
          <ActionForm action={generateInvoices} label="Generate invoices for this level">
            <p>
              Creates a term invoice from the fee structure for every admitted or active
              learner in the level who does not have one yet.
            </p>
            <div className="form-grid">
              <Field
                name="year"
                label="Year"
                type="number"
                required
                defaultValue={settings.currentYear}
                min={2000}
                max={2100}
              />
              <Field
                name="term"
                label="Term"
                required
                defaultValue={settings.currentTerm}
              >
                {[1, 2, 3].map((term) => (
                  <option key={term}>{term}</option>
                ))}
              </Field>
              <Field name="classLevel" label="Level" required>
                {programmes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Field>
            </div>
          </ActionForm>
        </>
      )}
    </Section>
  );
}
export async function CompliancePage() {
  const user = await requireUser(viewers('compliance'));
  const today = nairobiDay();
  const soon = dayStart(addDays(today, 60));
  const settings = await getSettings();
  const monday = addDays(today, -7);
  const students = await db.student.findMany({
    where: { status: { in: ['Admitted', 'Active'] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      emergencyPhone: true,
      birthCertificateNumber: true,
      parentPhone: true,
    },
  });
  const ids = students.map((student) => student.id);
  const [
    licences,
    immunised,
    collectors,
    consents,
    attendanceToday,
    meals,
    staff,
    profiles,
    safeguarding,
  ] = await Promise.all([
    db.licenceRecord.findMany({ orderBy: { expiryDate: 'asc' } }),
    db.immunization.findMany({
      where: { student: { in: ids } },
      select: { student: true },
      distinct: ['student'],
    }),
    db.authorizedPickup.findMany({
      where: { student: { in: ids }, status: 'Approved' },
      select: { student: true },
      distinct: ['student'],
    }),
    db.consent.findMany({
      where: { student: { in: ids }, kind: { startsWith: 'Processing of my child' } },
      orderBy: { recordedAt: 'desc' },
    }),
    db.attendance.count({ where: { day: today } }),
    db.mealPlan.count({ where: { day: { gte: monday, lte: today } } }),
    db.user.findMany({
      where: { role: { notIn: ['parent'] } },
      select: { id: true, name: true },
    }),
    db.staffProfile.findMany(),
    db.incident.count({ where: { kind: 'Safeguarding concern', status: 'Open' } }),
  ]);
  const has = (list: { student: string }[]) => new Set(list.map((item) => item.student));
  const immunisedSet = has(immunised);
  const collectorSet = has(collectors);
  const consentGiven = new Set<string>();
  const seen = new Set<string>();
  for (const item of consents) {
    if (seen.has(item.student)) continue;
    seen.add(item.student);
    if (item.granted) consentGiven.add(item.student);
  }
  const gaps = [
    ['No emergency contact phone', students.filter((student) => !student.emergencyPhone)],
    [
      'No immunisation record',
      students.filter((student) => !immunisedSet.has(student.id)),
    ],
    [
      'No birth certificate number',
      students.filter((student) => !student.birthCertificateNumber),
    ],
    [
      'No approved collector',
      students.filter((student) => !collectorSet.has(student.id)),
    ],
    [
      'No data-processing consent',
      students.filter((student) => !consentGiven.has(student.id)),
    ],
  ] as const;
  const staffGaps = staff.filter((person) => {
    const profile = profiles.find((item) => item.user === person.id);
    return (
      !profile?.goodConductExpiry ||
      !profile.medicalCertExpiry ||
      profile.goodConductExpiry <= soon ||
      profile.medicalCertExpiry <= soon
    );
  });
  return (
    <>
      <PageTitle title="Licensing and compliance">
        {settings.county || 'County'} childcare licensing records: children’s records,
        immunisation, emergency contacts, attendance, food provision and staff
        certificates.
      </PageTitle>
      <PrintButton />
      <div className="stats">
        <Stat label="Enrolled learners" value={students.length} />
        <Stat
          label="Attendance records today"
          value={attendanceToday + ' / ' + students.length}
          tone={attendanceToday < students.length ? 'warn' : 'good'}
        />
        <Stat
          label="Menu entries in the last 7 days"
          value={meals}
          tone={meals ? 'good' : 'warn'}
        />
        <Stat
          label="Open safeguarding concerns"
          value={safeguarding}
          tone={safeguarding ? 'warn' : 'good'}
        />
        <Stat
          label="Staff certificate gaps"
          value={staffGaps.length}
          tone={staffGaps.length ? 'warn' : 'good'}
        />
      </div>
      <Section title="Licences, permits and certificates">
        <Table
          head={['Record', 'Number', 'Issued by', 'Issued', 'Expires']}
          empty={!licences.length}
        >
          {licences.map((item) => (
            <tr key={item.id}>
              <td>
                {item.kind}
                {item.notes && <div className="small-text muted">{item.notes}</div>}
              </td>
              <td>{item.number || '—'}</td>
              <td>{item.issuedBy || '—'}</td>
              <td>{item.issueDate ? date(item.issueDate) : '—'}</td>
              <td>
                {item.expiryDate ? date(item.expiryDate) : '—'}{' '}
                {item.expiryDate && item.expiryDate <= soon && (
                  <span
                    className={
                      'badge ' +
                      (item.expiryDate < new Date() ? 'badge-danger' : 'badge-warn')
                    }
                  >
                    {item.expiryDate < new Date() ? 'Expired' : 'Renew soon'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {canEdit(user.role, 'compliance') && (
          <ActionForm action={saveLicence} label="Add licence record">
            <div className="form-grid">
              <Field name="kind" label="Record type" required>
                {licenceKinds.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </Field>
              <Field name="number" label="Licence / certificate number" maxLength={100} />
              <Field name="issuedBy" label="Issued by" maxLength={200} />
              <Field name="issueDate" label="Issue date" type="date" />
              <Field name="expiryDate" label="Expiry date" type="date" />
              <Field
                name="notes"
                label="Notes (inspection remarks, conditions)"
                maxLength={1000}
              />
            </div>
          </ActionForm>
        )}
      </Section>
      <Section title="Children’s records: gaps to close">
        <Table head={['Requirement', 'Learners missing it']}>
          {gaps.map(([label, list]) => (
            <tr key={label}>
              <td>
                {label}{' '}
                <span className={'badge ' + (list.length ? 'badge-warn' : 'badge-good')}>
                  {list.length}
                </span>
              </td>
              <td className="small-text">
                {list.map((student) => fullName(student)).join(', ') || 'Complete'}
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Staff certificates missing or due within 60 days">
        <p className="small-text">
          {staffGaps.map((person) => person.name).join(', ') ||
            'All staff certificates are current.'}
        </p>
      </Section>
      <p className="small-text muted">
        Confirm current requirements with the {settings.county || 'county'} Department of
        Education / ECDE and public health office. Generated {date(new Date())}.
      </p>
    </>
  );
}
