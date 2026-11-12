// Shared: theme toggle (persisted per viewer, safe if storage is blocked)
(function(){
  var root=document.documentElement,btn=document.getElementById('theme');
  try{var t=localStorage.getItem('bh-theme');if(t)root.setAttribute('data-theme',t)}catch(e){}
  if(btn)btn.addEventListener('click',function(){
    var dark=root.getAttribute('data-theme')?root.getAttribute('data-theme')==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
    var n=dark?'light':'dark';root.setAttribute('data-theme',n);try{localStorage.setItem('bh-theme',n)}catch(e){}
  });
})();
