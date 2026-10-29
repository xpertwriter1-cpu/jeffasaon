const r = require('express').Router(), bcrypt = require('bcryptjs');
const User = require('../models/User'), Student = require('../models/Student'), Payment = require('../models/Payment'), Enquiry = require('../models/Enquiry');
const {reviewSession,canChangeStatus,verifiedPayments,review} = require('../lib/admission-review');
const { requireLogin, requireRole } = require('../middleware/auth');
r.use(requireLogin, requireRole('admin', 'teacher', 'bursar'), reviewSession);
r.get('/dashboard', async (q, s, n) => {
  try {
    const canFinance = ['admin', 'bursar'].includes(q.session.user.role);
    s.render('pages/admin-dashboard', { title: 'School administration', stats: {
      students: await Student.countDocuments(), pending: await Student.countDocuments({ status: 'Pending' }),
      payments: canFinance ? await Payment.countDocuments({ status: 'Pending verification' }) : null,
      enquiries: q.session.user.role === 'admin' ? await Enquiry.countDocuments({readAt:null,status:{$ne:'Closed'}}) : null
    } });
  } catch (e) { n(e); }
});
r.get('/students', async (q, s, n) => { try { s.render('pages/admin-students', { title: 'Student register', students: await Student.find().sort({ createdAt: -1 }) }); } catch (e) { n(e); } });
r.post('/students/:id/status', requireRole('admin'), async (q, s, n) => {
  try {
    if (q.body._csrf !== q.session.admissionToken) return s.status(403).send('Your form expired. Reload the student register.');
    if (['Pending','Admitted','Active','Graduated','Withdrawn'].includes(q.body.status)) {
      const st = await Student.findById(q.params.id);
      if (st) {
        if (!canChangeStatus(st.status,q.body.status)) return s.status(409).send('Use Admission approvals to approve a pending application. Only admitted children can become Active. Graduated and withdrawn records cannot be reopened here.');
        const changes={status:q.body.status};
        if(st.status==='Admitted' && q.body.status==='Active') {
          const evidence=review(st,await verifiedPayments([st]));
          if(!evidence.canActivate) return s.status(409).send('A fee payment made after admission must be verified by the bursar before this child can become Active. Sandbox tests do not qualify.');
          changes.activatedAt=new Date();changes.activatedBy=q.session.user.id;changes.activationPayment=evidence.paid[0]._id;
        }
        const result = await Student.updateOne({_id:st._id,status:st.status},{$set:changes},{runValidators:true});
        if (!result.matchedCount) return s.status(409).send('The record changed. Reload the student register.');
      }
    }
    s.redirect('/admin/students');
  } catch (e) { n(e); }
});
r.get('/users', requireRole('admin'), async (q, s, n) => { try { s.render('pages/admin-users', { title: 'Staff accounts', users: await User.find().select('-passwordHash') }); } catch (e) { n(e); } });
r.post('/users', requireRole('admin'), async (q, s, n) => {
  try {
    const b = q.body;
    if (['name','email','password'].some(key=>typeof b[key]!=='string') || !b.name.trim() || b.name.length>200 || !/^\S+@\S+\.\S+$/.test(b.email) || b.email.length>254 || b.password.length < 8 || Buffer.byteLength(b.password,'utf8')>72 || !['admin','teacher','bursar'].includes(b.role)) return s.status(400).send('Invalid staff details');
    const email = b.email.toLowerCase().trim();
    if (await User.findOne({ email })) return s.status(400).send('Email already exists');
    await User.create({ name: b.name, email, phone: b.phone, passwordHash: await bcrypt.hash(b.password, 12), role: b.role });
    s.redirect('/admin/users');
  } catch (e) { n(e); }
});
module.exports = r;
