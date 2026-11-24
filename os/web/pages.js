"use strict";
/* Butter web UI: Overview, Servers, Local, Backup, Network, System, Settings pages and shared server blocks. */
const P = B.pages;
const dockerNote = () => { const d = B.S.docker || {}; return d.installed && d.running ? "" : `<div class="notice warn">${ic("warn")}<div><b>${d.installed ? "Docker is installed but not running." : "Docker is not installed."}</b> Servers run inside Docker. <a href="#setup">Run setup</a> or open <a href="#settings">Settings</a> to see how to fix it.</div></div>`; };
const empty = (t, sub, act) => `<div class="empty"><svg class="mascot" aria-hidden="true" viewBox="0 0 64 64"><use href="#i-dino"/></svg><p><b>${t}</b></p>${sub ? `<p class="k">${sub}</p>` : ""}${act || ""}</div>`;
B.empty = empty;
const jt = (s) => (s.type === "java" ? { paper: "Paper", vanilla: "Vanilla", fabric: "Fabric", forge: "Forge" }[s.flavor] || "Java" : "Bedrock") + (s.version && s.version !== "LATEST" ? " " + s.version : "");
B.jt = jt;
const ctlBtns = (s, sm) => { const on = s.state === "running", c = sm ? " sm" : "";
  return (on ? `<button class="btn${c}" data-do="ctl" data-c="stop" data-n="${s.name}">${ic("stop")}Stop</button><button class="btn${c}" data-do="ctl" data-c="restart" data-n="${s.name}">${ic("restart")}Restart</button>` : `<button class="btn p${c}" data-do="ctl" data-c="start" data-n="${s.name}">${ic("play")}Start</button>`); };
B.ctlBtns = ctlBtns;

/* ---------- shared server blocks (used by Local and the server detail page) ---------- */
B.crackedSw = (s) => sw({ attrs: `data-a="cracked" data-n="${s.name}"`, on: s.cracked, label: "Cracked mode", hint: "Let players without a paid Minecraft account join. This turns off Mojang login checks, so anyone can pretend to be anyone: use it with a whitelist." });
B.pluginBlock = (s, flavor) => { const word = flavor === "fabric" || flavor === "forge" ? "mods" : "plugins";
  if (flavor === "vanilla") return `<p class="k">Vanilla servers cannot load plugins or mods. Switch to Paper (plugins) or Fabric/Forge (mods) under Version.</p>`;
  return `<div id="pg-${s.name}" class="k">loading...</div>
  <div class="row" style="margin-top:10px"><input id="pu-${s.name}" placeholder="direct .jar link (Modrinth, Hangar, GitHub)" aria-label="Direct .jar link" style="flex:1;min-width:200px"><button class="btn p" data-do="plugin" data-n="${s.name}">${ic("link")}Add from link</button></div>
  <div class="row" style="margin-top:10px"><label class="btn p filebtn">${ic("upload")}Upload .jar from this device<input type="file" accept=".jar" multiple data-up="${s.name}" hidden></label><span class="k" id="upm-${s.name}" role="status"></span></div>
  <p class="k" style="margin-top:8px">Adding or removing ${word} restarts the server.</p>`; };
