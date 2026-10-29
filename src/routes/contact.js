const router=require('express').Router();
const crypto=require('crypto');
const Enquiry=require('../models/Enquiry');
const mail=require('../lib/enquiry-mail');
const form=require('../lib/landing');
router.get('/contact',(req,res)=>res.redirect('/#contact'));
router.post('/contact',async(req,res,next)=>{
  try{
    const b=req.body;
    if(!req.session.contactToken||b._csrf!==req.session.contactToken)return form(req,res,'Your form expired. Please submit it again.',{},403);
    const values={};
    for(const key of ['parentName','email','phone','childAge','message']){
      if(b[key]!==undefined&&typeof b[key]!=='string')return form(req,res,'Please enter one value per field.',{},400);
      values[key]=String(b[key]||'').trim();
    }
    if(!values.parentName||values.parentName.length>200||!mail.email(values.email)||!/^\+?[\d ()-]{7,30}$/.test(values.phone)||values.childAge.length>100||!values.message||values.message.length>5000)return form(req,res,'Enter your name, a valid email and phone, and a message of up to 5,000 characters.',values,400);
    if(typeof b.requestKey!=='string'||!/^[a-f\d]{64}$/.test(b.requestKey))return form(req,res,'Please reload the form and try again.',values,400);
    if(b.website)return res.redirect('/#contact');
    const submissionKey=crypto.createHash('sha256').update(req.session.contactToken+':'+b.requestKey).digest('hex');
    let enquiry=await Enquiry.findOne({submissionKey});
    if(!enquiry){
      if(req.session.lastEnquiryAt&&Date.now()-req.session.lastEnquiryAt<60000)return form(req,res,'Please wait a minute before sending another enquiry.',values,429);
      enquiry=new Enquiry({...values,email:values.email.toLowerCase(),submissionKey});
      enquiry.notifications=mail.initialNotifications(enquiry);
      await Enquiry.init();
      try{await enquiry.save();}catch(error){if(error.code!==11000)throw error;enquiry=await Enquiry.findOne({submissionKey});if(!enquiry)throw error;}
      req.session.lastEnquiryAt=Date.now();
    }
    req.session.flash={type:'success',message:'Your enquiry has been received. Reference: '+enquiry._id+'. The school will reply to the email address you provided.'};
    res.redirect('/#contact');
  }catch(error){next(error);}
});
module.exports=router;
