import { randomBytes } from 'node:crypto';
import type { Invoice } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { sandboxReady } from '@/lib/mpesa-sandbox';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { startSandbox, checkSandbox } from '@/actions/sandbox';
import { currency, date } from '@/lib/school';
export async function SandboxPanel({
  invoices,
  students,
}: {
  invoices: Invoice[];
  students: { id: string; firstName: string; lastName: string; status: string }[];
}) {
  if (process.env.MPESA_ENV !== 'sandbox') return null;
  const user = await requireUser(['parent']);
  const attempts = await db.mpesaSandboxAttempt.findMany({
    where: { parent: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return (
    <section className="record-card">
      <h2 className="h3">M-Pesa sandbox tests</h2>
      <p className="notice">
        Sandbox only. These tests do not collect school fees or change a child’s balance.
      </p>
      {sandboxReady() ? (
        <ActionForm action={startSandbox} label="Send test request">
          <Hidden name="requestKey" value={randomBytes(32).toString('hex')} />
          <Field name="invoiceId" label="Test invoice" required>
            <option value="">Choose an invoice</option>
            {invoices
              .filter((invoice) =>
                students.some(
                  (student) =>
                    student.id === invoice.student &&
                    ['Admitted', 'Active'].includes(student.status),
                ),
              )
              .map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {students.find((student) => student.id === invoice.student)?.firstName}{' '}
                  / {invoice.year} term {invoice.term}
                </option>
              ))}
          </Field>
          <Field
            name="amount"
            label="Test amount (KES)"
            type="number"
            min={1}
            max={150000}
            required
          />
          <Field
            name="parentPhone"
            label="Kenyan test mobile number"
            type="tel"
            required
          />
        </ActionForm>
      ) : (
        <p>
          Sandbox setup is incomplete. Ask the school administrator to check the
          configuration.
        </p>
      )}
      {attempts.map((attempt) => (
        <div className="record-card" key={attempt.id}>
          <p>
            {date(attempt.createdAt)} / {currency(attempt.amount)} / {attempt.status}
          </p>
          <ActionForm action={checkSandbox} label="Check test status" className="stack">
            <Hidden name="id" value={attempt.id} />
          </ActionForm>
        </div>
      ))}
    </section>
  );
}