B.fillPlayers = async (s) => {
  const e = document.getElementById("pl-" + s.name); if (!e) return;
  if (s.state !== "running") { e.innerHTML = "Start the server to see players."; return; }
  const r = await api("a=players&n=" + s.name), e2 = document.getElementById("pl-" + s.name); if (!e2) return;
  e2.innerHTML = r.ok ? (r.players.length ? r.players.map((p) => `<span class="chip">${ic("user")}${esc(p)}<button class="btn sm" data-do="pl" data-c="kick" data-n="${s.name}" data-p="${esc(p)}">${ic("claw")}Kick</button><button class="btn sm" data-do="pl" data-c="op" data-n="${s.name}" data-p="${esc(p)}">${ic("crown")}Op</button><button class="btn sm d" data-do="pl" data-c="ban" data-n="${s.name}" data-p="${esc(p)}">${ic("fang")}Ban</button></span>`).join("") : "Nobody is online.") : esc(r.error);
};
B.fillPlugins = async (s) => {
  const r = await api("a=plugins&n=" + s.name), f = document.getElementById("pg-" + s.name); if (!f) return;
  f.innerHTML = r.ok ? (r.plugins.length ? r.plugins.map((x) => `<span class="chip">${ic("fern")}${esc(x)}<button class="btn sm d" data-do="rmplugin" data-n="${s.name}" data-f="${esc(x)}">Remove</button></span>`).join("") : "None installed yet.") : esc(r.error);
};
const after = async () => { await B.tick(); };
B.ACT.ctl = async (t) => { const r = await api(`a=${t.dataset.c}&n=${t.dataset.n}`); if (!r.ok) toast(r.error, 1); await after(); };
B.ACT.pl = async (t) => {
  if (t.dataset.c === "ban" && !(await ask({ title: "Ban " + t.dataset.p + "?", body: "They will not be able to join until you pardon them under Players.", ok: "Ban", danger: 1 }))) return;
  const r = await api(`a=${t.dataset.c}&n=${t.dataset.n}&p=${enc(t.dataset.p)}`); toast(r.ok ? t.dataset.p + ": " + t.dataset.c + " done" : r.error, !r.ok); await after();
};
B.ACT.rmplugin = async (t) => { const r = await api(`a=rmplugin&n=${t.dataset.n}&f=${enc(t.dataset.f)}`); toast(r.ok ? "Removed " + t.dataset.f + ". Restart the server to apply." : r.error, !r.ok); const s = B.S.servers.find((x) => x.name === t.dataset.n); if (s) B.fillPlugins(s); };
B.ACT.plugin = async (t) => { const u = document.getElementById("pu-" + t.dataset.n).value.trim(); const r = await api(`a=plugin&n=${t.dataset.n}&url=${enc(u)}`); toast(r.ok ? "Added " + r.file + ". The server is restarting." : r.error, !r.ok); const s = B.S.servers.find((x) => x.name === t.dataset.n); if (s && r.ok) B.fillPlugins(s); await after(); };
B.ACT.share = async (t) => { const r = await api(`a=${t.dataset.c}&n=${t.dataset.n}`); toast(r.ok ? (t.dataset.c === "share" ? "Internet link ready" : "Internet link turned off") : r.error, !r.ok); await after(); if (B.cur.page === "server" && B.server) B.server.refreshHead(); };
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.up) {
    const n = t.dataset.up, m = document.getElementById("upm-" + n);
    for (const f of t.files) { m.textContent = "Uploading " + f.name + "..."; const r = await api(`a=upload&n=${n}&f=${enc(f.name.replace(/[^A-Za-z0-9._-]/g, "_"))}`, f); m.textContent = r.ok ? "Added " + r.file + ". The server is restarting." : r.error; if (!r.ok) toast(r.error, 1); }
    t.value = ""; const s = B.S.servers.find((x) => x.name === n); if (s) B.fillPlugins(s); await after();
  }
  if (t.dataset && t.dataset.a === "cracked") {
    const r = await api(`a=cracked&n=${t.dataset.n}&v=${t.checked ? 1 : 0}`);
    if (!r.ok) { toast(r.error, 1); t.checked = !t.checked; } else toast((r.cracked ? "Cracked mode ON" : "Cracked mode OFF") + ". The server is restarting.");
    await after();
  }
});

/* ---------- Overview ---------- */
const memBar = () => { const m = B.S.mem, t = m.total, seg = [["OS", m.os, "var(--ind)"], ["Servers", m.servers, "var(--y)"], ["Worlds in RAM", m.worlds, "var(--ok)"]];
  return `<div class="bar" role="img" aria-label="Memory use">${seg.map((s) => `<i style="width:${s[1] / t * 100}%;background:${s[2]}"></i>`).join("")}</div><div class="leg">${seg.map((s) => `<span><b style="background:${s[2]}"></b>${s[0]} ${gb(s[1])}</span>`).join("")}<span><b style="background:var(--line2)"></b>Free ${gb(Math.max(0, m.avail))}</span></div>`; };
const advice = () => { const S = B.S, c = S.capacity, f = S.mem.avail, j = c.java_fits, b = c.bedrock_fits;
  return `${gb(f)} free. A Java server needs about ${gb(c.java_need)} (estimate), so ${j ? "it fits" : "<b>not safely</b>"}. A Bedrock server needs about ${gb(c.bedrock_need)} (estimate)${b ? " and fits" : ", which also does <b>not</b> fit safely"}. ${S.persist ? "" : "Live USB mode allows " + S.max_servers + " servers."}`; };
