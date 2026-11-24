"use strict";
// "Host commercially": this machine joins the ButterHosting network as a paid host.
// It enrolls once, sends a heartbeat every minute (what it is hosting and how much room is left), runs the customer servers the network
// assigns to it, and earns server-hours that the daily payout turns into USDC owed to the wallet. See hosting-api/nodes.js and payouts.js.
const { loadCfg, saveCfg, WALLET_RE, crypto, ok, fail } = (() => { const c = require("./core"); return { ...c, crypto: require("crypto") }; })();
const sys = require("./sys"), dk = require("./docker");
const VERSION = "1";
let servers = null, timer = null;
const srv = () => servers || (servers = require("./servers"));
const cc = () => loadCfg().commercial;

async function networkApi() {
  const c = cc(); if (c.api) return c.api.replace(/\/$/, "");
  if (process.env.BUTTER_NETWORK_API) return process.env.BUTTER_NETWORK_API.replace(/\/$/, "");
  const site = process.env.BUTTER_SITE || "https://butterhosting.vercel.app";
  try { const t = await (await fetch(site + "/config.js", { signal: AbortSignal.timeout(10000) })).text(); const m = t.match(/BUTTER_API\s*=\s*"([^"]+)"/); if (m) return m[1].replace(/\/$/, ""); } catch (e) {}
  return "";
}
async function post(path, body) {
  const api = await networkApi(); if (!api) throw new Error("The ButterHosting network address is not set up yet (config.js on the site is empty).");
  const r = await fetch(api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || ("network answered " + r.status)); e.code = r.status; throw e; } return j;
}
function summary() {
  const c = cc(); return { enabled: c.enabled, state: c.state, node_id: c.node_id, wallet: c.wallet, ram_share_mb: c.ram_share_mb, max_servers: c.max_servers, hosted: c.hosted || [],
    earned_usd: c.earned_usd, pending_usd: c.pending_usd, last_heartbeat: c.last_heartbeat, error: c.error };
}
async function enroll() {
  const c = cc(); if (!c.node_id) c.node_id = crypto.randomBytes(8).toString("hex"); c.state = "registering"; saveCfg();
  if (c.secret) return;
  const r = await post("/node/enroll", { id: c.node_id, platform: require("./core").PLATFORM, version: VERSION, ram_share_mb: c.ram_share_mb, max_servers: c.max_servers, wallet: c.wallet });
  c.secret = r.secret; saveCfg();
}
async function beat() {
  const c = cc(); if (!c.enabled) return;
  try {
    if (!c.secret) await enroll();
    const hosted = (await dk.ps()).filter((x) => /buttercommercial=1/.test(x.Labels || ""));
    const m = sys.mem(); const room = Math.max(0, Math.min(c.ram_share_mb, m.avail - 600));
    const r = await post("/node/heartbeat", { id: c.node_id, secret: c.secret, active: true, servers: hosted.filter((x) => x.State === "running").length, free_mb: room, ram_share_mb: c.ram_share_mb, max_servers: c.max_servers, wallet: c.wallet });
    c.earned_usd = r.earned_usd || 0; c.pending_usd = r.pending_usd || 0; c.last_heartbeat = Date.now(); c.state = "online"; c.error = "";
    await reconcile(r.work || [], hosted);
    c.hosted = (await dk.ps()).filter((x) => /buttercommercial=1/.test(x.Labels || "")).map((x) => { const L = {}; (x.Labels || "").split(",").forEach((kv) => { const i = kv.indexOf("="); if (i > 0) L[kv.slice(0, i)] = kv.slice(i + 1); }); return { name: x.Names.replace(/^bw-/, ""), owner: L.butterowner || "", state: x.State }; });
    saveCfg();
  } catch (e) {
    if (e.code === 403) { c.secret = ""; } // the network forgot us: enroll again next time
    c.state = Date.now() - (c.last_heartbeat || 0) > 180000 ? "offline" : c.state; if (c.state === "registering" || !c.last_heartbeat) c.state = "error"; c.error = String(e.message).slice(0, 200); saveCfg();
  }
}
async function reconcile(work, hosted) {
  const have = new Set(hosted.map((x) => x.Names.replace(/^bw-/, "")));
  for (const w of work.slice(0, cc().max_servers)) {
    if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(w.name || "") || have.has(w.name) || (await dk.exists(w.name))) continue;
    try { await srv().create({ n: w.name, type: "java", flavor: ["paper", "vanilla", "fabric", "forge"].includes(w.flavor) ? w.flavor : "paper", ver: w.version || "LATEST", mem: Math.min(+w.mem || 1024, cc().ram_share_mb), share: "none", cross: "0" });
      const f = srv().readConf(w.name); if (f) { f.commercial = true; f.owner = String(w.owner || ""); srv().writeConf(w.name, f); await require("./core").run("docker", ["rm", "-f", dk.cname(w.name)]); await srv().launch(w.name, f); } } catch (e) {}
  }
  const want = new Set(work.map((w) => w.name));
  for (const x of hosted) { const n = x.Names.replace(/^bw-/, ""); if (!want.has(n)) { await require("./core").run("docker", ["rm", "-f", x.Names]); require("fs").rmSync(srv().sdir(n), { recursive: true, force: true }); } }
}
function start() { if (timer) return; timer = setInterval(() => beat(), 60000); timer.unref(); const c = cc(); if (c.enabled) setTimeout(() => beat(), 5000).unref(); }
async function set(b) {
  const c = cc(); b = b || {};
  if ("wallet" in b) { const w = String(b.wallet || "").trim(); if (w && !WALLET_RE.test(w)) fail("Wallet must look like 0x followed by 40 letters/numbers (USDC on an EVM chain)"); c.wallet = w; }
  if ("ram_share_mb" in b) c.ram_share_mb = Math.max(512, Math.min(262144, parseInt(b.ram_share_mb, 10) || 2048));
  if ("max_servers" in b) c.max_servers = Math.max(1, Math.min(50, parseInt(b.max_servers, 10) || 2));
  if ("enabled" in b) {
    c.enabled = !!b.enabled;
    if (c.enabled) { if (!(await dk.engine())) { c.enabled = false; saveCfg(); fail("Docker is not running, so this machine cannot host yet."); } c.state = "registering"; c.error = ""; saveCfg(); await beat(); }
    else { c.state = "off"; c.error = ""; const hosted = (await dk.ps()).filter((x) => /buttercommercial=1/.test(x.Labels || "")); if (hosted.length) { /* hand the work back: stop customer servers, keep their files for the network to move */ for (const x of hosted) await require("./core").run("docker", ["stop", "-t", "20", x.Names]); } }
  }
  saveCfg(); return ok(summary());
}
module.exports = { summary, set, start, beat };
