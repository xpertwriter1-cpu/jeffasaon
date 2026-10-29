const express = require('express');
const crypto = require('crypto');
const Invoice = require('../models/Invoice');
const Attempt = require('../models/MpesaSandboxAttempt');
const mpesa = require('../lib/mpesa');
const { requireLogin, requireRole } = require('../middleware/auth');
const router = express.Router();
const callbacks = express.Router();
const id = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
function flash(req, message, type = 'info') { req.session.flash = {type,message}; }

// Query Safaricom rather than accepting a callback's claim of success.
async function reconcile(attempt) {
  if (!attempt.checkoutId || ['Successful','Failed'].includes(attempt.status)) return;
  const result = await mpesa.query(attempt.checkoutId);
  if (result.CheckoutRequestID !== attempt.checkoutId || result.MerchantRequestID !== attempt.merchantId) return;
  if (result.ResultCode === undefined || result.ResultCode === null || !/^\d+$/.test(String(result.ResultCode))) return;
  const code = String(result.ResultCode);
  await Attempt.updateOne({ _id:attempt._id, status:{$in:['Pending','Unknown','Requesting']} }, {
    $set:{status:code === '0' ? 'Successful' : 'Failed', resultCode:code}
  });
}
// Mounted before login/session middleware: Safaricom has no browser session or CSRF token.
callbacks.post('/mpesa/sandbox/callback/:id/:token', wrap(async (req,res) => {
  if (!id(req.params.id) || !/^[a-f\d]{64}$/.test(req.params.token)) return res.sendStatus(404);
  const attempt = await Attempt.findById(req.params.id).select('+callbackHash');
  if (!attempt || !crypto.timingSafeEqual(Buffer.from(hash(req.params.token)), Buffer.from(attempt.callbackHash))) return res.sendStatus(404);
  const callback = req.body && req.body.Body && req.body.Body.stkCallback;
  if (!callback || !attempt.checkoutId || callback.CheckoutRequestID !== attempt.checkoutId || callback.MerchantRequestID !== attempt.merchantId) {
    // A callback can race the initiation response. Keep it pending for a status check.
    return res.json({ResultCode:0,ResultDesc:'Accepted'});
  }
  try { await reconcile(attempt); } catch { /* A parent can retry status checks after a provider outage. */ }
  res.json({ResultCode:0,ResultDesc:'Accepted'});
}));

router.use('/parent/payments/mpesa-sandbox', requireLogin, requireRole('parent'), (req,res,next) => {
  if (req.method !== 'POST') return res.sendStatus(405);
  if (!req.session.recordToken || req.body._csrf !== req.session.recordToken) return res.status(403).send('Your form expired. Reload the payment page.');
  next();
});
router.post('/parent/payments/mpesa-sandbox', wrap(async (req,res) => {
  const b = req.body;
  const number = mpesa.phone(b.parentPhone);
  if (!id(b.invoiceId) || typeof b.amount !== 'string' || !/^\d+$/.test(b.amount) || Number(b.amount) < 1 || Number(b.amount) > 150000 || !number || typeof b.requestKey !== 'string' || !/^[a-f\d]{64}$/.test(b.requestKey)) {
    return res.status(400).send('Choose an invoice, enter a whole-shilling test amount from 1 to 150,000, and a valid Kenyan mobile number.');
  }
  const invoice = await Invoice.findById(b.invoiceId).populate('student');
  if (!invoice || !invoice.student || invoice.student.parentEmail !== req.session.user.email) return res.sendStatus(404);
  if (!['Admitted','Active'].includes(invoice.student.status)) return res.status(409).send('The school must admit the child before testing fee payment.');
  try { mpesa.configuration(); } catch(error) {
    flash(req,error.message,'warning'); return res.redirect('/parent/payments');
  }
  // Persist before calling Safaricom. Unique keys stop a double click sending twice.
  const token = crypto.randomBytes(32).toString('hex');
  let attempt;
  try {
    await Attempt.init();
    attempt = await Attempt.create({parent:req.session.user.id,invoice:invoice._id,phone:number,amount:Number(b.amount),
      requestKey:b.requestKey,throttleBucket:Math.floor(Date.now()/30000),callbackHash:hash(token)});
  } catch(error) {
    if (error.code !== 11000) throw error;
    flash(req,'A test request was already submitted. Check its status before sending another prompt.');
    return res.redirect('/parent/payments');
  }
  try {
    const result = await mpesa.initiate({amount:attempt.amount,phone:number,reference:'TEST' + String(invoice._id).slice(-8),
      callbackPath:'/mpesa/sandbox/callback/' + attempt._id + '/' + token});
    if (String(result.ResponseCode) !== '0' || !result.CheckoutRequestID || !result.MerchantRequestID) {
      attempt.status = 'Failed';
      flash(req,'Safaricom did not accept this sandbox request. Check your sandbox setup.','warning');
    } else {
      attempt.checkoutId = result.CheckoutRequestID; attempt.merchantId = result.MerchantRequestID; attempt.status = 'Pending';
      flash(req,'Sandbox request accepted. Follow the test flow, then check its status below. This does not pay real school fees.');
    }
  } catch {
    attempt.status = 'Unknown';
    flash(req,'The sandbox request could not be confirmed. Check your phone and Daraja before sending another request.','warning');
  }
  await attempt.save();
  res.redirect('/parent/payments');
}));
router.post('/parent/payments/mpesa-sandbox/:id/check', wrap(async (req,res) => {
  if (!id(req.params.id)) return res.sendStatus(404);
  const attempt = await Attempt.findOne({_id:req.params.id,parent:req.session.user.id});
  if (!attempt) return res.sendStatus(404);
  if (!attempt.checkoutId) {
    flash(req,'No checkout ID is available. Check this request in Daraja; it cannot be verified here.','warning');
  } else {
    // Atomically throttle repeated status checks, including concurrent requests.
    const lock = await Attempt.updateOne({_id:attempt._id,$or:[{lastCheckedAt:{$exists:false}},{lastCheckedAt:{$lt:new Date(Date.now()-15000)}}]},{$set:{lastCheckedAt:new Date()}});
    if (!lock.modifiedCount) flash(req,'Please wait 15 seconds before checking again.');
    else {
      try { await reconcile(attempt); flash(req,'Sandbox status checked. Test payments do not change fee balances.'); }
      catch { flash(req,'Safaricom could not confirm the status yet. Please check again shortly.','warning'); }
    }
  }
  res.redirect('/parent/payments');
}));
module.exports = { router, callbacks, reconcile };
