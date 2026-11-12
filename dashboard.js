(function(){
  var API=(window.BUTTER_API||"").replace(/\/$/,""),PLAN_LIMIT=10,HOT=80;
  var $=function(s){return document.querySelector(s)};
  var state={servers:[],log:[],range:24,metric:"cpu",loadedAt:Date.now(),err:false,loading:true};
  var seed=[
    {id:1,name:"survival-smp",tpl:"Minecraft",region:"Mumbai",status:"on",cpu:46,ram:62,players:12},
    {id:2,name:"api-gateway",tpl:"Node.js",region:"Singapore",status:"on",cpu:21,ram:34,players:0},
    {id:3,name:"game-lobby",tpl:"Minecraft",region:"Frankfurt",status:"on",cpu:86,ram:71,players:9},
    {id:4,name:"photo-bot",tpl:"Python",region:"Virginia",status:"off",cpu:0,ram:0,players:0}
  ];
  var NAMES={cpu:"CPU",ram:"Memory",players:"Players"};
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove('show')},2200)}
  function clock(){return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
  function note(m){state.log.unshift({t:clock(),m:m});state.log=state.log.slice(0,8);save()}
  function save(){if(API||!state.loaded)return;try{localStorage.setItem('bh-demo-v2',JSON.stringify({s:state.servers,l:state.log}))}catch(e){}}
  var reqId=0;
  function load(){
    var id=++reqId;state.loading=!state.servers||!state.servers.length&&!state.loaded;render();
    var done=function(){if(id!==reqId)return;state.loading=false;state.loaded=true;state.loadedAt=Date.now();render()};
    if(API){
      $('main').classList.add('stale');
      return fetch(API+"/servers").then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(d){if(id!==reqId)return;state.servers=d.servers||d;state.err=false;if(!state.log.length)state.log=[{t:clock(),m:"Connected to backend"}];$('main').classList.remove('stale');done()}).catch(function(){if(id!==reqId)return;state.err=true;$('main').classList.remove('stale');done()});
    }
    try{var d=JSON.parse(localStorage.getItem('bh-demo-v2'));if(d&&d.s){state.servers=d.s;state.log=d.l||[];return setTimeout(done,350)}}catch(e){}
    state.servers=seed.map(function(x){return Object.assign({},x)});state.log=[{t:clock(),m:"Demo workspace ready"}];setTimeout(done,350);
  }
  function act(id,action){
    var s=state.servers.find(function(x){return x.id===id});if(!s)return;
    if(action==="delete"&&!confirm("Delete "+s.name+"? This can't be undone."))return;
    var fin=function(){
      if(action==="start"){s.status="on";s.cpu=12+Math.round(Math.random()*30);s.ram=20+Math.round(Math.random()*40)}
      if(action==="stop"){s.status="off";s.cpu=0;s.ram=0;s.players=0}
      if(action==="restart"){s.status="on";s.cpu=15+Math.round(Math.random()*25)}
      if(action==="delete"){state.servers=state.servers.filter(function(x){return x.id!==id})}
      state.loadedAt=Date.now();note(s.name+" "+action);render();
    };
    if(action!=="delete"){s.status="busy";render()}
    if(API)fetch(API+"/servers/"+id+"/"+action,{method:"POST"}).then(function(r){if(!r.ok)throw 0;fin()}).catch(function(){s.status="off";state.err=true;render()});
    else setTimeout(fin,700);
  }
  /* deterministic series so tiles, sparklines and chart always agree; last point equals the current value */
  function series(key,cur,n){
    var raw=[],i;for(i=0;i<24;i++)raw.push(Math.sin(i*.55+key.length)*.18+Math.cos(i*1.7)*.07);
    var out=raw.map(function(r){return Math.max(0,cur*(1+r-raw[23]))});
    return out.slice(24-n);
  }
  function stat(key){
    var on=state.servers.filter(function(x){return x.status==="on"});
    if(!on.length)return {cur:null};
    var cur=key==="players"?on.reduce(function(a,x){return a+(x.players||0)},0):Math.round(on.reduce(function(a,x){return a+x[key]},0)/on.length);
    return {cur:cur,s:series(key,cur,state.range),on:on};
  }
  function fmt(k,v){return v==null?"—":v+(k==="players"?"":"%")}
  function spark(s,sel){
    var W=120,H=28,mx=Math.max.apply(null,s)||1,mn=Math.min.apply(null,s),sp=(mx-mn)||1;
    var p=s.map(function(v,i){return (i/(s.length-1)*W).toFixed(1)+","+(H-3-(v-mn)/sp*(H-6)).toFixed(1)}).join(" ");
    var c=sel?"var(--toast)":"var(--line)";
    return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+p+'" fill="none" stroke="'+c+'" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }
  function delta(k,st){
    if(!st.s)return '<span class="d">—</span>';
    var a=st.s[0],b=st.s[st.s.length-1],d=Math.round(b-a);
    var u=k==="players"?"":" pts",txt=d===0?"±0":(d>0?"▲ ":"▼ ")+Math.abs(d)+u;
    if(k==="players"&&Math.abs(a)<5&&Math.abs(b)<5)return '<span class="d">was '+Math.round(a)+'</span>';
    return '<span class="d num">'+txt+' vs '+state.range+'h</span>';
  }
  function kpis(){
    var S=state.servers,on=S.filter(function(x){return x.status==="on"}),m=state.metric;
    var dots=S.slice(0,14).map(function(x){return '<i class="'+(x.status==="on"?(x.cpu>=HOT?"hot":"on"):"")+'"></i>'}).join("");
    var cells=['<div class="cell"><button class="kpi" type="button" data-k="servers" data-tip="Servers online out of all servers" aria-pressed="false"><span class="l">Servers</span><span class="v num">'+(S.length?on.length+'<span style="font-size:.6em;color:var(--ink-2)"> / '+S.length+'</span>':'—')+'</span><span class="dots" aria-hidden="true">'+dots+'</span></button></div>'];
    ["cpu","ram","players"].forEach(function(k){
      var st=stat(k),sel=m===k,tip={cpu:"Average CPU across online servers",ram:"Average memory across online servers",players:"Players connected right now"}[k];
      cells.push('<div class="cell"><button class="kpi" type="button" data-k="'+k+'" data-tip="'+tip+'" aria-pressed="'+sel+'"><span class="l">'+NAMES[k]+'</span><span class="v num">'+fmt(k,st.cur)+'</span>'+delta(k,st)+(st.s?spark(st.s,sel):'')+'</button></div>');
    });
    $('#kpis').innerHTML=cells.join("");
    document.querySelectorAll('.kpi').forEach(function(b){b.onclick=function(){if(b.dataset.k==="servers"){$('#servers').scrollIntoView({behavior:'smooth'});return}state.metric=b.dataset.k;render()}});
  }
  function niceMax(peak){var steps=[1,2,5,10,20,50,100,200,500],i=0,t=Math.max(peak*1.15,4);while(steps[i]*4<t&&i<steps.length-1)i++;return steps[i]*4}
  function chart(){
    var k=state.metric,st=stat(k),n=state.range;
    $('#ch-l').textContent=NAMES[k]+(k==="players"?"":" load")+" · last "+n+"h";
    $('#ch-v').textContent=fmt(k,st.cur);
    if(!st.s){$('#chips').innerHTML='';$('#chart').innerHTML='<div class="empty">No online servers to chart<button class="btn sm" id="empty-new" type="button">Start a server</button></div>';var b=$('#empty-new');if(b)b.onclick=function(){$('#new').click()};return}
    var s=st.s,pk=Math.max.apply(null,s),lo=Math.min.apply(null,s),avg=s.reduce(function(a,b){return a+b},0)/s.length;
    $('#chips').innerHTML=['Peak '+fmt(k,Math.round(pk)),'Low '+fmt(k,Math.round(lo)),'Avg '+fmt(k,Math.round(avg))].map(function(c){return '<span class="num">'+c+'</span>'}).join("");
    var W=Math.max(300,Math.round($('#chart').clientWidth||760)),H=W<520?190:230,P={l:38,r:10,t:10,b:26},max=k==="players"?niceMax(pk):100;
    var x=function(i){return P.l+(W-P.l-P.r)*i/(n-1)},y=function(v){return P.t+(H-P.t-P.b)*(1-v/max)};
    var grid=[0,1,2,3,4].map(function(i){var t=max/4*i;return '<line x1="'+P.l+'" x2="'+(W-P.r)+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="var(--line)" stroke-dasharray="'+(i?"3 4":"0")+'"/><text x="'+(P.l-8)+'" y="'+(y(t)+4)+'" text-anchor="end">'+Math.round(t)+(k==="players"?"":"%")+'</text>'}).join("");
    var pts=s.map(function(v,i){return x(i).toFixed(1)+","+y(v).toFixed(1)});
    var area="M"+x(0)+","+y(0)+" L"+pts.join(" L")+" L"+x(n-1)+","+y(0)+"Z";
    var lbl=[0,.25,.5,.75,1].map(function(f){var i=Math.round(f*(n-1));return '<text x="'+x(i)+'" y="'+(H-6)+'" text-anchor="'+(i===0?"start":i===n-1?"end":"middle")+'">'+(i===n-1?"now":(n-1-i)+"h ago")+'</text>'}).join("");
    $('#chart').setAttribute('aria-label',NAMES[k]+" over the last "+n+" hours: now "+fmt(k,st.cur)+", peak "+fmt(k,Math.round(pk))+", low "+fmt(k,Math.round(lo)));
    $('#chart').setAttribute('role','img');
    $('#chart').innerHTML='<svg viewBox="0 0 '+W+' '+H+'"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--butter-2)" stop-opacity=".35"/><stop offset="1" stop-color="var(--butter-2)" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#g)"/><polyline points="'+pts.join(" ")+'" fill="none" stroke="var(--toast)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+lbl+'<line id="cl" y1="'+P.t+'" y2="'+(H-P.b)+'" stroke="var(--ink-2)" stroke-dasharray="2 3" visibility="hidden"/><circle id="cd" r="4.5" fill="var(--toast)" stroke="var(--card)" stroke-width="2" visibility="hidden"/></svg><div class="ctip" id="ctip" hidden></div>';
    var svg=$('#chart svg'),tip=$('#ctip');
    svg.addEventListener('pointermove',function(e){
      var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W,i=Math.max(0,Math.min(n-1,Math.round((px-P.l)/(W-P.l-P.r)*(n-1))));
      var cx=x(i),cy=y(s[i]);$('#cl').setAttribute('x1',cx);$('#cl').setAttribute('x2',cx);$('#cl').setAttribute('visibility','visible');$('#cd').setAttribute('cx',cx);$('#cd').setAttribute('cy',cy);$('#cd').setAttribute('visibility','visible');
      tip.hidden=false;tip.innerHTML='<b class="num">'+fmt(k,Math.round(s[i]))+'</b><span>'+(i===n-1?"now":(n-1-i)+"h ago")+'</span>';tip.style.left=(cx/W*r.width)+'px';tip.style.top=(cy/H*r.height)+'px';
    });
    svg.addEventListener('pointerleave',function(){tip.hidden=true;$('#cl').setAttribute('visibility','hidden');$('#cd').setAttribute('visibility','hidden')});
  }
  function plan(){
    var n=state.servers.length,f=Math.round(Math.min(n,PLAN_LIMIT)/PLAN_LIMIT*40),ticks="";
    for(var i=0;i<40;i++)ticks+='<i class="'+(i<f?"f":"")+'"></i>';
    $('#plan').innerHTML='<div class="plan"><div class="top2"><span>Servers</span><span>Plan limit</span></div><div class="inner"><div class="nl num">'+n+'<small> of '+PLAN_LIMIT+'</small></div><div class="ticks" aria-hidden="true">'+ticks+'</div><div class="foot num"><span>'+Math.max(0,PLAN_LIMIT-n)+' left</span><span>'+Math.round(n/PLAN_LIMIT*100)+'%</span></div></div></div>';
  }
  function list(){
    var S=state.servers;
    if(state.loading){$('#list').innerHTML='<div class="sk"></div><div class="sk"></div><div class="sk"></div>';$('#count').textContent="";return}
    $('#count').textContent=S.length?S.length:"";
    if(!S.length){$('#list').innerHTML='<div class="empty">Servers appear here once you create one<button class="btn sm" id="empty-new2" type="button">New server</button></div>';var b=$('#empty-new2');if(b)b.onclick=function(){$('#new').click()};return}
    var sorted=S.slice().sort(function(a,b){return (b.status==="on")-(a.status==="on")||b.cpu-a.cpu});
    $('#list').innerHTML=sorted.map(function(s){
      var on=s.status==="on",busy=s.status==="busy",hot=on&&s.cpu>=HOT;
      var chip=busy?'<span class="chip busy">working</span>':hot?'<span class="chip hot" data-tip="CPU at '+s.cpu+'%. Over '+HOT+'% for a game server usually means lag.">▲ High CPU</span>':on?'<span class="chip on">online</span>':'<span class="chip off">offline</span>';
      return '<div class="row"><div><span class="n">'+esc(s.name)+'</span>'+chip+'<div class="m">'+esc(s.tpl)+' · '+esc(s.region)+(on&&s.players?' · '+s.players+' players':'')+'</div></div>'+
        '<div class="val num" data-tip="CPU '+s.cpu+'% · Memory '+s.ram+'%">'+(on?s.cpu+'%':'—')+'</div>'+
        '<div class="acts"><button data-a="'+(on?"stop":"start")+'" data-id="'+s.id+'"'+(busy?" disabled":"")+'>'+(on?"Stop":"Start")+'</button><button class="'+(hot?"hotbtn":"")+'" data-a="restart" data-id="'+s.id+'"'+(!on||busy?" disabled":"")+'>Restart</button><button data-a="delete" data-id="'+s.id+'" aria-label="Delete '+esc(s.name)+'" data-tip="Delete">✕</button></div>'+
        (on?'<div class="bar" aria-hidden="true"><i style="width:'+s.cpu+'%"></i></div>':'')+'</div>';
    }).join("");
    document.querySelectorAll('.acts button').forEach(function(b){b.onclick=function(){act(+b.dataset.id,b.dataset.a)}});
  }
  function log(){$('#log').innerHTML=state.log.length?state.log.map(function(l){return '<li><time class="num">'+l.t+'</time><span>'+esc(l.m)+'</span></li>'}).join(""):'<li class="muted">Actions you take show up here</li>'}
  function banner(){
    var b=$('#banner');
    if(state.err){b.hidden=false;b.innerHTML='<span>Couldn\'t refresh. Showing the last numbers.</span><button id="retry" type="button">Retry</button>';$('#retry').onclick=load}
    else b.hidden=true;
  }
  function ago(){var m=Math.floor((Date.now()-state.loadedAt)/60000);$('#updated').textContent=m<1?"Updated just now":"Updated "+m+" min ago"}
  function render(){banner();kpis();chart();plan();list();log();ago();save()}
  /* one tooltip system, also on keyboard focus */
  var tip=$('#tip');
  function showTip(el){var r=el.getBoundingClientRect();tip.textContent=el.getAttribute('data-tip');tip.hidden=false;var w=tip.offsetWidth;tip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';tip.style.top=Math.max(8,r.top-tip.offsetHeight-8)+'px'}
  document.addEventListener('pointerover',function(e){var t=e.target.closest&&e.target.closest('[data-tip]');if(t)showTip(t);else tip.hidden=true});
  document.addEventListener('focusin',function(e){var t=e.target.closest&&e.target.closest('[data-tip]');if(t)showTip(t)});
  document.addEventListener('focusout',function(){tip.hidden=true});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')tip.hidden=true});
  addEventListener('scroll',function(){tip.hidden=true},true);
  document.querySelectorAll('.seg button').forEach(function(b){b.onclick=function(){state.range=+b.dataset.r;document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});render()}});
  var dlg=$('#dlg');$('#new').onclick=function(){$('#form').reset();dlg.showModal();dlg.querySelector('input').focus()};
  $('#form').addEventListener('submit',function(e){
    if(e.submitter&&e.submitter.value!=="ok")return;
    var f=new FormData(e.target),name=String(f.get('name')).trim().replace(/\s+/g,'-');if(!name)return;
    if(state.servers.length>=PLAN_LIMIT){toast("Plan limit reached");return}
    var s={id:Date.now(),name:name,tpl:f.get('tpl'),region:f.get('region'),status:"busy",cpu:0,ram:0,players:0};
    state.servers.push(s);render();
    var fin=function(){s.status="on";s.cpu=8+Math.round(Math.random()*20);s.ram=15+Math.round(Math.random()*25);state.loadedAt=Date.now();note("Created "+name);toast(name+" is online");render()};
    if(API)fetch(API+"/servers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s)}).then(function(r){if(!r.ok)throw 0;fin()}).catch(function(){state.servers=state.servers.filter(function(x){return x!==s});state.err=true;render()});
    else setTimeout(fin,1200);
  });
  var mode=$('#mode');mode.textContent=API?"Live":"Demo";mode.setAttribute('data-tip',API?"Connected to your backend":"Sample data stored in this browser. Set BUTTER_API in config.js to go live.");mode.tabIndex=0;
  var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){if(state.loaded)chart()},150)});
  setInterval(ago,30000);
  load();
})();
