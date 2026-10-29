import type { FeeItem, Payment } from '@prisma/client';
export function invoiceTotals(
  invoice: { id: string; items: FeeItem[] },
  payments: Pick<Payment, 'invoice' | 'status' | 'amount'>[],
) {
  const total = invoice.items.reduce(
    (sum, item) => sum + Math.round(item.amount * 100),
    0,
  );
  const paid = payments
    .filter((payment) => payment.invoice === invoice.id && payment.status === 'Paid')
    .reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  return { total: total / 100, paid: paid / 100, balance: (total - paid) / 100 };
}
