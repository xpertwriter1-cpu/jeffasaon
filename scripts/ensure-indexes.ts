import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
// Create missing indexes without rebuilding collections or dropping legacy sparse indexes.
const indexes = [
  {
    createIndexes: 'users',
    indexes: [{ key: { email: 1 }, name: 'email_1', unique: true }],
  },
  {
    createIndexes: 'students',
    indexes: [
      {
        key: { admissionNumber: 1 },
        name: 'admissionNumber_1',
        unique: true,
        sparse: true,
      },
    ],
  },
  {
    createIndexes: 'payments',
    indexes: [
      {
        key: { transactionKey: 1 },
        name: 'transactionKey_1',
        unique: true,
        sparse: true,
      },
    ],
  },
  {
    createIndexes: 'invoices',
    indexes: [
      {
        key: { student: 1, year: 1, term: 1 },
        name: 'student_1_year_1_term_1',
        unique: true,
      },
    ],
  },
  {
    createIndexes: 'reports',
    indexes: [
      {
        key: { student: 1, year: 1, term: 1 },
        name: 'student_1_year_1_term_1',
        unique: true,
      },
    ],
  },
  {
    createIndexes: 'enquiries',
    indexes: [
      { key: { submissionKey: 1 }, name: 'submissionKey_1', unique: true, sparse: true },
    ],
  },
  {
    createIndexes: 'mpesasandboxattempts',
    indexes: [
      { key: { parent: 1, requestKey: 1 }, name: 'parent_1_requestKey_1', unique: true },
      {
        key: { parent: 1, throttleBucket: 1 },
        name: 'parent_1_throttleBucket_1',
        unique: true,
      },
      { key: { checkoutId: 1 }, name: 'checkoutId_1', unique: true, sparse: true },
    ],
  },
  {
    createIndexes: 'attendance',
    indexes: [
      { key: { student: 1, day: 1 }, name: 'student_1_day_1', unique: true },
      { key: { day: 1, classLevel: 1 }, name: 'day_1_classLevel_1' },
    ],
  },
  {
    createIndexes: 'staff_attendance',
    indexes: [{ key: { user: 1, day: 1 }, name: 'user_1_day_1', unique: true }],
  },
  {
    createIndexes: 'classes',
    indexes: [{ key: { name: 1, year: 1 }, name: 'name_1_year_1', unique: true }],
  },
  {
    createIndexes: 'staff_profiles',
    indexes: [{ key: { user: 1 }, name: 'user_1', unique: true }],
  },
  {
    createIndexes: 'academic_terms',
    indexes: [{ key: { year: 1, term: 1 }, name: 'year_1_term_1', unique: true }],
  },
  {
    createIndexes: 'fee_structures',
    indexes: [
      {
        key: { year: 1, term: 1, classLevel: 1 },
        name: 'year_1_term_1_classLevel_1',
        unique: true,
      },
    ],
  },
  {
    createIndexes: 'meal_plans',
    indexes: [
      {
        key: { day: 1, classLevel: 1, meal: 1 },
        name: 'day_1_classLevel_1_meal_1',
        unique: true,
      },
    ],
  },
  {
    createIndexes: 'mpesa_requests',
    indexes: [
      { key: { parent: 1, requestKey: 1 }, name: 'parent_1_requestKey_1', unique: true },
      {
        key: { parent: 1, throttleBucket: 1 },
        name: 'parent_1_throttleBucket_1',
        unique: true,
      },
      { key: { checkoutId: 1 }, name: 'checkoutId_1', unique: true, sparse: true },
    ],
  },
  {
    createIndexes: 'authorized_pickups',
    indexes: [{ key: { student: 1, status: 1 }, name: 'student_1_status_1' }],
  },
  {
    createIndexes: 'pickup_records',
    indexes: [
      { key: { day: 1 }, name: 'day_1' },
      { key: { student: 1, at: -1 }, name: 'student_1_at_-1' },
    ],
  },
  {
    createIndexes: 'care_logs',
    indexes: [
      { key: { student: 1, day: 1 }, name: 'student_1_day_1' },
      { key: { day: 1, kind: 1 }, name: 'day_1_kind_1' },
    ],
  },
  {
    createIndexes: 'competency_assessments',
    indexes: [{ key: { student: 1, year: 1, term: 1 }, name: 'student_1_year_1_term_1' }],
  },
  {
    createIndexes: 'outbound_messages',
    indexes: [{ key: { status: 1, nextAttemptAt: 1 }, name: 'status_1_nextAttemptAt_1' }],
  },
  {
    createIndexes: 'consents',
    indexes: [
      {
        key: { student: 1, kind: 1, recordedAt: -1 },
        name: 'student_1_kind_1_recordedAt_-1',
      },
    ],
  },
  {
    createIndexes: 'request_limits',
    indexes: [{ key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 }],
  },
];
try {
  for (const command of indexes) await db.$runCommandRaw(command);
  console.log('Required indexes are present. Existing data and indexes were retained.');
} catch {
  console.error(
    'Could not create an index. Check database permissions and existing duplicates before retrying.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
