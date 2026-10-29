const express = require('express');
const crypto = require('crypto');
const Student = require('../models/Student');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Report = require('../models/Report');
const MpesaSandboxAttempt = require('../models/MpesaSandboxAttempt');
const mpesa = require('../lib/mpesa');
const { requireLogin, requireRole } = require('../middleware/auth');
const { invoiceTotals, validMoney } = require('../lib/fees');
const r = express.Router();
const finance = requireRole('admin', 'bursar');
const teaching = requireRole('admin', 'teacher');
const parent = requireRole('parent');
const wrap = fn => (q, s, n) => Promise.resolve(fn(q, s, n)).catch(e => {
  if (e.code === 11000) return s.status(409).send('A record for this student and term, or this transaction reference, already exists.');
  if (e.name === 'ValidationError' || e.name === 'CastError') return s.status(400).send('Invalid record details.');
  n(e);
});
const id = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const period = b => /^\d{4}$/.test(String(b.year)) && Number(b.year) >= 2000 && Number(b.year) <= 2100 && ['1','2','3'].includes(String(b.term));
const eligibleStudentStatuses = ['Admitted', 'Active'];
const eligibleStudents = () => Student.find({ status: { $in: eligibleStudentStatuses } }).sort({ firstName: 1 });
const ownedStudents = q => Student.find({ parentEmail: q.session.user.email });
const paymentQuery = (q, students) => ({ student: { $in: students.map(st => st._id) } });
// Protect state-changing record operations, without affecting the existing public routes.
r.use((q, s, n) => {
  if (!/^\/(admin|parent)\/(fees|payments|reports)(\/|$)/.test(q.path)) return n('router');
  requireLogin(q, s, () => {
    if (!q.session.recordToken) q.session.recordToken = crypto.randomBytes(32).toString('hex');
    s.locals.recordToken = q.session.recordToken;
    if (q.method === 'POST' && q.body._csrf !== q.session.recordToken) return s.status(403).send('Your form expired. Reload the page and try again.');
    n();
  });
});