const miniRows = () => B.S.servers.length ? B.S.servers.map((s) => `<tr><td data-l="Name"><a href="#server/${s.name}"><b>${esc(s.name)}</b></a><div class="k">${esc(jt(s))}</div></td><td data-l="State">${stBadge(s.state)}</td><td data-l="Memory">${s.state === "running" ? gb(s.ram) : "-"}</td></tr>`).join("") : `<tr><td colspan="3">${empty("No servers yet", "Press + to hatch your first one.")}</td></tr>`;
P.overview = {
  show() { this.live(true); },
  live(force) {
    if (!force && B.typing()) return; const S = B.S, m = S.mem, run = S.servers.filter((s) => s.state === "running"), pl = S.servers.reduce((a, s) => a + (s.players || 0), 0);
    const used = m.total - m.avail, cpu = typeof S.cpu === "number" ? S.cpu : Math.min(100, (parseFloat(S.load) || 0) / (S.cores || 1) * 100);
    B.setView(`${dockerNote()}<div class="grid g4">
 <div class="card stat">${ic("heartbeat", "big-ic")}<div><div class="k">Servers running</div><div class="big">${run.length} <small>/ ${S.servers.length}</small></div><div class="k">${S.persist ? "USB volume found" : "live mode allows " + S.max_servers}</div></div></div>
 <div class="card stat">${ic("footprint", "big-ic")}<div><div class="k">Players online</div><div class="big">${pl}</div><div class="k">Java servers only</div></div></div>
 <div class="card stat">${ring(used / m.total * 100, Math.round(used / m.total * 100) + "%", "Memory used", "var(--y)")}<div><div class="k">Memory used</div><div class="big">${(used / 1024).toFixed(1)} <small>GB of ${(m.total / 1024).toFixed(1)}</small></div><div class="k">${gb(m.avail)} free</div></div></div>
 <div class="card stat">${ring(cpu, Math.round(cpu) + "%", "CPU", "var(--ind)")}<div><div class="k">CPU load</div><div class="big">${esc(S.load.split(" ")[0])}</div><div class="k">${S.cores} cores${S.temp != null ? " · " + S.temp + " °C" : ""}</div></div></div></div>
 <div class="grid g2" style="margin-top:14px"><div class="card"><h3>${ic("volcano")}Where the memory goes</h3>${memBar()}<h3 style="margin-top:18px">${ic("egg")}Can I add another?</h3><div class="say">${advice()}</div></div>
 <div class="card"><h3>${ic("server")}Servers</h3><table class="rt"><thead><tr><th>Name</th><th>State</th><th>Memory</th></tr></thead><tbody>${miniRows()}</tbody></table><p class="k" style="margin-bottom:0">${ic("fossil")}Backup: ${S.backup && S.backup.usb ? (S.backup.last ? "last " + esc(S.backup.last) : "waiting for first backup") : S.persist ? "worlds are stored on this machine" : "no BUTTER volume, nothing is saved at power off"}</p></div></div>`, force);
  } };

/* ---------- Servers ---------- */
const srvRows = () => B.S.servers.length ? B.S.servers.map((s) => { const on = s.state === "running", a = addrList(s)[0];
  return `<tr><td data-l="Name"><a href="#server/${s.name}"><b>${esc(s.name)}</b></a><div class="k">${esc(jt(s))}</div></td><td data-l="State">${stBadge(s.state)}</td><td data-l="Players">${s.players == null ? "-" : s.players + (s.max_players ? " / " + s.max_players : "")}</td><td data-l="Memory">${on ? gb(s.ram) + (s.mem_limit ? " / " + gb(s.mem_limit) : "") : "-"}</td><td data-l="CPU">${on ? s.cpu + "%" : "-"}</td><td data-l="Address">${a ? `<code>${esc(a.v)}</code>${s.type === "bedrock" ? " (UDP)" : ""}` : "-"}${s.join ? `<div class="k">internet: <b>${esc(s.join)}</b></div>` : ""}</td><td data-l="" class="acts">${ctlBtns(s, 1)}<a class="btn sm" href="#server/${s.name}">${ic("gear")}Manage</a><button class="btn sm d" data-do="del" data-n="${s.name}" aria-label="Delete ${esc(s.name)}">${ic("trash")}Delete</button></td></tr>`; }).join("") : `<tr><td colspan="7">${empty("No servers yet", "Create your first Minecraft server. It takes about a minute.", `<button class="btn p" data-do="newsrv">${ic("egg")}New server</button>`)}</td></tr>`;
