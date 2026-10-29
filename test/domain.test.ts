import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAdmission,
  validDate,
  fileType,
  canChangeStatus,
  today,
} from '../src/lib/admission-validation';
import { strings, money, password, objectId, phone } from '../src/lib/validation';
import { runForm } from '../src/lib/forms';
import { invoiceTotals } from '../src/lib/invoice-totals';
import { normalizePhone, timestamp } from '../src/lib/mpesa-sandbox';
const valid = () => ({
  firstName: 'Amina',
  lastName: 'Test',
  dateOfBirth: '2022-06-12',
  homeAddress: 'Rongai',
  classLevel: 'PP1',
  guardianName: 'Parent',
  guardianRelationship: 'Mother',
  parentPhone: '0729000000',
  emergencyName: 'Guardian',
  emergencyRelationship: 'Aunt',
  emergencyPhone: '0712000000',
  declaration: 'yes',
});
test('admission accepts optional clinic and collection contact fields without inventing required details', () => {
  assert.equal(
    validateAdmission({
      ...valid(),
      doctorName: 'Local clinic',
      pickupName: 'Grandparent',
    }).doctorName,
    'Local clinic',
  );
});
test('admission rejects a future birthday, invalid programme, missing declaration and invalid telephone', () => {
  for (const input of [
    { ...valid(), dateOfBirth: '2099-01-01' },
    { ...valid(), classLevel: 'Year 8' },
    { ...valid(), declaration: 'no' },
    { ...valid(), parentPhone: 'not a number' },
  ])
    assert.throws(() => validateAdmission(input));
  assert.ok(today().match(/^\d{4}-\d{2}-\d{2}$/));
});
test('date validation rejects rollover dates and accepts a real leap day', () => {
  assert.equal(validDate('2025-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2024-13-01'), false);
});
test('admission checks guardian completeness and long health notes', () => {
  assert.throws(() =>
    validateAdmission({ ...valid(), secondGuardianName: 'Other parent' }),
  );
  assert.throws(() => validateAdmission({ ...valid(), medicalNotes: 'x'.repeat(3001) }));
});
test('form parsing rejects duplicate string fields and ignores Next action metadata', () => {
  const form = new FormData();
  form.set('$ACTION_REF_0', 'internal');
  form.set('email', 'parent@example.test');
  assert.deepEqual(strings(form), { email: 'parent@example.test' });
  form.append('email', 'attacker@example.test');
  assert.throws(() => strings(form));
});
test('form actions return user-facing validation errors instead of throwing them away', async () => {
  const form = new FormData();
  form.set('password', 'short');
  const result = await runForm(form, async () => {
    throw new Error('bad input');
  });
  assert.equal(result.error, 'We could not complete your request. Please try again or contact the school.');
  assert.deepEqual(result.values, {});
});
test('money rejects negative, exponential, non-finite and fractional-cent values', () => {
  for (const value of ['-1', '1e4', 'Infinity', '1.001', '0', '10000001'])
    assert.equal(money.safeParse(value).success, false);
  assert.equal(money.parse('120.50'), 120.5);
});
test('password length uses UTF-8 bytes and account IDs cannot carry query operators', () => {
  assert.equal(password.safeParse('é'.repeat(37)).success, false);
  assert.equal(password.safeParse('a'.repeat(72)).success, true);
  assert.equal(objectId.safeParse({ $ne: null }).success, false);
  assert.equal(objectId.safeParse('a'.repeat(24)).success, true);
  assert.equal(phone.safeParse('0700000000').success, true);
});
test('verified invoice totals use cents and ignore pending and foreign payments', () => {
  const invoice = {
    id: 'invoice',
    items: [
      { id: null, label: 'Tuition', amount: 100.1 },
      { id: null, label: 'Meals', amount: 0.2 },
    ],
  };
  const result = invoiceTotals(invoice, [
    { invoice: 'invoice', status: 'Paid', amount: 40.1 },
    { invoice: 'invoice', status: 'Pending verification', amount: 60 },
    { invoice: 'other', status: 'Paid', amount: 999 },
  ]);
  assert.deepEqual(result, { total: 100.3, paid: 40.1, balance: 60.2 });
});
test('status changes cannot bypass admission or reopen final records', () => {
  assert.equal(canChangeStatus('Pending', 'Admitted'), false);
  assert.equal(canChangeStatus('Pending', 'Active'), false);
  assert.equal(canChangeStatus('Admitted', 'Active'), true);
  assert.equal(canChangeStatus('Graduated', 'Active'), false);
  assert.equal(canChangeStatus('Withdrawn', 'Pending'), false);
});
test('document type comes from bytes rather than the filename or browser MIME type', () => {
  assert.equal(fileType(Buffer.from('%PDF-1.7'))?.mimeType, 'application/pdf');
  assert.equal(
    fileType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))?.mimeType,
    'image/png',
  );
  assert.equal(fileType(Buffer.from('<script>not an image</script>')), null);
});
test('sandbox numbers are Kenyan mobiles and timestamps use Nairobi time', () => {
  assert.equal(normalizePhone('0729 123456'), '254729123456');
  assert.equal(normalizePhone('+254712123456'), '254712123456');
  assert.equal(normalizePhone('+12025551234'), null);
  assert.equal(timestamp(new Date('2026-10-29T00:00:00Z')), '20261029030000');
});