r.get('/admin/fees', finance, wrap(async (q, s) => {
  const [students, invoiceStudents, invoices, payments] = await Promise.all([
    Student.find().sort({ firstName: 1 }), eligibleStudents(), Invoice.find().populate('student').sort({ year: -1, term: -1 }), Payment.find({ status: 'Paid', invoice: { $exists: true } })
  ]);
  s.render('pages/fees', { title: 'Term fees', staff: true, students, invoiceStudents, invoices, payments, invoiceTotals });
}));
r.post('/admin/fees', finance, wrap(async (q, s) => {
  const b = q.body;
  if (!id(b.studentId) || !period(b)) return s.status(400).send('Choose a student, year and term.');
  const student = await Student.findById(b.studentId);
  if (!student) return s.status(404).send('Student not found.');
  if (!eligibleStudentStatuses.includes(student.status)) return s.status(409).send('Fee invoices can only be created for admitted or active students.');
  const labels = ['Tuition', 'Meals', 'Transport', 'Admission fee', 'Uniform', 'Other'];
  const items = [];
  for (let i = 0; i < labels.length; i++) {
    const value = b['fee' + i] || '0';
    if (!validMoney(value)) return s.status(400).send('Enter valid fee amounts with at most two decimal places.');
    if (Number(value) > 0) items.push({ label: labels[i], amount: Number(value) });
  }
  if (!items.length) return s.status(400).send('Enter at least one fee amount.');
  await Invoice.create({ student: student._id, year: b.year, term: b.term, items, createdBy: q.session.user.id });
  q.session.flash = { type: 'success', message: 'Term invoice created. Parents can now view it and submit payments.' };
  s.redirect('/admin/fees');
}));
r.get('/parent/fees', parent, wrap(async (q, s) => {
  const students = await ownedStudents(q);
  const [invoices, payments] = await Promise.all([
    Invoice.find({ student: { $in: students.map(st => st._id) } }).populate('student').sort({ year: -1, term: -1 }),
    Payment.find(paymentQuery(q, students))
  ]);
  s.render('pages/fees', { title: 'Fee balances', staff: false, students, invoices, payments, invoiceTotals });
}));
r.get(['/parent/fees/:id/statement', '/admin/fees/:id/statement'], wrap(async (q, s) => {
  const parentView = q.path.startsWith('/parent');
  if ((parentView && q.session.user.role !== 'parent') || (!parentView && !['admin','bursar'].includes(q.session.user.role))) return s.sendStatus(403);
  if (!id(q.params.id)) return s.sendStatus(404);
  const student = await Student.findById(q.params.id);
  if (!student || (parentView && student.parentEmail !== q.session.user.email)) return s.sendStatus(404);
  const [invoices, payments] = await Promise.all([
    Invoice.find({ student: student._id }).sort({ year: 1, term: 1 }),
    Payment.find({ student: student._id }).sort({ createdAt: 1 })
  ]);
  s.render('pages/statement', { title: 'Student fee statement', student, invoices, payments, invoiceTotals, staff: !parentView });
}));
async function paymentPage(q, s, error = null, status = 200) {
  const students = await ownedStudents(q);
  const [invoices, payments] = await Promise.all([
    Invoice.find({ student: { $in: students.map(st => st._id) } }).populate('student').sort({ year: -1, term: -1 }),
    Payment.find(paymentQuery(q, students)).populate('student').populate('invoice').sort({ createdAt: -1 })
  ]);
  const sandboxAttempts = process.env.MPESA_ENV === 'sandbox'
    ? await MpesaSandboxAttempt.find({parent:q.session.user.id}).sort({createdAt:-1}).limit(10) : [];
  s.status(status).render('pages/payments', { title: 'Fees and payments', students, invoices: invoices.filter(inv => inv.student && ['Admitted','Active'].includes(inv.student.status)), payments, error, invoiceTotals, selectedInvoice: String(q.query.invoice || ''),
    sandboxEnabled:process.env.MPESA_ENV === 'sandbox', sandboxReady:mpesa.ready(), sandboxAttempts, sandboxRequestKey:crypto.randomBytes(32).toString('hex') });
}
r.get('/parent/payments', parent, wrap(async (q, s) => paymentPage(q, s)));
r.post('/parent/payments', parent, wrap(async (q, s) => {
  const b = q.body;
  const methods = ['M-Pesa', 'Bank transfer', 'Cash'];
  const reference = String(b.reference || '').trim().toUpperCase();
  if (!id(b.invoiceId) || !validMoney(b.amount) || Number(b.amount) < 1 || !methods.includes(b.method) || !String(b.parentPhone || '').trim() || reference.length > 100 || (b.method !== 'Cash' && !reference)) {
    return paymentPage(q, s, 'Choose an invoice, enter a valid amount and phone number, and supply the transaction reference for M-Pesa or bank payments.', 400);
  }
  const invoice = await Invoice.findById(b.invoiceId).populate('student');
  if (!invoice || !invoice.student || invoice.student.parentEmail !== q.session.user.email) return s.status(404).send('Invoice not found.');
  if (!['Admitted','Active'].includes(invoice.student.status)) return s.status(409).send('The school must admit the child before a fee payment can be submitted.');
  await Payment.create({ invoice: invoice._id, student: invoice.student._id, parent: q.session.user.id, parentName: q.session.user.name,
    parentPhone: String(b.parentPhone).trim(), amount: Number(b.amount), purpose: 'Tuition', method: b.method, reference,
    ...(reference ? { transactionKey: b.method + ':' + reference } : {}), status: 'Pending verification' });
  q.session.flash = { type: 'success', message: 'Payment submitted. Your balance changes only after the bursar verifies receipt.' };
  s.redirect('/parent/payments');
}));
r.get('/admin/payments', finance, wrap(async (q, s) => {
  s.render('pages/admin-payments', { title: 'Payment verification', payments: await Payment.find().populate('student').populate('invoice').sort({ createdAt: -1 }) });
}));
r.post('/admin/payments/:id/status', finance, wrap(async (q, s) => {
  if (!id(q.params.id) || !['Pending verification', 'Paid', 'Failed', 'Refunded'].includes(q.body.status)) return s.status(400).send('Invalid payment status.');
  const payment = await Payment.findById(q.params.id);
  if (!payment) return s.status(404).send('Payment not found.');
  if (q.body.status === 'Paid') {
    if (payment.method !== 'Cash' && !payment.reference) return s.status(400).send('A transaction reference is required before verification.');
    if (q.body.confirmReceived !== 'yes') return s.status(400).send('Confirm that the school has received this payment.');
    if (payment.reference) payment.transactionKey = payment.method + ':' + payment.reference.trim().toUpperCase();
    payment.verifiedBy = q.session.user.id; payment.verifiedAt = new Date();
  }
  payment.status = q.body.status;
  await payment.save();
  s.redirect('/admin/payments');
}));
r.get(['/parent/payments/:id/receipt', '/admin/payments/:id/receipt'], wrap(async (q, s) => {
  const role = q.session.user.role;
  if ((q.path.startsWith('/admin') && !['admin','bursar'].includes(role)) || (q.path.startsWith('/parent') && role !== 'parent')) return s.sendStatus(403);
  if (!id(q.params.id)) return s.sendStatus(404);
  const payment = await Payment.findOne({ _id: q.params.id, status: 'Paid' }).populate('student').populate('invoice');
  if (!payment) return s.status(404).send('A receipt is available only for a verified payment.');
  if (role === 'parent' && (!payment.student || payment.student.parentEmail !== q.session.user.email)) return s.sendStatus(404);
  s.render('pages/receipt', { title: 'Payment receipt', payment });
}));

