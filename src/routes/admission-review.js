const router = require('express').Router();
const Student = require('../models/Student');
const nextAdmissionNumber = require('../lib/admission-number');
const {requireLogin,requireRole} = require('../middleware/auth');
const {reviewSession,agreementVersion,verifiedPayments,review} = require('../lib/admission-review');
const id = value=>typeof value==='string' && /^[a-f\d]{24}$/i.test(value);
const wrap = fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
router.use((req,res,next)=>{
  if (!/^\/admin\/admissions(?:\/|$)/.test(req.path) && !/^\/parent\/students\/[^/]+\/accept\/?$/.test(req.path)) return next('router');
  requireLogin(req,res,()=>reviewSession(req,res,()=>{
    if(req.method==='POST' && req.body._csrf!==req.session.admissionToken) return res.status(403).send('Your form expired. Reload the page and try again.');
    next();
  }));
});
router.post('/parent/students/:id/accept',requireRole('parent'),wrap(async(req,res)=>{
  if (!id(req.params.id)) return res.sendStatus(404);
  if (req.body.agree!=='yes' || req.body.agreementVersion!==agreementVersion) return res.status(400).send('Read and confirm the enrolment agreement before submitting.');
  const student = await Student.findById(req.params.id);
  if (!student || student.parentEmail!==req.session.user.email) return res.sendStatus(404);
  if(student.status!=='Pending') return res.status(409).send('This application is no longer awaiting parent acceptance.');
  // Preserve the original acceptance timestamp and identity on repeat submissions.
  const result = await Student.updateOne({_id:student._id,parentEmail:req.session.user.email,status:'Pending',
    $or:[{enrolmentAcceptedAt:{$exists:false}},{enrolmentAcceptedAt:null}]},
    {$set:{enrolmentAcceptedAt:new Date(),enrolmentAcceptedBy:req.session.user.id,enrolmentAgreementVersion:agreementVersion}});
  if(!result.matchedCount && !student.enrolmentAcceptedAt) return res.status(409).send('The application changed. Reload the child record.');
  req.session.flash={type:'success',message:'Your enrolment agreement is recorded. The school admin will review the application. Approval is still required.'};
  res.redirect('/parent/students/'+student._id);
}));
router.get('/admin/admissions',requireRole('admin'),wrap(async(req,res)=>{
  const students = await Student.find({status:'Pending'}).sort({createdAt:1});
  const payments = students.length ? await verifiedPayments(students) : [];
  const applications = students.map(student=>({student,...review(student,payments)}));
  res.set('Cache-Control','no-store');
  res.render('pages/admission-approvals',{title:'Admission approvals',applications});
}));
router.post('/admin/admissions/:id/approve',requireRole('admin'),wrap(async(req,res)=>{
  if(!id(req.params.id)) return res.sendStatus(404);
  if(req.body.confirmReview!=='yes') return res.status(400).send('Confirm that you have reviewed the child record before approving.');
  const student = await Student.findById(req.params.id);
  if(!student) return res.sendStatus(404);
  if(student.status!=='Pending') return res.status(409).send('This application has already been reviewed or is no longer pending.');
  const evidence = review(student,await verifiedPayments([student]));
  if(!evidence.ready) return res.status(409).send('The parent must accept enrolment before admission approval. Fee payment follows admission.');
  const changes={status:'Admitted',admissionApprovedAt:new Date(),admissionApprovedBy:req.session.user.id,admissionApprovalBasis:evidence.basis};
  if(!student.admissionNumber) changes.admissionNumber=await nextAdmissionNumber();
  const updated = await Student.updateOne({_id:student._id,status:'Pending'},{$set:changes},{runValidators:true});
  if(!updated.modifiedCount) return res.status(409).send('The application changed. Reload the approval queue.');
  req.session.flash={type:'success',message:'Admission approved. Create the child fee invoice. After the parent pays and the bursar verifies payment, the child can be marked Active.'};
  res.redirect('/admin/admissions');
}));
module.exports=router;
