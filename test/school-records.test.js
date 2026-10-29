const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const Student = require('../src/models/Student');
const Invoice = require('../src/models/Invoice');
const Payment = require('../src/models/Payment');
const Report = require('../src/models/Report');
const { invoiceTotals } = require('../src/lib/fees');
const ids = { student: '111111111111111111111111', invoice: '222222222222222222222222', payment: '333333333333333333333333', report: '444444444444444444444444', parent: '555555555555555555555555', teacher: '666666666666666666666666', admin: '777777777777777777777777' };
const school = { name: 'Jeffersons Preschool', location: 'Rongai', phone: '0729323301', email: 'school@example.test' };
let student, invoice, payment, report, calls, server, base;
const originals = [];
function stub(model, method, fn) { originals.push([model, method, model[method]]); model[method] = fn; }
function query(value) { return { sort() { return this; }, populate() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
function matches(doc, criteria) {
  return Object.entries(criteria).every(([key, expected]) => {
    const actual = doc[key] && doc[key]._id || doc[key];
    if (expected && expected.$in) return expected.$in.some(v => String(v) === String(actual));
    if (expected && expected.$exists !== undefined) return (actual !== undefined) === expected.$exists;
    return String(actual) === String(expected);
  });
}
before(async () => {
  stub(Student, 'find', criteria => query(!criteria || matches(student, criteria) ? [student] : []));
  stub(Student, 'findById', key => query(key === ids.student ? student : null));
  stub(Invoice, 'find', criteria => query(!criteria || matches(invoice, criteria) ? [invoice] : []));
  stub(Invoice, 'findById', key => query(key === ids.invoice ? invoice : null));
  stub(Invoice, 'create', async value => { await new Invoice(value).validate(); calls.invoice = value; });
  stub(Payment, 'find', criteria => query(!criteria || matches(payment, criteria) ? [payment] : []));
  stub(Payment, 'findOne', criteria => query(matches(payment, criteria) ? payment : null));
  stub(Payment, 'findById', key => query(key === ids.payment ? payment : null));
  stub(Payment, 'create', async value => { await new Payment(value).validate(); calls.payment = value; });
  stub(Report, 'find', criteria => query(!criteria || matches(report, criteria) ? [report] : []));
  stub(Report, 'findById', key => query(key === ids.report ? report : null));
  stub(Report, 'create', async value => { await new Report(value).validate(); calls.report = value; });
  stub(Report, 'updateOne', async (criteria, change) => {
    calls.reportUpdate = change;
    if (!matches(report, criteria)) return { matchedCount: 0 };
    Object.assign(report, change.$set);
    for (const key of Object.keys(change.$unset || {})) delete report[key];
    return { matchedCount: 1 };
  });
  const app = express(); app.use(express.urlencoded({ extended: true }));
  app.set('views', path.join(__dirname, '../src/views')); app.set('view engine', 'ejs');
  // Test-only identities; production authentication is not modified.
  app.use((req, res, next) => {
    const role = req.headers['x-test-role'];
    req.session = { recordToken: 'test-token', user: role ? { id: ids[role] || ids.parent, name: 'Test '+role, email: role==='stranger'?'other@example.test':'parent@example.test', role: role==='stranger'?'parent':role, phone:'0700000000' } : null };
    Object.assign(res.locals, { currentUser: req.session.user, school, flash: null }); next();
  });
  app.use(require('../src/routes/school-records'));
  app.use((err, req, res, next) => res.status(500).send(err.message));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { for (const [model, method, original] of originals.reverse()) model[method] = original; await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  calls = {};
  student = { _id: ids.student, firstName: 'Sample', lastName: 'Student', parentEmail: 'parent@example.test', classLevel: 'PP1', status:'Admitted', admissionNumber: 'JPS-TEST' };
  invoice = { _id: ids.invoice, student, year: 2026, term: 1, items: [{label:'Tuition',amount:1000},{label:'Meals',amount:250.5}] };
  payment = { _id: ids.payment, student, invoice, parentName: 'Test parent', amount: 300, method: 'M-Pesa', reference: 'TESTREF', status: 'Pending verification', createdAt: new Date(), async save() { calls.savedPayment = this; } };
  report = { _id: ids.report, student, teacher: { _id: ids.teacher, name: 'Test teacher' }, classLevel:'PP1', year:2026, term:1, assessments:Report.areas.map(area=>({area,rating:'Meeting expectations'})), daysPresent:45, daysPossible:50, comments:'Keep learning.', status:'Draft' };
});
async function request(route, role = 'parent', data) {
  const response = await fetch(base + route, { redirect:'manual', headers: { ...(role?{'x-test-role':role}:{}), ...(data?{'content-type':'application/x-www-form-urlencoded'}:{}) }, method:data?'POST':'GET', ...(data?{body:new URLSearchParams(data)}:{}) });
  return { status:response.status, location:response.headers.get('location'), text:await response.text() };
}
const paymentData = extra => ({_csrf:'test-token',invoiceId:ids.invoice,amount:'300.25',method:'M-Pesa',reference:'abc123',parentPhone:'0700000000',...extra});
const reportData = extra => ({_csrf:'test-token',studentId:ids.student,year:'2026',term:'1',daysPresent:'45',daysPossible:'50',comments:'Good progress',...Object.fromEntries(Report.areas.map((a,i)=>['rating'+i,'Meeting expectations'])),...extra});

test('partial payments count only verified payments for the same invoice, with cent precision', () => {
  assert.deepEqual(invoiceTotals(invoice,[{invoice:ids.invoice,status:'Paid',amount:300.25},{invoice:ids.invoice,status:'Pending verification',amount:800},{invoice:ids.invoice,status:'Refunded',amount:100},{invoice:'other',status:'Paid',amount:900}]),{total:1250.5,paid:300.25,balance:950.25});
});
test('overpayments show a credit', () => assert.equal(invoiceTotals(invoice,[{invoice:ids.invoice,status:'Paid',amount:1300}]).balance,-49.5));
test('balances also count payments whose invoice has been populated', () => assert.equal(invoiceTotals(invoice,[{invoice,status:'Paid',amount:300}]).balance,950.5));
test('unauthenticated requests redirect to sign in', async () => assert.equal((await request('/parent/fees',null)).location,'/auth/login'));
test('parent fee page displays invoice details and correct balance', async () => { const result=await request('/parent/fees'); assert.equal(result.status,200); assert.match(result.text,/1,250.5/); });
test('parents with no matching children see no invoices or payment history', async () => {
  const fees=await request('/parent/fees','stranger'); assert.doesNotMatch(fees.text,/Sample Student/);
  const payments=await request('/parent/payments','stranger'); assert.doesNotMatch(payments.text,/TESTREF/);
});
test('teacher cannot access or verify payments', async () => { assert.equal((await request('/admin/payments','teacher')).status,302); assert.equal((await request('/admin/payments/'+ids.payment+'/status','teacher',{_csrf:'test-token',status:'Paid',confirmReceived:'yes'})).status,302); assert.equal(calls.savedPayment,undefined); });
test('bursar can create itemized invoices', async () => { const result=await request('/admin/fees','bursar',{_csrf:'test-token',studentId:ids.student,year:'2026',term:'2',fee0:'1000',fee1:'250.50'}); assert.equal(result.status,302); assert.deepEqual(calls.invoice.items,[{label:'Tuition',amount:1000},{label:'Meals',amount:250.5}]); });
test('bursars cannot invoice pending students', async () => {
  student.status='Pending';
  const result=await request('/admin/fees','bursar',{_csrf:'test-token',studentId:ids.student,year:'2026',term:'2',fee0:'1000'});
  assert.equal(result.status,409);assert.equal(calls.invoice,undefined);
});
test('zero and invalid fee amounts are rejected', async () => {
  for (const fee0 of ['0','NaN','-1','10.001']) assert.equal((await request('/admin/fees','admin',{_csrf:'test-token',studentId:ids.student,year:'2026',term:'1',fee0})).status,400);
});
test('payment page preselects requested invoice', async () => { const result=await request('/parent/payments?invoice='+ids.invoice); assert.equal(result.status,200); assert.match(result.text,new RegExp('value="'+ids.invoice+'" selected')); });
test('submitted payment is pending, linked to owned invoice and has normalized reference', async () => { assert.equal((await request('/parent/payments','parent',paymentData())).status,302); assert.equal(calls.payment.status,'Pending verification'); assert.equal(calls.payment.invoice,ids.invoice); assert.equal(calls.payment.transactionKey,'M-Pesa:ABC123'); });
test('foreign invoice cannot receive a parent payment', async () => { assert.equal((await request('/parent/payments','stranger',paymentData())).status,404); assert.equal(calls.payment,undefined); });
test('fee payment is blocked until the child is admitted',async()=>{
  student.status='Pending';assert.equal((await request('/parent/payments','parent',paymentData())).status,409);assert.equal(calls.payment,undefined);
});
test('missing reference, invalid amount and forged method are rejected', async () => { for (const fields of [{reference:''},{amount:'Infinity'},{amount:'0'},{amount:'1.001'},{method:'Card'}]) assert.equal((await request('/parent/payments','parent',paymentData(fields))).status,400); });
test('state-changing operations reject missing CSRF token', async () => { assert.equal((await request('/parent/payments','parent',paymentData({_csrf:''}))).status,403); assert.equal(calls.payment,undefined); });
test('verified payments require receipt confirmation and record verifier', async () => {
  const route='/admin/payments/'+ids.payment+'/status';
  assert.equal((await request(route,'bursar',{_csrf:'test-token',status:'Paid'})).status,400);
  assert.equal((await request(route,'admin',{_csrf:'test-token',status:'Paid',confirmReceived:'yes'})).status,302);
  assert.equal(payment.status,'Paid'); assert.equal(payment.verifiedBy,ids.admin); assert.ok(payment.verifiedAt instanceof Date);
});
test('pending receipts are unavailable; paid receipts are restricted to owners', async () => {
  const route='/parent/payments/'+ids.payment+'/receipt'; assert.equal((await request(route)).status,404);
  payment.status='Paid'; assert.equal((await request(route,'stranger')).status,404);
  const result=await request(route); assert.equal(result.status,200); assert.match(result.text,/Payment receipt/);
});
test('teacher creates complete report drafts', async () => { assert.equal((await request('/admin/reports','teacher',reportData())).status,302); assert.equal(calls.report.teacher,ids.teacher); assert.equal(calls.report.assessments.length,5); });
test('teachers cannot create reports for pending students', async () => {
  student.status='Pending';
  const result=await request('/admin/reports','teacher',reportData());
  assert.equal(result.status,409);assert.equal(calls.report,undefined);
});
test('impossible attendance and incomplete assessments are rejected', async () => { for (const fields of [{daysPresent:'51'},{daysPossible:'400'},{rating0:'A+'}]) assert.equal((await request('/admin/reports','teacher',reportData(fields))).status,400); });
test('bursar cannot view or create report forms', async () => { assert.equal((await request('/admin/reports','bursar')).status,302); assert.equal((await request('/admin/reports','bursar',reportData())).status,302); });
test('only admins publish reports; drafts are hidden from parents', async () => {
  assert.equal((await request('/parent/reports/'+ids.report)).status,404);
  assert.equal((await request('/admin/reports/'+ids.report+'/publish','teacher',{_csrf:'test-token'})).status,302); assert.equal(report.status,'Draft');
  assert.equal((await request('/admin/reports/'+ids.report+'/publish','admin',{_csrf:'test-token'})).status,302); assert.equal(report.status,'Published');
  const result=await request('/parent/reports/'+ids.report); assert.equal(result.status,200); assert.match(result.text,/Student progress report/);
  assert.equal((await request('/parent/reports/'+ids.report,'stranger')).status,404);
});
test('published reports cannot be edited and returning to draft hides them', async () => {
  report.status='Published'; report.publishedAt=new Date();
  assert.equal((await request('/admin/reports/'+ids.report,'admin',reportData())).status,409);
  assert.equal((await request('/admin/reports/'+ids.report+'/unpublish','admin',{_csrf:'test-token'})).status,302);
  assert.equal((await request('/parent/reports/'+ids.report)).status,404);
});
test('another teacher cannot edit a draft', async () => { report.teacher='888888888888888888888888'; assert.equal((await request('/admin/reports/'+ids.report,'teacher',reportData())).status,403); });
test('all new page templates render with sample data', async () => {
  for (const route of ['/admin/fees','/admin/payments','/admin/reports','/admin/reports/new','/admin/reports/'+ids.report+'/edit','/admin/reports/'+ids.report]) assert.equal((await request(route,'admin')).status,200,route);
  report.status='Published'; report.publishedAt=new Date(); assert.equal((await request('/parent/reports')).status,200);
});
test('uniqueness indexes protect term records and payment references', () => {
  assert.ok(Invoice.schema.indexes().some(([keys, options])=>keys.student && keys.year && keys.term && options.unique));
  assert.ok(Report.schema.indexes().some(([keys, options])=>keys.student && keys.year && keys.term && options.unique));
  assert.ok(Payment.schema.indexes().some(([keys, options])=>keys.transactionKey && options.unique && options.sparse));
});
test('student fee statements render and reject other parents', async () => {
  assert.equal((await request('/parent/fees/'+ids.student+'/statement')).status,200);
  assert.equal((await request('/parent/fees/'+ids.student+'/statement','stranger')).status,404);
  assert.equal((await request('/admin/fees/'+ids.student+'/statement','teacher')).status,403);
  assert.equal((await request('/admin/fees/'+ids.student+'/statement','bursar')).status,200);
});
test('duplicate database transaction errors return a helpful conflict response', async () => {
  const create=Payment.create;
  try { Payment.create=async()=>{ const error=new Error('duplicate');error.code=11000;throw error; };
    const result=await request('/parent/payments','parent',paymentData()); assert.equal(result.status,409); assert.match(result.text,/already exists/);
  } finally { Payment.create=create; }
});
