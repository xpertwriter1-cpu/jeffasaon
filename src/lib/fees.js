function invoiceTotals(invoice, payments) {
  const totalCents = invoice.items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  const paidCents = payments.filter(p => String(p.invoice && p.invoice._id || p.invoice) === String(invoice._id) && p.status === 'Paid')
    .reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
  return { total: totalCents / 100, paid: paidCents / 100, balance: (totalCents - paidCents) / 100 };
}
function validMoney(value) {
  return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value)) && Number(value) <= 10000000;
}
module.exports = { invoiceTotals, validMoney };
