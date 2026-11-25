"use strict";
/* Butter web UI: server detail page (Overview, Settings, Resources, Players, Plugins & Mods, Files, Backups, Version, Danger zone). */
let D = { n: "", conf: {}, props: {}, propsOk: false, path: "/" };
const srv = () => (B.S.servers || []).find((x) => x.name === D.n);
const isJava = () => D.conf.type !== "bedrock";
const modWord = () => D.conf.flavor === "fabric" || D.conf.flavor === "forge" ? "Mods" : "Plugins";
const TABS = () => [["overview", "Overview", "heartbeat"], ["settings", "Settings", "gear"], ["resources", "Resources", "volcano"]].concat(isJava() ? [["players", "Players", "footprint"], ["plugins", modWord(), "fern"]] : []).concat([["files", "Files", "bone"], ["backups", "Backups", "fossil"], ["version", "Version", "chip"], ["danger", "Danger zone", "meteor"]]);
const fld = (l, inner, h) => `<label class="fld">${l}${inner}</label>${h ? `<div class="k hint">${h}</div>` : ""}`;

/* ---------- property schema ---------- */
const GM = ["survival", "creative", "adventure", "spectator"], DF = ["peaceful", "easy", "normal", "hard"];
const SCHEMA_J = [
  { g: "Game", i: "egg", f: [
    { k: "motd", l: "Message of the day (MOTD)", t: "motd", d: "A Minecraft Server", h: "Shown in the server list. Use the colour buttons or § codes, \\n for a second line." },
    { k: "max-players", l: "Max players", t: "num", d: "20", min: 1, max: 1000 },
    { k: "gamemode", l: "Default game mode", t: "sel", d: "survival", o: GM },
    { k: "force-gamemode", l: "Force game mode", t: "bool", d: "false", h: "Everyone who joins gets the default game mode." },
    { k: "difficulty", l: "Difficulty", t: "sel", d: "easy", o: DF },
    { k: "hardcore", l: "Hardcore", t: "bool", d: "false", h: "One life. After dying a player becomes a spectator." },
    { k: "pvp", l: "Players can fight each other (PvP)", t: "bool", d: "true" },
    { k: "enable-command-block", l: "Command blocks", t: "bool", d: "false" }] },
  { g: "World", i: "fern", f: [
    { k: "level-seed", l: "World seed", t: "txt", d: "", h: "Only used when a new world is generated." },
    { k: "level-type", l: "World type", t: "sel", d: "minecraft:normal", o: ["minecraft:normal", "minecraft:flat", "minecraft:large_biomes", "minecraft:amplified"] },
    { k: "view-distance", l: "View distance (chunks)", t: "num", d: "10", min: 2, max: 32, h: "Lower is faster on small machines." },
    { k: "simulation-distance", l: "Simulation distance (chunks)", t: "num", d: "10", min: 3, max: 32 },
    { k: "spawn-protection", l: "Spawn protection (blocks)", t: "num", d: "16", min: 0, max: 1000 },
    { k: "max-world-size", l: "Max world size (blocks)", t: "num", d: "29999984", min: 1, max: 29999984, step: 1000 },
    { k: "allow-nether", l: "Nether", t: "bool", d: "true" }, { k: "allow-flight", l: "Allow flying (needed by some mods)", t: "bool", d: "false" },
    { k: "spawn-animals", l: "Animals", t: "bool", d: "true" }, { k: "spawn-monsters", l: "Monsters", t: "bool", d: "true" }, { k: "spawn-npcs", l: "Villagers", t: "bool", d: "true" },
    { k: "entity-broadcast-range-percentage", l: "Entity range (%)", t: "num", d: "100", min: 10, max: 1000, step: 10 }] },
  { g: "Players & access", i: "crown", f: [
    { k: "online-mode", l: "Cracked / offline mode", t: "inv", d: "true", h: "Lets players without a paid Minecraft account join. Anyone can pretend to be anyone, so use it with a whitelist." },
    { k: "white-list", l: "Whitelist", t: "bool", d: "false", h: "Only listed players can join. Edit the list under Players." },
    { k: "enforce-whitelist", l: "Enforce whitelist", t: "bool", d: "false", h: "Kick players who are not listed when the whitelist is turned on." },
    { k: "player-idle-timeout", l: "Kick idle players after (minutes, 0 = never)", t: "num", d: "0", min: 0, max: 10000 },
    { k: "op-permission-level", l: "Operator permission level", t: "sel", d: "4", o: ["1", "2", "3", "4"], lab: { 1: "1 - bypass spawn protection", 2: "2 - command blocks and cheats", 3: "3 - manage players", 4: "4 - everything" } },
    { k: "function-permission-level", l: "Function permission level", t: "sel", d: "2", o: ["1", "2", "3", "4"] }] },
  { g: "Resource pack", i: "file", f: [
    { k: "resource-pack", l: "Resource pack link", t: "txt", d: "", h: "A direct download link to a .zip." },
    { k: "resource-pack-sha1", l: "Resource pack SHA-1", t: "txt", d: "" },
    { k: "require-resource-pack", l: "Players must use the pack", t: "bool", d: "false" }] },
  { g: "Advanced", i: "chip", f: [
    { k: "sync-chunk-writes", l: "Sync chunk writes", t: "bool", d: "true", h: "Safer for the world, a little slower." },
    { k: "network-compression-threshold", l: "Network compression threshold (bytes, -1 = off)", t: "num", d: "256", min: -1, max: 65535, step: 16 }] }];
