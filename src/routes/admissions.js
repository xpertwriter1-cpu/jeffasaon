const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const multer = require('multer');
const Student = require('../models/Student');
const {agreementText,agreementVersion}=require('../lib/admission-review');
const nextAdmissionNumber = require('../lib/admission-number');
const { requireLogin, requireRole } = require('../middleware/auth');
const { groups, documentTypes, today, validateAdmission, fileType } = require('../lib/admission');
const r = express.Router();
const uploadRoot = path.resolve(__dirname, '../../private-uploads/admissions');
const upload = multer({ storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024,files:4,fields:60,fieldSize:12000,parts:64} }).fields(documentTypes.map(d=>({name:d.name,maxCount:1})));
const id = value => typeof value==='string' && /^[a-f\d]{24}$/i.test(value);
const wrap = fn => (q,s,n)=>Promise.resolve(fn(q,s,n)).catch(n);
r.use((q,s,n)=>{
  if (!/^\/parent\/admission\/?$/.test(q.path) && !/^\/(parent|admin)\/students\/[a-f\d]{24}(\/|$)/i.test(q.path)) return n('router');
  if(q.method==='GET' && q.path==='/parent/admission' && ['Daycare','Playgroup','PP1','PP2'].includes(q.query.classLevel)) q.session.admissionProgramme=q.query.classLevel;
  requireLogin(q,s,()=>{
    if (!q.session.admissionToken) q.session.admissionToken=crypto.randomBytes(32).toString('hex');
    s.locals.admissionToken=q.session.admissionToken; n();
  });
});
function renderForm(q,s,errors=[],values={},status=200) {
  s.status(status).render('pages/admission',{title:'Student admission',errors,values,groups,documentTypes,today:today()});
}
r.get('/parent/admission',requireRole('parent'),(q,s)=>{
  const classLevel=['Daycare','Playgroup','PP1','PP2'].includes(q.query.classLevel)?q.query.classLevel:q.session.admissionProgramme||'';
  delete q.session.admissionProgramme;
  renderForm(q,s,[],{guardianName:q.session.user.name,parentPhone:q.session.user.phone||'',classLevel});
});
r.post('/parent/admission',requireRole('parent'),(q,s,n)=>{
  upload(q,s,error=>{
    if(error) return renderForm(q,s,[error.code==='LIMIT_FILE_SIZE'?'Each document must be no larger than 5 MB.':'Upload up to one file per document category and check that the form fields are valid.'],{},400);
    n();
  });
},wrap(async(q,s,n)=>{
  const {values,errors}=validateAdmission(q.body);
  if(q.body._csrf!==q.session.admissionToken) return s.status(403).send('Your form expired. Reload the admission page and try again.');
  const uploads=[];
  for(const kind of documentTypes) {
    const file=q.files && q.files[kind.name] && q.files[kind.name][0];
    if(!file) continue;
    const type=fileType(file.buffer);
    if(!type || (kind.photo && type.mimeType==='application/pdf')) {
      errors.push(kind.label+' must be '+(kind.photo?'a JPG or PNG image.':'a PDF, JPG or PNG file.')); continue;
    }
    uploads.push({file,metadata:{kind:kind.name,storedName:crypto.randomUUID()+type.extension,
      originalName:path.basename(file.originalname.replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,200)||kind.label+type.extension,
      mimeType:type.mimeType,size:file.size}});
  }
  if(errors.length) return renderForm(q,s,errors,values,400);
  const records={...values,dateOfBirth:values.dateOfBirth,requestedStartDate:values.requestedStartDate||undefined,
    parentName:q.session.user.name,parentEmail:q.session.user.email,submittedBy:q.session.user.id,
    emergencyContact:values.emergencyName+' ('+values.emergencyRelationship+') '+values.emergencyPhone,
    declarationAt:new Date(),documents:uploads.map(u=>u.metadata)};
  // Validate the database record before committing any uploaded files.
  const student=new Student(records);
  try { await student.validate(); } catch(error) { if(error.name==='ValidationError') return renderForm(q,s,['Please check the admission details.'],values,400); throw error; }
  const written=[];
  try {
    student.admissionNumber = await nextAdmissionNumber();
    if(uploads.length) await fs.mkdir(uploadRoot,{recursive:true});
    for(const upload of uploads) {
      const target=path.join(uploadRoot,upload.metadata.storedName);
      await fs.writeFile(target,upload.file.buffer,{flag:'wx'}); written.push(target);
    }
    await student.save();
  } catch(error) {
    const cleanup=await Promise.allSettled(written.map(target=>fs.unlink(target)));
    if(cleanup.some(result=>result.status==='rejected')) console.error('Could not clean up an admission upload after a failed submission.');
    throw error;
  }
  q.session.flash={type:'success',message:'Your child’s admission details and documents were submitted for school review.'};
  s.redirect('/parent/students/'+student._id);
}));
async function accessibleStudent(q) {
  if(!id(q.params.id)) return null;
  const parentView=q.path.startsWith('/parent');
  if(parentView ? q.session.user.role!=='parent' : !['admin','teacher'].includes(q.session.user.role)) return null;
  const student=await Student.findById(q.params.id);
  if(!student || (parentView && student.parentEmail!==q.session.user.email)) return null;
  return student;
}
r.get(['/parent/students/:id','/admin/students/:id'],wrap(async(q,s)=>{
  const student=await accessibleStudent(q);
  if(!student) return s.sendStatus(404);
  s.set('Cache-Control','no-store');
  s.render('pages/student-record',{title:'Child admission record',student,groups,documentTypes,agreementText,agreementVersion,staff:q.path.startsWith('/admin')});
}));
r.get(['/parent/students/:id/documents/:documentId','/admin/students/:id/documents/:documentId'],wrap(async(q,s,n)=>{
  const student=await accessibleStudent(q);
  if(!student || !id(q.params.documentId)) return s.sendStatus(404);
  const document=(student.documents||[]).find(doc=>String(doc._id)===q.params.documentId);
  if(!document || !/^[a-f\d-]{36}\.(pdf|png|jpg)$/i.test(document.storedName)) return s.sendStatus(404);
  const target=path.resolve(uploadRoot,document.storedName);
  if(path.dirname(target)!==uploadRoot) return s.sendStatus(404);
  try { await fs.access(target); } catch(error) { if(error.code==='ENOENT') return s.status(404).send('This document is unavailable. Please contact the school.'); throw error; }
  s.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Type':document.mimeType});
  s.download(target,document.originalName,error=>{if(error && !s.headersSent)n(error);});
}));
module.exports=r;
