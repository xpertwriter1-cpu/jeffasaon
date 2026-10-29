const r=require('express').Router(),bcrypt=require('bcryptjs'),User=require('../models/User');
const roles=['admin','parent','teacher','bursar'];
function destination(user,programme) {
  if(user.role!=='parent')return '/admin/dashboard';
  return ['Daycare','Playgroup','PP1','PP2'].includes(programme)?'/parent/admission?classLevel='+encodeURIComponent(programme):'/parent/dashboard';
}
function sessionUser(user) { return {id:String(user._id),name:user.name,email:user.email,phone:user.phone,role:user.role}; }
r.get('/register',(q,s)=>s.render('pages/register',{title:'Parent registration',error:null}));
r.post('/register',async(q,s,n)=>{
  try {
    const {name,email,phone,password}=q.body;
    if([name,email,phone,password].some(value=>typeof value!=='string')||!name.trim()||name.length>200||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||phone.length>30||password.length<8||Buffer.byteLength(password,'utf8')>72)return s.status(400).render('pages/register',{title:'Parent registration',error:'Complete all fields. Password must be at least 8 characters.'});
    const em=email.toLowerCase().trim();
    if(await User.findOne({email:em}))return s.status(400).render('pages/register',{title:'Parent registration',error:'An account with that email already exists.'});
    const user=await User.create({name,email:em,phone,passwordHash:await bcrypt.hash(password,12),role:'parent'});
    const target=destination(user,q.session.admissionProgramme);
    q.session.regenerate(error=>{if(error)return n(error);q.session.user=sessionUser(user);s.redirect(target);});
  }catch(error){n(error);}
});
r.get('/login',(q,s)=>s.render('pages/login',{title:'Sign in',error:null,selectedRole:''}));
r.post('/login',async(q,s,n)=>{
  try {
    if(typeof q.body.email!=='string'||typeof q.body.password!=='string'||Buffer.byteLength(q.body.password,'utf8')>72)return s.status(400).render('pages/login',{title:'Sign in',error:'Enter a valid email and password.',selectedRole:''});
    const selectedRole=String(q.body.role||'');
    if(!roles.includes(selectedRole))return s.status(400).render('pages/login',{title:'Sign in',error:'Choose an account type.',selectedRole:''});
    const user=await User.findOne({email:String(q.body.email||'').toLowerCase().trim()});
    if(!user||!await bcrypt.compare(q.body.password||'',user.passwordHash)||user.role!==selectedRole)return s.status(401).render('pages/login',{title:'Sign in',error:'Email, password, or account type is incorrect.',selectedRole});
    const target=destination(user,q.session.admissionProgramme);
    q.session.regenerate(error=>{if(error)return n(error);q.session.user=sessionUser(user);s.redirect(target);});
  }catch(error){n(error);}
});
r.post('/logout',(q,s)=>q.session.destroy(()=>s.redirect('/')));
module.exports=r;
