'use server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { objectId, strings } from '@/lib/validation';
import { consentKinds } from '@/lib/lists';
import { assert } from '@/lib/settings';
// Consents are append-only: the newest entry per kind is the current decision,
// and the history shows who changed it and when.
export async function saveConsent(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent', 'admin', 'headteacher']);
    const values = z
      .object({
        studentId: objectId,
        kind: z.enum(consentKinds),
        granted: z.enum(['yes', 'no']),
      })
      .parse(strings(form));
    const student = await db.student.findFirst({
      where: {
        id: values.studentId,
        ...(user.role === 'parent' ? { parentEmail: user.email } : {}),
      },
    });
    assert(student, 'Learner not found.');
    await db.consent.create({
      data: {
        student: student.id,
        kind: values.kind,
        granted: values.granted === 'yes',
        recordedBy: user.id,
      },
    });
    return { success: 'Consent updated.' };
  });
}