const SCHEMA_B = [
  { g: "Game", i: "egg", f: [
    { k: "server-name", l: "Server name", t: "txt", d: "Dedicated Server" },
    { k: "max-players", l: "Max players", t: "num", d: "10", min: 1, max: 200 },
    { k: "gamemode", l: "Default game mode", t: "sel", d: "survival", o: ["survival", "creative", "adventure"] },
    { k: "force-gamemode", l: "Force game mode", t: "bool", d: "false" },
    { k: "difficulty", l: "Difficulty", t: "sel", d: "easy", o: DF },
    { k: "allow-cheats", l: "Allow cheats and commands", t: "bool", d: "false" }] },
  { g: "World", i: "fern", f: [
    { k: "level-seed", l: "World seed", t: "txt", d: "" },
    { k: "view-distance", l: "View distance (chunks)", t: "num", d: "32", min: 5, max: 96 },
    { k: "tick-distance", l: "Simulation distance (chunks)", t: "num", d: "4", min: 4, max: 12 }] },
  { g: "Players & access", i: "crown", f: [
    { k: "online-mode", l: "Cracked / offline mode", t: "inv", d: "true", h: "Skips Xbox sign-in checks. Anyone can pretend to be anyone." },
    { k: "allow-list", l: "Allow list", t: "bool", d: "false" },
    { k: "default-player-permission-level", l: "New players are", t: "sel", d: "member", o: ["visitor", "member", "operator"] },
    { k: "player-idle-timeout", l: "Kick idle players after (minutes, 0 = never)", t: "num", d: "30", min: 0, max: 10000 },
    { k: "texturepack-required", l: "Players must use the resource pack", t: "bool", d: "false" }] }];
