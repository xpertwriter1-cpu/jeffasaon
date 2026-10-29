const mongoose=require('mongoose');
const notificationSchema=new mongoose.Schema({
  kind:{type:String,enum:['Acknowledgement','School notification','Reply'],required:true},
  to:{type:String,required:true},from:String,replyTo:String,
  subject:{type:String,required:true},text:{type:String,required:true},
  requestKey:String,createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  status:{type:String,enum:['Queued','Sending','Sent','Failed'],default:'Queued'},
  attempts:{type:Number,default:0},nextAttemptAt:{type:Date,default:Date.now},
  leaseUntil:Date,leaseToken:String,firstAttemptAt:Date,sentAt:Date,providerId:String,error:String,
  createdAt:{type:Date,default:Date.now}
});
const schema=new mongoose.Schema({
  parentName:{type:String,required:true,trim:true,maxlength:200},
  email:{type:String,required:true,lowercase:true,trim:true,maxlength:254},
  phone:{type:String,required:true,trim:true,maxlength:40},childAge:{type:String,maxlength:100},
  message:{type:String,required:true,maxlength:5000},
  status:{type:String,enum:['New','Contacted','Closed'],default:'New'},
  readAt:Date,readBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
  submissionKey:{type:String,unique:true,sparse:true},
  notifications:{type:[notificationSchema],default:[]},
  createdAt:{type:Date,default:Date.now}
});
schema.index({readAt:1,createdAt:-1});
schema.index({'notifications.status':1,'notifications.nextAttemptAt':1});
module.exports=mongoose.model('Enquiry',schema);
