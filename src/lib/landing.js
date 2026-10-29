const crypto=require('crypto');
module.exports=function(req,res,error=null,values={},status=200){
 if(!req.session.contactToken)req.session.contactToken=crypto.randomBytes(32).toString('hex');
 res.status(status).render('pages/home',{title:'Welcome',error,values,contactToken:req.session.contactToken,requestKey:typeof req.body?.requestKey==='string'&&/^[a-f\d]{64}$/.test(req.body.requestKey)?req.body.requestKey:crypto.randomBytes(32).toString('hex')});
};