const unesc = (v) => String(v == null ? "" : v).replace(/\\([:=#!])/g, "$1");
const pval = (f) => (D.props[f.k] != null ? unesc(D.props[f.k]) : f.d);
const motdDisp = (v) => String(v).replace(/\\u00a7/gi, "§");
const motdSave = (v) => String(v).replace(/§/g, "\\u00a7").replace(/\n/g, "\\n");
const MC = { 0: "#000000", 1: "#0000aa", 2: "#00aa00", 3: "#00aaaa", 4: "#aa0000", 5: "#aa00aa", 6: "#ffaa00", 7: "#aaaaaa", 8: "#555555", 9: "#5555ff", a: "#55ff55", b: "#55ffff", c: "#ff5555", d: "#ff55ff", e: "#ffff55", f: "#ffffff" };
function motdHtml(v) {
  v = motdDisp(v).replace(/\\n/g, "\n"); let out = "", st = { c: "", b: 0, i: 0, u: 0, s: 0 }; const open = () => `<span style="${st.c ? "color:" + st.c + ";" : ""}${st.b ? "font-weight:700;" : ""}${st.i ? "font-style:italic;" : ""}${st.u || st.s ? "text-decoration:" + (st.u ? "underline " : "") + (st.s ? "line-through" : "") + ";" : ""}">`;
  const parts = v.split("§"); out += open() + esc(parts[0]);
  for (let i = 1; i < parts.length; i++) { const p = parts[i], c = (p[0] || "").toLowerCase(), rest = p.slice(1);
    if (MC[c]) st = { c: MC[c], b: 0, i: 0, u: 0, s: 0 }; else if (c === "l") st.b = 1; else if (c === "o") st.i = 1; else if (c === "n") st.u = 1; else if (c === "m") st.s = 1; else if (c === "r") st = { c: "", b: 0, i: 0, u: 0, s: 0 };
    out += "</span>" + open() + esc(rest); }
  return out.replace(/\n/g, "<br>") + "</span>";
}
function fieldHtml(f) {
  const v = pval(f), id = "p-" + f.k, a = `data-prop="${f.k}" data-orig="${esc(f.t === "motd" ? motdDisp(v) : v)}"`, h = f.h ? `<div class="k hint" id="${id}-h">${f.h}</div>` : "";
  if (f.t === "bool") return `<div class="pf">${sw({ attrs: a + ` id="${id}"`, on: v === "true", label: f.l, hint: f.h })}</div>`;
  if (f.t === "inv") return `<div class="pf">${sw({ attrs: a + ` data-inv="1" id="${id}"`, on: v === "false", label: f.l, hint: f.h })}</div>`;
  if (f.t === "sel") { const o = f.o.includes(v) ? f.o : f.o.concat([v]); return `<div class="pf"><label class="fld" for="${id}">${f.l}</label><select id="${id}" ${a}>${o.map((x) => `<option value="${esc(x)}" ${x === v ? "selected" : ""}>${esc(f.lab && f.lab[x] || x)}</option>`).join("")}</select>${h}</div>`; }
  if (f.t === "num") return `<div class="pf"><label class="fld" for="${id}">${f.l}</label><div class="step"><button type="button" class="btn" data-do="step" data-d="-1" aria-label="Decrease ${esc(f.l)}">&minus;</button><input id="${id}" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" step="${f.step || 1}" ${a} value="${esc(v)}"><button type="button" class="btn" data-do="step" data-d="1" aria-label="Increase ${esc(f.l)}">+</button></div>${h}</div>`;
  if (f.t === "motd") return `<div class="pf wide"><label class="fld" for="${id}">${f.l}</label><input id="${id}" ${a} value="${esc(motdDisp(v))}" autocomplete="off" spellcheck="false"><div class="swatches" role="group" aria-label="Insert colour code">${Object.keys(MC).map((c) => `<button type="button" class="sq" data-do="mcol" data-c="${c}" style="background:${MC[c]}" aria-label="Colour ${c}"></button>`).join("")}<button type="button" class="btn sm" data-do="mcol" data-c="l"><b>B</b></button><button type="button" class="btn sm" data-do="mcol" data-c="o"><i>I</i></button><button type="button" class="btn sm" data-do="mcol" data-c="r">Reset</button></div><div class="motd" id="motdp" aria-label="MOTD preview">${motdHtml(v)}</div>${h}</div>`;
  return `<div class="pf"><label class="fld" for="${id}">${f.l}</label><input id="${id}" ${a} value="${esc(v)}" autocomplete="off" spellcheck="false">${h}</div>`;
}
const propVal = (el) => el.type === "checkbox" ? (el.dataset.inv ? (el.checked ? "false" : "true") : (el.checked ? "true" : "false")) : el.value;
function changedProps() { const o = {}; $$("[data-prop]").forEach((el) => { const ch = el.type === "checkbox" ? el.checked !== el.defaultChecked : el.value !== el.dataset.orig; if (ch) o[el.dataset.prop] = el.dataset.prop === "motd" ? motdSave(el.value) : propVal(el); }); return o; }
function updChg() { const c = changedProps(), k = Object.keys(c), e = $("#chg"); if (!e) return; e.innerHTML = k.length ? `${ic("edit")}<b>${k.length} changed:</b> ${k.map((x) => `<code>${esc(x)}</code>`).join(" ")}` : `<span class="k">No changes yet.</span>`; $$("[data-do=saveProps]").forEach((b) => { b.disabled = !k.length; }); }

/* ---------- tabs ---------- */
const TB = {};
TB.overview = () => { const s = srv() || {};
  return `<div id="ov-stats" class="grid g4">${ovStats(s)}</div>
<div class="grid g2" style="margin-top:14px"><section class="card"><h3>${ic("globe")}Join addresses</h3><div id="ov-addr">${addrHtml(s)}</div>${isJava() ? `<div class="row" id="ov-share" style="margin:10px 0">${s.join ? `<button class="btn" data-do="share" data-c="unshare" data-n="${D.n}">Turn off internet link</button>` : `<button class="btn p" data-do="share" data-c="share" data-n="${D.n}" ${s.state === "running" ? "" : "disabled"}>${ic("globe")}Get a free internet link</button>`}</div><div>${B.crackedSw(s)}</div>` : `<p class="k">Bedrock servers share by local network only.</p>`}</section>
<section class="card"><h3>${ic("terminal")}Console</h3><pre id="logbox" class="log" tabindex="0" aria-label="Server log">...</pre><div class="row" style="margin-top:8px"><input id="cmdin" data-keep placeholder="console: type a command (say hi, op Name, whitelist add Name...) and press Enter" aria-label="Console command" style="flex:1;min-width:200px" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn p" data-do="cmd" data-n="${D.n}">${ic("next")}Send</button></div><pre id="cmdout" class="k"></pre></section></div>`; };
const ovStats = (s) => { const lim = s.mem_limit || D.conf.mem || 0, on = s.state === "running";
  return `<div class="card stat">${ic("heartbeat", "big-ic")}<div><div class="k">Status</div><div class="big">${stBadge(s.state || "unknown")}</div><div class="k">${esc(B.jt(s))}</div></div></div>
<div class="card stat">${ring(on ? s.cpu : 0, on ? s.cpu + "%" : "-", "CPU", "var(--ind)")}<div><div class="k">CPU</div><div class="big">${on ? s.cpu + "%" : "-"}</div><div class="k">${D.conf.cpus ? "limit " + D.conf.cpus + " cores" : "no limit"}</div></div></div>
<div class="card stat">${ring(on && lim ? s.ram / lim * 100 : 0, on && lim ? Math.round(s.ram / lim * 100) + "%" : "-", "Memory", "var(--y)")}<div><div class="k">Memory</div><div class="big">${on ? gb(s.ram) : "-"}</div><div class="k">limit ${lim ? gb(lim) : "none"}</div></div></div>
<div class="card stat">${ic("footprint", "big-ic")}<div><div class="k">Players</div><div class="big">${s.players == null ? "-" : s.players} <small>${s.max_players ? "/ " + s.max_players : ""}</small></div><div class="k">${isJava() ? "online now" : "Java servers only"}</div></div></div>`; };
async function logs(force) { if (B.cur.page !== "server" || B.cur.t !== "overview") return; const r = await api("a=logs&n=" + D.n), b = $("#logbox"); if (!b) return; const near = b.scrollHeight - b.scrollTop - b.clientHeight < 40 || force; const tx = r.ok ? r.logs : r.error; if (b.textContent !== tx) { b.textContent = tx; if (near) b.scrollTop = b.scrollHeight; } }
B.ACT.cmd = async () => { const i = $("#cmdin"), c = i.value.trim(); if (!c) return; i.value = ""; const o = $("#cmdout"); o.textContent = "> " + c; const r = await api("a=cmd&n=" + D.n + "&c=" + enc(c)); o.textContent = "> " + c + "\n" + (r.ok ? (r.out || "(no output)") : r.error); logs(true); };
document.addEventListener("keydown", (e) => { if (e.target.id === "cmdin" && e.key === "Enter") { e.preventDefault(); B.ACT.cmd(); } });

TB.settings = () => {
  if (!D.propsOk) return `<div class="card">${B.empty("No settings file yet", "The server creates server.properties the first time it starts. Start it once, wait a minute, then come back.", srv() && srv().state !== "running" ? `<button class="btn p" data-do="ctl" data-c="start" data-n="${D.n}">${ic("play")}Start server</button>` : "")}</div>`;
  const run = srv() && srv().state === "running";
  return `<form id="sform" onsubmit="return false">${(isJava() ? SCHEMA_J : SCHEMA_B).map((g) => `<section class="card pgroup"><h3>${ic(g.i)}${g.g}</h3><div class="pgrid">${g.f.map(fieldHtml).join("")}</div></section>`).join("")}
<div class="savebar" role="region" aria-label="Save settings"><div id="chg" class="chg"><span class="k">No changes yet.</span></div><div class="row"><button class="btn p" type="button" data-do="saveProps" data-r="1" disabled>${ic("save")}${run ? "Save and restart now" : "Save"}</button>${run ? `<button class="btn" type="button" data-do="saveProps" data-r="0" disabled title="The server is stopped while the file is written and stays stopped until you start it.">Save and leave stopped</button>` : ""}</div></div></form>
<p class="k">Settings apply after a restart. Other lines of server.properties can be edited under <a href="#server/${D.n}/files">Files</a>.</p>`; };
B.ACT.step = (t) => { const i = t.parentElement.querySelector("input"); const st = +i.step || 1, d = +t.dataset.d; let v = (parseFloat(i.value) || 0) + st * d; if (i.min !== "") v = Math.max(+i.min, v); if (i.max !== "") v = Math.min(+i.max, v); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); };
B.ACT.mcol = (t) => { const i = $("#p-motd"), c = t.dataset.c, p = i.selectionStart == null ? i.value.length : i.selectionStart; i.value = i.value.slice(0, p) + "§" + c + i.value.slice(i.selectionEnd == null ? p : i.selectionEnd); i.focus(); i.setSelectionRange(p + 2, p + 2); i.dispatchEvent(new Event("input", { bubbles: true })); };
document.addEventListener("input", (e) => { const t = e.target; if (t.dataset && t.dataset.prop) { if (t.id === "p-motd") $("#motdp").innerHTML = motdHtml(t.value); updChg(); } });
document.addEventListener("change", (e) => { if (e.target.dataset && e.target.dataset.prop) updChg(); });
B.ACT.saveProps = async (t) => {
  const props = changedProps(); if (!Object.keys(props).length) return;
  if ("online-mode" in props) props["enforce-secure-profile"] = props["online-mode"];
  const bad = Object.entries(props).find(([k, v]) => /[\r\n]/.test(v)); if (bad) return toast("Line breaks are not allowed in " + bad[0], 1);
  const r = await api("a=setprops&n=" + D.n, { props, restart: t.dataset.r !== "0" }); if (!r.ok) return toast(r.error, 1);
  toast(t.dataset.r === "0" ? "Saved. Start the server when you are ready." : "Saved. The server restarts now."); await reload(); await B.tick(); TAB();
};

TB.resources = () => { const c = D.conf, j = isJava(), hi = B.HI || {}, max = Math.min(j ? 16384 : 4096, Math.max(c.mem || 1024, Math.floor((hi.mem_total_mb || 8192) / 256) * 256)), s = srv() || {}, avail = (hi.mem_avail_mb || 0) + (s.state === "running" ? s.ram || 0 : 0), cores = hi.cores || (B.S && B.S.cores) || 4;
  const env = Object.entries(c.env || {});
  return `<div class="notice warn">${ic("warn")}<div><b>Saving here recreates the server container.</b> The world and all files are kept, but the server restarts and players are disconnected for a minute.</div></div>
<div class="grid g2s" style="margin-top:14px"><div class="stack"><section class="card"><h3>${ic("volcano")}Memory and CPU</h3>
${fld(`Memory <output id="r-memv" class="k">${gb(c.mem)}</output>`, `<input id="r-mem" type="range" min="512" max="${max}" step="256" value="${clamp(c.mem, 512, max)}" data-out="r-memv" data-fmt="gb">`)}<div id="r-fit">${fitBar(j ? javaNeed(c.mem) : 700, avail, keepFree())}</div>
${fld(`CPU limit <output id="r-cpuv" class="k">${c.cpus ? (+c.cpus).toFixed(1) + " cores" : "unlimited"}</output>`, `<input id="r-cpu" type="range" min="0" max="${cores}" step="0.5" value="${c.cpus || 0}" data-out="r-cpuv" data-fmt="cpu">`, "0 means no limit.")}</section>
${j ? `<section class="card"><h3>${ic("chip")}Java options</h3><div class="fld">Garbage collection flags</div><div class="seg" role="radiogroup" aria-label="JVM flags">${[["aikar", "Aikar (recommended)"], ["default", "Default"], ["custom", "Custom"]].map((x) => `<label><input type="radio" name="r-jvm" value="${x[0]}" ${c.jvm === x[0] ? "checked" : ""}><span>${x[1]}</span></label>`).join("")}</div>
<div id="r-jvmc" ${c.jvm === "custom" ? "" : "hidden"}>${fld("Custom JVM flags", `<textarea id="r-jvmt" rows="3" class="sel" spellcheck="false" maxlength="400" placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=200">${esc(c.jvm_custom || "")}</textarea>`, "Memory flags (-Xmx, -Xms) are set from the memory slider.")}</div>
${D.conf.flavor === "paper" ? `<div style="margin-top:12px">${sw({ attrs: 'id="r-cross"', on: !!c.cross, label: "Crossplay (Bedrock players can join)", hint: "Phones and consoles join through the extra Bedrock port." })}</div>` : ""}</section>` : ""}</div>
<div class="stack"><section class="card"><h3>${ic("restart")}Restarts</h3>${sw({ attrs: 'id="r-auto"', on: c.auto_restart !== false, label: "Start automatically", hint: "Bring the server back after a crash or when the machine starts." })}
${fld("Restart every (hours, 0 = never)", `<input id="r-every" type="number" min="0" max="168" value="${c.restart_every_h || 0}" style="max-width:120px">`, "Players get a 30 second warning.")}</section>
<section class="card"><h3>${ic("list")}Environment variables</h3><p class="k" style="margin-top:0">Extra variables for the container, for example <code>TZ</code> or <code>VIEW_DISTANCE</code>.</p><table class="env"><thead><tr><th>Name</th><th>Value</th><th></th></tr></thead><tbody id="envb">${env.map((e) => envRow(e[0], e[1])).join("")}</tbody></table><button class="btn sm" data-do="envadd" style="margin-top:8px">${ic("plus")}Add variable</button></section></div></div>
<div class="savebar"><div class="k">Applies by recreating the container. World kept.</div><div class="row"><button class="btn p" data-do="saveRes">${ic("save")}Save and recreate</button></div></div>`; };
const envRow = (k, v) => `<tr><td><input data-envk value="${esc(k)}" aria-label="Variable name" placeholder="NAME" spellcheck="false"></td><td><input data-envv value="${esc(v)}" aria-label="Variable value" spellcheck="false"></td><td><button class="btn sm d" data-do="envdel" aria-label="Remove variable">${ic("trash")}</button></td></tr>`;
B.ACT.envadd = () => { $("#envb").insertAdjacentHTML("beforeend", envRow("", "")); $("#envb tr:last-child input").focus(); };
B.ACT.envdel = (t) => t.closest("tr").remove();
document.addEventListener("input", (e) => { if (e.target.id === "r-mem") { const s = srv() || {}, hi = B.HI || {}, avail = (hi.mem_avail_mb || 0) + (s.state === "running" ? s.ram || 0 : 0), m = +e.target.value; $("#r-fit").innerHTML = fitBar(isJava() ? javaNeed(m) : 700, avail, keepFree()); } });
document.addEventListener("change", (e) => { if (e.target.name === "r-jvm") $("#r-jvmc").hidden = e.target.value !== "custom"; });
B.ACT.saveRes = async () => {
  const env = {}, bad = []; $$("#envb tr").forEach((tr) => { const k = $("[data-envk]", tr).value.trim(), v = $("[data-envv]", tr).value; if (!k) return; if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) bad.push(k); env[k] = v; });
  if (bad.length) return toast("Variable names use letters, digits and _ only: " + bad[0], 1);
  const conf = { mem: +$("#r-mem").value, cpus: +$("#r-cpu").value, auto_restart: $("#r-auto").checked, restart_every_h: clamp(parseInt($("#r-every").value, 10) || 0, 0, 168), env };
  if (isJava()) { conf.jvm = ($("input[name=r-jvm]:checked") || {}).value || "aikar"; conf.jvm_custom = $("#r-jvmt") ? $("#r-jvmt").value : ""; if ($("#r-cross")) conf.cross = $("#r-cross").checked; }
  if (!(await ask({ title: "Recreate the container?", body: "The server restarts with the new limits. The world and files are kept.", ok: "Save and recreate" }))) return;
  const r = await api("a=setsrvconf&n=" + D.n, { conf }); toast(r.ok ? "Saved. The server is restarting." : r.error, !r.ok); if (r.ok) { await reload(); await B.tick(); TAB(); }
};

const LISTS = [["whitelist", "Whitelist", "user", "Players allowed to join when the whitelist is on."], ["ops", "Operators", "crown", "Players who can run admin commands."], ["banned-players", "Banned players", "fang", "Cannot join until pardoned."], ["banned-ips", "Banned IPs", "meteor", "Addresses that cannot connect."]];
TB.players = () => { const s = srv() || {}, on = s.state === "running";
  return `<section class="card"><h3>${ic("footprint")}Online now</h3><div id="pl-${D.n}" class="k">${on ? "loading..." : "Start the server to see players."}</div></section>
${on ? "" : `<div class="notice">${ic("info")}<div>Adding or removing names works while the server is running, because it uses the server console.</div></div>`}
<div class="grid g2" style="margin-top:14px">${LISTS.map((l) => `<section class="card"><h3>${ic(l[2])}${l[1]}</h3><p class="k" style="margin-top:0">${l[3]}${l[0] === "whitelist" ? ` Whitelist is <b>${unesc(D.props["white-list"]) === "true" ? "on" : "off"}</b> (change it in Settings).` : ""}</p><div id="ls-${l[0]}" class="chips">loading...</div><div class="row" style="margin-top:10px"><input id="la-${l[0]}" placeholder="${l[0] === "banned-ips" ? "1.2.3.4" : "player name"}" aria-label="Add to ${l[1]}" style="flex:1;min-width:140px" autocomplete="off" spellcheck="false"><button class="btn p" data-do="ladd" data-l="${l[0]}">${ic("plus")}Add</button></div></section>`).join("")}</div>`; };
async function fillList(l) { const r = await api(`a=list&n=${D.n}&l=${l}`), e = document.getElementById("ls-" + l); if (!e) return; e.innerHTML = r.ok ? (r.entries.length ? r.entries.map((x) => `<span class="chip">${esc(x.name)}${x.reason && x.reason !== "Banned by an operator." ? `<span class="k"> (${esc(x.reason)})</span>` : ""}<button class="btn sm d" data-do="ldel" data-l="${l}" data-p="${esc(x.name)}" aria-label="Remove ${esc(x.name)}">${ic("x")}</button></span>`).join("") : `<span class="k">Empty.</span>`) : esc(r.error); }
B.ACT.ladd = async (t) => { const i = $("#la-" + t.dataset.l), p = i.value.trim(); if (!p) return i.focus(); const r = await api(`a=listadd&n=${D.n}&l=${t.dataset.l}&p=${enc(p)}`); if (!r.ok) return toast(r.error, 1); i.value = ""; fillList(t.dataset.l); };
B.ACT.ldel = async (t) => { const r = await api(`a=listdel&n=${D.n}&l=${t.dataset.l}&p=${enc(t.dataset.p)}`); if (!r.ok) return toast(r.error, 1); fillList(t.dataset.l); };
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id && e.target.id.startsWith("la-")) { e.preventDefault(); const b = $(`[data-do=ladd][data-l=${e.target.id.slice(3)}]`); if (b) b.click(); } });

