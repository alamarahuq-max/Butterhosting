#!/usr/bin/env node
const fs=require('fs'),f=process.env.STUB_STATE;let st={c:{}};try{st=JSON.parse(fs.readFileSync(f))}catch{}
const a=process.argv.slice(2),save=()=>fs.writeFileSync(f,JSON.stringify(st));
const cmd=a[0];
if(cmd==='ps'){for(const[n,c]of Object.entries(st.c))console.log(JSON.stringify({Names:n,State:c.s}))}
else if(cmd==='run'){fs.appendFileSync(f+'.runs',a.join(' ')+'\n');const n=a[a.indexOf('--name')+1];st.c[n]={s:'running'};save();console.log('abc123')}
else if(cmd==='stats'){for(const n of a.slice(a.indexOf('{{json .}}')+1))console.log(JSON.stringify({Name:n,CPUPerc:'100.00%',MemPerc:'40.5%'}))}
else if(cmd==='start'||cmd==='restart'){st.c[a[a.length-1]].s='running';save()}
else if(cmd==='stop'){st.c[a[a.length-1]].s='exited';save()}
else if(cmd==='rm'){delete st.c[a[a.length-1]];save()}
else if(cmd==='volume'){}
else if(cmd==='inspect'){console.log('true')}
else if(cmd==='logs'){if(a.includes('--since'))console.log('[connect] Your public address: bh-stub-1234.play.minekube.net');else console.log('\x1b[32m[Server] Done!\x1b[0m')}
else if(cmd==='cp'){st.files=st.files||[];st.files.push(a[2].split('/').pop());save()}
else if(cmd==='exec'&&a.includes('ls')){console.log((st.files||[]).concat(['readme.txt']).join('\n'))}
else if(cmd==='exec'&&a.includes('rm')){st.files=(st.files||[]).filter(f=>f!==a[a.length-1].split('/').pop());save()}
else if(cmd==='exec'){if(a[2]==='rcon-cli'&&a[3]==='list')console.log('There are 2 of a max of 20 players online: a, b');else console.log('ran: '+a.slice(3).join(' '))}
