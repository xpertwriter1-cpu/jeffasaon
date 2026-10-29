const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const path=require('path');
const Enquiry=require('../src/models/Enquiry');
const mail=require('../src/lib/enquiry-mail');
const realFetch=global.fetch,oldEnv={...process.env},originals=[];
let records,sessions,server,base,outbound;
const adminId='111111111111111111111111';
function stub(object,key,fn){originals.push([object,key,object[key]]);object[key]=fn;}
function query(value){return {sort(){return this;},limit(){return this;},then(resolve,reject){return Promise.resolve(value).then(resolve,reject);}};}
before(async()=>{
  stub(Enquiry,'init',async()=>{});
  stub(Enquiry.prototype,'save',async function(){await this.validate();records.push(this);return this;});
  stub(Enquiry,'findOne',async criteria=>records.find(record=>record.submissionKey===criteria.submissionKey)||null);
  stub(Enquiry,'findById',async key=>records.find(record=>String(record._id)===String(key))||null);
  stub(Enquiry,'find',()=>query(records));
  stub(Enquiry,'countDocuments',async()=>records.filter(record=>!record.readAt&&record.status!=='Closed').length);
  stub(Enquiry,'updateOne',async(criteria,change)=>{
    const record=records.find(row=>String(row._id)===String(criteria._id));if(!record)return {matchedCount:0,modifiedCount:0};
    if(typeof criteria.status==='string'&&criteria.status!==record.status)return {matchedCount:0,modifiedCount:0};
    if(criteria.status?.$ne===record.status)return {matchedCount:0,modifiedCount:0};
    if(criteria.readAt===null&&record.readAt)return {matchedCount:0,modifiedCount:0};
    if(criteria['notifications.requestKey']&&record.notifications.some(job=>job.requestKey===criteria['notifications.requestKey'].$ne))return {matchedCount:0,modifiedCount:0};
    let job;
    if(criteria.notifications){const match=criteria.notifications.$elemMatch;job=record.notifications.find(job=>String(job._id)===String(match._id)&&job.leaseToken===match.leaseToken);if(!job)return {matchedCount:0,modifiedCount:0};}
    for(const[key,value]of Object.entries(change.$set||{})){if(key.startsWith('notifications.$.'))job[key.slice('notifications.$.'.length)]=value;else record[key]=value;}
    if(change.$push?.notifications)record.notifications.push(change.$push.notifications);
    return {matchedCount:1,modifiedCount:1};
  });
  stub(Enquiry,'findOneAndUpdate',async(criteria,change)=>{
    for(const record of records){const job=record.notifications.find(item=>(item.status==='Queued'&&item.nextAttemptAt<=new Date())||(item.status==='Sending'&&item.leaseUntil<new Date()));
      if(job){for(const[key,value]of Object.entries(change.$set))job[key.slice('notifications.$.'.length)]=value;job.attempts++;return record;}}
    return null;
  });
  const app=express();app.use(express.urlencoded({extended:true}));app.set('view engine','ejs');app.set('views',path.join(__dirname,'../src/views'));
  app.use((req,res,next)=>{
    const key=req.headers['x-test-session']||'visitor';if(!sessions.has(key))sessions.set(key,{});req.session=sessions.get(key);
    const role=req.headers['x-test-role'];req.session.user=role?{id:adminId,role,name:'School Admin',email:'school@example.test'}:null;
    Object.assign(res.locals,{currentUser:req.session.user,flash:req.session.flash||null,school:{name:'Test School',email:'school@example.test',phone:'0700000000',location:'Rongai'}});next();
  });
  app.use(require('../src/routes/public'));app.use(require('../src/routes/contact'));app.use(require('../src/routes/enquiries'));app.use((error,req,res,next)=>res.status(500).send(error.message));
  server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});base='http://127.0.0.1:'+server.address().port;
});
beforeEach(()=>{records=[];sessions=new Map();outbound=[];delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;process.env.EMAIL_PROVIDER='resend';process.env.ENQUIRY_NOTIFY_EMAIL='school@example.test';global.fetch=realFetch;});
after(async()=>{for(const[object,key,original]of originals.reverse())object[key]=original;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);global.fetch=realFetch;await new Promise(resolve=>server.close(resolve));});
async function request(route,{role,body,session=role?'staff':'visitor'}={}){const response=await realFetch(base+route,{method:body?'POST':'GET',redirect:'manual',headers:{'x-test-session':session,...(role?{'x-test-role':role}:{}),...(body?{'content-type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{})});return {status:response.status,location:response.headers.get('location'),text:await response.text()};}
async function contact(extra={}){await request('/');return request('/contact',{body:{_csrf:sessions.get('visitor').contactToken,requestKey:'a'.repeat(64),parentName:'Visitor',email:'visitor@example.test',phone:'0700000000',message:'Please tell me about PP1.',...extra}});}
function configured(){process.env.RESEND_API_KEY='fake-test-key';process.env.EMAIL_FROM='school@example.test';global.fetch=async(url,options)=>{outbound.push({url,options});return {ok:true,json:async()=>({id:'provider-'+outbound.length})};};}
async function reply(extra={}){const record=records[0];await request('/admin/enquiries/'+record._id,{role:'admin'});return request('/admin/enquiries/'+record._id+'/reply',{role:'admin',body:{_csrf:sessions.get('staff').admissionToken,replyKey:'b'.repeat(64),message:'You are welcome to visit the school.',...extra}});}

test('contact submission atomically retains enquiry and queues visitor acknowledgement and school notification',async()=>{
  const result=await contact();assert.equal(result.status,302);assert.equal(records.length,1);assert.equal(records[0].status,'New');assert.equal(records[0].notifications.length,2);assert.equal(records[0].notifications[0].to,'visitor@example.test');assert.equal(records[0].notifications[1].to,'school@example.test');assert.equal(outbound.length,0);
  assert.match(sessions.get('visitor').flash.message,/received/);assert.equal(await mail.processOne(),false);
});
test('double submission preserves one enquiry and one set of notifications',async()=>{await contact();await contact();assert.equal(records.length,1);assert.equal(records[0].notifications.length,2);});
test('contact validates fields and CSRF while retaining escaped values',async()=>{
  let result=await contact({email:'invalid',parentName:'<script>test</script>'});assert.equal(result.status,400);assert.match(result.text,/&lt;script&gt;/);assert.equal(records.length,0);
  result=await contact({_csrf:'wrong'});assert.equal(result.status,403);
  for(const fields of [{message:'x'.repeat(5001)},{phone:'bad'},{email:'bad\r\nBcc: victim@example.test'}])assert.equal((await contact(fields)).status,400);
});
test('new enquiry badge count decreases when admin reads the enquiry',async()=>{
  await contact();let result=await request('/admin/enquiries/unread',{role:'admin'});assert.equal(JSON.parse(result.text).unread,1);
  result=await request('/admin/enquiries',{role:'admin'});assert.match(result.text,/New message/);assert.match(result.text,/Email delivery is not configured/);
  result=await request('/admin/enquiries/'+records[0]._id,{role:'admin'});assert.equal(result.status,200);assert.ok(records[0].readAt);assert.equal(String(records[0].readBy),adminId);
  result=await request('/admin/enquiries/unread',{role:'admin'});assert.equal(JSON.parse(result.text).unread,0);
});
test('visitors, parents, teachers and bursars cannot access private enquiries',async()=>{
  await contact();for(const role of [undefined,'parent','teacher','bursar'])for(const route of ['/admin/enquiries','/admin/enquiries/unread','/admin/enquiries/'+records[0]._id])assert.equal((await request(route,{role})).status,302);
});
test('reply is queued once, audited, uses the saved recipient and requires CSRF',async()=>{
  await contact();assert.equal((await reply({_csrf:'bad'})).status,403);assert.equal((await reply({message:''})).status,400);
  assert.equal((await reply({to:'forged@example.test'})).status,302);assert.equal((await reply()).status,302);
  const jobs=records[0].notifications.filter(job=>job.kind==='Reply');assert.equal(jobs.length,1);assert.equal(jobs[0].to,'visitor@example.test');assert.equal(String(jobs[0].createdBy),adminId);assert.equal(jobs[0].status,'Queued');assert.equal(records[0].status,'New');
});
test('closed enquiry cannot be replied to and status changes are CSRF protected',async()=>{
  await contact();await reply();records[0].status='Closed';assert.equal((await reply()).status,409);
  const route='/admin/enquiries/'+records[0]._id+'/status';assert.equal((await request(route,{role:'admin',body:{_csrf:'bad',status:'New'}})).status,403);
  assert.equal((await request(route,{role:'admin',body:{_csrf:sessions.get('staff').admissionToken,status:'New'}})).status,302);assert.equal(records[0].status,'New');
});
test('worker sends queued notifications and reply, then marks contacted only after provider acceptance',async()=>{
  await contact();await reply();configured();for(let i=0;i<3;i++)assert.equal(await mail.processOne(),true);
  assert.equal(outbound.length,3);assert.ok(records[0].notifications.every(job=>job.status==='Sent'&&job.providerId));assert.equal(records[0].status,'Contacted');
  const payload=JSON.parse(outbound[2].options.body);assert.deepEqual(payload.to,['visitor@example.test']);assert.equal(payload.reply_to,'school@example.test');assert.match(payload.text,/welcome to visit/);assert.ok(outbound[2].options.headers['Idempotency-Key']);assert.equal(await mail.processOne(),false);
});
test('provider failure retains message and retries identical payload with the same idempotency key',async()=>{
  await contact();configured();global.fetch=async(url,options)=>{outbound.push({url,options});throw new Error('private-api-key');};
  await mail.processOne();const job=records[0].notifications[0];assert.equal(job.status,'Queued');assert.doesNotMatch(job.error,/private-api-key/);assert.ok(job.nextAttemptAt>new Date());job.nextAttemptAt=new Date(0);
  process.env.EMAIL_FROM='changed@example.test';global.fetch=async(url,options)=>{outbound.push({url,options});return {ok:true,json:async()=>({id:'accepted'})};};await mail.processOne();
  assert.equal(outbound[0].options.headers['Idempotency-Key'],outbound[1].options.headers['Idempotency-Key']);assert.equal(outbound[0].options.body,outbound[1].options.body);assert.equal(job.status,'Sent');
});
test('expired retry window stops email transmission and preserves a visible failure',async()=>{
  await contact();configured();records[0].notifications[0].firstAttemptAt=new Date(Date.now()-24*3600000);await mail.processOne();assert.equal(records[0].notifications[0].status,'Failed');assert.equal(outbound.length,0);
});
test('expired send leases can recover after an app restart',async()=>{
  await contact();configured();const job=records[0].notifications[0];job.status='Sending';job.leaseUntil=new Date(0);await mail.processOne();assert.equal(job.status,'Sent');assert.equal(outbound.length,1);
});
test('five provider failures stop retries and do not falsely mark an enquiry contacted',async()=>{
  await contact();configured();const job=records[0].notifications[0];job.attempts=4;
  global.fetch=async()=>({ok:false,status:403});await mail.processOne();assert.equal(job.status,'Failed');assert.equal(job.attempts,5);assert.equal(records[0].status,'New');assert.match(job.error,/HTTP 403/);
});
test('a delayed accepted reply does not reopen a closed enquiry',async()=>{
  await contact();await reply();records[0].status='Closed';configured();for(let i=0;i<3;i++)await mail.processOne();assert.equal(records[0].status,'Closed');assert.equal(records[0].notifications[2].status,'Sent');
});
