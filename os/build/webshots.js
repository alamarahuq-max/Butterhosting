const {chromium}=require('playwright');
(async()=>{const out=process.argv[2];const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto('http://127.0.0.1:8081/#overview');await p.waitForTimeout(2500);await p.screenshot({path:out+'/web-overview.png'});
await p.click('nav a[data-p=servers]');await p.waitForTimeout(800);await p.screenshot({path:out+'/web-servers.png'});
await p.click('#theme');await p.click('nav a[data-p=overview]');await p.waitForTimeout(800);await p.screenshot({path:out+'/web-overview-light.png'});
await b.close()})().catch(e=>{console.error(String(e));process.exit(1)});