B.ACT.newsrv = () => B.newDialog();
P.servers = {
  show() { this.live(true); },
  live(force) { if (!force && B.typing()) return;
    B.setView(`${dockerNote()}<div class="card"><div class="row between"><h3>${ic("server")}Servers</h3><button class="btn p" data-do="newsrv">${ic("egg")}New server</button></div><table class="rt"><thead><tr><th>Name</th><th>State</th><th>Players</th><th>Memory</th><th>CPU</th><th>Join address</th><th></th></tr></thead><tbody>${srvRows()}</tbody></table><div class="say" style="margin-top:12px">${advice()}</div></div>`, force); } };

/* ---------- Local (players, plugins, sharing, per server) ---------- */
P.local = {
  show() { this.live(true); },
  live(force) {
    if (!force && B.typing()) return; const S = B.S;
    const h = `<div class="card"><h3>${ic("footprint")}Local</h3><p class="k" style="margin:0">Manage the servers running on this machine: players, plugins and sharing. Only people on this network can open this page. For everything else open a server under <a href="#servers">Servers</a>.</p></div>` +
      (S.servers.length ? S.servers.map((s) => `<div class="card" style="margin-top:14px"><h3>${esc(s.name)} ${stBadge(s.state)}</h3><div class="k">${s.type === "java" ? "Java (" + esc(jt(s)) + ")" : "Bedrock"} · network ${esc(S.ip)}:${s.port || "?"}${s.join ? " · internet <b>" + esc(s.join) + "</b>" : ""}</div>
 ${s.type === "java" ? `${s.bedrock_port ? `<p class="k" style="margin-top:8px">Phones &amp; consoles (Bedrock): add server <b>${esc(S.ip)}</b> port <b>${s.bedrock_port}</b></p>` : ""}<div class="row" style="margin-top:10px">${s.join ? `<button class="btn" data-do="share" data-c="unshare" data-n="${s.name}">Turn off internet link</button>` : `<button class="btn p" data-do="share" data-c="share" data-n="${s.name}" ${s.state === "running" ? "" : "disabled"}>${ic("globe")}Get a free internet link</button>`}<a class="btn" href="#server/${s.name}">${ic("gear")}Manage</a></div>
 <h4>${ic("footprint")}Players</h4><div id="pl-${s.name}" class="k">${s.state === "running" ? "loading..." : "Start the server to see players."}</div>
 <div class="row" style="margin-top:10px">${B.crackedSw(s)}</div><h4>${ic("fern")}Mods &amp; plugins</h4>${B.pluginBlock(s, s.flavor)}` : `<p class="k">Bedrock servers share by local network only.</p><div class="row"><a class="btn" href="#server/${s.name}">${ic("gear")}Manage</a></div>`}</div>`).join("") : `<div class="card" style="margin-top:14px">${empty("No servers yet", "Press + to make one.")}</div>`);
    const ch = B.setView(h, force); if (ch || force) for (const s of S.servers.filter((x) => x.type === "java")) { if (s.state === "running") B.fillPlayers(s); if (s.flavor !== "vanilla") B.fillPlugins(s); } else for (const s of S.servers.filter((x) => x.type === "java" && x.state === "running")) B.fillPlayers(s);
  } };

/* ---------- Backup, Network, System ---------- */
P.backup = {
  show() { this.live(true); },
  live(force) { if (!force && B.typing()) return; const S = B.S, m = S.mem, bk = S.backup || {};
    B.setView(`<div class="card"><h3>${ic("fossil")}Backup</h3><div class="big" style="color:${S.persist ? "var(--ok)" : "var(--warn)"}">${S.persist ? "USB volume found" : "No BUTTER volume"}</div><p>${S.persist ? "Worlds are copied to the USB every 5 minutes and when you shut down. A sudden power cut can lose up to 5 minutes." : "Everything is in RAM only and will be lost at power off. Make an ext4 partition labelled BUTTER on your USB stick and reboot."}</p><p class="k">Last backup: ${esc(bk.last || "none yet")}</p><p class="k">Worlds in RAM: ${gb(m.worlds)}</p></div>
 <div class="card" style="margin-top:14px"><h3>${ic("fossil")}Per-server backups</h3>${S.servers.length ? `<ul class="plain">${S.servers.map((s) => `<li><a href="#server/${s.name}/backups"><b>${esc(s.name)}</b></a> <span class="k">back up, restore, download and schedule</span></li>`).join("")}</ul>` : `<p class="k">No servers yet.</p>`}</div>`, force); } };
