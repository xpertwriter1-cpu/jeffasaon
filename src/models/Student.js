const mongoose = require('mongoose');
const { groups, documentTypes } = require('../lib/admission');
const fields = {};
for (const field of groups.flatMap(group=>group.fields)) {
  fields[field.name] = field.type==='date' ? {type:Date} : {type:String,trim:true,maxlength:field.max || 200};
  if (field.options) fields[field.name].enum = ['', ...field.options];
}
// Keep new fields optional in the schema so existing student records remain valid.
fields.firstName.required = true; fields.lastName.required = true; fields.classLevel.required = true;
module.exports = mongoose.model('Student', new mongoose.Schema({
  ...fields,
  admissionNumber:{type:String,unique:true,sparse:true},
  parentName:{type:String,required:true}, parentEmail:{type:String,required:true,lowercase:true},
  parentPhone:{type:String,required:true}, emergencyContact:String,
  declarationAt:Date, submittedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  enrolmentAcceptedAt:Date,
  enrolmentAcceptedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  enrolmentAgreementVersion:String,
  admissionApprovedAt:Date,
  admissionApprovedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  admissionApprovalBasis:{type:String,enum:['Parent acceptance','Verified payment','Parent acceptance and verified payment']},
  admissionApprovalPayment:{type:mongoose.Schema.Types.ObjectId,ref:'Payment'},
  activatedAt:Date,
  activatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  activationPayment:{type:mongoose.Schema.Types.ObjectId,ref:'Payment'},
  documents:[{
    kind:{type:String,enum:documentTypes.map(d=>d.name),required:true},
    storedName:{type:String,required:true}, originalName:{type:String,required:true},
    mimeType:{type:String,enum:['application/pdf','image/png','image/jpeg'],required:true},
    size:{type:Number,required:true}, uploadedAt:{type:Date,default:Date.now}
  }],
  status:{type:String,enum:['Pending','Admitted','Active','Graduated','Withdrawn'],default:'Pending'},
  createdAt:{type:Date,default:Date.now}
}));
