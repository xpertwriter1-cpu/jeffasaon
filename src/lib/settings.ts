import { z } from 'zod';
import { db } from './db';
import { school } from './school';
import { isDay, dayStart } from './day';
import { UserError } from './validation';
// Kenyan school calendar: three terms. Used only until the school records its own dates.
export function defaultTerm(date = new Date()) {
  const month = Number(
    new Intl.DateTimeFormat('en-KE', {
      month: 'numeric',
      timeZone: 'Africa/Nairobi',
    }).format(date),
  );
  return month <= 4 ? 1 : month <= 8 ? 2 : 3;
}
export async function getSettings() {
  const stored = await db.schoolSetting.findUnique({ where: { id: 'school' } });
  return (
    stored ?? {
      id: 'school',
      name: school.name,
      phone: school.phone,
      email: school.email,
      location: school.location,
      county: 'Kajiado',
      subCounty: null,
      registrationNumber: null,
      currentYear: new Date().getFullYear(),
      currentTerm: defaultTerm(),
      notifyAbsence: true,
      notifyPickup: true,
      updatedBy: null,
      updatedAt: new Date(),
    }
  );
}
export const optionalText = (max = 500) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));
export const requiredText = (max = 200) =>
  z.string().trim().min(1, 'Complete all required fields.').max(max);
export const dayField = z.string().refine(isDay, 'Enter a valid date.');
export const optionalDate = z
  .string()
  .optional()
  .transform((value, context) => {
    if (!value) return undefined;
    if (!isDay(value)) {
      context.addIssue({ code: 'custom', message: 'Enter a valid date.' });
      return z.NEVER;
    }
    return dayStart(value);
  });
export const flag = z
  .string()
  .optional()
  .transform((value) => value === 'yes');
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new UserError(message);
}
// MongoDB via Prisma: an unset field does not match `null`, so test both.
export const activeAccount = {
  OR: [{ active: true }, { active: null }, { active: { isSet: false } }],
};
export const notCollected = {
  OR: [{ checkOutAt: null }, { checkOutAt: { isSet: false } }],
};
