import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden, Check } from '@/components/fields';
import { PageTitle } from '@/components/portal-shell';
import { PrintButton } from '@/components/print-button';
import { createInvoice, submitPayment, verifyPayment } from '@/actions/records';
import { currency, date, feeLabels } from '@/lib/school';
import { invoiceTotals } from '@/lib/invoice-totals';
import { objectId } from '@/lib/validation';
import { SandboxPanel } from './sandbox';
export async function FeesPage({
  parent,
  studentId,
}: {
  parent: boolean;
  studentId?: string;
}) {
  const user = await requireUser(parent ? ['parent'] : ['admin', 'bursar']);
  if (studentId && !objectId.safeParse(studentId).success) notFound();
  const students = await db.student.findMany({
    where: {
      ...(parent ? { parentEmail: user.email } : {}),
      ...(studentId ? { id: studentId } : {}),
    },
    orderBy: { firstName: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      admissionNumber: true,
    },
  });
  if (studentId && !students.length) notFound();
  const ids = students.map((student) => student.id);
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({
      where: { student: { in: ids } },
      orderBy: [{ year: 'desc' }, { term: 'desc' }],
    }),
    db.payment.findMany({ where: { student: { in: ids } } }),
  ]);
  return (
    <>
      <PageTitle
        title={
          studentId
            ? 'Student fee statement'
            : parent
              ? 'Your fee balances'
              : 'Term fee invoices'
        }
      >
        Balances change only when the school verifies receipt of a payment.
      </PageTitle>
      {studentId && (
        <>
          <p>
            {students[0]?.firstName} {students[0]?.lastName} /{' '}
            {students[0]?.admissionNumber}
          </p>
          <PrintButton />
        </>
      )}
      {!parent && !studentId && (
        <ActionForm action={createInvoice} label="Create term invoice">
          <div className="form-grid">
            <Field name="studentId" label="Student" required>
              <option value="">Choose a student</option>
              {students
                .filter((student) => ['Admitted', 'Active'].includes(student.status))
                .map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                  </option>
                ))}
            </Field>
            <Field
              name="year"
              label="Year"
              type="number"
              defaultValue={new Date().getFullYear()}
              min={2000}
              max={2100}
              required
            />
            <Field name="term" label="Term" required>
              {[1, 2, 3].map((term) => (
                <option key={term}>{term}</option>
              ))}
            </Field>
            {feeLabels.map((label, index) => (
              <Field
                key={label}
                name={'fee' + index}
                label={label + ' (KES)'}
                type="number"
                defaultValue="0"
                min={0}
                step="0.01"
              />
            ))}
          </div>
        </ActionForm>
      )}
      {invoices.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student / term</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th className="no-print">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const student = students.find((item) => item.id === invoice.student);
                const totals = invoiceTotals(invoice, payments);
                return (
                  <tr key={invoice.id}>
                    <td>
                      {student?.firstName} {student?.lastName}
                      <br />
                      {invoice.year} / Term {invoice.term}
                    </td>
                    <td>
                      {invoice.items.map((item) => (
                        <div key={item.label}>
                          {item.label}: {currency(item.amount)}
                        </div>
                      ))}
                    </td>
                    <td>{currency(totals.total)}</td>
                    <td>{currency(totals.paid)}</td>
                    <td>{currency(totals.balance)}</td>
                    <td className="no-print">
                      <Link
                        href={
                          '/' +
                          (parent ? 'parent' : 'admin') +
                          '/fees/' +
                          invoice.student +
                          '/statement'
                        }
                      >
                        Statement
                      </Link>
                      {parent && (
                        <>
                          <br />
                          <Link href={'/parent/payments?invoice=' + invoice.id}>
                            Submit payment
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No fee invoices yet.</p>
      )}
    </>
  );
}
export async function PaymentsPage({
  parent,
  selectedInvoice,
}: {
  parent: boolean;
  selectedInvoice?: string;
}) {
  const user = await requireUser(parent ? ['parent'] : ['admin', 'bursar']);
  const students = await db.student.findMany({
    where: parent ? { parentEmail: user.email } : {},
    select: { id: true, firstName: true, lastName: true, status: true },
  });
  const ids = students.map((student) => student.id);
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({ where: { student: { in: ids } } }),
    db.payment.findMany({
      where: parent ? { student: { in: ids } } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
  return (
    <>
      <PageTitle title={parent ? 'Payments' : 'Payment verification'}>
        {parent
          ? 'Record a payment for the bursar to verify. This form does not collect money.'
          : 'Verify actual receipt before marking a payment Paid.'}
      </PageTitle>
      {parent && (
        <>
          <ActionForm action={submitPayment} label="Submit payment record">
            <div className="form-grid">
              <Field
                name="invoiceId"
                label="Invoice"
                required
                defaultValue={selectedInvoice}
              >
                <option value="">Choose an invoice</option>
                {invoices
                  .filter((invoice) =>
                    students.some(
                      (student) =>
                        student.id === invoice.student &&
                        ['Admitted', 'Active'].includes(student.status),
                    ),
                  )
                  .map((invoice) => {
                    const student = students.find(
                      (student) => student.id === invoice.student,
                    );
                    return (
                      <option key={invoice.id} value={invoice.id}>
                        {student?.firstName} {student?.lastName} / {invoice.year} term{' '}
                        {invoice.term}
                      </option>
                    );
                  })}
              </Field>
              <Field
                name="amount"
                label="Amount (KES)"
                type="number"
                min={1}
                max={10000000}
                step="0.01"
                required
              />
              <Field name="method" label="Payment method" required>
                {['M-Pesa', 'Bank transfer', 'Cash'].map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </Field>
              <Field
                name="reference"
                label="Transaction reference (required except Cash)"
                maxLength={100}
              />
              <Field
                name="parentPhone"
                label="Phone number"
                type="tel"
                defaultValue={user.phone ?? ''}
                required
                maxLength={30}
              />
            </div>
          </ActionForm>
          <SandboxPanel invoices={invoices} students={students} />
        </>
      )}
      {payments.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date / child</th>
                <th>Amount</th>
                <th>Method / reference</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const student = students.find(
                  (student) => student.id === payment.student,
                );
                return (
                  <tr key={payment.id}>
                    <td>
                      {date(payment.createdAt)}
                      <br />
                      {student?.firstName} {student?.lastName}
                    </td>
                    <td>{currency(payment.amount)}</td>
                    <td>
                      {payment.method}
                      <br />
                      {payment.reference || 'No reference'}
                    </td>
                    <td>
                      <span className="status">{payment.status}</span>
                    </td>
                    <td>
                      {payment.status === 'Paid' && (
                        <Link
                          href={
                            '/' +
                            (parent ? 'parent' : 'admin') +
                            '/payments/' +
                            payment.id +
                            '/receipt'
                          }
                        >
                          Receipt
                        </Link>
                      )}
                      {!parent && (
                        <ActionForm
                          action={verifyPayment}
                          label="Save verification"
                          className="stack"
                        >
                          <Hidden name="id" value={payment.id} />
                          <Field
                            name="status"
                            label="Status"
                            defaultValue={payment.status}
                          >
                            {['Pending verification', 'Paid', 'Failed', 'Refunded'].map(
                              (status) => (
                                <option key={status}>{status}</option>
                              ),
                            )}
                          </Field>
                          <label className="check">
                            <input type="checkbox" name="confirmReceived" value="yes" />
                            <span>I verified receipt of this payment.</span>
                          </label>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No payment records yet.</p>
      )}
    </>
  );
}
export async function Receipt({ id, parent }: { id: string; parent: boolean }) {
  const user = await requireUser(parent ? ['parent'] : ['admin', 'bursar']);
  if (!objectId.safeParse(id).success) notFound();
  const payment = await db.payment.findFirst({ where: { id, status: 'Paid' } });
  const student = payment?.student
    ? await db.student.findUnique({ where: { id: payment.student } })
    : null;
  if (!payment || (parent && student?.parentEmail !== user.email)) notFound();
  return (
    <>
      <PageTitle title="Payment receipt" />
      <PrintButton />
      <div className="record-card">
        <h2>{currency(payment.amount)}</h2>
        <dl className="record-details">
          {[
            ['Receipt reference', payment.id],
            [
              'Child',
              student ? student.firstName + ' ' + student.lastName : 'Legacy payment',
            ],
            ['Parent', payment.parentName],
            ['Method', payment.method],
            ['Transaction reference', payment.reference || 'Cash'],
            ['Date received', date(payment.verifiedAt)],
            ['Status', payment.status],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
