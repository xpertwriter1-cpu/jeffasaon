import { z } from 'zod';
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid record.');
export const email = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase().trim());
export const password = z
  .string()
  .min(8)
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Use a password of at most 72 bytes.',
  );
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d ()-]{7,30}$/, 'Enter a valid phone number.');
export const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .transform(Number)
  .refine((value) => value > 0 && value <= 10000000, 'Enter a valid amount.');
export const period = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  term: z.coerce.number().int().min(1).max(3),
});
export function strings(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of form) {
    if (key.startsWith('$ACTION_')) continue;
    if (typeof value !== 'string') continue;
    if (key in values) throw new Error('Duplicate form field: ' + key);
    values[key] = value.trim();
  }
  return values;
}
export function formPassword(form: FormData): string {
  const value = form.get('password');
  return typeof value === 'string' ? value : '';
}
export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues.map((issue) => issue.message).join(' ');
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  )
    return 'This record already exists. Please reload and check your entries.';
  if (error instanceof Error && error.name === 'UserError') return error.message;
  return 'We could not complete your request. Please try again or contact the school.';
}
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
