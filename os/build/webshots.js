const {chromium}=require('playwright');
(async()=>{const out=process.argv[2],mode=process.argv[3]||'main';const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
if(mode==='live'){
await p.goto('http://127.0.0.1:8081/#local');await p.waitForTimeout(4000);await p.screenshot({path:out+'/web-wizard.png'});await p.evaluate(()=>{const w=document.getElementById('wizard');if(w)w.hidden=true});await p.screenshot({path:out+'/web-local.png'});
await p.click('nav a[data-p=servers]');await p.waitForTimeout(800);await p.screenshot({path:out+'/web-servers-live.png'});
if(await p.$('#add')){await p.click('#add');}await p.waitForTimeout(500);await p.screenshot({path:out+'/web-new-server.png'});
await b.close();return}
await p.goto('http://127.0.0.1:8081/#overview');await p.waitForTimeout(2500);await p.screenshot({path:out+'/web-wizard.png'});await p.evaluate(()=>{const w=document.getElementById('wizard');if(w)w.hidden=true});await p.screenshot({path:out+'/web-overview.png'});
await p.click('nav a[data-p=servers]');await p.waitForTimeout(800);await p.screenshot({path:out+'/web-servers.png'});
await p.click('#theme');await p.click('nav a[data-p=overview]');await p.waitForTimeout(800);await p.screenshot({path:out+'/web-overview-light.png'});
await b.close()})().catch(e=>{console.error(String(e));process.exit(1)});
