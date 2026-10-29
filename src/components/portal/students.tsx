import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ActionForm } from '@/components/action-form';
import { Field, Check, Hidden } from '@/components/fields';
import { PageTitle } from '@/components/portal-shell';
import { PrintButton } from '@/components/print-button';
import { admissionGroups, documentTypes } from '@/lib/admission-fields';
import { agreementText, agreementVersion, date } from '@/lib/school';
import { objectId } from '@/lib/validation';
import {
  submitAdmission,
  acceptEnrolment,
  approveAdmission,
  changeStudentStatus,
} from '@/actions/admissions';
export async function AdmissionForm({ programme }: { programme?: string }) {
  const user = await requireUser(['parent']);
  return (
    <>
      <PageTitle title="Your child's admission application">
        Complete the sections below. You can add documents now or contact the school for
        guidance.
      </PageTitle>
      <p className="notice">
        Submitting an application does not confirm a place. After submission, read and
        accept the enrolment agreement for school review.
      </p>
      <ActionForm action={submitAdmission} label="Submit application">
        {admissionGroups.map((group) => (
          <section className="form-section" key={group.title}>
            <h2>{group.title}</h2>
            <div className="form-grid">
              {group.fields.map((field) => (
                <Field
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  type={field.type}
                  required={field.required}
                  maxLength={field.max}
                  defaultValue={
                    field.name === 'classLevel'
                      ? programme
                      : field.name === 'guardianName'
                        ? user.name
                        : field.name === 'parentPhone'
                          ? (user.phone ?? '')
                          : undefined
                  }
                >
                  {field.options ? (
                    <>
                      <option value="">Please select</option>
                      {field.options.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </>
                  ) : undefined}
                </Field>
              ))}
            </div>
          </section>
        ))}
        <section className="form-section">
          <h2>Supporting documents</h2>
          <p className="muted small-text">
            PDF, PNG or JPEG, up to 5 MB each. Child photos must be PNG or JPEG. Files
            stay private.
          </p>
          <div className="form-grid">
            {documentTypes.map((kind) => (
              <label className="field" key={kind.name}>
                <span>{kind.label} (optional)</span>
                <input
                  name={kind.name}
                  type="file"
                  accept={
                    kind.name === 'childPhoto'
                      ? 'image/png,image/jpeg'
                      : 'application/pdf,image/png,image/jpeg'
                  }
                />
              </label>
            ))}
          </div>
        </section>
        <Check name="declaration">
          I confirm the information is accurate and authorise the school to use these
          details to care for my child and review this application.
        </Check>
      </ActionForm>
    </>
  );
}
export async function StudentRegister({ approvals = false }: { approvals?: boolean }) {
  const user = await requireUser(approvals ? ['admin'] : ['admin', 'teacher', 'bursar']);
  const students = await db.student.findMany({
    where: approvals ? { status: 'Pending' } : {},
    orderBy: { createdAt: approvals ? 'asc' : 'desc' },
    take: 500,
  });
  return (
    <>
      <PageTitle title={approvals ? 'Admission approvals' : 'Student register'}>
        {approvals
          ? 'Review the child record and the parent’s enrolment agreement before approving.'
          : 'The most recent 500 records. Use a child’s name to open their full record.'}
      </PageTitle>
      {!students.length ? (
        <p className="empty">No matching student records.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Child</th>
                <th>Programme</th>
                <th>Parent</th>
                <th>Status</th>
                <th>{approvals ? 'Review' : 'Admission number'}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>
                    {user.role === 'bursar' ? (
                      student.firstName + ' ' + student.lastName
                    ) : (
                      <Link href={'/admin/students/' + student.id}>
                        {student.firstName} {student.lastName}
                      </Link>
                    )}
                  </td>
                  <td>{student.classLevel}</td>
                  <td>
                    {student.parentName}
                    <br />
                    {student.parentEmail}
                  </td>
                  <td>
                    <span className="status">{student.status}</span>
                  </td>
                  <td>
                    {approvals ? (
                      student.enrolmentAcceptedAt &&
                      student.enrolmentAgreementVersion === agreementVersion ? (
                        <ActionForm
                          action={approveAdmission}
                          label="Approve admission"
                          className="stack"
                        >
                          <Hidden name="id" value={student.id} />
                          <Check name="confirmReview">I reviewed the child record.</Check>
                        </ActionForm>
                      ) : (
                        <span>Awaiting parent agreement</span>
                      )
                    ) : (
                      student.admissionNumber || 'Pending'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export async function StudentRecord({ id, parent }: { id: string; parent: boolean }) {
  const user = await requireUser(parent ? ['parent'] : ['admin', 'teacher']);
  if (!objectId.safeParse(id).success) notFound();
  const student = await db.student.findFirst({
    where: { id, ...(parent ? { parentEmail: user.email } : {}) },
  });
  if (!student) notFound();
  return (
    <>
      <PageTitle title={student.firstName + ' ' + student.lastName}>
        {student.classLevel +
          ' / ' +
          student.status +
          (student.admissionNumber ? ' / ' + student.admissionNumber : '')}
      </PageTitle>
      <div className="record-actions">
        <PrintButton />
        <Link
          className="button secondary"
          href={parent ? '/parent/dashboard' : '/admin/students'}
        >
          Back to records
        </Link>
      </div>
      {parent && student.status === 'Pending' && (
        <div className="record-card">
          <h2 className="h3">Enrolment agreement</h2>
          <p>{agreementText}</p>
          {student.enrolmentAcceptedAt ? (
            <p className="notice success">
              Accepted on {date(student.enrolmentAcceptedAt)}. The school will review your
              application.
            </p>
          ) : (
            <ActionForm action={acceptEnrolment} label="Accept enrolment agreement">
              <Hidden name="id" value={id} />
              <Hidden name="agreementVersion" value={agreementVersion} />
              <Check name="agree">I have read and accept the enrolment agreement.</Check>
            </ActionForm>
          )}
        </div>
      )}
      {admissionGroups.map((group) => (
        <section className="record-card" key={group.title}>
          <h2 className="h3">{group.title}</h2>
          <dl className="record-details">
            {group.fields.map((field) => {
              const value = student[field.name as keyof typeof student];
              return (
                <div key={field.name}>
                  <dt>{field.label}</dt>
                  <dd>
                    {value instanceof Date
                      ? date(value)
                      : typeof value === 'string'
                        ? value || 'Not provided'
                        : 'Not provided'}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
      <section className="record-card">
        <h2 className="h3">Documents</h2>
        {student.documents.length ? (
          <ul>
            {student.documents.map((document) => (
              <li key={document.storedName}>
                <a
                  href={
                    '/' +
                    (parent ? 'parent' : 'admin') +
                    '/students/' +
                    id +
                    '/documents/' +
                    document.storedName
                  }
                >
                  {documentTypes.find((type) => type.name === document.kind)?.label ||
                    document.kind}
                  : {document.originalName}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No documents uploaded.</p>
        )}
      </section>
      <section className="record-card">
        <h2 className="h3">Enrolment history</h2>
        <p>
          Parent acceptance: {date(student.enrolmentAcceptedAt)}
          <br />
          School approval: {date(student.admissionApprovedAt)}
          <br />
          Activation: {date(student.activatedAt)}
        </p>
      </section>
      {!parent && user.role === 'admin' && (
        <ActionForm action={changeStudentStatus} label="Update status">
          <Hidden name="id" value={id} />
          <Field name="status" label="Student status" defaultValue={student.status}>
            {['Pending', 'Admitted', 'Active', 'Graduated', 'Withdrawn'].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </Field>
          <p className="muted small-text">
            Admission requires the approval queue. Activation requires verified fees paid
            after admission.
          </p>
        </ActionForm>
      )}
    </>
  );
}
