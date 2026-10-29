const {test,before,after,beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const mpesa = require('../src/lib/mpesa');
const Attempt = require('../src/models/MpesaSandboxAttempt');
const Invoice = require('../src/models/Invoice');
const Payment = require('../src/models/Payment');
const {router,callbacks,reconcile} = require('../src/routes/mpesa-sandbox');
const ids = {invoice:'111111111111111111111111',parent:'222222222222222222222222',attempt:'333333333333333333333333'};
const realFetch = global.fetch;
const originalEnv = {...process.env};
const originals = [];
let listener,base,attempt,created,outbound,queryResult,paymentWrites,updateCalls;
function stub(object,key,value) { originals.push([object,key,object[key]]); object[key]=value; }
function setEnv() {
  Object.assign(process.env,{MPESA_ENV:'sandbox',MPESA_CONSUMER_KEY:'test-key',MPESA_CONSUMER_SECRET:'test-secret',MPESA_PASSKEY:'test-passkey',MPESA_SHORTCODE:'174379',MPESA_CALLBACK_BASE_URL:'https://tunnel.example.test'});
}
function docQuery(doc) { return {populate(){return this;},select(){return this;},then(resolve,reject){return Promise.resolve(doc).then(resolve,reject);}}; }
before(async()=>{
  stub(Invoice,'findById',key=>docQuery(key===ids.invoice?{_id:ids.invoice,student:{parentEmail:'parent@example.test',status:'Admitted'}}:null));
  stub(Attempt,'init',async()=>{});
  stub(Attempt,'create',async values=>{
    if(created) throw Object.assign(new Error('Duplicate'),{code:11000});
    await new Attempt(values).validate();created=values;
    attempt={...values,_id:ids.attempt,async save(){}};return attempt;
  });
  stub(Attempt,'findById',key=>docQuery(key===ids.attempt?attempt:null));
  stub(Attempt,'findOne',criteria=>docQuery(attempt && criteria._id===String(attempt._id) && criteria.parent===String(attempt.parent)?attempt:null));
  stub(Attempt,'updateOne',async(criteria,change)=>{updateCalls.push({criteria,change});if(attempt && change.$set.status) Object.assign(attempt,change.$set);return {modifiedCount:1};});
  stub(Payment,'create',async()=>{paymentWrites++;throw new Error('Sandbox must never write payments');});
  stub(mpesa,'initiate',async()=>{outbound++;return {ResponseCode:'0',CheckoutRequestID:'checkout-test',MerchantRequestID:'merchant-test'};});
  stub(mpesa,'query',async()=>queryResult);
  const app=express();app.use(express.urlencoded({extended:true}));app.use(express.json());app.use(callbacks);
  app.use((req,res,next)=>{const role=req.headers['x-test-role'];req.session={recordToken:'csrf',user:role?{id:role==='stranger'?'444444444444444444444444':ids.parent,email:role==='stranger'?'other@example.test':'parent@example.test',role:role==='stranger'?'parent':role}:null};next();});
  app.use(router);app.use((error,req,res,next)=>res.status(500).send('Unexpected test failure'));
  listener=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});base='http://127.0.0.1:'+listener.address().port;
});
beforeEach(()=>{setEnv();attempt=null;created=null;outbound=0;paymentWrites=0;updateCalls=[];queryResult={CheckoutRequestID:'checkout-test',MerchantRequestID:'merchant-test',ResultCode:0};});
after(async()=>{for(const [object,key,original] of originals.reverse())object[key]=original;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);global.fetch=realFetch;await new Promise(resolve=>listener.close(resolve));});
async function post(route,values={},role='parent',json=false) {
  const response=await realFetch(base+route,{method:'POST',redirect:'manual',headers:{...(role?{'x-test-role':role}:{}),'content-type':json?'application/json':'application/x-www-form-urlencoded'},body:json?JSON.stringify(values):new URLSearchParams(values)});
  return {status:response.status,location:response.headers.get('location'),text:await response.text()};
}
const form=extra=>({_csrf:'csrf',invoiceId:ids.invoice,amount:'1',parentPhone:'0700000000',requestKey:'a'.repeat(64),...extra});
const start=()=>post('/parent/payments/mpesa-sandbox',form());

