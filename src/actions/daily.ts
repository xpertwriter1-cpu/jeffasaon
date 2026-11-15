'use server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { editors } from '@/lib/permissions';
import { objectId, phone, strings, UserError } from '@/lib/validation';
import { programmes } from '@/lib/school';
import {
  getSettings,
  dayField,
  optionalDate,
  optionalText,
  requiredText,
  flag,
  assert,
  notCollected,
} from '@/lib/settings';
import { nairobiDay, atTime, time, dayStart } from '@/lib/day';
import { alertParents } from '@/lib/notify';
import { hashId, idMatches, normalizeId } from '@/lib/pickup';
import { careKinds, incidentKinds, mealNames } from '@/lib/lists';
const leaders = ['admin', 'headteacher'];
const enrolled = ['Admitted', 'Active'];
async function enrolledStudent(id: string) {
  const student = await db.student.findUnique({ where: { id: objectId.parse(id) } });
  assert(
    student && enrolled.includes(student.status),
    'Choose an admitted or active learner.',
  );
  return student;
}
function checkDay(role: string, day: string) {
  if (day !== nairobiDay() && !leaders.includes(role))
    throw new UserError(
      'Only the headteacher or administrator can change records for another day.',
    );
}
const name = (student: { firstName: string; lastName: string }) =>
  student.firstName + ' ' + student.lastName;
