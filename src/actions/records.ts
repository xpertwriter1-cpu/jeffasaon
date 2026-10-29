'use server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { objectId, period, money, phone, strings, UserError } from '@/lib/validation';
import { areas, ratings, feeLabels } from '@/lib/school';
const eligible = ['Admitted', 'Active'];
export async function createInvoice(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin', 'bursar']);
    const values = strings(form);
    const student = await db.student.findUnique({
      where: { id: objectId.parse(values.studentId) },
    });
    const term = period.parse(values);
    if (!student || !eligible.includes(student.status))
      throw new UserError('Choose an admitted or active student.');
    const items = feeLabels.flatMap((label, index) => {
      const raw = values['fee' + index] || '0';
      if (raw === '0' || raw === '0.00') return [];
      return [{ label, amount: money.parse(raw) }];
    });
    if (!items.length) throw new UserError('Enter at least one fee amount.');
    await db.invoice.create({
      data: { student: student.id, ...term, items, createdBy: user.id },
    });
    return '/admin/fees';
  });
}
export async function submitPayment(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent']);
    const values = z
      .object({
        invoiceId: objectId,
        amount: money,
        parentPhone: phone,
        method: z.enum(['M-Pesa', 'Bank transfer', 'Cash']),
        reference: z.string().max(100).optional(),
      })
      .parse(strings(form));
    const invoice = await db.invoice.findUnique({ where: { id: values.invoiceId } });
    const student =
      invoice &&
      (await db.student.findFirst({
        where: { id: invoice.student, parentEmail: user.email, status: { in: eligible } },
      }));
    if (!invoice || !student)
      throw new UserError('Invoice not found or child not yet admitted.');
    const reference = (values.reference || '').toUpperCase();
    if (values.method !== 'Cash' && !reference)
      throw new UserError('Enter the transaction reference.');
    await db.payment.create({
      data: {
        student: student.id,
        invoice: invoice.id,
        parent: user.id,
        parentName: user.name,
        parentPhone: values.parentPhone,
        amount: values.amount,
        method: values.method,
        reference,
        ...(reference ? { transactionKey: values.method + ':' + reference } : {}),
      },
    });
    return '/parent/payments';
  });
}
export async function verifyPayment(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin', 'bursar']);
    const values = z
      .object({
        id: objectId,
        status: z.enum(['Pending verification', 'Paid', 'Failed', 'Refunded']),
        confirmReceived: z.string().optional(),
      })
      .parse(strings(form));
    const payment = await db.payment.findUnique({ where: { id: values.id } });
    if (!payment) throw new UserError('Payment not found.');
    if (
      values.status === 'Paid' &&
      (values.confirmReceived !== 'yes' ||
        (payment.method !== 'Cash' && !payment.reference))
    )
      throw new UserError('Confirm school receipt and check the transaction reference.');
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: values.status,
        ...(values.status === 'Paid'
          ? { verifiedBy: user.id, verifiedAt: new Date() }
          : {}),
        ...(payment.reference
          ? { transactionKey: payment.method + ':' + payment.reference.toUpperCase() }
          : {}),
      },
    });
    return '/admin/payments';
  });
}
export async function saveReport(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin', 'teacher']);
    const values = strings(form);
    const term = period.parse(values);
    const studentId = objectId.parse(values.studentId);
    const attendance = z
      .object({
        daysPresent: z.coerce.number().int().min(0),
        daysPossible: z.coerce.number().int().min(0).max(366),
        comments: z.string().max(3000),
      })
      .parse(values);
    if (attendance.daysPresent > attendance.daysPossible)
      throw new UserError('Days present cannot exceed possible school days.');
    const assessments = areas.map((area, index) => {
      const rating = values['rating' + index];
      if (!rating || !ratings.includes(rating))
        throw new UserError('Rate every learning area.');
      return { area, rating };
    });
    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student) throw new UserError('Student not found.');
    const data = {
      student: studentId,
      classLevel: student.classLevel,
      ...term,
      ...attendance,
      assessments,
      updatedAt: new Date(),
    };
    if (values.id) {
      const id = objectId.parse(values.id);
      const existing = await db.report.findUnique({ where: { id } });
      if (
        !existing ||
        existing.status !== 'Draft' ||
        (user.role !== 'admin' && existing.teacher !== user.id)
      )
        throw new UserError('You can only edit your own draft reports.');
      if (existing.student !== studentId)
        throw new UserError('The report student cannot be changed.');
      const updated = await db.report.updateMany({
        where: { id, status: 'Draft' },
        data: { ...data, assessments: { set: assessments } },
      });
      if (!updated.count) throw new UserError('The report changed. Reload it.');
    } else {
      if (!eligible.includes(student.status))
        throw new UserError('Reports require an admitted or active student.');
      await db.report.create({ data: { ...data, teacher: user.id } });
    }
    return '/admin/reports';
  });
}
export async function publishReport(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin']);
    const values = strings(form);
    const id = objectId.parse(values.id);
    const publish = values.mode === 'publish';
    const result = await db.report.updateMany({
      where: { id, ...(publish ? { status: 'Draft' } : { status: 'Published' }) },
      data: publish
        ? { status: 'Published', approvedBy: user.id, publishedAt: new Date() }
        : { status: 'Draft', approvedBy: { unset: true }, publishedAt: { unset: true } },
    });
    if (!result.count) throw new UserError('The report changed. Reload the page.');
    return '/admin/reports';
  });
}
