const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const path=require('path');
const fs=require('fs/promises');
const Student=require('../src/models/Student');
const AdmissionCounter=require('../src/models/AdmissionCounter');
const originalCounterUpdate=AdmissionCounter.findOneAndUpdate;
let admissionSequence=0;
const {validateAdmission,fileType}=require('../src/lib/admission');
const ids={student:'111111111111111111111111',parent:'222222222222222222222222'};
const uploadRoot=path.resolve(__dirname,'../private-uploads/admissions');
const valid={firstName:'Test',middleName:'Middle',lastName:'Child',dateOfBirth:'2022-03-01',classLevel:'PP1',homeAddress:'Rongai',guardianName:'Test Parent',guardianRelationship:'Mother',parentPhone:'0729323301',emergencyName:'Test Contact',emergencyRelationship:'Aunt',emergencyPhone:'0700000000',declaration:'yes'};
let server,base,saved,record,failSave,writtenNames=[];
const originalSave=Student.prototype.save,originalFind=Student.findById;
before(async()=>{
  AdmissionCounter.findOneAndUpdate=async()=>({sequence:++admissionSequence});
  Student.prototype.save=async function(){if(failSave)throw new Error('Simulated database failure');saved=this;writtenNames.push(...this.documents.map(doc=>doc.storedName));return this;};
  Student.findById=async key=>key===ids.student?record:null;
  const app=express();app.use(express.urlencoded({extended:true}));app.set('view engine','ejs');app.set('views',path.resolve(__dirname,'../src/views'));
  app.use((q,s,n)=>{const role=q.headers['x-test-role'];q.session={admissionToken:'admission-token',user:role?{id:ids.parent,name:'Test Parent',email:role==='stranger'?'other@example.test':'parent@example.test',role:role==='stranger'?'parent':role,phone:'0729323301'}:null};Object.assign(s.locals,{school:{name:'Jeffersons Preschool',location:'Rongai',phone:'0729323301',email:'school@example.test'},currentUser:q.session.user,flash:null});n();});
  app.use(require('../src/routes/admissions'));app.use((error,q,s,n)=>s.status(500).send('Test save failure'));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{AdmissionCounter.findOneAndUpdate=originalCounterUpdate;Student.prototype.save=originalSave;Student.findById=originalFind;await new Promise(resolve=>server.close(resolve));for(const name of writtenNames)await fs.unlink(path.join(uploadRoot,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});});
beforeEach(()=>{saved=null;failSave=false;record=new Student({...valid,_id:ids.student,parentName:'Test Parent',parentEmail:'parent@example.test',documents:[]});});
async function request(route,role='parent',body){const response=await fetch(base+route,{method:body?'POST':'GET',headers:role?{'x-test-role':role}:{},...(body?{body}:{}),redirect:'manual'});return{status:response.status,location:response.headers.get('location'),text:await response.text(),headers:response.headers};}
function form(extra={},files={}){const data=new FormData();for(const [name,value] of Object.entries({...valid,_csrf:'admission-token',...extra}))data.append(name,value);for(const[name,file]of Object.entries(files))data.append(name,new Blob([file.buffer],{type:file.type||'application/pdf'}),file.name||'record.pdf');return data;}
const pdf={buffer:Buffer.from('%PDF-1.4\nAdmission test fixture'),name:'certificate.pdf'};
const png={buffer:Buffer.from([137,80,78,71,13,10,26,10,0]),type:'image/png',name:'photo.png'};

test('expanded admission form includes sections, private upload fields and CSRF token',async()=>{const result=await request('/parent/admission');assert.equal(result.status,200);for(const text of ['Child details','Parents and guardians','Health and support','birthCertificate','clinicCard','previousReport','childPhoto','admission-token'])assert.ok(result.text.includes(text),text);});
test('anonymous users must sign in and staff cannot submit parent applications',async()=>{assert.equal((await request('/parent/admission',null)).location,'/auth/login');assert.equal((await request('/parent/admission','teacher')).location,'/admin/dashboard');});
test('complete admission saves normalized child details and uses authenticated parent ownership',async()=>{
  const result=await request('/parent/admission','parent',form({firstName:'  Test  ',parentEmail:'forged@example.test',status:'Active',admissionNumber:'FORGED',allergies:'Peanuts',supportNeeds:'Speech support'}));
  assert.equal(result.status,302);assert.ok(result.location.startsWith('/parent/students/'));assert.equal(saved.firstName,'Test');assert.equal(saved.parentEmail,'parent@example.test');assert.equal(saved.status,'Pending');assert.match(saved.admissionNumber,/^JPS-\d{4}-\d{5,}$/);assert.notEqual(saved.admissionNumber,'FORGED');assert.equal(saved.allergies,'Peanuts');assert.ok(saved.declarationAt instanceof Date);assert.equal(saved.submittedBy.toString(),ids.parent);
});
test('missing required details are rejected and entered values are retained',async()=>{const result=await request('/parent/admission','parent',form({emergencyPhone:'',firstName:'Retained Name'}));assert.equal(result.status,400);assert.match(result.text,/Emergency contact phone is required/);assert.match(result.text,/Retained Name/);assert.equal(saved,null);});
test('doctor phone and collector details may be omitted when names are supplied, without documents',async()=>{
  const result=await request('/parent/admission','parent',form({doctorName:'Local clinic',doctorPhone:'',pickupName:'Test Collector',pickupRelationship:'',pickupPhone:''}));
  assert.equal(result.status,302);assert.equal(saved.pickupName,'Test Collector');assert.equal(saved.doctorPhone,'');assert.equal(saved.documents.length,0);
  assert.ok(validateAdmission({...valid,doctorPhone:'invalid'}).errors.some(error=>error.includes('valid phone number')));
});
test('future and invalid dates, bad phones and missing declaration are rejected',()=>{
  for(const invalid of [{dateOfBirth:'2099-01-01'},{dateOfBirth:'2022-02-30'},{parentPhone:'invalid'},{declaration:''},{classLevel:'University'},{secondGuardianEmail:'invalid'}])assert.ok(validateAdmission({...valid,...invalid}).errors.length,JSON.stringify(invalid));
});
test('arrays and overlong strings cannot bypass admission validation',()=>{assert.ok(validateAdmission({...valid,firstName:['A','B']}).errors.length);assert.ok(validateAdmission({...valid,medicalNotes:'a'.repeat(3001)}).errors.length);});
test('birth certificate and photo upload are stored with private generated filenames',async()=>{
  const result=await request('/parent/admission','parent',form({}, {birthCertificate:pdf,childPhoto:png}));assert.equal(result.status,302);assert.equal(saved.documents.length,2);
  for(const doc of saved.documents){assert.match(doc.storedName,/^[a-f\d-]{36}\.(pdf|png)$/);assert.ok((await fs.stat(path.join(uploadRoot,doc.storedName))).size>0);}
});
test('unsupported content and PDF photos are rejected before records are saved',async()=>{
  for(const files of [{birthCertificate:{buffer:Buffer.from('<script>bad</script>'),name:'fake.pdf'}},{childPhoto:pdf}]){const result=await request('/parent/admission','parent',form({},files));assert.equal(result.status,400);assert.equal(saved,null);}
});
test('documents larger than 5 MB and unexpected upload fields are rejected',async()=>{
  assert.equal((await request('/parent/admission','parent',form({}, {birthCertificate:{buffer:Buffer.alloc(5*1024*1024+1),name:'large.pdf'}}))).status,400);
  assert.equal((await request('/parent/admission','parent',form({}, {unapprovedDocument:pdf}))).status,400);assert.equal(saved,null);
});
test('missing CSRF token blocks uploaded admissions',async()=>{const result=await request('/parent/admission','parent',form({_csrf:'wrong'}, {birthCertificate:pdf}));assert.equal(result.status,403);assert.equal(saved,null);});
test('a failed database save cleans up newly written document files',async()=>{
  const before=await fs.readdir(uploadRoot).catch(()=>[]);failSave=true;assert.equal((await request('/parent/admission','parent',form({}, {birthCertificate:pdf}))).status,500);const after=await fs.readdir(uploadRoot).catch(()=>[]);assert.deepEqual(after.sort(),before.sort());
});
test('child records are restricted to owning parent, teacher and admin',async()=>{
  assert.equal((await request('/parent/students/'+ids.student)).status,200);assert.equal((await request('/parent/students/'+ids.student,'stranger')).status,404);
  assert.equal((await request('/admin/students/'+ids.student,'teacher')).status,200);assert.equal((await request('/admin/students/'+ids.student,'admin')).status,200);assert.equal((await request('/admin/students/'+ids.student,'bursar')).status,404);
});
test('legacy student records with missing new fields remain viewable',async()=>{record=new Student({_id:ids.student,firstName:'Legacy',lastName:'Child',classLevel:'PP1',parentName:'Parent',parentEmail:'parent@example.test',parentPhone:'0700000000',emergencyContact:'Earlier emergency contact'});const result=await request('/parent/students/'+ids.student);assert.equal(result.status,200);assert.match(result.text,/Earlier emergency contact/);});
test('document downloads enforce ownership, private caching, attachment headers and missing file handling',async()=>{
  await request('/parent/admission','parent',form({}, {birthCertificate:pdf}));record=saved;record._id=ids.student;
  const route='/parent/students/'+ids.student+'/documents/'+record.documents[0]._id;
  const result=await request(route);assert.equal(result.status,200);assert.match(result.text,/%PDF-/);assert.match(result.headers.get('cache-control'),/no-store/);assert.match(result.headers.get('content-disposition'),/attachment/);
  assert.equal((await request(route,'stranger')).status,404);assert.equal((await request(route.replace('/parent/','/admin/'),'bursar')).status,404);
  record.documents[0].storedName='00000000-0000-0000-0000-000000000000.pdf';assert.equal((await request(route)).status,404);
});
test('document filename traversal is rejected',async()=>{record.documents.push({kind:'birthCertificate',storedName:'../../.env',originalName:'record.pdf',mimeType:'application/pdf',size:100});const result=await request('/parent/students/'+ids.student+'/documents/'+record.documents[0]._id);assert.equal(result.status,404);});
test('file type comes from contents instead of a supplied filename',()=>{assert.equal(fileType(pdf.buffer).mimeType,'application/pdf');assert.equal(fileType(png.buffer).mimeType,'image/png');assert.equal(fileType(Buffer.from('not an image')),null);});
test('programme admission links preselect each supported programme',async()=>{
  for(const programme of ['Daycare','Playgroup','PP1','PP2']){
    const result=await request('/parent/admission?classLevel='+programme);assert.equal(result.status,200);assert.ok(result.text.includes('<option selected>'+programme+'</option>'));
  }
  const invalid=await request('/parent/admission?classLevel=Unknown');assert.equal(invalid.status,200);assert.ok(!invalid.text.includes('<option selected>Unknown</option>'));
});
test('programme selection survives sign-in and parent registration',async()=>{
  const User=require('../src/models/User'),bcrypt=require('bcryptjs');
  const find=User.findOne,create=User.create;
  const user={_id:ids.parent,name:'Parent',email:'parent@example.test',phone:'0700000000',role:'parent',passwordHash:await bcrypt.hash('TestPassword123',4)};
  User.findOne=async criteria=>criteria.email==='new@example.test'?null:user;
  User.create=async values=>({...values,_id:ids.parent});
  const app=express();app.use(express.urlencoded({extended:true}));app.use(require('express-session')({secret:'programme-flow-test-secret',resave:false,saveUninitialized:false}));
  app.use(require('../src/routes/admissions'));app.use('/auth',require('../src/routes/auth'));
  const listener=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const origin='http://127.0.0.1:'+listener.address().port;
  try{
    for(const [programme,action] of [['Daycare','login'],['Playgroup','register'],['PP1','login'],['PP2','register']]){
      const start=await fetch(origin+'/parent/admission?classLevel='+programme,{redirect:'manual'});
      assert.equal(start.status,302);const cookie=start.headers.get('set-cookie').split(';')[0];
      const body=new URLSearchParams({name:'Parent',email:action==='register'?'new@example.test':'parent@example.test',phone:'0700000000',password:'TestPassword123',role:'parent'});
      const result=await fetch(origin+'/auth/'+action,{method:'POST',body,headers:{cookie},redirect:'manual'});
      assert.equal(result.status,302);assert.equal(result.headers.get('location'),'/parent/admission?classLevel='+programme);
    }
  }finally{User.findOne=find;User.create=create;await new Promise(resolve=>listener.close(resolve));}
});
