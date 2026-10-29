const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const session=require('express-session');
const path=require('path');
const {securityToken,protectForms}=require('../src/middleware/security');
let server,base;
before(async()=>{
 const app=express();app.use(express.urlencoded({extended:true}));app.use(session({secret:'test-only-secret',resave:false,saveUninitialized:false}));app.use(securityToken);
 app.set('view engine','ejs');app.set('views',path.join(__dirname,'../src/views'));
 app.use((req,res,next)=>{Object.assign(res.locals,{currentUser:null,flash:null,school:{name:'School',phone:'0700000000',email:'school@example.test',location:'Rongai'}});next();});
 app.use('/auth',protectForms);app.use('/admin/users',protectForms);
 app.use('/auth',require('../src/routes/auth'));app.post('/admin/users',(req,res)=>res.sendStatus(204));
 app.use(require('../src/routes/contact'));app.use(require('../src/routes/public'));
 server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});base='http://127.0.0.1:'+server.address().port;
});
after(()=>new Promise(resolve=>server.close(resolve)));
test('landing includes unique navigation targets, contact form and all application programmes',async()=>{
 const response=await fetch(base);assert.equal(response.status,200);const html=await response.text();
 for(const id of ['home','about','programs','admissions','contact'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(html,/playground.svg/);assert.match(html,/name="_csrf" value="[a-f\d]{64}"/);assert.match(html,/name="requestKey" value="[a-f\d]{64}"/);
 for(const programme of ['Daycare','Playgroup','PP1','PP2'])assert.ok(html.includes('/parent/admission?classLevel='+programme));
});
test('legacy public page links redirect to landing sections',async()=>{
 for(const id of ['about','programs','admissions','contact']){const response=await fetch(base+'/'+id,{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/#'+id);}
});
test('auth and staff writes reject missing, foreign-session and malformed CSRF tokens',async()=>{
 const page=await fetch(base+'/auth/login');const cookie=page.headers.get('set-cookie').split(';')[0];const html=await page.text();const token=html.match(/name="_security" value="([a-f\d]{64})"/)[1];
 for(const route of ['/auth/login','/auth/register','/auth/logout','/admin/users']){
  for(const invalid of ['', 'x'.repeat(64),'é'.repeat(64)]){const res=await fetch(base+route,{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_security:invalid})});assert.equal(res.status,403);}
 }
 let res=await fetch(base+'/admin/users',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_security:token})});assert.equal(res.status,204);
 res=await fetch(base+'/admin/users',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_security:token})});assert.equal(res.status,403);
 res=await fetch(base+'/auth/register',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_security:token,'email[$ne]':'anything',password:'valid-password'})});assert.equal(res.status,400);
});
