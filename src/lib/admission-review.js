const crypto = require('crypto');
const Payment = require('../models/Payment');
const agreementVersion = 'enrolment-v1';
const agreementText = 'I agree to enrol this child at Jeffersons Preschool in the requested programme and ask the school to review and approve this application. I understand that enrolment requires school approval and that any applicable fees will be shown on the school invoice.';

function reviewSession(req,res,next) {
  if (!req.session.admissionToken) req.session.admissionToken = crypto.randomBytes(32).toString('hex');
  res.locals.admissionToken = req.session.admissionToken;
  next();
}
function verifiedPayments(students) {
  return Payment.find({student:{$in:students.map(student=>student._id)},status:'Paid',amount:{$gt:0},
    verifiedAt:{$exists:true,$ne:null},invoice:{$exists:true,$ne:null}}).sort({verifiedAt:-1});
}
function review(student,payments) {
  const paid = payments.filter(payment=>String(payment.student && payment.student._id || payment.student)===String(student._id)
    && payment.status==='Paid' && payment.amount>0 && payment.verifiedAt && payment.invoice
    && (!student.admissionApprovedAt || (payment.createdAt && new Date(payment.createdAt)>=new Date(student.admissionApprovedAt))));
  const accepted = Boolean(student.enrolmentAcceptedAt && student.enrolmentAcceptedBy && student.enrolmentAgreementVersion===agreementVersion);
  const basis = accepted ? 'Parent acceptance' : null;
  return {accepted,paid,paidAmount:paid.reduce((sum,payment)=>sum+Math.round(payment.amount*100),0)/100,
    ready:student.status==='Pending' && accepted,canActivate:student.status==='Admitted' && paid.length>0,basis};
}
// Admission approval is performed only in the dedicated, audited approval action.
function canChangeStatus(current,next) {
  if (current===next) return true;
  return ({Pending:['Withdrawn'],Admitted:['Active','Withdrawn'],Active:['Graduated','Withdrawn'],Graduated:[],Withdrawn:[]}[current]||[]).includes(next);
}
module.exports = {agreementVersion,agreementText,reviewSession,verifiedPayments,review,canChangeStatus};
