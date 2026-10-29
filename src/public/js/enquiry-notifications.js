(() => {
  const badge=document.getElementById('enquiryUnreadBadge');
  if(!badge)return;
  let running=false;
  async function refresh(){
    if(running||document.hidden)return;running=true;
    try{
      const response=await fetch('/admin/enquiries/unread',{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return;
      const data=await response.json();
      if(Number.isInteger(data.unread)&&data.unread>=0){badge.textContent=String(data.unread);badge.hidden=data.unread===0;}
    }catch{}finally{running=false;}
  }
  void refresh();setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);
})();