TB.plugins = () => { const s = srv() || { name: D.n };
  return `<section class="card"><h3>${ic("fern")}${modWord()}</h3>${B.pluginBlock(s, D.conf.flavor)}</section><div class="notice" style="margin-top:14px">${ic("info")}<div>Only install ${modWord().toLowerCase()} from sources you trust. Find them on <a href="https://modrinth.com" target="_blank" rel="noopener">Modrinth</a>, <a href="https://hangar.papermc.io" target="_blank" rel="noopener">Hangar</a> or GitHub releases, and paste the direct .jar link.</div></div>`; };

/* ---------- files ---------- */
const BIN = /\.(jar|zip|gz|tar|png|jpe?g|gif|webp|ico|dat|dat_old|mca|mcc|nbt|so|dll|exe|bin|ogg|mp3|wav|7z|rar|lock|db|sqlite)$/i;
const jp = (a, b) => (a === "/" ? "" : a.replace(/\/$/, "")) + "/" + b;
async function loadDir(p) { D.path = p || "/"; D.edit = null; const r = await api(`a=ls&n=${D.n}&p=${enc(D.path)}`); if (!r.ok) { toast(r.error, 1); if (D.path !== "/") return loadDir("/"); } D.entries = r.ok ? r.entries : []; D.path = r.ok ? r.path : "/"; filesDraw(); }
const crumbs = () => { const seg = D.path.split("/").filter(Boolean); let acc = ""; return `<nav class="crumbs" aria-label="Folder path"><button class="lnk" data-do="cd" data-p="/">${ic("nest")}${esc(D.n)}</button>${seg.map((s) => { acc += "/" + s; return `<span aria-hidden="true">/</span><button class="lnk" data-do="cd" data-p="${esc(acc)}">${esc(s)}</button>`; }).join("")}</nav>`; };
TB.files = () => `<section class="card" id="fbox"><p class="k">loading...</p></section>`;
function filesDraw() {
  const box = $("#fbox"); if (!box) return;
  if (D.edit) { box.innerHTML = `<div class="row between"><h3>${ic("edit")}${esc(D.edit.p)}</h3><span class="k" id="edst"></span></div><textarea id="ed" class="sel code" spellcheck="false" aria-label="File contents">${esc(D.edit.text)}</textarea><div class="row" style="margin-top:10px"><button class="btn p" data-do="fsave">${ic("save")}Save</button><button class="btn" data-do="fclose">Close</button><span class="k">Most files take effect after a server restart.</span></div>`; $("#ed").focus(); return; }
  box.innerHTML = `${crumbs()}<div class="row" style="margin:10px 0"><label class="btn p filebtn">${ic("upload")}Upload files<input type="file" multiple data-fup hidden></label><button class="btn" data-do="mkdir">${ic("folder")}New folder</button><button class="btn" data-do="newfile">${ic("file")}New file</button><span class="k" id="fup" role="status"></span></div>
<table class="rt files"><thead><tr><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead><tbody>${D.path !== "/" ? `<tr><td data-l="Name"><button class="lnk" data-do="cd" data-p="${esc(D.path.replace(/\/[^/]*$/, "") || "/")}">${ic("back")}..</button></td><td></td><td></td><td></td></tr>` : ""}${D.entries.map((e) => { const p = jp(D.path, e.name), can = !e.dir && e.size <= 512 * 1024 && !BIN.test(e.name);
    return `<tr><td data-l="Name">${e.dir ? `<button class="lnk" data-do="cd" data-p="${esc(p)}">${ic("folder")}${esc(e.name)}</button>` : `${can ? `<button class="lnk" data-do="fopen" data-p="${esc(p)}">${ic("file")}${esc(e.name)}</button>` : `<span class="fn">${ic("file")}${esc(e.name)}</span>`}`}</td><td data-l="Size">${e.dir ? "" : fsize(e.size)}</td><td data-l="Modified">${e.mtime ? ago(e.mtime) : ""}</td><td class="acts">${can ? `<button class="btn sm" data-do="fopen" data-p="${esc(p)}">${ic("edit")}Edit</button>` : ""}${e.dir ? "" : `<a class="btn sm" href="/cgi-bin/api?a=get&n=${D.n}&p=${enc(p)}" download="${esc(e.name)}">${ic("download")}Download</a>`}<button class="btn sm d" data-do="frm" data-p="${esc(p)}" data-dir="${e.dir ? 1 : ""}" aria-label="Delete ${esc(e.name)}">${ic("trash")}</button></td></tr>`; }).join("") || `<tr><td colspan="4" class="k">This folder is empty.</td></tr>`}</tbody></table>`;
}
B.ACT.cd = (t) => loadDir(t.dataset.p);
B.ACT.fopen = async (t) => { const r = await api(`a=cat&n=${D.n}&p=${enc(t.dataset.p)}`); if (!r.ok) return toast(r.error, 1); D.edit = { p: t.dataset.p, text: r.content }; filesDraw(); };
B.ACT.fsave = async () => { const r = await api("a=write&n=" + D.n, { p: D.edit.p, content: $("#ed").value }); if (!r.ok) return toast(r.error, 1); D.edit.text = $("#ed").value; $("#edst").textContent = "Saved"; toast("Saved " + D.edit.p); };
B.ACT.fclose = () => loadDir(D.edit.p.replace(/\/[^/]*$/, "") || "/");
B.ACT.mkdir = async () => { const v = await ask({ title: "New folder", icon: "folder", input: "", label: "Folder name", ok: "Create", max: 80 }); if (!v) return; if (/[\\/]/.test(v)) return toast("No slashes in a folder name", 1); const r = await api(`a=mkdir&n=${D.n}&p=${enc(jp(D.path, v))}`); toast(r.ok ? "Folder created" : r.error, !r.ok); loadDir(D.path); };
B.ACT.newfile = async () => { const v = await ask({ title: "New file", icon: "file", input: "", label: "File name", ok: "Create", max: 80 }); if (!v) return; if (/[\\/]/.test(v)) return toast("No slashes in a file name", 1); D.edit = { p: jp(D.path, v), text: "" }; filesDraw(); };
B.ACT.frm = async (t) => { if (!(await ask({ title: "Delete " + t.dataset.p.split("/").pop() + "?", body: t.dataset.dir ? "The folder and everything in it will be deleted. This cannot be undone." : "This file will be deleted. This cannot be undone.", ok: "Delete", danger: 1 }))) return; const r = await api(`a=rm&n=${D.n}&p=${enc(t.dataset.p)}`); toast(r.ok ? "Deleted" : r.error, !r.ok); loadDir(D.path); };
document.addEventListener("keydown", (e) => { if (e.target.id === "ed" && (e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); B.ACT.fsave(); } });
document.addEventListener("input", (e) => { if (e.target.id === "ed" && $("#edst")) $("#edst").textContent = "Unsaved changes"; });
document.addEventListener("change", async (e) => {
  const t = e.target; if (t.dataset && t.dataset.fup !== undefined) { const m = $("#fup"), fl = [...t.files]; let n = 0;
    for (const f of fl) { if (f.size > 150 * 1048576) { toast(f.name + " is bigger than 150 MB", 1); continue; } m.textContent = `Uploading ${f.name} (${++n}/${fl.length})...`; const r = await api(`a=put&n=${D.n}&p=${enc(jp(D.path, f.name))}`, f); if (!r.ok) toast(r.error, 1); }
    t.value = ""; m.textContent = ""; loadDir(D.path); }
});

