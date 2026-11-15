import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/fields';
import { viewers } from '@/lib/permissions';
import { saveMealPlan } from '@/actions/daily';
import { programmes } from '@/lib/school';
import { mealNames } from '@/lib/lists';
import { nairobiDay, isDay, addDays, weekdayOf, time } from '@/lib/day';
import { Filter, Table, Section, fullName } from './ui';
export async function MealsPage({ day }: { day?: string }) {
  await requireUser(viewers('meals'));
  const selectedDay = isDay(day) ? day : nairobiDay();
  const monday = addDays(selectedDay, 1 - weekdayOf(selectedDay));
  const week = [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
  const [plans, diets, feeding] = await Promise.all([
    db.mealPlan.findMany({ where: { day: { in: week } } }),
    db.student.findMany({
      where: {
        status: { in: ['Admitted', 'Active'] },
        OR: [{ allergies: { not: null } }, { dietaryRequirements: { not: null } }],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        classLevel: true,
        allergies: true,
        dietaryRequirements: true,
      },
    }),
    db.careLog.findMany({
      where: { day: selectedDay, kind: 'Meal' },
      orderBy: { at: 'asc' },
    }),
  ]);
  const flagged = diets.filter(
    (student) => student.allergies || student.dietaryRequirements,
  );
  const learners = await db.student.findMany({
    where: { id: { in: feeding.map((item) => item.student) } },
    select: { id: true, firstName: true, lastName: true },
  });
  return (
    <>
      <PageTitle title="Meals and feeding">
        Weekly menu, dietary requirements and feeding records. These form the food
        provision records required for county licensing inspections.
      </PageTitle>
      <Filter day={selectedDay} />
      <Section title={'Menu for the week of ' + monday}>
        <Table head={['Meal', ...week]}>
          {mealNames.map((meal) => (
            <tr key={meal}>
              <td>{meal}</td>
              {week.map((item) => (
                <td key={item}>
                  {plans
                    .filter((plan) => plan.day === item && plan.meal === meal)
                    .map((plan) => (
                      <div key={plan.id} className="small-text">
                        {plan.classLevel !== 'All' && (
                          <strong>{plan.classLevel}: </strong>
                        )}
                        {plan.menu}
                      </div>
                    ))}
                </td>
              ))}
            </tr>
          ))}
        </Table>
        <ActionForm action={saveMealPlan} label="Save menu item">
          <div className="form-grid">
            <Field
              name="day"
              label="Date"
              type="date"
              required
              defaultValue={selectedDay}
            />
            <Field name="meal" label="Meal" required>
              {mealNames.map((meal) => (
                <option key={meal}>{meal}</option>
              ))}
            </Field>
            <Field name="classLevel" label="For" required defaultValue="All">
              {['All', ...programmes].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Field>
            <Field name="menu" label="Menu" required maxLength={500} />
            <Field name="notes" label="Allergen notes" maxLength={500} />
          </div>
        </ActionForm>
      </Section>
      <Section title="Dietary requirements and allergies">
        <Table
          head={['Learner', 'Level', 'Allergies', 'Dietary requirements']}
          empty={!flagged.length}
        >
          {flagged.map((student) => (
            <tr key={student.id}>
              <td>{fullName(student)}</td>
              <td>{student.classLevel}</td>
              <td>{student.allergies || '—'}</td>
              <td>{student.dietaryRequirements || '—'}</td>
            </tr>
          ))}
        </Table>
        <p className="small-text muted">
          Update a learner’s allergies or diet from the Health page.
        </p>
      </Section>
      <Section title={'Feeding records for ' + selectedDay}>
        <Table head={['Time', 'Learner', 'Eaten', 'Notes']} empty={!feeding.length}>
          {feeding.map((item) => (
            <tr key={item.id}>
              <td>{time(item.at)}</td>
              <td>{fullName(learners.find((learner) => learner.id === item.student))}</td>
              <td>{item.amount || '—'}</td>
              <td>{item.details || ''}</td>
            </tr>
          ))}
        </Table>
        <p className="small-text muted">
          Record what each child ate from the Daycare care page (type “Meal”).
        </p>
      </Section>
    </>
  );
}