test('normalizes Kenyan mobiles and rejects malformed or international numbers',()=>{
  for(const value of ['0712 345 678','+254712345678','254712345678'])assert.equal(mpesa.phone(value),'254712345678');
  assert.equal(mpesa.phone('0112345678'),'254112345678');
  for(const value of ['abc','+12025550123','2547000',[],null])assert.equal(mpesa.phone(value),null);
  assert.equal(mpesa.timestamp(new Date('2026-10-18T16:00:01Z')),'20261018190001');
});
test('refuses production and insecure or incomplete configuration',()=>{
  for(const [key,value] of [['MPESA_ENV','production'],['MPESA_SHORTCODE','123456'],['MPESA_PASSKEY',''],['MPESA_CALLBACK_BASE_URL','http://localhost:3000'],['MPESA_CALLBACK_BASE_URL','https://example.test/path']]){
    setEnv();process.env[key]=value;assert.equal(mpesa.ready(),false);assert.throws(()=>mpesa.configuration());
  }
});
test('provider client uses sandbox OAuth, password, callback URL and query endpoint',async()=>{
  const originalInitiate=originals.find(([object,key])=>object===mpesa && key==='initiate')[2];
  const originalQuery=originals.find(([object,key])=>object===mpesa && key==='query')[2];
  const requests=[];
  global.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.includes('/oauth/')?{access_token:'token'}:{ResponseCode:'0'}};};
  try {
    await originalInitiate({amount:1,phone:'254700000000',reference:'TEST123',callbackPath:'/mpesa/sandbox/callback/id/token'});
    await originalQuery('checkout-test');
    assert.equal(requests.length,4);
    assert.ok(requests.every(request=>request.url.startsWith('https://sandbox.safaricom.co.ke/')));
    assert.equal(requests[0].options.headers.Authorization,'Basic '+Buffer.from('test-key:test-secret').toString('base64'));
    const payload=JSON.parse(requests[1].options.body);
    assert.equal(payload.PhoneNumber,'254700000000');assert.equal(payload.Amount,1);
    assert.equal(payload.TransactionType,'CustomerPayBillOnline');
    assert.equal(payload.Password,Buffer.from('174379test-passkey'+payload.Timestamp).toString('base64'));
    assert.equal(payload.CallBackURL,'https://tunnel.example.test/mpesa/sandbox/callback/id/token');
    assert.ok(requests[3].url.endsWith('/mpesa/stkpushquery/v1/query'));
    assert.equal(JSON.parse(requests[3].options.body).CheckoutRequestID,'checkout-test');
    global.fetch=async()=>{throw new Error('secret-value');};
    await assert.rejects(()=>originalQuery('checkout-test'),error=>!error.message.includes('secret-value'));
  } finally {global.fetch=realFetch;}
});
test('parent starts sandbox request without reference and a double submission sends only once',async()=>{
  assert.equal((await start()).status,302);assert.equal(attempt.status,'Pending');assert.equal(attempt.phone,'254700000000');
  assert.equal(attempt.checkoutId,'checkout-test');assert.equal(outbound,1);
  assert.equal((await start()).status,302);assert.equal(outbound,1);assert.equal(paymentWrites,0);
});
test('authentication, role, CSRF and invoice ownership protect sandbox requests',async()=>{
  assert.equal((await post('/parent/payments/mpesa-sandbox',form(),null)).location,'/auth/login');
  assert.equal((await post('/parent/payments/mpesa-sandbox',form(),'teacher')).location,'/admin/dashboard');
  assert.equal((await post('/parent/payments/mpesa-sandbox',form({_csrf:''}))).status,403);
  assert.equal((await post('/parent/payments/mpesa-sandbox',form(),'stranger')).status,404);
  assert.equal(outbound,0);
});
test('invalid amounts, phone and request keys never call the provider',async()=>{
  for(const fields of [{amount:'0'},{amount:'1.5'},{amount:'150001'},{parentPhone:'invalid'},{requestKey:'bad'}])assert.equal((await post('/parent/payments/mpesa-sandbox',form(fields))).status,400);
  assert.equal(outbound,0);
});
test('missing setup makes no provider or attempt writes',async()=>{
  delete process.env.MPESA_PASSKEY;assert.equal((await start()).status,302);assert.equal(outbound,0);assert.equal(created,null);
});
test('sandbox fee test is blocked before admission',async()=>{
  const original=Invoice.findById;
  Invoice.findById=()=>docQuery({_id:ids.invoice,student:{parentEmail:'parent@example.test',status:'Pending'}});
  try{assert.equal((await start()).status,409);assert.equal(outbound,0);assert.equal(created,null);}finally{Invoice.findById=original;}
});
test('accepted request stays pending until query success and never creates real payment',async()=>{
  await start();assert.equal(attempt.status,'Pending');
  const route='/parent/payments/mpesa-sandbox/'+ids.attempt+'/check';
  assert.equal((await post(route,{_csrf:'csrf'},'stranger')).status,404);
  assert.equal((await post(route,{_csrf:'csrf'})).status,302);assert.equal(attempt.status,'Successful');assert.equal(paymentWrites,0);
});
test('pending, mismatched and unavailable queries do not mark success; cancellation marks failed',async()=>{
  await start();
  for(const result of [{ResponseCode:'0'},{...queryResult,CheckoutRequestID:'other'},{...queryResult,MerchantRequestID:'other'}]){queryResult=result;await reconcile(attempt);assert.equal(attempt.status,'Pending');}
  queryResult={CheckoutRequestID:'checkout-test',MerchantRequestID:'merchant-test',ResultCode:1032};
  await reconcile(attempt);assert.equal(attempt.status,'Failed');assert.equal(paymentWrites,0);
});
test('unconfirmed initiation becomes unknown without automatic retry',async()=>{
  const original=mpesa.initiate;mpesa.initiate=async()=>{outbound++;throw new Error('Timeout');};
  try {await start();assert.equal(attempt.status,'Unknown');assert.equal(attempt.checkoutId,undefined);assert.equal(outbound,1);assert.equal(paymentWrites,0);}
  finally {mpesa.initiate=original;}
});
test('callback has no login requirement, rejects wrong tokens and queries instead of trusting success',async()=>{
  await start();
  const token='b'.repeat(64);attempt.callbackHash=crypto.createHash('sha256').update(token).digest('hex');
  const route='/mpesa/sandbox/callback/'+ids.attempt+'/';
  const body={Body:{stkCallback:{CheckoutRequestID:'checkout-test',MerchantRequestID:'merchant-test',ResultCode:0}}};
  assert.equal((await post(route+'c'.repeat(64),body,null,true)).status,404);
  queryResult={CheckoutRequestID:'checkout-test',MerchantRequestID:'merchant-test',ResultCode:1032};
  assert.equal((await post(route+token,body,null,true)).status,200);assert.equal(attempt.status,'Failed');assert.equal(paymentWrites,0);
  queryResult.ResultCode=0;await post(route+token,body,null,true);assert.equal(attempt.status,'Failed');
});
test('sandbox panel renders setup notice and test controls without requiring a transaction reference',async()=>{
  const ejs=require('ejs');
  const locals={sandboxEnabled:true,sandboxReady:false,sandboxAttempts:[],invoices:[],selectedInvoice:'',recordToken:'csrf',sandboxRequestKey:'a'.repeat(64),currentUser:{phone:'0700000000'}};
  const filename=path.join(__dirname,'../src/views/partials/mpesa-sandbox.ejs');
  let html=await ejs.renderFile(filename,locals);assert.match(html,/setting up sandbox/);assert.doesNotMatch(html,/Send M-Pesa test prompt/);
  html=await ejs.renderFile(filename,{...locals,sandboxReady:true,invoices:[{_id:ids.invoice,student:{firstName:'Test',lastName:'Child'},year:2026,term:1}]});
  assert.match(html,/Send M-Pesa test prompt/);assert.doesNotMatch(html,/name="reference"/);assert.match(html,/do not pay school fees/);
});