/* ---------- backups ---------- */
TB.backups = () => { const c = D.conf;
  return `<section class="card"><div class="row between"><h3>${ic("fossil")}Backups</h3><button class="btn p" data-do="bknow">${ic("fossil")}Back up now</button></div><div id="bklist"><p class="k">loading...</p></div></section>
<section class="card" style="margin-top:14px"><h3>${ic("clock")}Schedule</h3><div class="row">${fld("Back up every (hours, 0 = never)", `<input id="bk-h" type="number" min="0" max="168" value="${c.backup_every_h || 0}" style="max-width:120px">`)}${fld("Keep the newest", `<input id="bk-k" type="number" min="1" max="50" value="${c.backup_keep || 5}" style="max-width:120px">`)}</div><div class="row" style="margin-top:10px"><button class="btn p" data-do="bksave">${ic("save")}Save schedule</button><span class="k">Saving recreates the server container (world kept). Safety backups made before a restore are never deleted automatically.</span></div></section>`; };
async function fillBackups() { const r = await api("a=backups&n=" + D.n), e = $("#bklist"); if (!e) return; if (!r.ok) { e.innerHTML = esc(r.error); return; }
  e.innerHTML = r.backups.length ? `<table class="rt"><thead><tr><th>Backup</th><th>Size</th><th>Taken</th><th></th></tr></thead><tbody>${r.backups.map((b) => { const tag = (b.file.match(/-(auto|pre-[a-z-]+)\.tar\.gz$/) || [])[1];
    return `<tr><td data-l="Backup"><code>${esc(b.file)}</code>${tag ? ` <span class="st off">${esc(tag)}</span>` : ""}</td><td data-l="Size">${fsize(b.size)}</td><td data-l="Taken">${ago(b.mtime)}</td><td class="acts"><button class="btn sm" data-do="bkrestore" data-f="${esc(b.file)}">${ic("restart")}Restore</button><a class="btn sm" href="/cgi-bin/api?a=dlbackup&n=${D.n}&f=${enc(b.file)}" download="${esc(b.file)}">${ic("download")}Download</a><button class="btn sm d" data-do="bkdel" data-f="${esc(b.file)}" aria-label="Delete ${esc(b.file)}">${ic("trash")}</button></td></tr>`; }).join("")}</tbody></table>` : B.empty("No backups yet", "Press Back up now to save the world."); }
