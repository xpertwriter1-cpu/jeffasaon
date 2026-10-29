const AdmissionCounter = require('../models/AdmissionCounter');

module.exports = async function nextAdmissionNumber() {
  const year = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Nairobi', year: 'numeric' }).format(new Date());
  const key = 'admission-' + year;
  let counter;
  try {
    counter = await AdmissionCounter.findOneAndUpdate(
      { _id: key }, { $inc: { sequence: 1 } }, { upsert: true, new: true }
    );
  } catch (error) {
    // Concurrent first registrations may both try to create the year's counter.
    if (error.code !== 11000) throw error;
    counter = await AdmissionCounter.findOneAndUpdate(
      { _id: key }, { $inc: { sequence: 1 } }, { new: true }
    );
  }
  return 'JPS-' + year + '-' + String(counter.sequence).padStart(5, '0');
};