// ---------- Attendance ----------
export async function checkIn(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('attendance'));
    const values = z
      .object({
        studentId: objectId,
        day: dayField,
        droppedOffBy: optionalText(120),
        late: flag,
        notes: optionalText(500),
      })
      .parse(strings(form));
    checkDay(user.role, values.day);
    const student = await enrolledStudent(values.studentId);
    const where = { student_day: { student: student.id, day: values.day } };
    const existing = await db.attendance.findUnique({ where });
    assert(!existing?.checkOutAt, 'This learner has already been collected today.');
    const data = {
      status: values.late ? 'Late' : 'Present',
      checkInAt: existing?.checkInAt ?? new Date(),
      checkInBy: user.id,
      droppedOffBy: values.droppedOffBy,
      notes: values.notes,
      classLevel: student.classLevel,
      absenceReason: null,
      updatedAt: new Date(),
    };
    await db.attendance.upsert({
      where,
      create: { student: student.id, day: values.day, ...data },
      update: data,
    });
    return { success: name(student) + ' checked in.' };
  });
}
export async function markAbsent(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('attendance'));
    const values = z
      .object({ studentId: objectId, day: dayField, reason: optionalText(300) })
      .parse(strings(form));
    checkDay(user.role, values.day);
    const student = await enrolledStudent(values.studentId);
    const where = { student_day: { student: student.id, day: values.day } };
    const existing = await db.attendance.findUnique({ where });
    assert(
      !existing?.checkInAt,
      'This learner was checked in. Correct the record instead of marking absent.',
    );
    await db.attendance.upsert({
      where,
      create: {
        student: student.id,
        day: values.day,
        classLevel: student.classLevel,
        status: 'Absent',
        absenceReason: values.reason,
      },
      update: { status: 'Absent', absenceReason: values.reason, updatedAt: new Date() },
    });
    const settings = await getSettings();
    if (
      settings.notifyAbsence &&
      existing?.status !== 'Absent' &&
      values.day === nairobiDay()
    )
      await alertParents(
        student.id,
        name(student) + ' is marked absent today',
        settings.name +
          ': ' +
          student.firstName +
          ' has been marked absent today (' +
          values.day +
          '). If this is unexpected, please call the school on ' +
          (settings.phone || '') +
          '.',
        'absence:' + student.id + ':' + values.day,
      );
    return { success: name(student) + ' marked absent.' };
  });
}
// ---------- Authorised collection ----------
export async function addPickupPerson(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent', 'admin', 'headteacher']);
    const values = z
      .object({
        studentId: objectId,
        name: requiredText(120),
        relationship: requiredText(60),
        phone,
        idNumber: z
          .string()
          .transform(normalizeId)
          .pipe(z.string().regex(/^[A-Z0-9]{5,20}$/, 'Enter the ID or passport number.')),
      })
      .parse(strings(form));
    const student = await db.student.findFirst({
      where: {
        id: values.studentId,
        ...(user.role === 'parent' ? { parentEmail: user.email } : {}),
      },
    });
    assert(student, 'Learner not found.');
    const staff = user.role !== 'parent';
    await db.authorizedPickup.create({
      data: {
        student: student.id,
        name: values.name,
        relationship: values.relationship,
        phone: values.phone,
        idLast4: values.idNumber.slice(-4),
        idHash: hashId(values.idNumber),
        requestedBy: user.id,
        status: staff ? 'Approved' : 'Pending',
        ...(staff ? { approvedBy: user.id, approvedAt: new Date() } : {}),
      },
    });
    return {
      success: staff
        ? values.name + ' can now collect ' + student.firstName + '.'
        : 'Request sent. The school will confirm ' +
          values.name +
          ' before they can collect ' +
          student.firstName +
          '.',
    };
  });
}
export async function reviewPickupPerson(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent', 'admin', 'headteacher']);
    const values = z
      .object({ id: objectId, decision: z.enum(['Approved', 'Revoked']) })
      .parse(strings(form));
    const person = await db.authorizedPickup.findUnique({ where: { id: values.id } });
    assert(person, 'Record not found.');
    if (user.role === 'parent') {
      // Parents may withdraw someone from their own child's list, never approve.
      const own = await db.student.findFirst({
        where: { id: person.student, parentEmail: user.email },
      });
      assert(
        own && values.decision === 'Revoked',
        'Only the school can approve collection.',
      );
    }
    await db.authorizedPickup.update({
      where: { id: person.id },
      data: {
        status: values.decision,
        ...(values.decision === 'Approved'
          ? { approvedBy: user.id, approvedAt: new Date() }
          : {}),
      },
    });
    return { success: person.name + ' ' + values.decision.toLowerCase() + '.' };
  });
}
export async function releaseChild(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('pickup'));
    const values = z
      .object({
        studentId: objectId,
        mode: z.enum(['listed', 'override']),
        pickupPerson: z.string().optional(),
        idNumber: z.string().max(30).optional(),
        collectorName: optionalText(120),
        notes: optionalText(1000),
      })
      .parse(strings(form));
    const day = nairobiDay();
    const student = await enrolledStudent(values.studentId);
    const where = { student_day: { student: student.id, day } };
    const attendance = await db.attendance.findUnique({ where });
    assert(attendance?.checkInAt, student.firstName + ' was not checked in today.');
    assert(!attendance.checkOutAt, student.firstName + ' has already been collected.');
    let collector: string,
      relationship: string | undefined,
      verification: string,
      person: string | undefined;
    if (values.mode === 'listed') {
      const listed = objectId.safeParse(values.pickupPerson).success
        ? await db.authorizedPickup.findFirst({
            where: { id: values.pickupPerson, student: student.id, status: 'Approved' },
          })
        : null;
      assert(listed, 'Choose an approved collector.');
      if (!values.idNumber || !idMatches(values.idNumber, listed.idHash)) {
        await db.pickupRecord.create({
          data: {
            student: student.id,
            day,
            pickupPerson: listed.id,
            collectorName: listed.name,
            relationship: listed.relationship,
            verification: 'ID did not match record',
            outcome: 'Refused',
            notes: values.notes,
            verifiedBy: user.id,
          },
        });
        await alertParents(
          student.id,
          'Collection refused for ' + student.firstName,
          'Safety alert: someone giving the name ' +
            listed.name +
            ' tried to collect ' +
            student.firstName +
            ' but the ID did not match our records. ' +
            student.firstName +
            ' is safe at school. Please call the school.',
          'pickup-refused:' + student.id + ':' + Date.now(),
        );
        throw new UserError(
          'ID does not match. Do NOT release the child. The attempt was recorded and the parent alerted.',
        );
      }
      collector = listed.name;
      relationship = listed.relationship;
      person = listed.id;
      verification = 'ID checked (…' + listed.idLast4 + ')';
    } else {
      if (!leaders.includes(user.role))
        throw new UserError(
          'Only the headteacher or administrator can authorise an exception.',
        );
      assert(
        values.collectorName && (values.notes?.length ?? 0) >= 15,
        'Record the collector’s name and how the parent confirmed (at least 15 characters).',
      );
      collector = values.collectorName;
      verification = 'Exception authorised by ' + user.name;
    }
    const record = await db.pickupRecord.create({
      data: {
        student: student.id,
        day,
        pickupPerson: person,
        collectorName: collector,
        relationship,
        verification,
        outcome: 'Released',
        notes: values.notes,
        verifiedBy: user.id,
      },
    });
    const updated = await db.attendance.updateMany({
      where: { id: attendance.id, ...notCollected },
      data: {
        checkOutAt: record.at,
        checkOutBy: user.id,
        pickupRecord: record.id,
        updatedAt: new Date(),
      },
    });
    assert(updated.count, 'This learner was collected by another staff member just now.');
    const settings = await getSettings();
    if (settings.notifyPickup)
      await alertParents(
        student.id,
        student.firstName + ' has been collected',
        settings.name +
          ': ' +
          student.firstName +
          ' was collected by ' +
          collector +
          ' at ' +
          time(record.at) +
          '.',
        'pickup:' + record.id,
      );
    return { success: student.firstName + ' released to ' + collector + '.' };
  });
}
// ---------- Daycare care records ----------
export async function addCareLog(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('daycare'));
    const values = z
      .object({
        studentId: objectId,
        day: dayField,
        kind: z.enum(careKinds),
        at: z.string(),
        amount: optionalText(60),
        details: optionalText(1000),
      })
      .parse(strings(form));
    checkDay(user.role, values.day);
    const student = await enrolledStudent(values.studentId);
    const at = atTime(values.day, values.at);
    assert(at, 'Enter the time as HH:MM.');
    await db.careLog.create({
      data: {
        student: student.id,
        day: values.day,
        kind: values.kind,
        at,
        amount: values.amount,
        details: values.details,
        by: user.id,
      },
    });
    return { success: values.kind + ' recorded for ' + student.firstName + '.' };
  });
}
// ---------- Meals ----------
export async function saveMealPlan(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('meals'));
    const values = z
      .object({
        day: dayField,
        classLevel: z.enum(['All', ...programmes]),
        meal: z.enum(mealNames),
        menu: requiredText(500),
        notes: optionalText(500),
      })
      .parse(strings(form));
    const key = { day: values.day, classLevel: values.classLevel, meal: values.meal };
    await db.mealPlan.upsert({
      where: { day_classLevel_meal: key },
      create: { ...values, createdBy: user.id },
      update: { menu: values.menu, notes: values.notes },
    });
    return { success: values.meal + ' saved for ' + values.day + '.' };
  });
}
// ---------- Health ----------
export async function updateHealthProfile(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(['admin', 'headteacher']);
    const values = z
      .object({
        studentId: objectId,
        allergies: optionalText(1000),
        medicalConditions: optionalText(1000),
        medications: optionalText(1000),
        dietaryRequirements: optionalText(1000),
        doctorName: optionalText(120),
        doctorPhone: optionalText(40),
      })
      .parse(strings(form));
    const { studentId, ...data } = values;
    await db.student.update({
      where: { id: studentId },
      data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value ?? null]),
      ),
    });
    return { success: 'Health and dietary profile updated.' };
  });
}
export async function addImmunization(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('health'));
    const values = z
      .object({
        studentId: objectId,
        vaccine: requiredText(120),
        doseDate: dayField,
        nextDue: optionalDate,
        cardSeen: flag,
      })
      .parse(strings(form));
    assert(values.doseDate <= nairobiDay(), 'The dose date cannot be in the future.');
    const student = await db.student.findUnique({ where: { id: values.studentId } });
    assert(student, 'Learner not found.');
    await db.immunization.create({
      data: {
        student: student.id,
        vaccine: values.vaccine,
        doseDate: dayStart(values.doseDate),
        nextDue: values.nextDue,
        cardSeen: values.cardSeen,
        by: user.id,
      },
    });
    return { success: 'Immunisation recorded.' };
  });
}
export async function addMedication(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('health'));
    const values = z
      .object({
        studentId: objectId,
        medicine: requiredText(120),
        dose: requiredText(120),
        at: z.string(),
        parentConsent: flag,
        notes: optionalText(1000),
      })
      .parse(strings(form));
    assert(
      values.parentConsent,
      'Medication may only be given with written parent consent.',
    );
    const student = await enrolledStudent(values.studentId);
    const givenAt = atTime(nairobiDay(), values.at);
    assert(givenAt, 'Enter the time as HH:MM.');
    await db.medicationLog.create({
      data: {
        student: student.id,
        medicine: values.medicine,
        dose: values.dose,
        givenAt,
        parentConsent: true,
        notes: values.notes,
        by: user.id,
      },
    });
    await alertParents(
      student.id,
      'Medication given to ' + student.firstName,
      student.firstName +
        ' was given ' +
        values.medicine +
        ' (' +
        values.dose +
        ') at ' +
        time(givenAt) +
        ' as you authorised.',
      'medication:' + student.id + ':' + givenAt.getTime(),
    );
    return { success: 'Medication recorded and parent notified.' };
  });
}
export async function reportIncident(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('health'));
    const values = z
      .object({
        studentId: z.string().optional(),
        day: dayField,
        at: z.string(),
        kind: z.enum(incidentKinds),
        severity: z.enum(['Minor', 'Moderate', 'Serious']),
        description: requiredText(3000),
        actionTaken: requiredText(3000),
        notifyParent: flag,
      })
      .parse(strings(form));
    const occurredAt = atTime(values.day, values.at);
    assert(
      occurredAt && occurredAt <= new Date(),
      'Enter a valid time that is not in the future.',
    );
    const studentId = values.studentId ? objectId.parse(values.studentId) : undefined;
    const student = studentId
      ? await db.student.findUnique({ where: { id: studentId } })
      : null;
    // Safeguarding concerns go to the headteacher; they are not sent to parents automatically.
    const tellParent = Boolean(
      student && values.notifyParent && values.kind !== 'Safeguarding concern',
    );
    await db.incident.create({
      data: {
        student: student?.id,
        occurredAt,
        kind: values.kind,
        severity: values.severity,
        description: values.description,
        actionTaken: values.actionTaken,
        reportedBy: user.id,
        ...(tellParent ? { parentNotifiedAt: new Date() } : {}),
      },
    });
    if (tellParent && student)
      await alertParents(
        student.id,
        'Incident report for ' + student.firstName,
        'An incident involving ' +
          student.firstName +
          ' (' +
          values.kind.toLowerCase() +
          ', ' +
          values.severity.toLowerCase() +
          ') was recorded at ' +
          time(occurredAt) +
          '. Action taken: ' +
          values.actionTaken.slice(0, 300) +
          ' Please contact the school for details.',
        'incident:' + student.id + ':' + occurredAt.getTime(),
      );
    return {
      success:
        'Incident recorded.' +
        (values.kind === 'Safeguarding concern'
          ? ' The headteacher must review it today.'
          : ''),
    };
  });
}
export async function closeIncident(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin', 'headteacher']);
    const id = objectId.parse(strings(form).id);
    await db.incident.update({
      where: { id },
      data: { status: 'Closed', closedBy: user.id },
    });
    return { success: 'Incident closed.' };
  });
}
// ---------- Timetable ----------
export async function saveSlot(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('timetable'));
    const values = z
      .object({
        classLevel: z.enum(programmes),
        weekday: z.coerce.number().int().min(1).max(5),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.'),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.'),
        activity: requiredText(120),
        learningArea: optionalText(120),
      })
      .parse(strings(form));
    assert(values.start < values.end, 'The activity must end after it starts.');
    const clash = await db.timetableSlot.findFirst({
      where: {
        classLevel: values.classLevel,
        weekday: values.weekday,
        start: { lt: values.end },
        end: { gt: values.start },
      },
    });
    assert(
      !clash,
      'This overlaps “' +
        clash?.activity +
        '” (' +
        clash?.start +
        '–' +
        clash?.end +
        ').',
    );
    await db.timetableSlot.create({ data: values });
    return { success: 'Timetable updated.' };
  });
}
export async function deleteSlot(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('timetable'));
    await db.timetableSlot.delete({ where: { id: objectId.parse(strings(form).id) } });
    return { success: 'Activity removed.' };
  });
}