B.ACT.bknow = async () => { const r = await api("a=backup&n=" + D.n); toast(r.ok ? "Backup saved: " + r.file : r.error, !r.ok); fillBackups(); };
B.ACT.bkrestore = async (t) => { if (!(await ask({ title: "Restore this backup?", body: `The server stops, a safety backup of the current world is made, then <code>${esc(t.dataset.f)}</code> is restored.`, ok: "Restore", danger: 1 }))) return; const r = await api(`a=restore&n=${D.n}&f=${enc(t.dataset.f)}`); toast(r.ok ? "Restored. Start the server when ready." : r.error, !r.ok); fillBackups(); await B.tick(); };
B.ACT.bkdel = async (t) => { if (!(await ask({ title: "Delete this backup?", body: "<code>" + esc(t.dataset.f) + "</code> is removed for good.", ok: "Delete", danger: 1 }))) return; const r = await api(`a=delbackup&n=${D.n}&f=${enc(t.dataset.f)}`); toast(r.ok ? "Deleted" : r.error, !r.ok); fillBackups(); };
B.ACT.bksave = async () => { const r = await api("a=setsrvconf&n=" + D.n, { conf: { backup_every_h: clamp(parseInt($("#bk-h").value, 10) || 0, 0, 168), backup_keep: clamp(parseInt($("#bk-k").value, 10) || 5, 1, 50) } }); toast(r.ok ? "Schedule saved" : r.error, !r.ok); if (r.ok) await reload(); };

