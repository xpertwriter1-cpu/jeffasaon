document.querySelectorAll('#nav a[href*="#"]').forEach(link => link.addEventListener('click', event => {
  const nav = document.getElementById('nav');
  if (!window.bootstrap || !nav.classList.contains('show')) return;
  const destination = new URL(link.href);
  const target = destination.pathname === location.pathname && document.getElementById(destination.hash.slice(1));
  if (target) {
    event.preventDefault();
    nav.addEventListener('hidden.bs.collapse', () => {
      history.pushState(null, '', destination.hash);
      target.scrollIntoView({block:'start'});
    }, {once:true});
  }
  bootstrap.Collapse.getOrCreateInstance(nav).hide();
}));
document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
const role = document.getElementById('role');
if (role) role.addEventListener('change', () => {
  for (const name of ['parent','admin','teacher','bursar']) document.getElementById(name+'AccountHelp').hidden = role.value !== name;
  document.getElementById('chooseAccountHelp').hidden = !!role.value;
});
