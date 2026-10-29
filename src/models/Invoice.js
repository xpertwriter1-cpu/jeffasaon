const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  year: { type: Number, required: true, min: 2000, max: 2100 },
  term: { type: Number, required: true, enum: [1, 2, 3] },
  items: [{ label: { type: String, required: true }, amount: { type: Number, required: true, min: 0 } }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
schema.index({ student: 1, year: 1, term: 1 }, { unique: true });
module.exports = mongoose.model('Invoice', schema);