/* ---------- version ---------- */
const FL = [["paper", "Paper", "Fast, plugins, recommended"], ["vanilla", "Vanilla", "Plain Mojang server"], ["fabric", "Fabric", "Light mods"], ["forge", "Forge", "Big mod packs"]];
const verOpts = (flavor, cur) => { const v = B.VL; if (!v) return `<option value="LATEST">LATEST</option>`; const list = isJava() ? ["LATEST"].concat(v.java.filter((x) => { const m = +x.split(".")[1] || 99; return flavor === "paper" ? m >= 8 : flavor === "fabric" ? m >= 14 : true; })) : v.bedrock; return list.map((x) => `<option value="${esc(x)}" ${x === cur ? "selected" : ""}>${x === "LATEST" && v.latest && isJava() ? "Latest (" + esc(v.latest) + ")" : esc(x)}</option>`).join(""); };
TB.version = async () => { await B.loadVL(); const c = D.conf;
  return `<section class="card"><h3>${ic("chip")}Version</h3><p>Now running: <b>${esc(B.jt(srv() || c))}</b></p><div class="notice">${ic("info")}<div>A backup is taken automatically before switching. Going to an older version can break a world that was already opened in a newer one, so keep that backup.</div></div>
${isJava() ? `<div class="fld">Software</div><div class="tiles sm" role="radiogroup" aria-label="Software">${FL.map((f) => `<label class="tile"><input type="radio" name="v-fl" value="${f[0]}" ${c.flavor === f[0] ? "checked" : ""}><b>${f[1]}</b><small>${f[2]}</small></label>`).join("")}</div>` : ""}
<label class="fld">Version<select id="v-ver" style="max-width:260px">${verOpts(c.flavor, c.version)}</select></label>
<div class="row" style="margin-top:12px"><button class="btn p" data-do="setver">${ic("restart")}Back up and switch</button></div></section>`; };
document.addEventListener("change", (e) => { if (e.target.name === "v-fl") { const s = $("#v-ver"), cur = s.value; s.innerHTML = verOpts(e.target.value, cur); } });
B.ACT.setver = async () => { const fl = isJava() ? ($("input[name=v-fl]:checked") || {}).value : "", ver = $("#v-ver").value;
  if (!(await ask({ title: "Switch to " + (fl ? fl + " " : "") + ver + "?", body: "A backup is taken first, then the server container is recreated. This can take a few minutes.", ok: "Switch version", danger: 1 }))) return;
  const r = await api(`a=setversion&n=${D.n}&ver=${enc(ver)}&flavor=${fl}`); toast(r.ok ? "Version switched. The server is starting." : r.error, !r.ok); if (r.ok) { await reload(); await B.tick(); TAB(); } };

