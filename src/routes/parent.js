const r = require('express').Router();
const Student = require('../models/Student');
const Payment = require('../models/Payment');
const { requireLogin, requireRole } = require('../middleware/auth');
r.use(requireLogin, requireRole('parent'));
r.get('/dashboard', async (q, s, n) => {
  try {
    const students = await Student.find({ parentEmail: q.session.user.email }).sort({ createdAt: -1 });
    const payments = await Payment.find({ student: { $in: students.map(st => st._id) } }).sort({ createdAt: -1 });
    s.render('pages/parent-dashboard', { title: 'Parent portal', students, payments });
  } catch (e) { n(e); }
});
module.exports = r;
