import { admissionGroups } from './admission-fields';
import { UserError } from './validation';
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateAdmission(values: Record<string, string>) {
  for (const field of admissionGroups.flatMap((group) => group.fields)) {
    const value = values[field.name] || '';
    if (field.required && !value) throw new UserError(field.label + ' is required.');
    if (value.length > (field.max || 200))
      throw new UserError(field.label + ' is too long.');
    if (value && field.options && !field.options.includes(value))
      throw new UserError('Choose a valid ' + field.label.toLowerCase() + '.');
    if (
      value &&
      field.type === 'date' &&
      (!validDate(value) || value < '1900-01-01' || value > '2100-12-31')
    )
      throw new UserError(field.label + ' must be a valid date.');
    if (value && field.type === 'tel' && !/^\+?[\d ()-]{7,30}$/.test(value))
      throw new UserError(field.label + ' must be a valid phone number.');
    if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      throw new UserError(field.label + ' must be a valid email address.');
  }
  if (values.dateOfBirth && values.dateOfBirth > today())
    throw new UserError('Date of birth cannot be in the future.');
  if (
    values.requestedStartDate &&
    values.dateOfBirth &&
    values.requestedStartDate < values.dateOfBirth
  )
    throw new UserError('Admission cannot be before the child was born.');
  if (
    values.secondGuardianName &&
    (!values.secondGuardianPhone || !values.secondGuardianRelationship)
  )
    throw new UserError('Add the second guardian relationship and phone.');
  if (values.declaration !== 'yes')
    throw new UserError('Confirm the parent or guardian declaration.');
  return values;
}
export function fileType(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-')
    return { extension: '.pdf', mimeType: 'application/pdf' };
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { extension: '.png', mimeType: 'image/png' };
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return { extension: '.jpg', mimeType: 'image/jpeg' };
  return null;
}
export function canChangeStatus(current: string, next: string) {
  const transitions: Record<string, string[]> = {
    Pending: ['Withdrawn'],
    Admitted: ['Active', 'Withdrawn'],
    Active: ['Graduated', 'Withdrawn'],
    Graduated: [],
    Withdrawn: [],
  };
  return current === next || Boolean(transitions[current]?.includes(next));
}
