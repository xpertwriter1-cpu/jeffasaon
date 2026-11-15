'use server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { editors } from '@/lib/permissions';
import {
  objectId,
  money,
  period,
  password,
  formPassword,
  strings,
  UserError,
} from '@/lib/validation';
import { feeLabels, programmes, staffRoles } from '@/lib/school';
import {
  dayField,
  optionalDate,
  optionalText,
  requiredText,
  flag,
  assert,
} from '@/lib/settings';
import { dayStart } from '@/lib/day';
const level = z.enum(programmes);
export async function saveSettings(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('settings'));
    const values = z
      .object({
        name: requiredText(),
        phone: optionalText(40),
        email: optionalText(254),
        location: optionalText(200),
        county: optionalText(80),
        subCounty: optionalText(80),
        registrationNumber: optionalText(80),
        currentYear: z.coerce.number().int().min(2000).max(2100),
        currentTerm: z.coerce.number().int().min(1).max(3),
        notifyAbsence: flag,
        notifyPickup: flag,
      })
      .parse(strings(form));
    const data = { ...values, updatedBy: user.id, updatedAt: new Date() };
    await db.schoolSetting.upsert({
      where: { id: 'school' },
      create: { id: 'school', ...data },
      update: data,
    });
    return { success: 'School settings saved.' };
  });
}
export async function saveTerm(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('settings'));
    const values = strings(form);
    const term = period.parse(values);
    const dates = z.object({ startDate: dayField, endDate: dayField }).parse(values);
    assert(dates.startDate < dates.endDate, 'The term must end after it starts.');
    const data = {
      startDate: dayStart(dates.startDate),
      endDate: dayStart(dates.endDate),
    };
    await db.academicTerm.upsert({
      where: { year_term: term },
      create: { ...term, ...data },
      update: data,
    });
    return { success: 'Term dates saved.' };
  });
}
export async function saveLicence(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('compliance'));
    const values = z
      .object({
        kind: requiredText(),
        number: optionalText(100),
        issuedBy: optionalText(200),
        issueDate: optionalDate,
        expiryDate: optionalDate,
        notes: optionalText(1000),
      })
      .parse(strings(form));
    await db.licenceRecord.create({ data: { ...values, createdBy: user.id } });
    return { success: 'Licence record saved.' };
  });
}
export async function saveFeeStructure(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin', 'bursar']);
    const values = strings(form);
    const term = period.parse(values);
    const classLevel = level.parse(values.classLevel);
    const items = feeLabels.flatMap((label, index) => {
      const raw = values['fee' + index] || '0';
      return Number(raw) === 0 ? [] : [{ label, amount: money.parse(raw) }];
    });
    assert(items.length, 'Enter at least one fee amount.');
    await db.feeStructure.upsert({
      where: { year_term_classLevel: { ...term, classLevel } },
      create: { ...term, classLevel, items, createdBy: user.id },
      update: { items: { set: items } },
    });
    return { success: 'Fee structure saved for ' + classLevel + '.' };
  });
}
// Bill every admitted or active learner in a level who has no invoice for that term yet.
export async function generateInvoices(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin', 'bursar']);
    const values = strings(form);
    const term = period.parse(values);
    const classLevel = level.parse(values.classLevel);
    const structure = await db.feeStructure.findUnique({
      where: { year_term_classLevel: { ...term, classLevel } },
    });
    assert(structure, 'Save a fee structure for this class and term first.');
    const students = await db.student.findMany({
      where: { classLevel, status: { in: ['Admitted', 'Active'] } },
      select: { id: true },
    });
    const existing = await db.invoice.findMany({
      where: { ...term, student: { in: students.map((student) => student.id) } },
      select: { student: true },
    });
    const billed = new Set(existing.map((invoice) => invoice.student));
    const pending = students.filter((student) => !billed.has(student.id));
    for (const student of pending)
      await db.invoice.create({
        data: {
          student: student.id,
          ...term,
          items: structure.items,
          createdBy: user.id,
        },
      });
    return {
      success:
        pending.length + ' invoice(s) created. ' + billed.size + ' already existed.',
    };
  });
}
export async function saveClass(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('classes'));
    const values = strings(form);
    const data = z
      .object({
        name: requiredText(80),
        level,
        year: z.coerce.number().int().min(2000).max(2100),
        room: optionalText(80),
        capacity: z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .or(z.literal('').transform(() => undefined)),
      })
      .parse(values);
    const staff = form
      .getAll('staff')
      .filter((value): value is string => typeof value === 'string');
    const people = await db.user.findMany({
      where: { id: { in: staff.filter((id) => objectId.safeParse(id).success) } },
      select: { id: true, role: true },
    });
    const teachers = people
      .filter((person) => ['teacher', 'headteacher'].includes(person.role))
      .map((person) => person.id);
    const caregivers = people
      .filter((person) => person.role === 'caregiver')
      .map((person) => person.id);
    if (values.id) {
      await db.schoolClass.update({
        where: { id: objectId.parse(values.id) },
        data: { ...data, teachers: { set: teachers }, caregivers: { set: caregivers } },
      });
      return { success: 'Class updated.' };
    }
    await db.schoolClass.create({ data: { ...data, teachers, caregivers } });
    return { success: 'Class created.' };
  });
}
export async function assignClass(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('classes'));
    const values = z
      .object({ studentId: objectId, classId: objectId })
      .parse(strings(form));
    const schoolClass = await db.schoolClass.findUnique({
      where: { id: values.classId },
    });
    const student = await db.student.findUnique({ where: { id: values.studentId } });
    assert(schoolClass && student, 'Choose a student and a class.');
    assert(
      schoolClass.level === student.classLevel,
      'This class is for ' + schoolClass.level + '. Change the learner’s level first.',
    );
    if (schoolClass.capacity) {
      const count = await db.student.count({
        where: { classId: schoolClass.id, status: { in: ['Admitted', 'Active'] } },
      });
      assert(count < schoolClass.capacity, 'This class is full.');
    }
    await db.student.update({
      where: { id: student.id },
      data: { classId: schoolClass.id },
    });
    return { success: student.firstName + ' allocated to ' + schoolClass.name + '.' };
  });
}
export async function promoteLevel(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('classes'));
    const values = z
      .object({ studentId: objectId, classLevel: level })
      .parse(strings(form));
    await db.student.update({
      where: { id: values.studentId },
      data: { classLevel: values.classLevel, classId: null },
    });
    return { success: 'Programme level changed. Allocate the learner to a class.' };
  });
}
export async function updateAccount(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const admin = await requireUser(editors('users'));
    const values = z
      .object({
        id: objectId,
        role: z.enum(['parent', ...staffRoles]),
        active: z.enum(['yes', 'no']),
      })
      .parse(strings(form));
    if (values.id === admin.id && (values.role !== 'admin' || values.active === 'no'))
      throw new UserError('You cannot remove your own administrator access.');
    const target = await db.user.findUnique({ where: { id: values.id } });
    assert(target, 'Account not found.');
    if ((target.role === 'parent') !== (values.role === 'parent'))
      throw new UserError(
        'Parent and staff accounts cannot be converted. Create a new account instead.',
      );
    await db.user.update({
      where: { id: values.id },
      data: { role: values.role, active: values.active === 'yes' },
    });
    return { success: 'Account updated.' };
  });
}
export async function resetPassword(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('users'));
    const id = objectId.parse(strings(form).id);
    const value = password.parse(formPassword(form));
    await db.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(value, 12) },
    });
    return {
      success:
        'Password reset. Share it with the user privately and ask them to keep it secret.',
    };
  });
}
export async function saveStaffProfile(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(editors('teachers'));
    const values = z
      .object({
        user: objectId,
        phone: optionalText(40),
        idNumber: optionalText(30),
        tscNumber: optionalText(30),
        qualification: optionalText(200),
        employmentDate: optionalDate,
        emergencyContact: optionalText(200),
        goodConductExpiry: optionalDate,
        medicalCertExpiry: optionalDate,
        notes: optionalText(2000),
      })
      .parse(strings(form));
    const staff = await db.user.findUnique({ where: { id: values.user } });
    assert(staff && staff.role !== 'parent', 'Staff member not found.');
    const data = { ...values, updatedAt: new Date() };
    await db.staffProfile.upsert({
      where: { user: values.user },
      create: data,
      update: data,
    });
    return { success: 'Profile saved for ' + staff.name + '.' };
  });
}
// Staff clock in/out. Leaders may record for anyone; other staff only for themselves.
export async function clockStaff(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(staffRoles);
    const values = z
      .object({
        user: objectId,
        day: dayField,
        mode: z.enum(['in', 'out', 'absent', 'leave']),
      })
      .parse(strings(form));
    if (values.user !== user.id && !['admin', 'headteacher'].includes(user.role))
      throw new UserError('You can only record your own attendance.');
    const where = { user_day: { user: values.user, day: values.day } };
    const existing = await db.staffAttendance.findUnique({ where });
    if (values.mode === 'out') {
      assert(existing?.checkInAt, 'Clock in first.');
      await db.staffAttendance.update({ where, data: { checkOutAt: new Date() } });
    } else {
      const status =
        values.mode === 'in'
          ? 'Present'
          : values.mode === 'absent'
            ? 'Absent'
            : 'On leave';
      await db.staffAttendance.upsert({
        where,
        create: {
          user: values.user,
          day: values.day,
          status,
          recordedBy: user.id,
          ...(values.mode === 'in' ? { checkInAt: new Date() } : {}),
        },
        update: {
          status,
          recordedBy: user.id,
          ...(values.mode === 'in' && !existing?.checkInAt
            ? { checkInAt: new Date() }
            : {}),
        },
      });
    }
    return { success: 'Staff attendance recorded.' };
  });
}
export async function saveLearnerRecord(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(['admin', 'headteacher']);
    const values = z
      .object({
        id: objectId,
        upiNumber: optionalText(30),
        birthCertificateNumber: optionalText(40),
      })
      .parse(strings(form));
    await db.student.update({
      where: { id: values.id },
      data: {
        upiNumber: values.upiNumber ?? null,
        birthCertificateNumber: values.birthCertificateNumber ?? null,
      },
    });
    return { success: 'Learner record updated.' };
  });
}