/* ---------- danger zone ---------- */
TB.danger = () => `<div class="stack"><section class="card"><h3>${ic("edit")}Rename</h3><div class="row"><input id="d-ren" value="${esc(D.n)}" maxlength="24" aria-label="New name" style="flex:1;min-width:160px"><button class="btn" data-do="ren">Rename</button></div><p class="k">The server restarts under the new name. Lowercase letters, digits and dashes.</p></section>
<section class="card"><h3>${ic("copy")}Clone</h3><div class="row"><input id="d-clone" value="${esc(D.n)}-copy" maxlength="24" aria-label="Name of the copy" style="flex:1;min-width:160px"><button class="btn" data-do="clone">Clone</button></div><p class="k">Copies the world and settings into a new, stopped server. The server is stopped briefly while it is copied.</p></section>
<section class="card danger"><h3>${ic("meteor")}Delete this server</h3><p>This removes <b>${esc(D.n)}</b> and its world from this machine. Backups are kept.</p><button class="btn d" data-do="del" data-n="${D.n}">${ic("trash")}Delete server...</button></section></div>`;
B.ACT.ren = async () => { const to = $("#d-ren").value.trim().toLowerCase(); if (!NAME_RE.test(to)) return toast("Use 2-24 lowercase letters, digits or dashes", 1); if (to === D.n) return;
  if (!(await ask({ title: "Rename to " + to + "?", body: "The server restarts.", ok: "Rename" }))) return; const r = await api(`a=rename&n=${D.n}&to=${to}`); toast(r.ok ? "Renamed" : r.error, !r.ok); if (r.ok) { await B.tick(); location.hash = "#server/" + to + "/danger"; } };
B.ACT.clone = async () => { const to = $("#d-clone").value.trim().toLowerCase(); if (!NAME_RE.test(to)) return toast("Use 2-24 lowercase letters, digits or dashes", 1); const r = await api(`a=clone&n=${D.n}&to=${to}`); toast(r.ok ? "Cloned to " + to : r.error, !r.ok); if (r.ok) { await B.tick(); location.hash = "#server/" + to; } };
B.ACT.del = async (t) => { const n = t.dataset.n; if (!(await ask({ title: "Delete " + n + "?", body: "The server and its world are removed from this machine. This cannot be undone. Backups are kept.", typed: n, ok: "Delete server", danger: 1 }))) return; const r = await api("a=delete&n=" + n); toast(r.ok ? "Deleted " + n : r.error, !r.ok); if (r.ok) { location.hash = "#servers"; await B.tick(); } };

/* ---------- page shell ---------- */
async function reload() { const r = await api("a=srvconf&n=" + D.n); if (r.ok) { D.conf = r.conf || {}; D.props = r.props || {}; D.propsOk = !!r.props_available; } return r; }
const headHtml = () => { const s = srv(); if (!s) return ""; const a = addrList(s)[0];
  return `<div class="shead"><div class="sh-main"><a class="btn sm" href="#servers" aria-label="Back to servers">${ic("back")}Servers</a><span class="sh-name"><b>${esc(s.name)}</b></span>${stBadge(s.state)}<span class="k">${esc(B.jt(s))}</span>${a ? `<code>${esc(a.v)}</code><button class="btn sm" data-do="copy" data-v="${esc(a.v)}" aria-label="Copy address">${ic("copy")}</button>` : ""}</div><div class="row">${B.ctlBtns(s)}</div></div>`; };
const tabsHtml = () => `<div class="tabs" role="tablist" aria-label="Server sections">${TABS().map((t) => `<a role="tab" href="#server/${D.n}/${t[0]}" aria-selected="${B.cur.t === t[0]}" ${B.cur.t === t[0] ? 'class="on"' : ""}>${ic(t[2])}<span>${t[1]}</span></a>`).join("")}</div>`;
async function TAB() {
  const t = TABS().some((x) => x[0] === B.cur.t) ? B.cur.t : "overview", tok = ++D.tok; if (D.n !== B.cur.n) return;
  const body = $("#tabbody"); if (!body) return; body.setAttribute("aria-label", t);
  const html = await TB[t](); if (tok !== D.tok) return; body.innerHTML = html;
  if (t === "overview") logs(true); if (t === "settings") updChg(); if (t === "players") { const s = srv(); if (s) B.fillPlayers(s); LISTS.forEach((l) => fillList(l[0])); }
  if (t === "plugins") { const s = srv(); if (s && D.conf.flavor !== "vanilla") B.fillPlugins(s); } if (t === "files") loadDir(D.path); if (t === "backups") fillBackups();
  if (t === "resources" && !B.HI) B.loadHI().then(() => { if (B.cur.t === "resources" && $("#tabbody")) TAB(); });
}
B.server = { refreshHead() { const h = $("#sh-head"); if (h) h.innerHTML = headHtml(); } };
B.pages.server = {
  async show() {
    const n = B.cur.n; D.tok = 0; if (D.n !== n) D = { n, conf: {}, props: {}, propsOk: false, path: "/", tok: 0 };
    if (!srv()) { B.setView(`<div class="card">${B.empty("No server called " + esc(n), "It may have been deleted or renamed.", `<a class="btn p" href="#servers">Back to servers</a>`)}</div>`, true); return; }
    const [r] = await Promise.all([reload(), B.loadHI()]); if (B.cur.n !== n) return;
    if (!r.ok) { B.setView(`<div class="card"><div class="msg err">${esc(r.error)}</div></div>`, true); return; }
    B.setView(`<div id="sh-head" class="card sticky">${headHtml()}</div>${tabsHtml()}<div id="tabbody" role="tabpanel"></div>`, true); TAB();
  },
  live() {
    const s = srv(); if (!s) return; const h = $("#sh-head"); if (h) { const x = headHtml(); if (h.dataset.h !== x) { h.innerHTML = x; h.dataset.h = x; } }
    if (B.cur.t === "overview") { const o = $("#ov-stats"); if (o) { const x = ovStats(s); if (o.dataset.h !== x) { o.innerHTML = x; o.dataset.h = x; } } const a = $("#ov-addr"); if (a) { const x = addrHtml(s); if (a.dataset.h !== x) { a.innerHTML = x; a.dataset.h = x; } }
      const sh = $("#ov-share"); if (sh && !B.typing()) { const x = s.join ? "u" : "s" + (s.state === "running"); if (sh.dataset.h !== x) { sh.dataset.h = x; sh.innerHTML = s.join ? `<button class="btn" data-do="share" data-c="unshare" data-n="${D.n}">Turn off internet link</button>` : `<button class="btn p" data-do="share" data-c="share" data-n="${D.n}" ${s.state === "running" ? "" : "disabled"}>${ic("globe")}Get a free internet link</button>`; } }
      const ck = $("[data-a=cracked]"); if (ck && document.activeElement !== ck) ck.checked = !!s.cracked; logs(); }
  } };
