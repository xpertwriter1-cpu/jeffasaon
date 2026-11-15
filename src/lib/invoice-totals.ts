import type { FeeItem, Payment } from '@prisma/client';
// Totals in whole cents to avoid floating-point drift. Parents may pay in any number
// of instalments: only verified (Paid) payments reduce the balance; payments awaiting
// verification are reported separately so nobody is asked to pay twice.
export function invoiceSummary(
  invoice: { id: string; items: Pick<FeeItem, 'amount'>[] },
  payments: Pick<Payment, 'invoice' | 'status' | 'amount'>[],
) {
  const cents = (value: number) => Math.round(value * 100);
  const mine = payments.filter((payment) => payment.invoice === invoice.id);
  const total = invoice.items.reduce((sum, item) => sum + cents(item.amount), 0);
  const paid = mine
    .filter((payment) => payment.status === 'Paid')
    .reduce((sum, payment) => sum + cents(payment.amount), 0);
  const pending = mine
    .filter((payment) => payment.status === 'Pending verification')
    .reduce((sum, payment) => sum + cents(payment.amount), 0);
  return {
    total: total / 100,
    paid: paid / 100,
    balance: (total - paid) / 100,
    pending: pending / 100,
    // What a parent can still pay without overpaying, allowing for unverified payments.
    payable: Math.max(0, total - paid - pending) / 100,
    instalments: mine.filter((payment) => payment.status === 'Paid').length,
  };
}
export function invoiceTotals(
  invoice: { id: string; items: Pick<FeeItem, 'amount'>[] },
  payments: Pick<Payment, 'invoice' | 'status' | 'amount'>[],
) {
  const { total, paid, balance } = invoiceSummary(invoice, payments);
  return { total, paid, balance };
}
