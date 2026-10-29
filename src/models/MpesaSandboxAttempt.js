const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  parent:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  invoice:{type:mongoose.Schema.Types.ObjectId,ref:'Invoice',required:true},
  phone:{type:String,required:true}, amount:{type:Number,required:true,min:1,max:150000},
  requestKey:{type:String,required:true}, throttleBucket:{type:Number,required:true},
  callbackHash:{type:String,required:true,select:false},
  checkoutId:String, merchantId:String,
  status:{type:String,enum:['Requesting','Pending','Successful','Failed','Unknown'],default:'Requesting'},
  resultCode:String, lastCheckedAt:Date, createdAt:{type:Date,default:Date.now}
});
schema.index({parent:1,requestKey:1},{unique:true});
schema.index({parent:1,throttleBucket:1},{unique:true});
schema.index({checkoutId:1},{unique:true,sparse:true});
module.exports = mongoose.model('MpesaSandboxAttempt', schema);
