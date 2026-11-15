import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { canEdit, viewers } from '@/lib/permissions';
import { programmes } from '@/lib/school';
import { getSettings, activeAccount } from '@/lib/settings';
import { saveClass, assignClass, promoteLevel } from '@/actions/school';
import { Filter, Table, Section, fullName, levelParam } from './ui';
export async function ClassesPage({ level }: { level?: string }) {
  const user = await requireUser(viewers('classes'));
  const settings = await getSettings();
  const selected = levelParam(level);
  const [classes, staff, students] = await Promise.all([
    db.schoolClass.findMany({
      where: { year: settings.currentYear },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    }),
    db.user.findMany({
      where: { role: { in: ['teacher', 'headteacher', 'caregiver'] }, ...activeAccount },
      select: { id: true, name: true, role: true },
    }),
    db.student.findMany({
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
        classId: true,
      },
    }),
  ]);
  const edit = canEdit(user.role, 'classes');
  const staffName = (id: string) =>
    staff.find((person) => person.id === id)?.name || 'Former staff';
  return (
    <>
      <PageTitle title="Class management">
        Day Care, Playgroup, PP1 and PP2 classes for {settings.currentYear}, their staff
        and learners.
      </PageTitle>
      <Table
        head={['Class', 'Level', 'Room', 'Teachers', 'Caregivers', 'Learners']}
        empty={!classes.length}
      >
        {classes.map((item) => {
          const count = students.filter((student) => student.classId === item.id).length;
          return (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.level}</td>
              <td>{item.room || '—'}</td>
              <td>{item.teachers.map(staffName).join(', ') || '—'}</td>
              <td>{item.caregivers.map(staffName).join(', ') || '—'}</td>
              <td>
                {count}
                {item.capacity ? ' / ' + item.capacity : ''}
              </td>
            </tr>
          );
        })}
      </Table>
      {edit && (
        <Section title="Create a class">
          <ActionForm action={saveClass} label="Create class">
            <div className="form-grid">
              <Field
                name="name"
                label="Class name (e.g. PP1 Sunflowers)"
                required
                maxLength={80}
              />
              <Field name="level" label="Level" required>
                {programmes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Field>
              <Field
                name="year"
                label="Year"
                type="number"
                defaultValue={settings.currentYear}
                min={2000}
                max={2100}
                required
              />
              <Field name="room" label="Room" maxLength={80} />
              <Field name="capacity" label="Capacity" type="number" min={1} max={200} />
              <label className="field">
                <span>Teachers and caregivers (hold Ctrl to pick several)</span>
                <select name="staff" multiple size={5}>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ({person.role})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </ActionForm>
        </Section>
      )}
      <Section title="Learner allocation">
        <Filter level={level || ''} />
        <Table
          head={['Learner', 'Level', 'Class', ...(edit ? ['Change'] : [])]}
          empty={!students.length}
        >
          {students.map((student) => (
            <tr key={student.id}>
              <td>{fullName(student)}</td>
              <td>{student.classLevel}</td>
              <td>
                {classes.find((item) => item.id === student.classId)?.name || (
                  <span className="badge badge-warn">Not allocated</span>
                )}
              </td>
              {edit && (
                <td>
                  <div className="inline-actions">
                    <ActionForm action={assignClass} label="Allocate" className="stack">
                      <Hidden name="studentId" value={student.id} />
                      <Field
                        name="classId"
                        label="Class"
                        required
                        defaultValue={student.classId ?? ''}
                      >
                        <option value="">Choose</option>
                        {classes
                          .filter((item) => item.level === student.classLevel)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                      </Field>
                    </ActionForm>
                    <ActionForm
                      action={promoteLevel}
                      label="Change level"
                      className="stack"
                    >
                      <Hidden name="studentId" value={student.id} />
                      <Field
                        name="classLevel"
                        label="Move to level"
                        defaultValue={student.classLevel}
                      >
                        {programmes.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </Field>
                    </ActionForm>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
