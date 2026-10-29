const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  parentName: { type: String, required: true }, parentPhone: String,
  amount: { type: Number, required: true, min: 1 },
  purpose: { type: String, enum: ['Admission fee','Tuition','Meals','Transport','Uniform','Other'], default: 'Tuition' },
  method: { type: String, enum: ['M-Pesa','Bank transfer','Cash','Card','Other'], default: 'M-Pesa' },
  reference: String,
  transactionKey: String,
  status: { type: String, enum: ['Pending verification','Paid','Failed','Refunded'], default: 'Pending verification' },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, verifiedAt: Date,
  createdAt: { type: Date, default: Date.now }
});
schema.index({ transactionKey: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model('Payment', schema);
