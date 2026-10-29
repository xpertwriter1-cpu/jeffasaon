require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
(async () => {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw Error('Set SEED_ADMIN_PASSWORD to a unique password of 12 to 72 bytes.');
  if (!process.env.MONGODB_URI) throw Error('Configure MONGODB_URI in .env');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const email = (process.argv[2] || 'admin@jeffersonspreschool.local').toLowerCase();
    if (await User.findOne({email})) console.log('Account already exists; unchanged.');
    else {
      await User.create({name:'School Administrator', email, phone:process.env.SCHOOL_PHONE, passwordHash:await bcrypt.hash(password,12), role:'admin'});
      console.log('Admin created. Email:', email);
    }
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exit(1); });
