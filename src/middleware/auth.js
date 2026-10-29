exports.requireLogin = (req, res, next) => {
  if (!req.session.user) { req.session.flash = { type:'warning', message:'Please sign in first.' }; return res.redirect('/auth/login'); }
  next();
};
exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.session.user || !roles.includes(req.session.user.role)) {
    req.session.flash = { type:'danger', message:'You do not have permission to access this page.' };
    return res.redirect(!req.session.user ? '/auth/login' : req.session.user.role === 'parent' ? '/parent/dashboard' : '/admin/dashboard');
  }
  next();
};
