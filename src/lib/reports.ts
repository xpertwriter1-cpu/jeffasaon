import { db } from './db';
import { invoiceTotals } from './invoice-totals';
import { isDay, nairobiDay, addDays, dayStart, time } from './day';
import { programmes } from './school';
export type ReportTable = { title: string; head: string[]; rows: (string | number)[][] };
export interface ReportQuery {
  from?: string;
  to?: string;
  level?: string;
  year?: string;
  term?: string;
}
const name = (student?: { firstName: string; lastName: string } | null) =>
  student ? student.firstName + ' ' + student.lastName : '';
const ymd = (value?: Date | null) => (value ? nairobiDay(value) : '');
export function range(query: ReportQuery) {
  const to = isDay(query.to) ? query.to : nairobiDay();
  const from = isDay(query.from) ? query.from : addDays(to, -30);
  return { from, to };
}
export function termOf(query: ReportQuery, fallback: { year: number; term: number }) {
  const year = Number(query.year) || fallback.year;
  const term = [1, 2, 3].includes(Number(query.term))
    ? Number(query.term)
    : fallback.term;
  return { year, term };
}
const levelFilter = (level?: string) =>
  (programmes as readonly string[]).includes(level || '') ? { classLevel: level } : {};
async function learners(where: object = {}) {
  return db.student.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classLevel: true,
      admissionNumber: true,
    },
  });
}
export const reportNames = [
  'students',
  'attendance',
  'fees',
  'payments',
  'assessments',
  'incidents',
  'immunizations',
  'pickups',
] as const;
export type ReportName = (typeof reportNames)[number];
export const reportRoles: Record<ReportName, string[]> = {
  students: ['admin', 'headteacher'],
  attendance: ['admin', 'headteacher'],
  fees: ['admin', 'headteacher', 'bursar'],
  payments: ['admin', 'bursar'],
  assessments: ['admin', 'headteacher'],
  incidents: ['admin', 'headteacher'],
  immunizations: ['admin', 'headteacher'],
  pickups: ['admin', 'headteacher'],
};
export async function buildReport(
  report: ReportName,
  query: ReportQuery,
  current: { year: number; term: number },
): Promise<ReportTable> {
  const { from, to } = range(query);
  const period = termOf(query, current);
  if (report === 'students') {
    const students = await db.student.findMany({
      where: levelFilter(query.level),
      orderBy: [{ classLevel: 'asc' }, { firstName: 'asc' }],
    });
    return {
      title: 'Learner register',
      head: [
        'Admission no.',
        'UPI',
        'Learner',
        'Level',
        'Status',
        'Date of birth',
        'Gender',
        'Parent',
        'Parent phone',
        'Emergency contact',
        'Emergency phone',
        'Allergies',
        'Medical conditions',
      ],
      rows: students.map((s) => [
        s.admissionNumber || '',
        s.upiNumber || '',
        name(s),
        s.classLevel,
        s.status,
        ymd(s.dateOfBirth),
        s.gender || '',
        s.parentName,
        s.parentPhone || '',
        s.emergencyName || '',
        s.emergencyPhone || '',
        s.allergies || '',
        s.medicalConditions || '',
      ]),
    };
  }
  if (report === 'attendance') {
    const records = await db.attendance.findMany({
      where: { day: { gte: from, lte: to }, ...levelFilter(query.level) },
      orderBy: [{ day: 'asc' }],
    });
    const kids = await learners({
      id: { in: [...new Set(records.map((r) => r.student))] },
    });
    const pickups = await db.pickupRecord.findMany({
      where: {
        id: { in: records.flatMap((r) => (r.pickupRecord ? [r.pickupRecord] : [])) },
      },
    });
    return {
      title: 'Attendance ' + from + ' to ' + to,
      head: [
        'Date',
        'Learner',
        'Level',
        'Status',
        'Arrived',
        'Brought by',
        'Departed',
        'Collected by',
        'Absence reason',
      ],
      rows: records.map((r) => [
        r.day,
        name(kids.find((k) => k.id === r.student)),
        r.classLevel,
        r.status,
        time(r.checkInAt),
        r.droppedOffBy || '',
        time(r.checkOutAt),
        pickups.find((p) => p.id === r.pickupRecord)?.collectorName || '',
        r.absenceReason || '',
      ]),
    };
  }
  if (report === 'fees') {
    const invoices = await db.invoice.findMany({ where: period });
    const kids = await learners({
      id: { in: invoices.map((i) => i.student) },
      ...levelFilter(query.level),
    });
    const payments = await db.payment.findMany({
      where: { invoice: { in: invoices.map((i) => i.id) } },
    });
    return {
      title: 'Fee balances ' + period.year + ' Term ' + period.term,
      head: [
        'Admission no.',
        'Learner',
        'Level',
        'Billed (KES)',
        'Paid (KES)',
        'Balance (KES)',
      ],
      rows: invoices.flatMap((invoice) => {
        const kid = kids.find((k) => k.id === invoice.student);
        if (!kid) return [];
        const totals = invoiceTotals(invoice, payments);
        return [
          [
            kid.admissionNumber || '',
            name(kid),
            kid.classLevel,
            totals.total,
            totals.paid,
            totals.balance,
          ],
        ];
      }),
    };
  }
  if (report === 'payments') {
    const payments = await db.payment.findMany({
      where: { createdAt: { gte: dayStart(from), lt: dayStart(addDays(to, 1)) } },
      orderBy: { createdAt: 'asc' },
    });
    const kids = await learners({
      id: { in: payments.flatMap((p) => (p.student ? [p.student] : [])) },
    });
    return {
      title: 'Payments ' + from + ' to ' + to,
      head: [
        'Date',
        'Learner',
        'Parent',
        'Amount (KES)',
        'Method',
        'Reference',
        'Status',
        'Verified',
      ],
      rows: payments.map((p) => [
        ymd(p.createdAt),
        name(kids.find((k) => k.id === p.student)),
        p.parentName,
        p.amount,
        p.method,
        p.reference || '',
        p.status,
        ymd(p.verifiedAt),
      ]),
    };
  }
  if (report === 'assessments') {
    const records = await db.competencyAssessment.findMany({
      where: period,
      orderBy: { assessedOn: 'asc' },
    });
    const kids = await learners({
      id: { in: [...new Set(records.map((r) => r.student))] },
      ...levelFilter(query.level),
    });
    return {
      title: 'Competency assessments ' + period.year + ' Term ' + period.term,
      head: ['Date', 'Learner', 'Level', 'Learning area', 'Strand', 'Rating', 'Comment'],
      rows: records.flatMap((r) => {
        const kid = kids.find((k) => k.id === r.student);
        return kid
          ? [
              [
                ymd(r.assessedOn),
                name(kid),
                kid.classLevel,
                r.learningArea,
                r.strand,
                r.level,
                r.comment || '',
              ],
            ]
          : [];
      }),
    };
  }
  if (report === 'incidents') {
    const records = await db.incident.findMany({
      where: { occurredAt: { gte: dayStart(from), lt: dayStart(addDays(to, 1)) } },
      orderBy: { occurredAt: 'asc' },
    });
    const kids = await learners({
      id: { in: records.flatMap((r) => (r.student ? [r.student] : [])) },
    });
    return {
      title: 'Incidents ' + from + ' to ' + to,
      head: [
        'Date',
        'Time',
        'Learner',
        'Type',
        'Severity',
        'Description',
        'Action taken',
        'Parent notified',
        'Status',
      ],
      rows: records.map((r) => [
        ymd(r.occurredAt),
        time(r.occurredAt),
        name(kids.find((k) => k.id === r.student)),
        r.kind,
        r.severity,
        r.description,
        r.actionTaken,
        ymd(r.parentNotifiedAt),
        r.status,
      ]),
    };
  }
  if (report === 'immunizations') {
    const records = await db.immunization.findMany({ orderBy: { doseDate: 'asc' } });
    const kids = await learners({
      id: { in: [...new Set(records.map((r) => r.student))] },
      ...levelFilter(query.level),
    });
    return {
      title: 'Immunisation register',
      head: ['Learner', 'Level', 'Vaccine', 'Dose date', 'Next due', 'Card seen'],
      rows: records.flatMap((r) => {
        const kid = kids.find((k) => k.id === r.student);
        return kid
          ? [
              [
                name(kid),
                kid.classLevel,
                r.vaccine,
                ymd(r.doseDate),
                ymd(r.nextDue),
                r.cardSeen ? 'Yes' : 'No',
              ],
            ]
          : [];
      }),
    };
  }
  const records = await db.pickupRecord.findMany({
    where: { day: { gte: from, lte: to } },
    orderBy: { at: 'asc' },
  });
  const kids = await learners({
    id: { in: [...new Set(records.map((r) => r.student))] },
  });
  return {
    title: 'Collection records ' + from + ' to ' + to,
    head: [
      'Date',
      'Time',
      'Learner',
      'Collector',
      'Relationship',
      'Verification',
      'Outcome',
      'Notes',
    ],
    rows: records.map((r) => [
      r.day,
      time(r.at),
      name(kids.find((k) => k.id === r.student)),
      r.collectorName,
      r.relationship || '',
      r.verification,
      r.outcome,
      r.notes || '',
    ]),
  };
}
// CSV with a UTF-8 byte-order mark so Excel opens names like “Wanjirũ” correctly.
// Cells starting with = + - @ are prefixed to stop spreadsheet formula injection.
export function toCsv(table: ReportTable) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = "'" + text;
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return (
    '﻿' + [table.head, ...table.rows].map((row) => row.map(cell).join(',')).join('\r\n')
  );
}
