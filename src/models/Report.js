const mongoose = require('mongoose');
const areas = ['Language', 'Numeracy', 'Creativity', 'Physical development', 'Social skills'];
const ratings = ['Exceeding expectations', 'Meeting expectations', 'Developing', 'Needs support'];
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  year: { type: Number, required: true, min: 2000, max: 2100 },
  term: { type: Number, required: true, enum: [1, 2, 3] },
  classLevel: { type: String, required: true },
  assessments: [{ area: { type: String, enum: areas, required: true }, rating: { type: String, enum: ratings, required: true } }],
  daysPresent: { type: Number, min: 0, required: true },
  daysPossible: { type: Number, min: 0, required: true },
  comments: { type: String, maxlength: 3000 },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publishedAt: Date
}, { timestamps: true });
schema.index({ student: 1, year: 1, term: 1 }, { unique: true });
const Report = mongoose.model('Report', schema);
Report.areas = areas; Report.ratings = ratings;
module.exports = Report;
