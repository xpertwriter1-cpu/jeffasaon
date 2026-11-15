'use server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { editors } from '@/lib/permissions';
import { objectId, period, strings } from '@/lib/validation';
import { programmes } from '@/lib/school';
import { allAreas, cbcLevels } from '@/lib/cbc';
import { dayField, optionalText, requiredText, flag, assert } from '@/lib/settings';
import { dayStart, nairobiDay } from '@/lib/day';
const area = z
  .string()
  .refine((value) => allAreas.includes(value), 'Choose a learning area.');
export async function saveLesson(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('learning'));
    const values = z
      .object({
        classLevel: z.enum(programmes),
        day: dayField,
        learningArea: area,
        strand: requiredText(120),
        subStrand: optionalText(120),
        title: requiredText(200),
        outcomes: optionalText(2000),
        activities: optionalText(3000),
        resources: optionalText(1000),
        reflection: optionalText(2000),
      })
      .parse(strings(form));
    await db.lesson.create({ data: { ...values, by: user.id } });
    return { success: 'Lesson plan saved.' };
  });
}
export async function addObservation(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('learning'));
    const values = z
      .object({
        studentId: objectId,
        learningArea: area,
        note: requiredText(2000),
        sharedWithParent: flag,
      })
      .parse(strings(form));
    const student = await db.student.findUnique({ where: { id: values.studentId } });
    assert(student, 'Learner not found.');
    await db.observation.create({
      data: {
        student: student.id,
        day: nairobiDay(),
        learningArea: values.learningArea,
        note: values.note,
        sharedWithParent: values.sharedWithParent,
        by: user.id,
      },
    });
    return { success: 'Observation saved.' };
  });
}
// Record one strand for a whole class in one submission (level_<studentId> fields).
export async function saveAssessments(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('assessment'));
    const values = strings(form);
    const term = period.parse(values);
    const meta = z
      .object({
        learningArea: area,
        strand: requiredText(120),
        assessedOn: dayField,
        classLevel: z.enum(programmes),
      })
      .parse(values);
    const codes = cbcLevels.map((level) => level.code as string);
    const entries = Object.entries(values)
      .filter(([key, value]) => key.startsWith('level_') && value)
      .map(([key, level]) => {
        const student = objectId.parse(key.slice(6));
        assert(codes.includes(level), 'Choose EE, ME, AE or BE.');
        return { student, level, comment: values['comment_' + student] || undefined };
      });
    assert(entries.length, 'Rate at least one learner.');
    const learners = await db.student.count({
      where: {
        id: { in: entries.map((entry) => entry.student) },
        classLevel: meta.classLevel,
      },
    });
    assert(
      learners === entries.length,
      'Every learner must belong to ' + meta.classLevel + '.',
    );
    await db.competencyAssessment.createMany({
      data: entries.map((entry) => ({
        ...entry,
        ...term,
        learningArea: meta.learningArea,
        strand: meta.strand,
        assessedOn: dayStart(meta.assessedOn),
        by: user.id,
      })),
    });
    return { success: entries.length + ' assessment(s) saved.' };
  });
}
