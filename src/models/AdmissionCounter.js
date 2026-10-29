const mongoose = require('mongoose');

module.exports = mongoose.model('AdmissionCounter', new mongoose.Schema({
  _id: String,
  sequence: { type: Number, default: 0 }
}));