r.get('/admin/reports', teaching, wrap(async (q, s) => {
  const [students, reports] = await Promise.all([Student.find().sort({ firstName: 1 }), Report.find().populate('student').populate('teacher', 'name').sort({ year: -1, term: -1 })]);
  s.render('pages/reports', { title: 'Student reports', staff: true, students, reports });
}));
r.get('/parent/reports', parent, wrap(async (q, s) => {
  const students = await ownedStudents(q);
  const reports = await Report.find({ student: { $in: students.map(st => st._id) }, status: 'Published' }).populate('student').populate('teacher', 'name').sort({ year: -1, term: -1 });
  s.render('pages/reports', { title: 'Student reports', staff: false, students, reports });
}));
r.get('/admin/reports/new', teaching, wrap(async (q, s) => {
  s.render('pages/report-form', { title: 'New student report', report: null, students: await eligibleStudents(), areas: Report.areas, ratings: Report.ratings });
}));
r.get('/admin/reports/:id/edit', teaching, wrap(async (q, s) => {
  if (!id(q.params.id)) return s.sendStatus(404);
  const report = await Report.findById(q.params.id);
  if (!report) return s.sendStatus(404);
  if (report.status === 'Published') return s.status(409).send('Return this report to draft before editing.');
  if (q.session.user.role !== 'admin' && String(report.teacher) !== q.session.user.id) return s.sendStatus(403);
  s.render('pages/report-form', { title: 'Edit student report', report, students: await Student.find().sort({ firstName: 1 }), areas: Report.areas, ratings: Report.ratings });
}));
r.post(['/admin/reports', '/admin/reports/:id'], teaching, wrap(async (q, s) => {
  const b = q.body;
  if (!id(b.studentId) || !period(b) || !/^\d+$/.test(String(b.daysPresent)) || !/^\d+$/.test(String(b.daysPossible)) || Number(b.daysPresent) > Number(b.daysPossible) || Number(b.daysPossible) > 366 || String(b.comments || '').length > 3000) return s.status(400).send('Check the student, term, attendance and comments.');
  const assessments = Report.areas.map((area, i) => ({ area, rating: b['rating' + i] }));
  if (assessments.some(a => !Report.ratings.includes(a.rating))) return s.status(400).send('Choose a rating for every learning area.');
  const student = await Student.findById(b.studentId);
  if (!student) return s.status(404).send('Student not found.');
  if (!q.params.id && !eligibleStudentStatuses.includes(student.status)) return s.status(409).send('Reports can only be created for admitted or active students.');
  const values = { student: student._id, classLevel: student.classLevel, year: b.year, term: b.term, assessments, daysPresent: b.daysPresent, daysPossible: b.daysPossible, comments: String(b.comments || '').trim() };
  if (q.params.id) {
    if (!id(q.params.id)) return s.sendStatus(404);
    const report = await Report.findById(q.params.id);
    if (!report) return s.sendStatus(404);
    if (report.status !== 'Draft') return s.status(409).send('Published reports cannot be edited.');
    if (q.session.user.role !== 'admin' && String(report.teacher) !== q.session.user.id) return s.sendStatus(403);
    await Report.updateOne({ _id: report._id, status: 'Draft' }, { $set: values }, { runValidators: true });
  } else await Report.create({ ...values, teacher: q.session.user.id });
  s.redirect('/admin/reports');
}));
r.post('/admin/reports/:id/publish', requireRole('admin'), wrap(async (q, s) => {
  if (!id(q.params.id)) return s.sendStatus(404);
  const result = await Report.updateOne({ _id: q.params.id, status: 'Draft' }, { $set: { status: 'Published', approvedBy: q.session.user.id, publishedAt: new Date() } });
  if (!result.matchedCount) return s.status(409).send('Draft report not found.');
  s.redirect('/admin/reports');
}));
r.post('/admin/reports/:id/unpublish', requireRole('admin'), wrap(async (q, s) => {
  if (!id(q.params.id)) return s.sendStatus(404);
  await Report.updateOne({ _id: q.params.id }, { $set: { status: 'Draft' }, $unset: { approvedBy: '', publishedAt: '' } });
  s.redirect('/admin/reports');
}));
r.get(['/parent/reports/:id', '/admin/reports/:id'], wrap(async (q, s) => {
  const role = q.session.user.role;
  const parentView = q.path.startsWith('/parent');
  if ((parentView && role !== 'parent') || (!parentView && !['admin','teacher'].includes(role))) return s.sendStatus(403);
  if (!id(q.params.id)) return s.sendStatus(404);
  const report = await Report.findById(q.params.id).populate('student').populate('teacher', 'name').populate('approvedBy', 'name');
  if (!report || !report.student || (parentView && (report.status !== 'Published' || report.student.parentEmail !== q.session.user.email))) return s.sendStatus(404);
  s.render('pages/report-print', { title: 'Student report form', report });
}));
module.exports = r;
