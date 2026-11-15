import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { canEdit } from '@/lib/permissions';
import { saveSlot, deleteSlot } from '@/actions/daily';
import { programmes } from '@/lib/school';
import { weekdays } from '@/lib/day';
import { allAreas } from '@/lib/cbc';
import { Filter, levelParam } from './ui';
export async function TimetablePage({
  level,
  parent,
}: {
  level?: string;
  parent: boolean;
}) {
  const user = await requireUser(
    parent ? ['parent'] : ['admin', 'headteacher', 'teacher', 'caregiver'],
  );
  let selected = levelParam(level);
  if (!selected && parent) {
    const child = await db.student.findFirst({
      where: { parentEmail: user.email },
      select: { classLevel: true },
    });
    selected = levelParam(child?.classLevel);
  }
  selected = selected || 'PP1';
  const slots = await db.timetableSlot.findMany({
    where: { classLevel: selected },
    orderBy: { start: 'asc' },
  });
  const edit = !parent && canEdit(user.role, 'timetable');
  return (
    <>
      <PageTitle title={'Daily timetable · ' + selected}>
        Daily schedule and class activities, Monday to Friday.
      </PageTitle>
      <Filter level={selected} allLevels={false} />
      <div className="timetable-grid">
        {weekdays.map((name, index) => (
          <div className="day" key={name}>
            <h2 className="h3">{name}</h2>
            {slots
              .filter((slot) => slot.weekday === index + 1)
              .map((slot) => (
                <div className="slot" key={slot.id}>
                  <strong>
                    {slot.start}–{slot.end}
                  </strong>{' '}
                  {slot.activity}
                  {slot.learningArea && (
                    <div className="small-text muted">{slot.learningArea}</div>
                  )}
                  {edit && (
                    <ActionForm action={deleteSlot} label="Remove" className="stack">
                      <Hidden name="id" value={slot.id} />
                    </ActionForm>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
      {edit && (
        <ActionForm action={saveSlot} label="Add activity">
          <div className="form-grid">
            <Field name="classLevel" label="Class level" required defaultValue={selected}>
              {programmes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Field>
            <Field name="weekday" label="Day" required>
              {weekdays.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </Field>
            <Field name="start" label="Start" type="time" required />
            <Field name="end" label="End" type="time" required />
            <Field
              name="activity"
              label="Activity (e.g. Circle time, Snack, Nap)"
              required
              maxLength={120}
            />
            <Field name="learningArea" label="Learning area (optional)">
              <option value="">—</option>
              {allAreas.map((area) => (
                <option key={area}>{area}</option>
              ))}
            </Field>
          </div>
        </ActionForm>
      )}
    </>
  );
}
