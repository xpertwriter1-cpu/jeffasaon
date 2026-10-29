const r=require('express').Router();
r.get('/',(req,res)=>require('../lib/landing')(req,res));
for(const section of ['about','programs','admissions'])r.get('/'+section,(req,res)=>res.redirect('/#'+section));
module.exports=r;
