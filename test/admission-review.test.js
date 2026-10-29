const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const path=require('path');
const Student=require('../src/models/Student');
const Payment=require('../src/models/Payment');
const {review,agreementVersion,canChangeStatus}=require('../src/lib/admission-review');
const ids={student:'111111111111111111111111',parent:'222222222222222222222222',admin:'333333333333333333333333',payment:'444444444444444444444444',invoice:'555555555555555555555555'};
const originals=[];
let student,payments,updates,lastPaymentQuery,server,base;
function stub(object,key,fn){originals.push([object,key,object[key]]);object[key]=fn;}
function query(value){return {sort(){return this;},then(resolve,reject){return Promise.resolve(value).then(resolve,reject);}};}
before(async()=>{
  stub(Student,'find',criteria=>query(!criteria || criteria.status===student.status?[student]:[]));
  stub(Student,'findById',key=>Promise.resolve(key===ids.student?student:null));
  stub(Student,'updateOne',async(criteria,change)=>{
    updates.push({criteria,change});
    if(String(criteria._id)!==ids.student || criteria.status!==student.status || (criteria.parentEmail && criteria.parentEmail!==student.parentEmail) || (criteria.$or && student.enrolmentAcceptedAt))return {matchedCount:0,modifiedCount:0};
    Object.assign(student,change.$set);return {matchedCount:1,modifiedCount:1};
  });
  stub(Payment,'find',criteria=>{lastPaymentQuery=criteria;return query(payments);});
  const app=express();app.use(express.urlencoded({extended:true}));app.set('view engine','ejs');app.set('views',path.join(__dirname,'../src/views'));
  app.use((req,res,next)=>{
    const role=req.headers['x-test-role'];
    req.session={admissionToken:'review-token',user:role?{id:ids[role]||ids.parent,role:role==='stranger'?'parent':role,name:'Test User',email:role==='stranger'?'other@example.test':'parent@example.test'}:null};
    Object.assign(res.locals,{currentUser:req.session.user,flash:null,school:{name:'School',phone:'0700000000',email:'school@example.test',location:'Rongai'}});next();
  });
  app.use(require('../src/routes/admission-review'));
  app.use('/admin',require('../src/routes/admin'));
  app.use((error,req,res,next)=>res.status(500).send(error.message));
  server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});base='http://127.0.0.1:'+server.address().port;
});
beforeEach(()=>{student={_id:ids.student,firstName:'Test',lastName:'Child',status:'Pending',classLevel:'PP1',parentEmail:'parent@example.test',parentName:'Test Parent',admissionNumber:'JPS-2026-00001'};payments=[];updates=[];lastPaymentQuery=null;});
after(async()=>{for(const[object,key,original]of originals.reverse())object[key]=original;await new Promise(resolve=>server.close(resolve));});
async function request(route,role='parent',body){const response=await fetch(base+route,{method:body?'POST':'GET',redirect:'manual',headers:{...(role?{'x-test-role':role}:{}),...(body?{'content-type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{})});return {status:response.status,location:response.headers.get('location'),text:await response.text()};}
const accept=extra=>request('/parent/students/'+ids.student+'/accept','parent',{_csrf:'review-token',agree:'yes',agreementVersion,...extra});
const approve=(role='admin',extra={})=>request('/admin/admissions/'+ids.student+'/approve',role,{_csrf:'review-token',confirmReview:'yes',...extra});
function paid(extra={}){return {_id:ids.payment,student:ids.student,invoice:ids.invoice,status:'Paid',amount:100,verifiedAt:new Date(),createdAt:new Date(),...extra};}

test('parent acceptance records explicit version, identity and time while leaving status pending',async()=>{
  assert.equal((await accept()).status,302);assert.equal(student.status,'Pending');assert.equal(student.enrolmentAcceptedBy,ids.parent);assert.equal(student.enrolmentAgreementVersion,agreementVersion);assert.ok(student.enrolmentAcceptedAt instanceof Date);
  const firstTime=student.enrolmentAcceptedAt;assert.equal((await accept()).status,302);assert.equal(student.enrolmentAcceptedAt,firstTime);
});
test('acceptance requires ownership, explicit agreement, current version, CSRF and pending status',async()=>{
  const route='/parent/students/'+ids.student+'/accept';
  const body={_csrf:'review-token',agree:'yes',agreementVersion};
  assert.equal((await request(route,'stranger',body)).status,404);
  assert.equal((await accept({agree:''})).status,400);assert.equal((await accept({agreementVersion:'old'})).status,400);assert.equal((await accept({_csrf:'wrong'})).status,403);
  assert.equal((await request(route,'teacher',body)).status,302);assert.equal(updates.length,0);
  student.status='Active';assert.equal((await accept()).status,409);
});
test('admin approval requires acceptance and records the reviewer',async()=>{
  assert.equal((await approve()).status,409);await accept();
  assert.equal((await approve()).status,302);assert.equal(student.status,'Admitted');assert.equal(student.admissionApprovalBasis,'Parent acceptance');assert.equal(student.admissionApprovedBy,ids.admin);assert.ok(student.admissionApprovedAt instanceof Date);assert.equal(student.admissionNumber,'JPS-2026-00001');
  assert.equal((await approve()).status,409);
});
test('payment alone cannot bypass parent acceptance or admission review',async()=>{
  payments=[paid()];assert.equal((await approve()).status,409);assert.equal(student.status,'Pending');assert.equal(student.enrolmentAcceptedAt,undefined);
  assert.equal(lastPaymentQuery.status,'Paid');assert.ok(lastPaymentQuery.verifiedAt.$exists);
});
test('combined evidence is recorded and unrelated, refunded, pending, unaudited or zero payments do not qualify',async()=>{
  for(const fields of [{student:'other'},{status:'Pending verification'},{status:'Refunded'},{status:'Failed'},{verifiedAt:null},{invoice:null},{amount:0}])assert.equal(review(student,[paid(fields)]).ready,false);
  // Sandbox tests live in a separate collection and are never read by this workflow.
  assert.equal((await approve()).status,409);payments=[paid()];await accept();await approve();assert.equal(student.admissionApprovalBasis,'Parent acceptance');
});
test('queue shows ready and waiting states with protected approval actions',async()=>{
  let result=await request('/admin/admissions','admin');assert.equal(result.status,200);assert.match(result.text,/Waiting for parent acceptance/);assert.doesNotMatch(result.text,/>Approve admission</);
  await accept();result=await request('/admin/admissions','admin');assert.match(result.text,/>Approve admission</);assert.match(result.text,/review-token/);
  assert.equal((await request('/admin/admissions','teacher')).status,302);assert.equal((await request('/admin/admissions',null)).location,'/auth/login');
});
test('admin approval cannot be forged by a parent or bursar or without review confirmation and CSRF',async()=>{
  await accept();for(const role of ['parent','bursar','teacher'])assert.equal((await approve(role)).status,302);
  assert.equal((await approve('admin',{_csrf:'bad'})).status,403);assert.equal((await approve('admin',{confirmReview:''})).status,400);assert.equal(student.status,'Pending');
});
test('student register cannot bypass approval; activation follows admission',async()=>{
  const route='/admin/students/'+ids.student+'/status';
  for(const status of ['Admitted','Active','Graduated'])assert.equal((await request(route,'admin',{_csrf:'review-token',status})).status,409);
  await accept();await approve();assert.equal((await request(route,'admin',{_csrf:'review-token',status:'Active'})).status,409);payments=[paid()];assert.equal((await request(route,'admin',{_csrf:'review-token',status:'Active'})).status,302);assert.equal(student.status,'Active');
  assert.equal((await request(route,'admin',{_csrf:'bad',status:'Withdrawn'})).status,403);
  assert.equal((await request(route,'admin',{_csrf:'review-token',status:'Pending'})).status,409);
  assert.equal((await request('/admin/students','admin')).status,200);
});
test('approval detects concurrent status changes rather than overwriting them',async()=>{
  await accept();const original=Student.updateOne;Student.updateOne=async()=>({matchedCount:0,modifiedCount:0});
  try{assert.equal((await approve()).status,409);assert.equal(student.status,'Pending');}finally{Student.updateOne=original;}
});
test('status transition rules preserve final records and allow withdrawal',()=>{
  assert.equal(canChangeStatus('Pending','Active'),false);assert.equal(canChangeStatus('Pending','Admitted'),false);assert.equal(canChangeStatus('Admitted','Active'),true);assert.equal(canChangeStatus('Active','Graduated'),true);assert.equal(canChangeStatus('Pending','Withdrawn'),true);assert.equal(canChangeStatus('Graduated','Active'),false);
});
test('activation requires a verified payment created after admission and records activation evidence',async()=>{
  await accept();await approve();
  const route='/admin/students/'+ids.student+'/status';
  for(const fields of [{createdAt:new Date(student.admissionApprovedAt.getTime()-1000)},{status:'Pending verification'},{status:'Refunded'},{verifiedAt:null},{amount:0}]){
    payments=[paid(fields)];assert.equal((await request(route,'admin',{_csrf:'review-token',status:'Active'})).status,409);assert.equal(student.status,'Admitted');
  }
  payments=[paid({amount:1})];
  assert.equal((await request(route,'admin',{_csrf:'review-token',status:'Active'})).status,302);
  assert.equal(student.activationPayment,ids.payment);assert.equal(student.activatedBy,ids.admin);assert.ok(student.activatedAt instanceof Date);
});
