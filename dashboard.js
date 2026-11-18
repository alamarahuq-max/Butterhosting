(function(){
  var PRIMARY=(window.BUTTER_API||"").replace(/\/$/,""),API=PRIMARY,backup=false,HOT=80,POLL=4000;
  var $=function(s){return document.querySelector(s)};
  var state={servers:[],log:[],range:24,metric:"cpu",loadedAt:Date.now(),err:null,loading:true,loaded:false,user:null,limit:null,hist:{cpu:[],ram:[],players:[]}};
  var NAMES={cpu:"CPU",ram:"Memory",players:"Players"},timers=[];
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove('show')},2600)}
  function clock(){return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
  function note(m){state.log.unshift({t:clock(),m:m});state.log=state.log.slice(0,8)}
  function getTok(){try{return localStorage.getItem('bh-token')||""}catch(e){return ""}}
  function setTok(t){try{if(t)localStorage.setItem('bh-token',t);else localStorage.removeItem('bh-token')}catch(e){}}

  /* ---------- API ---------- */
  /* If the main server (Codespace) is down, the site's own /relay forwards to a backup ButterOS machine. Its address is never sent to the browser. */
  function pick(){
    if(!PRIMARY)return Promise.resolve();
    var ctl=window.AbortController?new AbortController():null,tm=setTimeout(function(){if(ctl)ctl.abort()},4000);
    return fetch(PRIMARY+"/health",{cache:"no-store",signal:ctl?ctl.signal:undefined}).then(function(r){return r.json()}).then(function(j){clearTimeout(tm);return !!(j&&j.ok&&!j.standby)},function(){clearTimeout(tm);return false}).then(function(up){
      var was=backup;backup=!up;API=up?PRIMARY:"/relay";
      var b=$('#failover');if(b)b.hidden=up;
      if(was!==backup&&state&&state.user)load(true);
    });
  }
  function call(path,opt,retried){
    opt=opt||{};var h={Authorization:"Bearer "+getTok()};if(opt.body)h["Content-Type"]="application/json";
    var again=function(){return retried?null:pick().then(function(){return call(path,opt,true)})};
    return fetch(API+path,{method:opt.method||"GET",headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){
      return r.json().catch(function(){return {}}).then(function(j){
        if(r.status===401){signOut(true);throw new Error("Please sign in again")}
        if((r.status===503||r.status===502)&&!retried){return again()}
        if(!r.ok)throw new Error(j.error||"Something went wrong");
        return j;
      });
    },function(){var a=again();if(a)return a;throw new Error("Can't reach the server. If it just restarted, wait a minute")});
  }

  /* ---------- sign in ---------- */
  function showGate(msg,nobtn){
    timers.forEach(clearInterval);timers=[];
    document.body.classList.add('gated');$('#gate').hidden=false;$('#user').hidden=true;$('#banner').hidden=true;
    $('#gate-btn').href=API+"/auth/discord";$('#gate-btn').style.display=(nobtn||backup)?'none':'';$('#gate-err').textContent=msg||"";
  }
  function signOut(expired){setTok("");state.user=null;state.loaded=false;showGate(expired?"Your session ended. Please sign in again.":"")}
  function userPill(){
    var u=state.user,el=$('#user');if(!u){el.hidden=true;return}
    el.hidden=false;el.innerHTML='<img src="'+esc(u.avatar)+'" alt="" width="24" height="24" referrerpolicy="no-referrer" onerror="this.remove()"><span>'+esc(u.name)+'</span><button type="button" id="signout">Sign out</button>';
    $('#signout').onclick=function(){signOut(false)};
  }

  /* ---------- data ---------- */
  var reqId=0;
  function pushHist(){
    ["cpu","ram","players"].forEach(function(k){var st=stat(k,true);var a=state.hist[k];if(st.cur==null)return;a.push(st.cur);if(a.length>90)a.shift()});
  }
  function load(silent){
    var id=++reqId;
    if(!silent&&!state.loaded){state.loading=true;render()}
    return call("/servers").then(function(d){
      if(id!==reqId)return;
      state.servers=d.servers;state.maxRam=d.maxRam||2;state.err=d.dockerOk===false?(/no space/i.test(d.dockerError||"")||d.diskLow?"The host disk is full ("+(d.diskFreeGb==null?"?":d.diskFreeGb)+" GB free), so Docker can't work. Free space on the Codespace (see the README).":"Docker isn't ready on the host yet"+(d.dockerError?" ("+String(d.dockerError).slice(0,120)+")":"")+". It can take a minute after the Codespace starts."):(d.diskLow?"The host disk is almost full ("+d.diskFreeGb+" GB free). New servers are blocked until space is freed.":null);
      state.loading=false;state.loaded=true;state.loadedAt=Date.now();pushHist();render();
    }).catch(function(e){
      if(id!==reqId||!state.user)return;
      state.err=state.loaded?"Couldn't refresh. Showing the last numbers.":e.message;state.loading=false;render();
    });
  }
  function find(id){return state.servers.find(function(x){return String(x.id)===String(id)})}
  function act(id,action){
    var s=find(id);if(!s)return;
    if(action==="logs")return openLogs(s);
    if(action==="settings")return openSettings(s);
    if(action==="address"){
      var a=prompt("Paste the join address from your playit.gg UDP tunnel (host:port). Leave empty to clear.",s.address||"");
      if(a===null)return;
      return call("/servers/"+encodeURIComponent(s.id)+"/address",{method:"POST",body:{address:a}}).then(function(){note(s.name+" join address saved");return load(true)}).catch(function(e){toast(e.message)});
    }
    if(action==="link"){
      s.linking=true;render();
      return call("/servers/"+encodeURIComponent(s.id)+"/link",{method:"POST"}).then(function(){note(s.name+" making join link");return load(true)}).catch(function(e){s.linking=false;toast(e.message);return load(true)});
    }
    if(action==="delete"&&!confirm("Delete "+s.name+"? Its files are removed too and this can't be undone."))return;
    s.status="busy";render();
    call("/servers/"+encodeURIComponent(s.id)+"/"+action,{method:"POST"}).then(function(){note(s.name+" "+action);return load(true)}).catch(function(e){toast(e.message);return load(true)});
  }

  /* ---------- numbers ---------- */
  function stat(key,noSeries){
    var on=state.servers.filter(function(x){return x.status==="on"});
    if(!on.length)return {cur:null};
    var cur=key==="players"?on.reduce(function(a,x){return a+(x.players||0)},0):Math.round(on.reduce(function(a,x){return a+x[key]},0)/on.length);
    if(noSeries)return {cur:cur};
    var s=state.hist[key].length>=2?state.hist[key].slice():[cur,cur];
    return {cur:cur,s:s};
  }
  function fmt(k,v){return v==null?"—":v+(k==="players"?"":"%")}
  function spark(s,sel){
    var W=120,H=28,mx=Math.max.apply(null,s)||1,mn=Math.min.apply(null,s),sp=(mx-mn)||1;
    var p=s.map(function(v,i){return (i/(s.length-1)*W).toFixed(1)+","+(H-3-(v-mn)/sp*(H-6)).toFixed(1)}).join(" ");
    return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+p+'" fill="none" stroke="'+(sel?"var(--toast)":"var(--line)")+'" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
  }
  function delta(k,st){
    if(!st.s)return '<span class="d">—</span>';
    if(st.s.length<15)return '<span class="d">live</span>';
    var a=st.s[0],b=st.s[st.s.length-1],d=Math.round(b-a),u=k==="players"?"":" pts";
    var base=Math.max(1,Math.round((st.s.length-1)*POLL/60000))+"m";
    if(k==="players"&&Math.abs(a)<5&&Math.abs(b)<5)return '<span class="d">was '+Math.round(a)+'</span>';
    return '<span class="d num">'+(d===0?"±0":(d>0?"▲ ":"▼ ")+Math.abs(d)+u)+' vs '+base+'</span>';
  }
  function agoLbl(i,n){
    if(i===n-1)return "now";
    var sec=(n-1-i)*POLL/1000;return sec<60?Math.round(sec)+"s ago":Math.round(sec/60)+"m ago";
  }

  /* ---------- render ---------- */
  function kpis(){
    var S=state.servers,on=S.filter(function(x){return x.status==="on"}),m=state.metric;
    var dots=S.slice(0,14).map(function(x){return '<i class="'+(x.status==="on"?(x.cpu>=HOT?"hot":"on"):"")+'"></i>'}).join("");
    var cells=['<div class="cell"><button class="kpi" type="button" data-k="servers" data-tip="Servers online out of all servers" aria-pressed="false"><span class="l">Servers</span><span class="v num">'+(S.length?on.length+'<span style="font-size:.6em;color:var(--ink-2);font-weight:500"> / '+S.length+'</span>':'—')+'</span><span class="dots" aria-hidden="true">'+dots+'</span></button></div>'];
    ["cpu","ram","players"].forEach(function(k){
      var st=stat(k),sel=m===k,tip={cpu:"Average CPU across online servers",ram:"Average memory across online servers",players:"Players connected right now"}[k];
      cells.push('<div class="cell"><button class="kpi" type="button" data-k="'+k+'" data-tip="'+tip+'" aria-pressed="'+sel+'"><span class="l">'+NAMES[k]+'</span><span class="v num">'+fmt(k,st.cur)+'</span>'+delta(k,st)+(st.s?spark(st.s,sel):'')+'</button></div>');
    });
    $('#kpis').innerHTML=cells.join("");
    document.querySelectorAll('.kpi').forEach(function(b){b.onclick=function(){if(b.dataset.k==="servers"){$('#servers').scrollIntoView({behavior:'smooth'});return}state.metric=b.dataset.k;render()}});
  }
  function niceMax(peak){var steps=[1,2,5,10,20,50,100,200,500],i=0,t=Math.max(peak*1.15,4);while(steps[i]*4<t&&i<steps.length-1)i++;return steps[i]*4}
  function chart(){
    var k=state.metric,st=stat(k);
    $('#ch-v').textContent=fmt(k,st.cur);
    if(!st.s){$('#ch-l').textContent=NAMES[k];$('#chips').innerHTML='';$('#chart').innerHTML='<div class="empty">No online servers to chart<button class="btn sm" id="empty-new" type="button">Start a server</button></div>';var b=$('#empty-new');if(b)b.onclick=function(){$('#new').click()};return}
    var s=st.s,n=s.length;
    $('#ch-l').textContent=NAMES[k]+(k==="players"?"":" load")+" · live";
    var pk=Math.max.apply(null,s),lo=Math.min.apply(null,s),avg=s.reduce(function(a,b){return a+b},0)/n;
    $('#chips').innerHTML=['Peak '+fmt(k,Math.round(pk)),'Low '+fmt(k,Math.round(lo)),'Avg '+fmt(k,Math.round(avg))].map(function(c){return '<span class="num">'+c+'</span>'}).join("");
    var W=Math.max(300,Math.round($('#chart').clientWidth||760)),H=W<520?190:230,P={l:38,r:10,t:10,b:26},max=k==="players"?niceMax(pk):100;
    var x=function(i){return P.l+(W-P.l-P.r)*i/(n-1)},y=function(v){return P.t+(H-P.t-P.b)*(1-v/max)};
    var grid=[0,1,2,3,4].map(function(i){var t=max/4*i;return '<line x1="'+P.l+'" x2="'+(W-P.r)+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="var(--line)" stroke-dasharray="'+(i?"3 4":"0")+'"/><text x="'+(P.l-8)+'" y="'+(y(t)+4)+'" text-anchor="end">'+Math.round(t)+(k==="players"?"":"%")+'</text>'}).join("");
    var pts=s.map(function(v,i){return x(i).toFixed(1)+","+y(v).toFixed(1)});
    var area="M"+x(0)+","+y(0)+" L"+pts.join(" L")+" L"+x(n-1)+","+y(0)+"Z";
    var lbl=[0,.25,.5,.75,1].map(function(f){var i=Math.round(f*(n-1));return '<text x="'+x(i)+'" y="'+(H-6)+'" text-anchor="'+(i===0?"start":i===n-1?"end":"middle")+'">'+agoLbl(i,n)+'</text>'}).join("");
    $('#chart').setAttribute('aria-label',NAMES[k]+": now "+fmt(k,st.cur)+", peak "+fmt(k,Math.round(pk))+", low "+fmt(k,Math.round(lo)));
    $('#chart').setAttribute('role','img');
    $('#chart').innerHTML='<svg viewBox="0 0 '+W+' '+H+'"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--toast)" stop-opacity=".28"/><stop offset="1" stop-color="var(--toast)" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#g)"/><polyline points="'+pts.join(" ")+'" fill="none" stroke="var(--toast)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+lbl+'<line id="cl" y1="'+P.t+'" y2="'+(H-P.b)+'" stroke="var(--ink-2)" stroke-dasharray="2 3" visibility="hidden"/><circle id="cd" r="4.5" fill="var(--toast)" stroke="var(--card)" stroke-width="2" visibility="hidden"/></svg><div class="ctip" id="ctip" hidden></div>';
    var svg=$('#chart svg'),tip=$('#ctip');
    svg.addEventListener('pointermove',function(e){
      var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W,i=Math.max(0,Math.min(n-1,Math.round((px-P.l)/(W-P.l-P.r)*(n-1))));
      var cx=x(i),cy=y(s[i]);$('#cl').setAttribute('x1',cx);$('#cl').setAttribute('x2',cx);$('#cl').setAttribute('visibility','visible');$('#cd').setAttribute('cx',cx);$('#cd').setAttribute('cy',cy);$('#cd').setAttribute('visibility','visible');
      tip.hidden=false;tip.innerHTML='<b class="num">'+fmt(k,Math.round(s[i]))+'</b><span>'+agoLbl(i,n)+'</span>';tip.style.left=(cx/W*r.width)+'px';tip.style.top=(cy/H*r.height)+'px';
    });
    svg.addEventListener('pointerleave',function(){tip.hidden=true;$('#cl').setAttribute('visibility','hidden');$('#cd').setAttribute('visibility','hidden')});
  }
  function plan(){
    var n=state.servers.length,lim=state.limit;
    if(lim==null){$('#plan').innerHTML='<div class="plan"><div class="top2"><span>Servers</span><span>No limit</span></div><div class="inner"><div class="nl num">'+n+'</div></div></div>';return}
    var f=Math.round(Math.min(n,lim)/lim*40),ticks="";
    for(var i=0;i<40;i++)ticks+='<i class="'+(i<f?"f":"")+'"></i>';
    $('#plan').innerHTML='<div class="plan"><div class="top2"><span>Servers</span><span>Plan limit</span></div><div class="inner"><div class="nl num">'+n+'<small> of '+lim+'</small></div><div class="ticks" aria-hidden="true">'+ticks+'</div><div class="foot num"><span>'+Math.max(0,lim-n)+' left</span><span>'+Math.round(n/lim*100)+'%</span></div></div></div>';
  }
  function list(){
    var S=state.servers;
    if(state.loading){$('#list').innerHTML='<div class="sk"></div><div class="sk"></div><div class="sk"></div>';$('#count').textContent="";return}
    $('#count').textContent=S.length?S.length:"";
    if(!S.length){$('#list').innerHTML='<div class="empty">Servers appear here once you create one<button class="btn sm" id="empty-new2" type="button">New server</button></div>';var b=$('#empty-new2');if(b)b.onclick=function(){$('#new').click()};return}
    var sorted=S.slice().sort(function(a,b){return (b.status==="on")-(a.status==="on")||b.cpu-a.cpu});
    $('#list').innerHTML=sorted.map(function(s){
      var on=s.status==="on",busy=s.status==="busy",bad=s.status==="error",hot=on&&s.cpu>=HOT;
      var chip=busy?'<span class="chip busy">working</span>':bad?'<span class="chip err" data-tip="'+esc(s.error||"Couldn't start")+'" tabindex="0">failed</span>':hot?'<span class="chip hot" data-tip="CPU at '+s.cpu+'%. Over '+HOT+'% usually means lag." tabindex="0">▲ High CPU</span>':on?'<span class="chip on">online</span>':'<span class="chip off">offline</span>';
      var where=s.address?(s.kind==="web"?(on?'<a href="'+esc(s.address)+'" target="_blank" rel="noopener">Open</a>':''):'<button class="copy" type="button" data-copy="'+esc(s.address)+'" data-tip="Copy join link">'+esc(s.address)+'</button>'):'';
      if(s.udp&&!s.address)where='<span class="muted" data-tip="Bedrock needs a UDP tunnel. Use Address to paste yours (see the README)." tabindex="0">no join address</span>';
      else if(s.kind==="game"&&!s.address)where=s.linking?'<span class="muted">making link…</span>':on&&s.canLink===false?'<span class="muted" data-tip="Free join links need Paper or Purpur" tabindex="0">no join link</span>':on?'<button class="mk" type="button" data-a="link" data-id="'+esc(s.id)+'" data-tip="'+esc(s.linkError||"Free link players type into Minecraft. Restarts the server once.")+'">Make join link</button>':'';
      var id=esc(s.id);
      return '<div class="row"><div><div class="nm"><span class="n">'+esc(s.name)+'</span>'+chip+'</div><div class="m">'+esc(s.tpl)+(on&&s.players?' · '+s.players+' players':'')+(where?' · '+where:'')+'</div></div>'+
        '<div class="val num" data-tip="CPU '+s.cpu+'% · Memory '+s.ram+'%">'+(on?s.cpu+'%':'—')+'</div>'+
        '<div class="acts">'+(bad?'':'<button data-a="'+(on?"stop":"start")+'" data-id="'+id+'"'+(busy?" disabled":"")+'>'+(on?"Stop":"Start")+'</button><button class="'+(hot?"hotbtn":"")+'" data-a="restart" data-id="'+id+'"'+(!on||busy?" disabled":"")+'>Restart</button>')+'<button data-a="logs" data-id="'+id+'">Logs</button>'+(s.tplKey==="minecraft"&&!bad?'<button data-a="settings" data-id="'+id+'">Settings</button>':'')+(s.udp&&!bad?'<button data-a="address" data-id="'+id+'">Address</button>':'')+'<button data-a="delete" data-id="'+id+'" aria-label="Delete '+esc(s.name)+'" data-tip="Delete"'+(busy?" disabled":"")+'>✕</button></div>'+
        (on?'<div class="bar" aria-hidden="true"><i style="width:'+s.cpu+'%"></i></div>':'')+'</div>';
    }).join("");
  }
  function logList(){$('#log').innerHTML=state.log.length?state.log.map(function(l){return '<li><time class="num">'+esc(l.t)+'</time><span>'+esc(l.m)+'</span></li>'}).join(""):'<li class="muted">Actions you take show up here</li>'}
  function banner(){
    var b=$('#banner');
    if(state.err){b.hidden=false;b.innerHTML='<span>'+esc(state.err)+'</span><button id="retry" type="button">Retry</button>';$('#retry').onclick=function(){load()}}
    else b.hidden=true;
  }
  function ago(){var s=Math.floor((Date.now()-state.loadedAt)/1000);$('#updated').textContent=s<15?"Updated just now":s<60?"Updated "+s+"s ago":"Updated "+Math.floor(s/60)+" min ago"}
  function render(){
    if(!state.user)return;
    banner();kpis();chart();plan();list();logList();ago();
  }


  /* ---------- settings & mods ---------- */
  var setDlg=$('#setdlg'),setForm=$('#setform'),setId=null,MODDIR={PAPER:"plugins",PURPUR:"plugins",FABRIC:"mods",FORGE:"mods",VANILLA:null};
  var SET_DEFAULTS={software:"PAPER",version:"LATEST",memory:1,motd:"A ButterHosting server",gamemode:"survival",difficulty:"normal",maxPlayers:10,viewDistance:10,pvp:true,hardcore:false,whitelist:false,whitelistNames:"",seed:"",allowNether:true,allowFlight:false,autostop:false};
  function openSettings(s){
    setId=s.id;$('#set-title').textContent=s.name+" settings";$('#set-err').textContent="";
    var st=Object.assign({},SET_DEFAULTS,s.settings||{}),mem=setForm.elements.memory,mx=state.maxRam||2;mem.innerHTML="";
    for(var g=1;g<=mx;g++){var o=document.createElement('option');o.value=g;o.textContent=g+" GB";mem.appendChild(o)}
    Array.prototype.forEach.call(setForm.elements,function(el){
      if(!el.name)return;
      if(el.type==="checkbox")el.checked=!!st[el.name];else el.value=st[el.name]==null?"":st[el.name];
    });
    modsRefresh();
    if(!setDlg.open)setDlg.showModal();
  }
  function modsRefresh(){
    var s=find(setId);if(!s)return;
    var sw=setForm.elements.software.value,dir=MODDIR[(s.settings||SET_DEFAULTS).software];
    $('#mods-h').textContent=dir==="plugins"?"Plugins":dir==="mods"?"Mods":"Mods and plugins";
    var list=$('#mods-list'),note=$('#mod-note'),drop=$('#drop');
    if(!dir){list.innerHTML="";drop.style.display="none";note.textContent="Vanilla can't load mods. Pick Paper, Purpur, Fabric or Forge above and save.";return}
    drop.style.display="";
    note.textContent=(s.status==="on"?"Restart the server after uploading so it loads.":"Start the server to upload.")+(s.canLink===false&&s.tplKey==="minecraft"?" Free join links work on Paper and Purpur only.":"");
    call("/servers/"+encodeURIComponent(setId)+"/files").then(function(r){list.innerHTML=r.files.map(modRow).join("")||'<li class="muted">Nothing uploaded yet</li>'}).catch(function(e){list.innerHTML='<li class="muted">'+esc(e.message)+'</li>'});
  }
  function modRow(n){return '<li><span>'+esc(n)+'</span><button type="button" data-del="'+esc(n)+'" aria-label="Remove '+esc(n)+'">Remove</button></li>'}
  function upload(file){
    var s=find(setId),t=$('#drop-t');if(!file||!s)return;
    if(!/\.jar$/i.test(file.name)){toast("Only .jar files");return}
    if(s.status!=="on"){toast("Start the server first");return}
    if(backup&&file.size>4*1024*1024){toast("Backup mode takes files up to 4 MB. Try again when the main server is back.");return}
    t.textContent="Uploading "+file.name+"…";
    fetch(API+"/servers/"+encodeURIComponent(setId)+"/files?name="+encodeURIComponent(file.name),{method:"POST",headers:{Authorization:"Bearer "+getTok()},body:file})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||"Upload failed");return j})})
      .then(function(){note("Uploaded "+file.name);toast(file.name+" uploaded. Restart to load it.");modsRefresh()})
      .catch(function(e){toast(e.message)}).then(function(){t.textContent="Drop a .jar here or click to upload"});
  }
  $('#mod-file').addEventListener('change',function(e){upload(e.target.files[0]);e.target.value=""});
  var dz=$('#drop');
  ['dragenter','dragover'].forEach(function(n){dz.addEventListener(n,function(e){e.preventDefault();dz.classList.add('over')})});
  ['dragleave','drop'].forEach(function(n){dz.addEventListener(n,function(e){e.preventDefault();dz.classList.remove('over')})});
  dz.addEventListener('drop',function(e){upload(e.dataTransfer.files[0])});
  $('#mods-list').addEventListener('click',function(e){
    var b=e.target.closest('[data-del]');if(!b)return;var n=b.dataset.del,s=find(setId);
    call("/servers/"+encodeURIComponent(setId)+"/files/delete?name="+encodeURIComponent(n),{method:"POST"}).then(function(){note("Removed "+n);modsRefresh()}).catch(function(er){toast(er.message)});
  });
  setForm.elements.software.addEventListener('change',function(){$('#set-note').textContent=MODDIR[this.value]===undefined?"":"Changing software keeps the world but old mods may not load. Applying restarts the server."});
  $('#set-close').onclick=function(){setDlg.close()};
  setForm.addEventListener('submit',function(e){
    e.preventDefault();var s=find(setId),er=$('#set-err');er.textContent="";if(!s)return;
    var body={};Array.prototype.forEach.call(setForm.elements,function(el){
      if(!el.name)return;
      body[el.name]=el.type==="checkbox"?el.checked:(el.type==="number"||el.name==="memory")?Number(el.value):el.value;
    });
    var btn=$('#set-save');btn.disabled=true;
    call("/servers/"+encodeURIComponent(setId)+"/settings",{method:"POST",body:body}).then(function(){setDlg.close();note(s.name+" settings applied");toast("Applying settings. The server restarts.");return load(true)}).catch(function(x){er.textContent=x.message}).then(function(){btn.disabled=false});
  });

  /* ---------- logs & console ---------- */
  var logId=null,logDlg=$('#logdlg'),pre=$('#log-pre');
  function fetchLogs(){
    call("/servers/"+encodeURIComponent(logId)+"/logs").then(function(j){pre.textContent=j.logs||"(no output yet)";pre.scrollTop=pre.scrollHeight}).catch(function(e){pre.textContent=e.message});
  }
  function openLogs(s){
    logId=s.id;$('#log-title').textContent=s.name;$('#cmdform').hidden=!(s.tplKey==="minecraft"&&s.status==="on");
    pre.textContent="Loading…";logDlg.showModal();fetchLogs();
  }
  $('#log-refresh').onclick=fetchLogs;$('#log-close').onclick=function(){logDlg.close()};
  logDlg.addEventListener('click',function(e){if(e.target===logDlg)logDlg.close()});
  $('#cmdform').addEventListener('submit',function(e){
    e.preventDefault();var inp=$('#cmd'),v=inp.value.trim();if(!v)return;inp.value="";
    var add=function(t){pre.textContent+="\n"+t;pre.scrollTop=pre.scrollHeight};add("> "+v);
    call("/servers/"+encodeURIComponent(logId)+"/command",{method:"POST",body:{cmd:v}}).then(function(j){add(j.output||"(no output)")}).catch(function(e){add(e.message)});
  });

  /* ---------- tooltips (hover + keyboard focus) ---------- */
  var tip=$('#tip');
  function showTip(el){var r=el.getBoundingClientRect();tip.textContent=el.getAttribute('data-tip');tip.hidden=false;var w=tip.offsetWidth;tip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';tip.style.top=Math.max(8,r.top-tip.offsetHeight-8)+'px'}
  document.addEventListener('pointerover',function(e){var t=e.target.closest&&e.target.closest('[data-tip]');if(t)showTip(t);else tip.hidden=true});
  document.addEventListener('focusin',function(e){var t=e.target.closest&&e.target.closest('[data-tip]');if(t)showTip(t)});
  document.addEventListener('focusout',function(){tip.hidden=true});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')tip.hidden=true});
  addEventListener('scroll',function(){tip.hidden=true},true);

  /* ---------- events ---------- */
  $('#list').addEventListener('click',function(e){
    var c=e.target.closest('[data-copy]');
    if(c){try{navigator.clipboard.writeText(c.dataset.copy).then(function(){toast("Address copied")},function(){toast("Copy failed")})}catch(x){toast("Copy failed")}return}
    var b=e.target.closest('[data-a]');if(b&&!b.disabled)act(b.dataset.id,b.dataset.a);
  });
  document.querySelectorAll('.seg button').forEach(function(b){b.onclick=function(){state.range=+b.dataset.r;document.querySelectorAll('.seg button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});render()}});
  var dlg=$('#dlg'),ferr=$('#form-err');
  $('#new').onclick=function(){if(!state.user)return;$('#form').reset();ferr.textContent="";dlg.showModal();dlg.querySelector('input').focus()};
  $('#form').addEventListener('submit',function(e){
    if(e.submitter&&e.submitter.value!=="ok")return;
    e.preventDefault();
    var f=new FormData(e.target),name=String(f.get('name')).trim().replace(/\s+/g,'-'),tpl=String(f.get('tpl'));
    if(!/^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/.test(name)){ferr.textContent="Use 2 to 24 letters, numbers or dashes";return}
    if(state.limit!=null&&state.servers.length>=state.limit){ferr.textContent="You've reached your plan limit";return}
    var btn=e.target.querySelector('button[value=ok]');btn.disabled=true;
    call("/servers",{method:"POST",body:{name:name,tpl:tpl}}).then(function(){dlg.close();note("Created "+name);toast(name+" is starting. The first launch can take a few minutes.");return load(true)}).catch(function(er){ferr.textContent=er.message}).then(function(){btn.disabled=false});
  });

  /* ---------- boot ---------- */
  function boot(){
    var mode=$('#mode');mode.textContent="Live";mode.setAttribute('data-tip',"Connected to your backend");mode.tabIndex=0;
    $('.seg').style.display='none';
    timers.push(setInterval(ago,10000));
    if(!PRIMARY)return showGate("The backend isn't connected yet. The site owner needs to set BUTTER_API in config.js.",true);
    pick().then(function(){
    if(!getTok())return showGate(backup?"Sign-in is unavailable while the backup machine is running. Try again in a few minutes.":"");
    return call("/me").then(function(u){
      state.user=u;state.limit=u.limit==null?null:u.limit;document.body.classList.remove('gated');$('#gate').hidden=true;userPill();
      load();
      timers.push(setInterval(function(){if(!document.hidden&&state.user)load(true)},POLL));
    }).catch(function(e){if(getTok())showGate(e.message);else showGate("")});
    });
    timers.push(setInterval(pick,20000));
  }
  var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){if(state.loaded)chart()},150)});
  boot();
})();
