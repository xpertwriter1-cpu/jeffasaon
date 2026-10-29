'use server';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { objectId, strings, UserError } from '@/lib/validation';
import { admissionGroups, documentTypes } from '@/lib/admission-fields';
import { validateAdmission, fileType, canChangeStatus } from '@/lib/admission-validation';
import { agreementVersion } from '@/lib/school';
import { limitRequests } from '@/lib/rate-limit';
const uploadRoot = path.resolve('private-uploads/admissions');
export async function submitAdmission(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent']);
    await limitRequests('admission', 10, 60 * 60 * 1000, user.id);
    const values = validateAdmission(strings(form));
    const documents: Prisma.AdmissionDocumentCreateInput[] = [];
    const files: { target: string; buffer: Buffer }[] = [];
    for (const kind of documentTypes) {
      const entries = form.getAll(kind.name);
      if (entries.length > 1) throw new UserError('Choose one document per field.');
      const file = entries[0];
      if (!(file instanceof File) || !file.size) continue;
      if (file.size > 5 * 1024 * 1024)
        throw new UserError('Documents must be no larger than 5 MB.');
      const buffer = Buffer.from(await file.arrayBuffer());
      const type = fileType(buffer);
      if (!type || (kind.name === 'childPhoto' && type.mimeType === 'application/pdf'))
        throw new UserError(
          'Use a PDF, PNG or JPEG document, and a PNG or JPEG child photo.',
        );
      const storedName = randomUUID() + type.extension;
      documents.push({
        kind: kind.name,
        storedName,
        originalName: path.basename(file.name).slice(0, 200),
        mimeType: type.mimeType,
        size: file.size,
        uploadedAt: new Date(),
      });
      files.push({ target: path.join(uploadRoot, storedName), buffer });
    }
    const detail: Record<string, string | Date | null> = {};
    for (const field of admissionGroups.flatMap((group) => group.fields)) {
      const value = values[field.name];
      detail[field.name] =
        field.type === 'date' ? (value ? new Date(value) : null) : value || null;
    }
    const written: string[] = [];
    try {
      await fs.mkdir(uploadRoot, { recursive: true });
      for (const file of files) {
        await fs.writeFile(file.target, file.buffer, { flag: 'wx' });
        written.push(file.target);
      }
      const student = await db.student.create({
        data: {
          ...detail,
          firstName: values.firstName!,
          lastName: values.lastName!,
          classLevel: values.classLevel!,
          parentName: values.guardianName!,
          parentPhone: values.parentPhone!,
          parentEmail: user.email,
          submittedBy: user.id,
          declarationAt: new Date(),
          documents,
        },
      });
      return '/parent/students/' + student.id;
    } catch (error) {
      await Promise.allSettled(written.map((file) => fs.unlink(file)));
      throw error;
    }
  });
}
export async function acceptEnrolment(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent']);
    const values = strings(form);
    const id = objectId.parse(values.id);
    if (values.agree !== 'yes' || values.agreementVersion !== agreementVersion)
      throw new UserError('Read and confirm the current enrolment agreement.');
    const student = await db.student.findFirst({
      where: { id, parentEmail: user.email },
    });
    if (!student) throw new UserError('Child record not found.');
    if (student.status !== 'Pending')
      throw new UserError('This application is no longer pending.');
    if (!student.enrolmentAcceptedAt) {
      const result = await db.student.updateMany({
        where: {
          id,
          parentEmail: user.email,
          status: 'Pending',
          OR: [{ enrolmentAcceptedAt: null }, { enrolmentAcceptedAt: { isSet: false } }],
        },
        data: {
          enrolmentAcceptedAt: new Date(),
          enrolmentAcceptedBy: user.id,
          enrolmentAgreementVersion: agreementVersion,
        },
      });
      if (!result.count)
        throw new UserError('The application changed. Reload the record.');
    }
    return '/parent/students/' + id;
  });
}
export async function approveAdmission(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin']);
    const values = strings(form);
    const id = objectId.parse(values.id);
    if (values.confirmReview !== 'yes')
      throw new UserError('Confirm that you reviewed the child record.');
    await db.$transaction(async (tx) => {
      const student = await tx.student.findUnique({ where: { id } });
      if (
        !student ||
        student.status !== 'Pending' ||
        !student.enrolmentAcceptedAt ||
        !student.enrolmentAcceptedBy ||
        student.enrolmentAgreementVersion !== agreementVersion
      )
        throw new UserError('The parent must accept enrolment before approval.');
      const year = new Intl.DateTimeFormat('en', {
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
      }).format(new Date());
      const counter = await tx.admissionCounter.upsert({
        where: { id: 'admission-' + year },
        create: { id: 'admission-' + year, sequence: 1 },
        update: { sequence: { increment: 1 } },
      });
      const result = await tx.student.updateMany({
        where: { id, status: 'Pending' },
        data: {
          status: 'Admitted',
          admissionNumber:
            student.admissionNumber ||
            'JPS-' + year + '-' + String(counter.sequence).padStart(5, '0'),
          admissionApprovedAt: new Date(),
          admissionApprovedBy: user.id,
          admissionApprovalBasis: 'Parent acceptance',
        },
      });
      if (!result.count)
        throw new UserError('The application changed. Reload the queue.');
    });
    return '/admin/admissions';
  });
}
export async function changeStudentStatus(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin']);
    const values = strings(form);
    const id = objectId.parse(values.id);
    const next = values.status || '';
    await db.$transaction(async (tx) => {
      const student = await tx.student.findUnique({ where: { id } });
      if (!student || !canChangeStatus(student.status, next))
        throw new UserError(
          'Use the approval queue to admit a child. Final records cannot be reopened.',
        );
      let activationPayment: string | undefined;
      if (next === 'Active' && student.status !== 'Active') {
        const payments = await tx.payment.findMany({
          where: {
            student: id,
            status: 'Paid',
            amount: { gt: 0 },
            createdAt: { gte: student.admissionApprovedAt ?? new Date(0) },
          },
        });
        activationPayment = payments.find(
          (payment) => payment.invoice && payment.verifiedAt,
        )?.id;
        if (!activationPayment)
          throw new UserError(
            'A fee payment after admission must be verified before activation.',
          );
      }
      const result = await tx.student.updateMany({
        where: { id, status: student.status },
        data: {
          status: next,
          ...(activationPayment
            ? { activationPayment, activatedAt: new Date(), activatedBy: user.id }
            : {}),
        },
      });
      if (!result.count)
        throw new UserError('The record changed. Reload the student register.');
    });
    return '/admin/students';
  });
}