P.network = {
  show() { this.live(true); },
  live(force) { if (!force && B.typing()) return; const S = B.S;
    B.setView(`<div class="card"><h3>${ic("globe")}Network</h3><p>Address of this machine: <b>${esc(S.ip || "no network")}</b></p><p>This page: <b>http://${esc(S.ip || "...")}</b> (local network only)</p>${S.servers.map((s) => `<p>${esc(s.name)}: <b>${esc(S.ip)}:${s.port || "?"}</b> ${s.type === "bedrock" ? "(UDP, Bedrock)" : "(Java)"}${s.type === "java" && s.bedrock_port ? ` &middot; phones &amp; consoles: <b>${esc(S.ip)}:${s.bedrock_port}</b> (TCP+UDP)` : ""}</p>`).join("") || `<p class="k">No servers yet.</p>`}<p class="k">To let friends outside your home join, forward the port in your router, or use the free internet link (turn it on for a server under Local or on its page).</p></div>`, force); } };
P.system = {
  show() { this.live(true); },
  live(force) { if (!force && B.typing()) return; const S = B.S, m = S.mem;
    B.setView(`<div class="card"><h3>${ic("volcano")}System</h3><dl class="kv"><dt>Kernel</dt><dd>${esc(S.kernel)}</dd><dt>Container engine</dt><dd>${esc(S.engine)}${S.docker && S.docker.version ? " · Docker " + esc(S.docker.version) : ""}</dd><dt>Load</dt><dd>${esc(S.load)}</dd><dt>Temperature</dt><dd>${S.temp == null ? "not available" : S.temp + " °C"}</dd><dt>Memory</dt><dd>${gb(m.total)} total${S.web_rss_mb != null ? " · web agent " + S.web_rss_mb + " MB" + (S.limit_web_mb ? " (limit " + S.limit_web_mb + " MB)" : "") : ""}</dd><dt>Platform</dt><dd>${esc(S.platform || "")}</dd></dl></div>`, force); } };

/* ---------- Commercial card (also used for status in the wizard) ---------- */
const coBadge = (s) => `<span class="st ${s === "online" ? "" : s === "registering" ? "busy" : s === "off" ? "off" : "bad"}">${esc(s || "off")}</span>`;
B.coStatus = (c) => `<dl class="kv"><dt>State</dt><dd>${coBadge(c.state)}</dd>${c.error ? `<dt>Problem</dt><dd class="err">${esc(c.error)}</dd>` : ""}<dt>Node id</dt><dd>${c.node_id ? `<code id="co-node">${esc(c.node_id)}</code> <button class="btn sm" data-do="copyid" data-id="co-node">${ic("copy")}Copy</button>` : "not registered yet"}</dd><dt>Last heartbeat</dt><dd>${c.last_heartbeat ? esc(new Date(c.last_heartbeat > 1e11 ? c.last_heartbeat : c.last_heartbeat * 1000).toLocaleString()) : "never"}</dd><dt>Earned</dt><dd><b>$${(+c.earned_usd || 0).toFixed(2)}</b> <span class="k">pending $${(+c.pending_usd || 0).toFixed(2)}</span></dd></dl>
 <h4>Customer servers on this machine</h4>${c.hosted && c.hosted.length ? `<table class="rt"><thead><tr><th>Server</th><th>Owner</th><th>State</th></tr></thead><tbody>${c.hosted.map((h) => `<tr><td data-l="Server">${esc(h.name)}</td><td data-l="Owner">${esc(h.owner)}</td><td data-l="State">${stBadge(h.state)}</td></tr>`).join("")}</tbody></table>` : `<p class="k">None. Customer servers are only placed here when the ButterHosting site assigns them.</p>`}`;
