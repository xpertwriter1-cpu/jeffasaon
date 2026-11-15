import { randomBytes } from 'node:crypto';
import type { Invoice, Payment } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { darajaConfig } from '@/lib/mpesa-live';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { startMpesa, checkMpesa, resolveMpesa } from '@/actions/mpesa';
import { currency, date } from '@/lib/school';
import { invoiceTotals } from '@/lib/invoice-totals';
import { time } from '@/lib/day';
import { Table } from './ui';
export async function MpesaPanel({
  invoices,
  payments,
  students,
  selectedInvoice,
}: {
  invoices: Invoice[];
  payments: Payment[];
  students: { id: string; firstName: string; lastName: string; status: string }[];
  selectedInvoice?: string;
}) {
  const config = darajaConfig();
  if (!config) return null;
  const user = await requireUser(['parent']);
  const requests = await db.mpesaRequest.findMany({
    where: { parent: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const open = invoices.filter((invoice) => {
    const student = students.find((item) => item.id === invoice.student);
    return (
      student &&
      ['Admitted', 'Active'].includes(student.status) &&
      invoiceTotals(invoice, payments).balance > 0
    );
  });
  return (
    <section className="record-card">
      <h2 className="h3">Pay with M-PESA</h2>
      {config.env === 'sandbox' && (
        <p className="notice">
          Test mode: payments here are rehearsals and do not change balances.
        </p>
      )}
      {open.length ? (
        <ActionForm action={startMpesa} label="Send payment request to my phone">
          <Hidden name="requestKey" value={randomBytes(32).toString('hex')} />
          <div className="form-grid">
            <Field
              name="invoiceId"
              label="Invoice"
              required
              defaultValue={selectedInvoice}
            >
              <option value="">Choose an invoice</option>
              {open.map((invoice) => {
                const student = students.find((item) => item.id === invoice.student);
                return (
                  <option key={invoice.id} value={invoice.id}>
                    {student?.firstName} · {invoice.year} Term {invoice.term} · balance{' '}
                    {currency(invoiceTotals(invoice, payments).balance)}
                  </option>
                );
              })}
            </Field>
            <Field
              name="amount"
              label="Amount (KES, whole shillings)"
              type="number"
              min={1}
              max={250000}
              step="1"
              required
            />
            <Field
              name="phone"
              label="M-PESA phone number"
              type="tel"
              required
              maxLength={20}
              defaultValue={user.phone ?? ''}
            />
          </div>
          <p className="small-text muted">
            You will receive a prompt on your phone. Enter your M-PESA PIN to pay. The
            receipt is confirmed automatically.
          </p>
        </ActionForm>
      ) : (
        <p>No outstanding balances.</p>
      )}
      {requests.length > 0 && (
        <Table head={['Requested', 'Amount', 'Status', '']}>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>
                {date(request.createdAt)} {time(request.createdAt)}
              </td>
              <td>{currency(request.amount)}</td>
              <td>
                {request.status}
                {request.receiptNumber ? ' · ' + request.receiptNumber : ''}
              </td>
              <td>
                {['Pending', 'Unknown'].includes(request.status) && (
                  <ActionForm action={checkMpesa} label="Check status" className="stack">
                    <Hidden name="id" value={request.id} />
                  </ActionForm>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
export async function MpesaRequests() {
  await requireUser(['admin', 'bursar']);
  if (!darajaConfig()) return null;
  const requests = await db.mpesaRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const parents = await db.user.findMany({
    where: { id: { in: [...new Set(requests.map((r) => r.parent))] } },
    select: { id: true, name: true },
  });
  return (
    <section className="record-card">
      <h2 className="h3">M-PESA requests</h2>
      <p className="small-text muted">
        Successful requests are recorded as Paid automatically. “Needs review” means
        Safaricom confirmed payment but the receipt or amount must be matched to the
        M-PESA statement.
      </p>
      <Table
        head={['Requested', 'Parent / phone', 'Amount', 'Status', 'Action']}
        empty={!requests.length}
      >
        {requests.map((request) => (
          <tr key={request.id}>
            <td>
              {date(request.createdAt)} {time(request.createdAt)}
            </td>
            <td>
              {parents.find((p) => p.id === request.parent)?.name}
              <br />+{request.phone}
            </td>
            <td>{currency(request.amount)}</td>
            <td>
              {request.status}
              {request.receiptNumber ? ' · ' + request.receiptNumber : ''}
              {request.resultDesc && (
                <div className="small-text muted">{request.resultDesc}</div>
              )}
            </td>
            <td>
              {request.status === 'Needs review' && !request.payment && (
                <ActionForm
                  action={resolveMpesa}
                  label="Record payment"
                  className="stack"
                >
                  <Hidden name="id" value={request.id} />
                  <Field
                    name="receipt"
                    label="M-PESA receipt no."
                    required
                    maxLength={12}
                  />
                  <Field
                    name="amount"
                    label="Amount received"
                    type="number"
                    required
                    min={1}
                    defaultValue={request.amount}
                  />
                </ActionForm>
              )}
              {['Pending', 'Unknown'].includes(request.status) && (
                <ActionForm action={checkMpesa} label="Check status" className="stack">
                  <Hidden name="id" value={request.id} />
                </ActionForm>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
