const crypto=require('crypto');
const Enquiry=require('../models/Enquiry');
const email=value=>typeof value==='string' && value.length<=254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
function schoolInbox(){return process.env.ENQUIRY_NOTIFY_EMAIL||process.env.SCHOOL_EMAIL||'jeffersonspreschool@gmail.com';}
function ready(){return process.env.EMAIL_PROVIDER==='resend' && Boolean(process.env.RESEND_API_KEY) && email(process.env.EMAIL_FROM) && email(schoolInbox());}
function initialNotifications(enquiry){
  const school=process.env.SCHOOL_NAME||'Jeffersons Preschool';
  return [
    {kind:'Acknowledgement',to:enquiry.email,replyTo:schoolInbox(),subject:'We received your enquiry — '+school,
      text:`Hello ${enquiry.parentName},\n\nThank you for contacting ${school}. We have received your enquiry and the school team will reply to this email address.\n\nEnquiry reference: ${enquiry._id}\n\n${school}`},
    {kind:'School notification',to:schoolInbox(),replyTo:enquiry.email,subject:'New website enquiry — '+school,
      text:`A visitor sent an enquiry.\n\nName: ${enquiry.parentName}\nEmail: ${enquiry.email}\nPhone: ${enquiry.phone}\nChild age: ${enquiry.childAge||'Not given'}\n\n${enquiry.message}\n\nReference: ${enquiry._id}\nSign in to the school admin portal and open Parent enquiries to reply.`}
  ];
}
async function send(notification,key){
  let response;
  try {
    response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':key},
      body:JSON.stringify({from:notification.from,to:[notification.to],reply_to:notification.replyTo,subject:notification.subject,text:notification.text})});
  } catch {throw new Error('Email provider unavailable; delivery will be retried.');}
  if(!response.ok)throw new Error('Email provider rejected the request (HTTP '+response.status+'). Check the sender and service settings.');
  let data;try{data=await response.json();}catch{throw new Error('Email provider returned an invalid response.');}
  if(!data.id)throw new Error('Email provider did not confirm acceptance.');
  return data.id;
}
async function processOne(){
  if(!ready())return false;
  const now=new Date(),leaseToken=crypto.randomBytes(24).toString('hex');
  const enquiry=await Enquiry.findOneAndUpdate({notifications:{$elemMatch:{$or:[
    {status:'Queued',nextAttemptAt:{$lte:now}},
    {status:'Sending',leaseUntil:{$lt:now}}
  ]}}},{$set:{'notifications.$.status':'Sending','notifications.$.leaseToken':leaseToken,'notifications.$.leaseUntil':new Date(Date.now()+60000)},$inc:{'notifications.$.attempts':1}},{new:true});
  if(!enquiry)return false;
  const job=enquiry.notifications.find(item=>item.leaseToken===leaseToken);
  const match={_id:enquiry._id,notifications:{$elemMatch:{_id:job._id,leaseToken}}};
  job.firstAttemptAt=job.firstAttemptAt||now;job.from=job.from||process.env.EMAIL_FROM;
  await Enquiry.updateOne(match,{$set:{'notifications.$.firstAttemptAt':job.firstAttemptAt,'notifications.$.from':job.from}});
  let sentId,error;
  try{
    if(Date.now()-new Date(job.firstAttemptAt).getTime()>23*3600000)throw new Error('Automatic retry window expired. Check the provider log before sending another reply.');
    if(!email(job.to)||!email(job.replyTo)||!email(job.from))throw new Error('The sender or recipient email address is invalid.');
    sentId=await send(job,'enquiry-'+enquiry._id+'-'+job._id);
  }catch(err){error=err.message;}
  const expired=Date.now()-new Date(job.firstAttemptAt).getTime()>23*3600000;
  if(sentId){
    await Enquiry.updateOne(match,{$set:{'notifications.$.status':'Sent','notifications.$.sentAt':new Date(),'notifications.$.providerId':sentId,'notifications.$.error':''}});
    if(job.kind==='Reply')await Enquiry.updateOne({_id:enquiry._id,status:'New'},{$set:{status:'Contacted'}});
  }else{
    const failed=job.attempts>=5||expired;
    await Enquiry.updateOne(match,{$set:{'notifications.$.status':failed?'Failed':'Queued','notifications.$.error':error,
      'notifications.$.nextAttemptAt':new Date(Date.now()+Math.min(900000,30000*2**Math.min(job.attempts,5)))}});
  }
  return true;
}
function startWorker(){
  let running=false;
  const tick=async()=>{if(running||!ready())return;running=true;try{await processOne();}catch{console.error('Enquiry email processing paused; messages remain queued for recovery.');}finally{running=false;}};
  const timer=setInterval(tick,1500);timer.unref();void tick();return ()=>clearInterval(timer);
}
module.exports={email,schoolInbox,ready,initialNotifications,processOne,startWorker};