B.coNote = `<div class="notice">${ic("info")}<div><b>Honest note:</b> payouts are a proof of concept. Nothing is paid automatically yet. Customer servers are only placed on this machine when the ButterHosting site assigns them, and you can turn this off at any time.</div></div>`;
B.coMaxRam = () => { const t = (B.HI && B.HI.mem_total_mb) || (B.S && B.S.mem.total) || 4096; return Math.max(1024, Math.floor(t * 0.9 / 256) * 256); };
B.coForm = (v) => `<div class="stack">${sw({ attrs: 'id="co-en"', on: v.enabled, label: "Host commercially for ButterHosting", hint: "Rent out spare capacity of this machine to other people's servers and earn." })}
 <label class="fld">RAM to share <output id="co-ramv" class="k">${gb(v.ram_share_mb)}</output><input id="co-ram" type="range" min="512" max="${B.coMaxRam()}" step="256" value="${clamp(v.ram_share_mb, 512, B.coMaxRam())}" data-out="co-ramv" data-fmt="gb"></label>
 <label class="fld">Max customer servers<input id="co-max" type="number" min="1" max="50" value="${v.max_servers || 2}" style="max-width:120px"></label>
 <label class="fld">Payout wallet (USDC, EVM address, optional)<input id="co-wal" value="${esc(v.wallet || "")}" placeholder="0x..." autocomplete="off" spellcheck="false" aria-describedby="co-walh"></label><div class="k" id="co-walh">Leave empty to set it later. Must look like 0x followed by 40 hex characters.</div><div class="msg err" id="co-err" role="alert"></div></div>`;
B.coRead = () => { const w = $("#co-wal").value.trim(), e = $("#co-err"); e.textContent = ""; if (w && !WALLET_RE.test(w)) { e.textContent = "That wallet address does not look right (0x and 40 hex characters)."; $("#co-wal").focus(); return null; }
  return { enabled: $("#co-en").checked, ram_share_mb: +$("#co-ram").value, max_servers: clamp(parseInt($("#co-max").value, 10) || 1, 1, 50), wallet: w }; };

