import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { viewers } from '@/lib/permissions';
import { saveLesson, addObservation, saveAssessments } from '@/actions/learning';
import { programmes, date } from '@/lib/school';
import {
  areasFor,
  cbcAreas,
  earlyYearsAreas,
  cbcLevels,
  coreCompetencies,
  isCbcLevel,
} from '@/lib/cbc';
import { getSettings } from '@/lib/settings';
import { nairobiDay } from '@/lib/day';
import { Filter, Table, Section, fullName, levelParam, StudentOptions } from './ui';
const allStrands = [
  ...new Set([
    ...Object.values(cbcAreas).flat(),
    ...Object.values(earlyYearsAreas).flat(),
  ]),
];
function AreaSelect({ level, defaultValue }: { level?: string; defaultValue?: string }) {
  const groups = level
    ? [
        [
          isCbcLevel(level) ? 'CBC learning areas' : 'Early years areas',
          areasFor(level),
        ] as const,
      ]
    : [
        ['CBC learning areas (PP1, PP2)', cbcAreas] as const,
        ['Early years areas (Daycare, Playgroup)', earlyYearsAreas] as const,
      ];
  return (
    <Field name="learningArea" label="Learning area" required defaultValue={defaultValue}>
      <option value="">Choose</option>
      {groups.map(([label, areas]) => (
        <optgroup key={label} label={label}>
          {Object.keys(areas).map((area) => (
            <option key={area}>{area}</option>
          ))}
        </optgroup>
      ))}
    </Field>
  );
}
function StrandInput({
  name = 'strand',
  label = 'Strand',
  required = true,
}: {
  name?: string;
  label?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <input name={name} list="strands" required={required} maxLength={120} />
      <datalist id="strands">
        {allStrands.map((strand) => (
          <option key={strand} value={strand} />
        ))}
      </datalist>
    </label>
  );
}
export async function LearningPage({ level }: { level?: string }) {
  await requireUser(viewers('learning'));
  const selected = levelParam(level);
  const [lessons, students, observations] = await Promise.all([
    db.lesson.findMany({
      where: selected ? { classLevel: selected } : {},
      orderBy: { day: 'desc' },
      take: 60,
    }),
    db.student.findMany({
      where: {
        status: { in: ['Admitted', 'Active'] },
        ...(selected ? { classLevel: selected } : {}),
      },
      orderBy: { firstName: 'asc' },
      select: { id: true, firstName: true, lastName: true, classLevel: true },
    }),
    db.observation.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
  ]);
  return (
    <>
      <PageTitle title="Learning management">
        Lesson plans and activities by CBC learning area and strand, and day-to-day
        teacher observations.
      </PageTitle>
      <Filter level={level || ''} />
      <Section title="Plan a lesson or activity">
        <ActionForm action={saveLesson} label="Save lesson plan">
          <div className="form-grid">
            <Field name="classLevel" label="Class level" required defaultValue={selected}>
              {programmes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Field>
            <Field
              name="day"
              label="Date"
              type="date"
              required
              defaultValue={nairobiDay()}
            />
            <AreaSelect level={selected} />
            <StrandInput />
            <StrandInput name="subStrand" label="Sub-strand" required={false} />
            <Field
              name="title"
              label="Lesson / activity title"
              required
              maxLength={200}
            />
          </div>
          <Field
            name="outcomes"
            label="Specific learning outcomes"
            type="textarea"
            maxLength={2000}
          />
          <Field
            name="activities"
            label="Learning experiences and activities"
            type="textarea"
            maxLength={3000}
          />
          <Field name="resources" label="Resources" type="textarea" maxLength={1000} />
        </ActionForm>
      </Section>
      <Section title="Recent lesson plans">
        <Table
          head={['Date', 'Level', 'Area / strand', 'Lesson']}
          empty={!lessons.length}
        >
          {lessons.map((lesson) => (
            <tr key={lesson.id}>
              <td>{lesson.day}</td>
              <td>{lesson.classLevel}</td>
              <td>
                {lesson.learningArea}
                <br />
                <span className="small-text">
                  {lesson.strand}
                  {lesson.subStrand ? ' › ' + lesson.subStrand : ''}
                </span>
              </td>
              <td>
                <strong>{lesson.title}</strong>
                {lesson.outcomes && (
                  <p className="small-text preserve-lines">{lesson.outcomes}</p>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Record an observation">
        <ActionForm action={addObservation} label="Save observation">
          <div className="form-grid">
            <Field name="studentId" label="Learner" required>
              <StudentOptions students={students} />
            </Field>
            <AreaSelect level={selected} />
          </div>
          <Field
            name="note"
            label="What did you observe?"
            type="textarea"
            required
            maxLength={2000}
          />
          <label className="check">
            <input type="checkbox" name="sharedWithParent" value="yes" />
            <span>Share with the parent in the daily report</span>
          </label>
        </ActionForm>
      </Section>
      <Section title="Recent observations">
        <Table
          head={['Date', 'Learner', 'Area', 'Observation', 'Shared']}
          empty={!observations.length}
        >
          {observations.map((item) => (
            <tr key={item.id}>
              <td>{item.day}</td>
              <td>{fullName(students.find((student) => student.id === item.student))}</td>
              <td>{item.learningArea}</td>
              <td className="preserve-lines">{item.note}</td>
              <td>{item.sharedWithParent ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
export async function AssessmentPage({
  level,
  year,
  term,
}: {
  level?: string;
  year?: string;
  term?: string;
}) {
  await requireUser(viewers('assessment'));
  const settings = await getSettings();
  const selected = levelParam(level) || 'PP1';
  const period = {
    year: Number(year) || settings.currentYear,
    term: [1, 2, 3].includes(Number(term)) ? Number(term) : settings.currentTerm,
  };
  const students = await db.student.findMany({
    where: { status: { in: ['Admitted', 'Active'] }, classLevel: selected },
    orderBy: { firstName: 'asc' },
    select: { id: true, firstName: true, lastName: true },
  });
  const records = await db.competencyAssessment.findMany({
    where: { ...period, student: { in: students.map((student) => student.id) } },
    orderBy: { assessedOn: 'desc' },
  });
  const areas = Object.keys(areasFor(selected));
  return (
    <>
      <PageTitle title="Learner assessment">
        Continuous competency-based assessment. Rate each strand as{' '}
        {cbcLevels.map((item) => item.code + ' (' + item.label + ')').join(', ')}.
      </PageTitle>
      <Filter
        level={selected}
        allLevels={false}
        extra={
          <>
            <label className="field">
              <span>Year</span>
              <input
                type="number"
                name="year"
                defaultValue={period.year}
                min={2000}
                max={2100}
              />
            </label>
            <label className="field">
              <span>Term</span>
              <select name="term" defaultValue={period.term}>
                {[1, 2, 3].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </>
        }
      />
      <Section title={'Assess a strand for ' + selected}>
        {students.length ? (
          <ActionForm action={saveAssessments} label="Save assessments">
            <Hidden name="classLevel" value={selected} />
            <Hidden name="year" value={String(period.year)} />
            <Hidden name="term" value={String(period.term)} />
            <div className="form-grid">
              <AreaSelect level={selected} />
              <StrandInput />
              <Field
                name="assessedOn"
                label="Date assessed"
                type="date"
                required
                defaultValue={nairobiDay()}
              />
            </div>
            <Table head={['Learner', 'Level', 'Evidence / comment']}>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>{fullName(student)}</td>
                  <td>
                    <select
                      name={'level_' + student.id}
                      defaultValue=""
                      aria-label={'Level for ' + fullName(student)}
                    >
                      <option value="">Not assessed</option>
                      {cbcLevels.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code} – {item.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      name={'comment_' + student.id}
                      maxLength={300}
                      aria-label={'Comment for ' + fullName(student)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </ActionForm>
        ) : (
          <p className="empty">No enrolled learners in {selected}.</p>
        )}
      </Section>
      <Section title={'Progress summary · ' + period.year + ' Term ' + period.term}>
        <p className="small-text muted">
          Most recent level per learning area. Core competencies to observe:{' '}
          {coreCompetencies.join(', ')}.
        </p>
        <Table head={['Learner', ...areas]} empty={!students.length}>
          {students.map((student) => (
            <tr key={student.id}>
              <td>{fullName(student)}</td>
              {areas.map((area) => {
                const latest = records.find(
                  (item) => item.student === student.id && item.learningArea === area,
                );
                return (
                  <td key={area}>
                    {latest ? latest.level + ' · ' + latest.strand : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
export async function ParentLearning() {
  const user = await requireUser(['parent']);
  const children = await db.student.findMany({
    where: { parentEmail: user.email },
    select: { id: true, firstName: true, lastName: true, classLevel: true },
  });
  const ids = children.map((child) => child.id);
  const [observations, assessments] = await Promise.all([
    db.observation.findMany({
      where: { student: { in: ids }, sharedWithParent: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.competencyAssessment.findMany({
      where: { student: { in: ids } },
      orderBy: { assessedOn: 'desc' },
      take: 200,
    }),
  ]);
  return (
    <>
      <PageTitle title="Learning and progress">
        Teacher notes and competency assessments shared with you.
      </PageTitle>
      {children.map((child) => (
        <Section key={child.id} title={fullName(child)}>
          <Table
            head={['Date', 'Learning area', 'Strand', 'Level', 'Comment']}
            empty={!assessments.some((item) => item.student === child.id)}
          >
            {assessments
              .filter((item) => item.student === child.id)
              .map((item) => (
                <tr key={item.id}>
                  <td>{date(item.assessedOn)}</td>
                  <td>{item.learningArea}</td>
                  <td>{item.strand}</td>
                  <td>
                    {cbcLevels.find((level) => level.code === item.level)?.label ||
                      item.level}
                  </td>
                  <td>{item.comment || ''}</td>
                </tr>
              ))}
          </Table>
          {observations
            .filter((item) => item.student === child.id)
            .map((item) => (
              <p key={item.id} className="small-text">
                <strong>
                  {item.day} · {item.learningArea}:
                </strong>{' '}
                {item.note}
              </p>
            ))}
        </Section>
      ))}
    </>
  );
}
