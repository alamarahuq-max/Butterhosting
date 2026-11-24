"use strict";
/* Butter web UI: new-server form (shared by the "+" dialog and the setup wizard), and the first-run setup wizard. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
B.NF = { name: "", type: "java", flavor: "paper", ver: "LATEST", mem: 1536, cross: true, cracked: false, share: false, run: { st: "idle" }, root: null, mode: "dialog" };
const FLV = [["paper", "Paper", "Fast, supports plugins", 1], ["vanilla", "Vanilla", "Plain Mojang server"], ["fabric", "Fabric", "Light mods"], ["forge", "Forge", "Big mod packs"]];
const minor = (v) => v === "LATEST" ? 99 : +String(v).split(".")[1] || 99;
const nfVers = () => { const f = B.NF, v = B.VL; if (!v) return ["LATEST"]; if (f.type === "bedrock") return v.bedrock; return ["LATEST"].concat(v.java.filter((x) => f.flavor === "paper" ? minor(x) >= 8 : f.flavor === "fabric" ? minor(x) >= 14 : true)); };
const nfCross = () => B.NF.type === "java" && B.NF.flavor === "paper" && minor(B.NF.ver) >= 16;
const nfMax = () => Math.min(16384, B.coMaxRam());
function nfAvail() { return (B.HI && B.HI.mem_avail_mb) || B.S.mem.avail; }
function nfForm() {
  const f = B.NF, j = f.type === "java", vs = nfVers(); if (!vs.includes(f.ver)) f.ver = "LATEST";
  const need = j ? javaNeed(f.mem) : 700, cr = nfCross();
  return `<div class="nf"><label class="fld" for="nf-name">Server name</label><input id="nf-name" value="${esc(f.name)}" maxlength="24" placeholder="my-world" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="nf-nh"><div class="k hint" id="nf-nh">2-24 characters: lowercase letters, digits and dashes.</div>
<div class="fld">Game</div><div class="tiles sm" role="radiogroup" aria-label="Game">${[["java", "Java Edition", "PC and Mac. Mods, plugins, crossplay."], ["bedrock", "Bedrock Edition", "Phones, consoles, Windows 10/11."]].map((t) => `<label class="tile"><input type="radio" name="nf-type" value="${t[0]}" ${f.type === t[0] ? "checked" : ""}><b>${t[1]}</b><small>${t[2]}</small></label>`).join("")}</div>
${j ? `<div class="fld">Software</div><div class="tiles sm" role="radiogroup" aria-label="Software">${FLV.map((t) => `<label class="tile"><input type="radio" name="nf-fl" value="${t[0]}" ${f.flavor === t[0] ? "checked" : ""}><b>${t[1]}${t[3] ? ' <span class="st">recommended</span>' : ""}</b><small>${t[2]}</small></label>`).join("")}</div>` : ""}
<label class="fld" for="nf-ver">Version</label><select id="nf-ver" style="max-width:280px">${vs.map((x) => `<option value="${esc(x)}" ${x === f.ver ? "selected" : ""}>${x === "LATEST" && B.VL && B.VL.latest && j ? "Latest (" + esc(B.VL.latest) + ")" : esc(x)}</option>`).join("")}</select>
${j ? `<label class="fld" for="nf-mem">Memory <output id="nf-memv" class="k">${gb(f.mem)}</output></label><input id="nf-mem" type="range" min="1024" max="${nfMax()}" step="256" value="${clamp(f.mem, 1024, nfMax())}" data-out="nf-memv" data-fmt="gb">` : `<div class="fld">Memory</div><p class="k" style="margin:0">Bedrock servers use about 700 MB.</p>`}
<div id="nf-fit">${fitBar(need, nfAvail(), keepFree())}</div>
<div class="stack sws">${j ? sw({ attrs: 'id="nf-cross"', on: f.cross && cr, dis: !cr, label: "Crossplay", hint: cr ? "Phones and consoles can join this Java server too." : "Needs Paper 1.16 or newer." }) : ""}${j ? sw({ attrs: 'id="nf-crack"', on: f.cracked, label: "Cracked mode", hint: "Let players without a paid account join. Anyone can pretend to be anyone: pair it with a whitelist." }) : ""}${j ? sw({ attrs: 'id="nf-share"', on: f.share, label: "Free internet link", hint: "A join link that works from anywhere. It changes if the server restarts." }) : ""}</div>
<div class="msg err" id="nf-err" role="alert"></div></div>`;
}
function nfProgress() {
  const r = B.NF.run, lines = (r.log || "").split("\n").filter(Boolean).slice(-12).join("\n");
  return `<div class="prog" aria-live="polite"><h3>${ic("egg")}Hatching ${esc(B.NF.name)}</h3><div class="bar ind" role="progressbar" aria-label="Creating the server"><i></i></div><p><b>${esc(r.stage || "Working...")}</b></p><p class="k">The first server downloads about 500 MB, so this can take a few minutes. You can keep this page open.</p><pre class="log" aria-hidden="true">${esc(lines || "waiting for the server to start...")}</pre></div>`;
}
function nfDone() { const r = B.NF.run; return `<div class="prog done"><svg class="mascot big" aria-hidden="true" viewBox="0 0 64 64"><use href="#i-dino"/></svg><h3>${ic("check")}${esc(r.name)} is ready</h3>${r.note ? `<p class="k">${esc(r.note)}</p>` : ""}<p class="k" style="margin-bottom:6px">Friends join with:</p>${r.addrs.length ? `<ul class="addrs">${r.addrs.map((x) => `<li><span class="k">${esc(x.l)}</span><code>${esc(x.v)}</code><button class="btn sm" type="button" data-do="copy" data-v="${esc(x.v)}" aria-label="Copy ${esc(x.l)}">${ic("copy")}Copy</button></li>`).join("")}</ul>` : `<p class="k">The address shows up on the server page.</p>`}</div>`; }
B.nfDraw = () => {
  const f = B.NF, root = f.root; if (!root || !root.isConnected) return; const st = f.run.st, keep = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : "";
  const dlg = f.mode === "dialog", docker = B.S.docker || {}, can = docker.installed && docker.running;
  let h = st === "creating" ? nfProgress() : st === "done" ? nfDone() : nfForm();
  if (st === "idle" || st === "error") h += (can ? "" : `<div class="notice warn">${ic("warn")}<div>Docker is ${docker.installed ? "not running" : "not installed"}, so a server cannot be created yet. <a href="#settings" data-do="closedlg">Open Settings</a> for help.</div></div>`) + `<div class="row end nfact">${dlg ? `<button class="btn" data-do="closedlg">Cancel</button>` : ""}<button class="btn p" data-do="nfcreate" ${can ? "" : "disabled"}>${ic("egg")}Create server</button></div>`;
  if (st === "creating" && dlg) h += `<div class="row end nfact"><button class="btn" data-do="closedlg">Keep going in the background</button></div>`;
  if (st === "done" && dlg) h += `<div class="row end nfact"><button class="btn" data-do="closedlg">Close</button><a class="btn p" href="#server/${esc(f.run.name)}" data-do="closedlg">${ic("gear")}Open server</a></div>`;
  root.innerHTML = h; if (st === "error" && f.run.err) $("#nf-err", root).textContent = f.run.err; if (keep) { const k = document.getElementById(keep); if (k) k.focus(); }
  if (st === "idle" && f.focus) { f.focus = 0; const n = $("#nf-name", root); if (n) n.focus(); }
};
document.addEventListener("input", (e) => { const t = e.target; if (!B.NF.root || !B.NF.root.contains(t)) return;
  if (t.id === "nf-name") B.NF.name = t.value.trim().toLowerCase();
  if (t.id === "nf-mem") { B.NF.mem = +t.value; $("#nf-fit").innerHTML = fitBar(javaNeed(B.NF.mem), nfAvail(), keepFree()); } });
document.addEventListener("change", (e) => { const t = e.target, f = B.NF; if (!f.root || !f.root.contains(t)) return;
  if (t.name === "nf-type") { f.type = t.value; B.nfDraw(); } else if (t.name === "nf-fl") { f.flavor = t.value; B.nfDraw(); }
  else if (t.id === "nf-ver") f.ver = t.value; else if (t.id === "nf-cross") f.cross = t.checked; else if (t.id === "nf-crack") f.cracked = t.checked; else if (t.id === "nf-share") f.share = t.checked; });
B.ACT.closedlg = () => { const d = $("#newdlg"); if (d) d.close(); };
B.nfMount = async (root, mode, name) => { const f = B.NF; f.root = root; f.mode = mode; if (f.run.st !== "creating" && f.run.st !== "done") { f.run = { st: "idle" }; if (name != null) f.name = name; } f.focus = mode === "dialog"; B.nfDraw(); await Promise.all([B.loadVL(), B.loadHI()]); const d = f.mem; f.mem = clamp(d, 1024, nfMax()); if (B.NF.run.st === "idle") B.nfDraw(); };
B.newDialog = () => {
  if ($("#newdlg")) return; const d = document.createElement("dialog"); d.id = "newdlg"; d.className = "dlg wide"; d.setAttribute("aria-label", "New server");
  d.innerHTML = `<h3>${ic("egg")}New server</h3><div id="nf-root"></div>`; document.body.appendChild(d); d.onclose = () => { if (B.NF.root === $("#nf-root")) B.NF.root = null; d.remove(); };
  d.showModal(); B.nfMount($("#nf-root", d), "dialog", ""); if (B.CFG) { B.NF.flavor = B.CFG.default_flavor || "paper"; B.NF.mem = B.CFG.default_mem || 1536; B.NF.share = B.CFG.share_default === "internet"; B.nfDraw(); }
};
B.ACT.nfcreate = async () => {
  const f = B.NF, err = (m) => { $("#nf-err", f.root).textContent = m; $("#nf-name", f.root).focus(); };
  f.name = ($("#nf-name", f.root).value || "").trim().toLowerCase();
  if (!NAME_RE.test(f.name)) return err("Name must be 2-24 characters: lowercase letters, digits and dashes, starting with a letter or digit.");
  if ((B.S.servers || []).some((s) => s.name === f.name)) return err("A server with that name already exists.");
  const j = f.type === "java", name = f.name, token = Date.now(); f.run = { st: "creating", log: "", stage: "Creating the container...", token }; B.nfDraw();
  const cross = j && nfCross() && f.cross ? 1 : 0, q = `a=create&n=${enc(name)}&type=${f.type}&mem=${j ? f.mem : 700}&ver=${enc(f.ver || "LATEST")}&flavor=${j ? f.flavor : "paper"}&cross=${cross}&share=${j && f.share ? "internet" : "none"}`;
  let made = null; api(q).then((r) => { made = r; });
  const t0 = Date.now();
  for (;;) {
    await sleep(2000); if (f.run.token !== token) return;
    const lg = await api("a=logs&n=" + enc(name)); if (f.run.token !== token) return; if (lg.ok) f.run.log = lg.logs;
    if (made && !made.ok) { f.run = { st: "error", err: made.error }; return B.nfDraw(); }
    const L = f.run.log || ""; const ready = /Done \(|Server started/.test(L);
    f.run.stage = ready ? "Almost there..." : /Preparing|Loading|Starting minecraft|Starting Minecraft|Starting server/i.test(L) ? "Building the world..." : L ? "Setting things up..." : made ? "Starting the server..." : "Downloading Minecraft server files...";
    if (ready && made && made.ok) {
      let note = ""; if (j && f.cracked) { f.run.stage = "Turning on cracked mode..."; B.nfDraw(); const c = await api(`a=cracked&n=${enc(name)}&v=1`); note = c.ok ? "Cracked mode is on. The server is restarting for a moment." : "Could not turn on cracked mode: " + c.error; }
      await B.tick(); const s = B.S.servers.find((x) => x.name === name) || { name, type: f.type, port: made.port }; const addrs = addrList(s);
      if (made.join && !addrs.some((a) => a.v === made.join)) addrs.push({ l: "Java, internet link", v: made.join });
      f.run = { st: "done", name, addrs, note, port: made.port }; return B.nfDraw();
    }
    if (Date.now() - t0 > 15 * 60 * 1000) { f.run = { st: "error", err: "It is taking much longer than usual. The server may still finish: check the Servers page." }; return B.nfDraw(); }
    if (f.root && f.root.isConnected && f.run.st === "creating") B.nfDraw(); else if (!f.root || !f.root.isConnected) { if (made && made.ok && ready) { toast(name + " is ready"); await B.tick(); return; } }
  }
};

/* ---------- Setup wizard ---------- */
const STEPS = ["Welcome", "Name", "Check", "Mode", "Server", "Finish"];
let W = null;
const wnew = () => ({ step: 0, name: "", chk: null, mode: "friends", ram: 2048, max: 2, wallet: "", err: "", busy: false });
const wbody = {
  0: () => `<svg class="mascot hero" aria-hidden="true" viewBox="0 0 64 64"><use href="#i-dino"/></svg><h2 id="wh" tabindex="-1">Welcome to Butter</h2><p class="lead">Let us get your Minecraft server machine ready. It takes about two minutes.</p><ul class="plain big"><li>${ic("nest")}Name this machine</li><li>${ic("heartbeat")}Check it can run servers</li><li>${ic("coin")}Choose how you want to use it</li><li>${ic("egg")}Hatch your first server</li></ul>`,
  1: () => `<h2 id="wh" tabindex="-1">${ic("nest")}Name this machine</h2><p class="k">Friends and the ButterHosting site will see this name. You can change it later in Settings.</p><label class="fld" for="w-name">Machine name</label><input id="w-name" value="${esc(W.name)}" maxlength="40" autocomplete="off" placeholder="butter-box"><div class="msg err" role="alert">${esc(W.err)}</div>`,
  2: () => { const c = W.chk; if (!c) return `<h2 id="wh" tabindex="-1">${ic("heartbeat")}Check your machine</h2><p class="k">Looking at this machine...</p><div class="bar ind"><i></i></div>`;
    const h = c.hi || {}, d = c.dk || {}, avail = h.mem_avail_mb || 0, fits = Math.max(0, Math.floor((avail - 1024) / 1536)), ok = d.installed && d.running;
    return `<h2 id="wh" tabindex="-1">${ic("heartbeat")}Check your machine</h2><dl class="checks"><div><dt>${ic("chip")}Processor</dt><dd>${h.cores || "?"} cores</dd></div><div><dt>${ic("volcano")}Memory</dt><dd>${gb(avail)} free of ${gb(h.mem_total_mb || 0)}</dd></div><div><dt>${ic("disk")}Disk</dt><dd>${h.disk_free_gb != null ? Math.round(h.disk_free_gb) + " GB free" : "unknown"}</dd></div><div><dt>${ic("server")}Docker</dt><dd class="${ok ? "okc" : "warnc"}">${ok ? ic("check") + "running" + (d.version ? " (" + esc(d.version) + ")" : "") : ic("warn") + (d.installed ? "installed, not running" : "not installed")}</dd></div></dl>
${ok ? "" : `<div class="notice warn">${ic("warn")}<div><b>${d.installed ? "Docker is installed but not running." : "Butter needs Docker to run servers."}</b> ${d.installed ? "Start it, then press Re-check." : "Install it with the steps below, then press Re-check."}${d.install_hint ? `<pre id="w-hint" class="sel">${esc(d.install_hint)}</pre><button class="btn sm" data-do="copyid" data-id="w-hint">${ic("copy")}Copy</button>` : ""}</div></div>`}
<div class="say">${ic("egg")} <b>Fits about ${fits} server${fits === 1 ? "" : "s"}.</b> ${fits ? "A Java server needs about 1.5 GB each." : "Not much room for a Java server. A Bedrock server needs only about 700 MB, or close other programs."}</div><div class="row" style="margin-top:12px"><button class="btn" data-do="wrecheck">${ic("restart")}Re-check</button></div>`; },
  3: () => `<h2 id="wh" tabindex="-1">${ic("coin")}How will you use it?</h2><div class="tiles" role="radiogroup" aria-label="Mode"><label class="tile"><input type="radio" name="w-mode" value="friends" ${W.mode === "friends" ? "checked" : ""}><span class="ti">${ic("footprint")}</span><b>Just for me and friends</b><small>Private servers, free. Nothing is shared.</small></label><label class="tile"><input type="radio" name="w-mode" value="commercial" ${W.mode === "commercial" ? "checked" : ""}><span class="ti">${ic("coin")}</span><b>Host commercially for ButterHosting (earn)</b><small>Rent spare capacity to other players.</small></label></div>
<div id="w-co" ${W.mode === "commercial" ? "" : "hidden"}><div class="stack" style="margin-top:14px">${B.coNote}<label class="fld">RAM to share <output id="w-ramv" class="k">${gb(W.ram)}</output><input id="w-ram" type="range" min="512" max="${B.coMaxRam()}" step="256" value="${clamp(W.ram, 512, B.coMaxRam())}" data-out="w-ramv" data-fmt="gb"></label><label class="fld">Max customer servers<input id="w-max" type="number" min="1" max="50" value="${W.max}" style="max-width:120px"></label><label class="fld">Payout wallet (USDC on an EVM chain, optional)<input id="w-wal" value="${esc(W.wallet)}" placeholder="0x..." autocomplete="off" spellcheck="false"></label><div class="msg err" role="alert">${esc(W.err)}</div></div></div>`,
  4: () => `<h2 id="wh" tabindex="-1">${ic("egg")}Create your first server</h2><div id="nf-root" class="wnf"></div>`,
  5: () => { const r = B.NF.run, co = W.mode === "commercial"; return `<svg class="mascot hero" aria-hidden="true" viewBox="0 0 64 64"><use href="#i-dino"/></svg><h2 id="wh" tabindex="-1">All set</h2><dl class="kv"><dt>Machine</dt><dd>${esc(W.name)}</dd><dt>Mode</dt><dd>${co ? "Hosting commercially (" + gb(W.ram) + ", up to " + W.max + " servers)" : "Just for me and friends"}</dd><dt>First server</dt><dd>${r.st === "done" ? esc(r.name) : "skipped"}</dd><dt>New server defaults</dt><dd>${B.NF.flavor === "paper" ? "Paper" : esc(B.NF.flavor)}, ${gb(B.NF.mem)}${B.NF.share ? ", free internet link" : ""}</dd></dl><div class="msg err" role="alert">${esc(W.err)}</div>`; }
};
function wizDraw(focus) {
  const el = $("#wizard"); if (!W) return; const s = W.step, run = B.NF.run.st;
  const nav = s === 0 ? `<button class="btn" data-do="wskip">Skip setup</button><button class="btn p" data-do="wnext">Let's go ${ic("next")}</button>` :
    `<button class="btn" data-do="wback" ${run === "creating" ? "disabled" : ""}>${ic("back")}Back</button>` + (s === 4 ? (run === "done" ? "" : `<button class="btn" data-do="wnext" ${run === "creating" ? "disabled" : ""}>Skip this step</button>`) : "") + (s === 5 ? `<button class="btn p" data-do="wfinish">${ic("check")}Finish setup</button>` : `<button class="btn p" data-do="wnext" ${(s === 4 && run !== "done") || (s === 2 && !W.chk) ? "disabled" : ""}>Continue ${ic("next")}</button>`);
  el.innerHTML = `<div class="wiz"><div class="wcard" role="dialog" aria-modal="false" aria-label="Setup"><div class="whead"><span class="brand sm">Butter <img src="logo.svg" alt=""> Os</span><span class="k wstep">Step ${s + 1} of ${STEPS.length}</span></div><ol class="stepper" aria-label="Setup progress">${STEPS.map((t, i) => `<li class="${i < s ? "done" : i === s ? "now" : ""}" ${i === s ? 'aria-current="step"' : ""}><span class="dot">${i < s ? ic("check") : i + 1}</span><span class="sl">${t}</span></li>`).join("")}</ol><div class="wbody">${wbody[s]()}</div><div class="wnav">${nav}</div></div></div>`;
  if (s === 4) { const r = $("#nf-root", el); B.nfMount(r, "wizard", "my-world"); }
  if (focus !== false) { const f = $("#wh", el); const i = $("input[type=text],input:not([type]),input[type=radio]:checked", el); (s === 1 && i ? i : f).focus(); }
}
const wsave = () => { if (!W) return; const g = (i) => document.getElementById(i); if (g("w-name")) W.name = g("w-name").value.trim(); if (g("w-ram")) { W.ram = +g("w-ram").value; W.max = clamp(parseInt(g("w-max").value, 10) || 1, 1, 50); W.wallet = g("w-wal").value.trim(); } };
async function wcheck() { const [dk, hi] = await Promise.all([api("a=docker"), api("a=hostinfo")]); if (!W) return; W.chk = { dk: dk.ok ? dk : {}, hi: hi.ok ? hi : {} }; if (hi.ok) B.HI = hi; if (W.step === 2) wizDraw(false); }
B.ACT.wrecheck = async () => { W.chk = null; wizDraw(false); await wcheck(); await B.tick(); };
B.ACT.wback = () => { wsave(); W.err = ""; W.step = Math.max(0, W.step - 1); wizDraw(); };
B.ACT.wskip = async () => { const r = await api("a=setconfig", { setup_done: true }); if (!r.ok) return toast(r.error, 1); B.CFG = r.config; W = null; B.wizardSeen = true; location.hash = "#overview"; await B.tick(); };
B.ACT.wnext = async () => {
  wsave(); W.err = ""; const s = W.step;
  if (s === 1) { if (!W.name) { W.err = "Please give the machine a name."; return wizDraw(false); } const r = await api("a=setconfig", { machine_name: W.name }); if (!r.ok) { W.err = r.error; return wizDraw(false); } B.CFG = r.config; }
  if (s === 3 && W.mode === "commercial" && W.wallet && !WALLET_RE.test(W.wallet)) { W.err = "That wallet address does not look right (0x and 40 hex characters), or leave it empty."; wizDraw(false); const w = $("#w-wal"); if (w) w.focus(); return; }
  W.step = Math.min(STEPS.length - 1, s + 1); wizDraw(); if (W.step === 2) wcheck();
};
B.ACT.wfinish = async () => {
  wsave(); W.err = "";
  if (W.mode === "commercial") { const r = await api("a=setcommercial", { enabled: true, ram_share_mb: W.ram, max_servers: W.max, wallet: W.wallet }); if (!r.ok) { W.err = "Commercial hosting: " + r.error; return wizDraw(false); } }
  else if (B.CFG && B.CFG.commercial && B.CFG.commercial.enabled) await api("a=setcommercial", { enabled: false });
  const r = await api("a=setconfig", { setup_done: true, machine_name: W.name, default_flavor: B.NF.flavor, default_mem: B.NF.mem, share_default: B.NF.share ? "internet" : "none" });
  if (!r.ok) { W.err = r.error; return wizDraw(false); }
  B.CFG = r.config; W = null; B.wizardSeen = true; B.NF.run = { st: "idle" }; location.hash = "#overview"; toast("Setup complete. Welcome to Butter!"); await B.tick();
};
document.addEventListener("change", (e) => { if (W && e.target.name === "w-mode") { wsave(); W.mode = e.target.value; const c = $("#w-co"); if (c) c.hidden = W.mode !== "commercial"; } });
document.addEventListener("keydown", (e) => { if (W && e.key === "Enter" && e.target.id === "w-name") { e.preventDefault(); B.ACT.wnext(); } });
B.wizard = {
  async show() {
    if (!W) { W = wnew(); await B.loadCfg(); await B.loadHI(); const c = B.CFG || {}; W.name = c.machine_name || (B.S && B.S.machine_name) || (B.HI && B.HI.hostname) || "butter-box"; const co = c.commercial || {}; W.ram = co.ram_share_mb || W.ram; W.max = co.max_servers || W.max; W.wallet = co.wallet || ""; W.mode = co.enabled ? "commercial" : "friends";
      B.NF.flavor = c.default_flavor || "paper"; B.NF.mem = c.default_mem || 1536; B.NF.share = c.share_default === "internet"; B.NF.run = { st: "idle" }; }
    wizDraw();
  },
  hide() { if (W && B.cur.p !== "setup") { W = null; B.NF.root = null; } }
};
