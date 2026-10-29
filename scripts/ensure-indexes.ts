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
