const router=require('express').Router();
const crypto=require('crypto');
const mongoose=require('mongoose');
const Enquiry=require('../models/Enquiry');
const mail=require('../lib/enquiry-mail');
const {requireLogin,requireRole}=require('../middleware/auth');
const {reviewSession}=require('../lib/admission-review');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const id=value=>typeof value==='string'&&/^[a-f\d]{24}$/i.test(value);
router.use('/admin/enquiries',requireLogin,requireRole('admin'),reviewSession,(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(req.method==='POST'&&req.body._csrf!==req.session.admissionToken)return res.status(403).send('Your form expired. Reload the enquiries page.');
  next();
});
router.get('/admin/enquiries/unread',wrap(async(req,res)=>res.json({unread:await Enquiry.countDocuments({readAt:null,status:{$ne:'Closed'}})})));
router.get('/admin/enquiries',wrap(async(req,res)=>{
  const enquiries=await Enquiry.find().sort({createdAt:-1}).limit(100);
  res.render('pages/admin-enquiries',{title:'Parent enquiries',enquiries,emailReady:mail.ready()});
}));
router.get('/admin/enquiries/:id',wrap(async(req,res)=>{
  if(!id(req.params.id))return res.sendStatus(404);
  const enquiry=await Enquiry.findById(req.params.id);if(!enquiry)return res.sendStatus(404);
  await Enquiry.updateOne({_id:enquiry._id,readAt:null},{$set:{readAt:new Date(),readBy:req.session.user.id}});
  res.render('pages/enquiry-detail',{title:'Reply to enquiry',enquiry,emailReady:mail.ready(),replyKey:crypto.randomBytes(32).toString('hex')});
}));
router.post('/admin/enquiries/:id/reply',wrap(async(req,res)=>{
  if(!id(req.params.id))return res.sendStatus(404);
  if(typeof req.body.message!=='string'||!req.body.message.trim()||req.body.message.trim().length>5000||typeof req.body.replyKey!=='string'||!/^[a-f\d]{64}$/.test(req.body.replyKey))return res.status(400).send('Enter a reply of 1 to 5,000 characters and submit it from the enquiry page.');
  const enquiry=await Enquiry.findById(req.params.id);if(!enquiry)return res.sendStatus(404);
  if(enquiry.status==='Closed')return res.status(409).send('Reopen this enquiry before replying.');
  if(!mail.email(enquiry.email))return res.status(400).send('This enquiry has an invalid email address. Contact the visitor using their phone.');
  const key=req.body.replyKey;
  const notification={_id:new mongoose.Types.ObjectId(),kind:'Reply',to:enquiry.email,replyTo:mail.schoolInbox(),
    subject:'Reply to your enquiry — '+(process.env.SCHOOL_NAME||'Jeffersons Preschool'),
    text:`Hello ${enquiry.parentName},\n\n${req.body.message.trim()}\n\n${process.env.SCHOOL_NAME||'Jeffersons Preschool'}\nEnquiry reference: ${enquiry._id}`,
    requestKey:key,createdBy:req.session.user.id,status:'Queued',attempts:0,nextAttemptAt:new Date(),createdAt:new Date()};
  const result=await Enquiry.updateOne({_id:enquiry._id,status:{$ne:'Closed'},'notifications.requestKey':{$ne:key}},{$push:{notifications:notification}},{runValidators:true});
  req.session.flash={type:'info',message:result.modifiedCount?'Reply queued. Delivery status appears in the reply history.':'This reply was already queued or the enquiry changed. Review the history before submitting again.'};
  res.redirect('/admin/enquiries/'+enquiry._id);
}));
router.post('/admin/enquiries/:id/status',wrap(async(req,res)=>{
  if(!id(req.params.id))return res.sendStatus(404);
  if(!['New','Contacted','Closed'].includes(req.body.status))return res.status(400).send('Choose a valid enquiry status.');
  await Enquiry.updateOne({_id:req.params.id},{$set:{status:req.body.status}});
  req.session.flash={type:'success',message:'Enquiry status updated.'};res.redirect('/admin/enquiries/'+req.params.id);
}));
module.exports=router;