/* ---------- Settings ---------- */
const flavName = { paper: "Paper (recommended)", vanilla: "Vanilla", fabric: "Fabric", forge: "Forge" };
let CO = null;
P.settings = {
  async show() {
    const [cfg, co, dk, hi] = await Promise.all([B.loadCfg(), api("a=commercial"), api("a=docker"), B.loadHI()]); CO = co.ok ? co : { state: "off" }; B.DK = dk.ok ? dk : null;
    const c = cfg || {}, th = B.theme(), dino = document.documentElement.classList.contains("dino"), ccfg = c.commercial || {};
    B.setView(`<div class="grid g2s">
<div class="stack">
<section class="card"><h3>${ic("nest")}This machine</h3><label class="fld">Machine name<input id="s-name" value="${esc(c.machine_name || "")}" maxlength="40" placeholder="butter-box"></label><div class="row" style="margin-top:10px"><button class="btn p" data-do="saveName">${ic("save")}Save name</button></div></section>
<section class="card"><h3>${ic("egg")}Defaults for new servers</h3><div class="fld">Software</div><div class="seg" role="radiogroup" aria-label="Default software">${["paper", "vanilla", "fabric", "forge"].map((f) => `<label><input type="radio" name="s-fl" value="${f}" ${(c.default_flavor || "paper") === f ? "checked" : ""}><span>${flavName[f]}</span></label>`).join("")}</div>
<label class="fld">Memory <output id="s-memv" class="k">${gb(c.default_mem || 1536)}</output><input id="s-mem" type="range" min="1024" max="${Math.min(16384, B.coMaxRam())}" step="256" value="${c.default_mem || 1536}" data-out="s-memv" data-fmt="gb"></label>
<div style="margin-top:10px">${sw({ attrs: 'id="s-share"', on: c.share_default === "internet", label: "Free internet link by default", hint: "New Java servers get a join link that works from anywhere." })}</div><div class="row" style="margin-top:12px"><button class="btn p" data-do="saveDefaults">${ic("save")}Save defaults</button></div></section>
<section class="card"><h3>${ic("palette")}Appearance</h3><div class="fld">Theme</div><div class="tiles" role="radiogroup" aria-label="Theme">${B.THEMES.map((t) => `<label class="tile"><input type="radio" name="s-th" value="${t[0]}" ${th === t[0] ? "checked" : ""}><span class="swatch th-${t[0]}" aria-hidden="true"><i></i><i></i><i></i></span><b>${t[1]}</b><small>${t[2]}</small></label>`).join("")}</div>
<div style="margin-top:12px">${sw({ attrs: 'id="s-dino"', on: dino, label: "Dino cursors", hint: "A dinosaur-themed mouse pointer set. Turn it off to use your system cursors." })}</div></section>
</div><div class="stack">
<section class="card"><h3>${ic("heartbeat")}Docker</h3><div id="s-dock">${this.dock()}</div><div class="row" style="margin-top:10px"><button class="btn" data-do="recheck">${ic("restart")}Re-check</button></div></section>
<section class="card" id="s-co"><h3>${ic("coin")}Host commercially for ButterHosting</h3>${B.coNote}<div style="margin-top:12px">${B.coForm({ enabled: !!ccfg.enabled || CO.enabled, ram_share_mb: CO.ram_share_mb || ccfg.ram_share_mb || 2048, max_servers: CO.max_servers || ccfg.max_servers || 2, wallet: CO.wallet || ccfg.wallet || "" })}</div><div class="row" style="margin-top:12px"><button class="btn p" data-do="saveCo">${ic("save")}Save</button></div><div id="co-stat" style="margin-top:12px">${B.coStatus(CO)}</div></section>
<section class="card"><h3>${ic("egg")}Setup</h3><p class="k" style="margin-top:0">Walk through the first-run guide again: name, machine check, mode and a first server.</p><a class="btn" href="#setup">${ic("play")}Run setup again</a></section>
<section class="card"><h3>${ic("info")}About</h3><div class="about"><svg class="mascot" aria-hidden="true" viewBox="0 0 64 64"><use href="#i-dino"/></svg><div><b>Butter</b> ${B.S.app ? "app" : "Os"}<div class="k">Minecraft server hosting for your own machine. ${esc(B.S.platform || "")}${B.DK && B.DK.version ? " · Docker " + esc(B.DK.version) : ""}</div><div class="k">Part of ButterHosting.</div></div></div></section>
</div></div>`, true);
  },
  dock() { const d = B.DK || {}; return `<dl class="kv"><dt>Installed</dt><dd>${d.installed ? `${ic("check")}yes` : `${ic("warn")}no`}</dd><dt>Running</dt><dd>${d.running ? `${ic("check")}yes` : `${ic("warn")}no`}</dd>${d.version ? `<dt>Version</dt><dd>${esc(d.version)}</dd>` : ""}</dl>` + (!d.installed && d.install_hint ? `<p class="k">Install Docker:</p><pre id="s-hint" class="sel">${esc(d.install_hint)}</pre><button class="btn sm" data-do="copyid" data-id="s-hint">${ic("copy")}Copy</button>` : d.installed && !d.running ? `<p class="k">Start Docker Desktop (or the docker service), then press Re-check.</p>` : ""); },
  async live() { if (B.typing()) { /* keep forms */ }
    const r = await api("a=commercial"); if (r.ok && $("#co-stat")) { CO = r; const h = B.coStatus(r); if ($("#co-stat").dataset.h !== h) { $("#co-stat").innerHTML = h; $("#co-stat").dataset.h = h; } } } };
B.ACT.saveName = async () => { const v = $("#s-name").value.trim(); if (!v) return toast("Give the machine a name", 1); const r = await api("a=setconfig", { machine_name: v }); toast(r.ok ? "Saved" : r.error, !r.ok); if (r.ok) { B.CFG = r.config; await B.tick(); } };
B.ACT.saveDefaults = async () => { const f = ($("input[name=s-fl]:checked") || {}).value || "paper"; const r = await api("a=setconfig", { default_flavor: f, default_mem: +$("#s-mem").value, share_default: $("#s-share").checked ? "internet" : "none" }); toast(r.ok ? "Defaults saved" : r.error, !r.ok); if (r.ok) B.CFG = r.config; };
B.ACT.recheck = async () => { const d = await api("a=docker"); if (d.ok) { B.DK = d; $("#s-dock").innerHTML = P.settings.dock(); } await B.tick(); };
B.ACT.saveCo = async () => { const v = B.coRead(); if (!v) return; const r = await api("a=setcommercial", v); if (!r.ok) { $("#co-err").textContent = r.error; return; } CO = r; $("#co-stat").innerHTML = B.coStatus(r); toast(r.enabled ? "Commercial hosting is on" : "Commercial hosting is off"); await B.loadCfg(); };
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.name === "s-th") B.setTheme(t.value, true);
  if (t.id === "s-dino") B.setDino(t.checked);
});
