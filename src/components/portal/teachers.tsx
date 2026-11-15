import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { viewers } from '@/lib/permissions';
import { saveStaffProfile, clockStaff } from '@/actions/school';
import { date } from '@/lib/school';
import { getSettings, activeAccount } from '@/lib/settings';
import { nairobiDay, isDay, time, addDays, dayStart } from '@/lib/day';
import { Filter, Table, Section } from './ui';
const iso = (value?: Date | null) => (value ? nairobiDay(value) : '');
export function ClockPanel({
  userId,
  day,
  record,
}: {
  userId: string;
  day: string;
  record?: { checkInAt: Date | null; checkOutAt: Date | null; status: string } | null;
}) {
  return (
    <div className="inline-actions">
      {!record?.checkInAt && (
        <ActionForm action={clockStaff} label="Clock in" className="stack">
          <Hidden name="user" value={userId} />
          <Hidden name="day" value={day} />
          <Hidden name="mode" value="in" />
        </ActionForm>
      )}
      {record?.checkInAt && !record.checkOutAt && (
        <ActionForm action={clockStaff} label="Clock out" className="stack">
          <Hidden name="user" value={userId} />
          <Hidden name="day" value={day} />
          <Hidden name="mode" value="out" />
        </ActionForm>
      )}
    </div>
  );
}
export async function TeachersPage({ day, staffId }: { day?: string; staffId?: string }) {
  await requireUser(viewers('teachers'));
  const selectedDay = isDay(day) ? day : nairobiDay();
  const settings = await getSettings();
  const staff = await db.user.findMany({
    where: { role: { notIn: ['parent'] }, ...activeAccount },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });
  const [profiles, attendance, classes] = await Promise.all([
    db.staffProfile.findMany(),
    db.staffAttendance.findMany({ where: { day: selectedDay } }),
    db.schoolClass.findMany({ where: { year: settings.currentYear } }),
  ]);
  const soon = dayStart(addDays(nairobiDay(), 60));
  const selected = staff.find((person) => person.id === staffId);
  const profile = profiles.find((item) => item.user === staffId);
  return (
    <>
      <PageTitle title="Teachers and staff">
        Profiles, class allocation, certificates and daily staff attendance.
      </PageTitle>
      <Filter day={selectedDay} />
      <Table
        head={[
          'Staff member',
          'Role',
          'Classes',
          'Certificates',
          'Attendance ' + selectedDay,
          '',
        ]}
        empty={!staff.length}
      >
        {staff.map((person) => {
          const info = profiles.find((item) => item.user === person.id);
          const record = attendance.find((item) => item.user === person.id);
          const assigned = classes.filter(
            (item) =>
              item.teachers.includes(person.id) || item.caregivers.includes(person.id),
          );
          const expiring = [info?.goodConductExpiry, info?.medicalCertExpiry].some(
            (value) => value && value <= soon,
          );
          return (
            <tr key={person.id}>
              <td>
                {person.name}
                <br />
                <span className="small-text muted">
                  {info?.phone || person.phone || person.email}
                </span>
              </td>
              <td>{person.role}</td>
              <td>{assigned.map((item) => item.name).join(', ') || '—'}</td>
              <td>
                {info?.tscNumber && (
                  <div className="small-text">TSC {info.tscNumber}</div>
                )}
                {info?.qualification && (
                  <div className="small-text">{info.qualification}</div>
                )}
                {expiring && <span className="badge badge-warn">Certificate due</span>}
              </td>
              <td>
                {record ? (
                  <>
                    {record.status} {time(record.checkInAt)}–{time(record.checkOutAt)}
                  </>
                ) : (
                  <span className="badge badge-warn">Not recorded</span>
                )}
                <ClockPanel userId={person.id} day={selectedDay} record={record} />
                {!record && (
                  <div className="inline-actions">
                    {(['absent', 'leave'] as const).map((mode) => (
                      <ActionForm
                        key={mode}
                        action={clockStaff}
                        label={mode === 'absent' ? 'Absent' : 'On leave'}
                        className="stack"
                      >
                        <Hidden name="user" value={person.id} />
                        <Hidden name="day" value={selectedDay} />
                        <Hidden name="mode" value={mode} />
                      </ActionForm>
                    ))}
                  </div>
                )}
              </td>
              <td>
                <a href={'/admin/teachers?staff=' + person.id + '#profile'}>
                  Edit profile
                </a>
              </td>
            </tr>
          );
        })}
      </Table>
      {selected && (
        <Section title={'Profile: ' + selected.name} id="profile">
          <ActionForm action={saveStaffProfile} label="Save profile">
            <Hidden name="user" value={selected.id} />
            <div className="form-grid">
              <Field
                name="phone"
                label="Phone"
                type="tel"
                maxLength={40}
                defaultValue={profile?.phone ?? selected.phone ?? ''}
              />
              <Field
                name="idNumber"
                label="National ID number"
                maxLength={30}
                defaultValue={profile?.idNumber ?? ''}
              />
              <Field
                name="tscNumber"
                label="TSC number (teachers)"
                maxLength={30}
                defaultValue={profile?.tscNumber ?? ''}
              />
              <Field
                name="qualification"
                label="Highest ECDE qualification"
                maxLength={200}
                defaultValue={profile?.qualification ?? ''}
              />
              <Field
                name="employmentDate"
                label="Employment date"
                type="date"
                defaultValue={iso(profile?.employmentDate)}
              />
              <Field
                name="emergencyContact"
                label="Emergency contact"
                maxLength={200}
                defaultValue={profile?.emergencyContact ?? ''}
              />
              <Field
                name="goodConductExpiry"
                label="Certificate of good conduct expires"
                type="date"
                defaultValue={iso(profile?.goodConductExpiry)}
              />
              <Field
                name="medicalCertExpiry"
                label="Food handler / medical certificate expires"
                type="date"
                defaultValue={iso(profile?.medicalCertExpiry)}
              />
            </div>
            <Field
              name="notes"
              label="Notes"
              type="textarea"
              maxLength={2000}
              defaultValue={profile?.notes ?? ''}
            />
          </ActionForm>
          <p className="small-text muted">Last updated {date(profile?.updatedAt)}.</p>
        </Section>
      )}
    </>
  );
}
