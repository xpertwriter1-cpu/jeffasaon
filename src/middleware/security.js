const crypto=require('crypto');
function securityToken(req,res,next){
 if(!req.session.securityToken)req.session.securityToken=crypto.randomBytes(32).toString('hex');
 res.locals.securityToken=req.session.securityToken;
 next();
}
function protectForms(req,res,next){
 if(req.method!=='POST')return next();
 const submitted=req.body?._security,expected=req.session.securityToken;
 if(typeof submitted!=='string'||!(/^[a-f\d]{64}$/.test(submitted))||typeof expected!=='string'||submitted.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(submitted),Buffer.from(expected)))return res.status(403).send('Your form expired. Reload the page and try again.');
 next();
}
module.exports={securityToken,protectForms};
