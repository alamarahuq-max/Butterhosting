#!/usr/bin/env node
// ButterOS home screen: a plain monospace terminal screen (works on the console, over SSH or a serial cable).
// Preview: BUTTER_DEMO=1 BUTTER_SNAPSHOT=html|ansi COLS=110 ROWS=36 [BUTTER_SCREEN=login|new|logs|power] node tui.js
const fs = require("fs"), cp = require("child_process"), crypto = require("crypto");
const { H, D, local, agent, demo, api } = require("./data");
const DEMO = process.env.BUTTER_DEMO === "1", SNAP = process.env.BUTTER_SNAPSHOT;
const COLS = +process.env.COLS || process.stdout.columns || 100, ROWS = +process.env.ROWS || process.stdout.rows || 32;
if (!SNAP && (!process.stdin.isTTY || COLS < 80 || ROWS < 24)) process.exit(3);

// ---- palette (re-programmed into the console's 16 colors) ----
const PAL = ["0a0a1c", "ff6b6b", "5ef2b0", "ffd23f", "23235a", "2e2e6e", "7dd3fc", "f1f1ff", "9a9acb", "ff6b6b", "5ef2b0", "ffd23f", "5b8cff", "c792ea", "7dd3fc", "ffffff"];
const N = { bg: 0, red: 1, grn: 2, yel: 3, chip: 4, rule: 5, cyn: 6, txt: 7, mut: 8 };
const fg = (i) => "\x1b[" + (i < 8 ? 30 + i : 90 + i - 8) + "m", bgc = (i) => "\x1b[" + (i < 8 ? 40 + i : 100 + i - 8) + "m", R0 = "\x1b[0m" + fg(N.txt) + bgc(N.bg), B = "\x1b[1m";
const c = (col, s) => fg(col) + s + fg(N.txt);
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const vlen = (s) => [...strip(s)].length;
const pad = (s, n) => s + " ".repeat(Math.max(0, n - vlen(s)));
const cut = (s, n) => (vlen(s) > n ? [...s].slice(0, n - 1).join("") + "~" : s);

// ---- accounts ----
const USERF = process.env.BUTTER_USERS || "/etc/butter-users.json";
let users = [{ name: "Claude", role: "Admin" }]; try { const j = JSON.parse(fs.readFileSync(USERF, "utf8")); if (Array.isArray(j.users) && j.users.length) users = j.users; } catch (e) {}
const hashpw = (salt, pw) => crypto.createHash("sha256").update(salt + pw).digest("hex");

// ---- state ----
let screen = process.env.BUTTER_NOLOGIN || (DEMO && !process.env.BUTTER_SCREEN) ? "home" : (process.env.BUTTER_SCREEN === "login" ? "login" : "login");
if (DEMO && ["new", "logs", "power", "home"].includes(process.env.BUTTER_SCREEN)) screen = "home";
let sel = 0, cu = 0, pw = "", lerr = "", msg = "", msgT = 0, modal = null, ver = null, logs = [], power = false;
const toast = (s) => { msg = s; msgT = Date.now() + 6000; };
const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB/s" : b >= 1e3 ? Math.round(b / 1e3) + " KB/s" : Math.round(b) + " B/s");
const upf = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + "h " + m + "m" : m + "m"; };
const meter = (v, n, col) => { const k = Math.max(0, Math.min(n, Math.round((v / 100) * n))); return fg(col) + "\u2588".repeat(k) + fg(N.rule) + "\u2591".repeat(n - k) + fg(N.txt); };

const LOGO = ["  ____        _   _             ___  ____  ", " | __ ) _   _| |_| |_ ___ _ __ / _ \\/ ___| ", " |  _ \\| | | | __| __/ _ \\ '__| | | \\___ \\ ", " | |_) | |_| | |_| ||  __/ |  | |_| |___) |", " |____/ \\__,_|\\__|\\__\\___|_|   \\___/|____/ "];


// circular gauge: half-block characters give twice the vertical detail, so it really looks round. Fills clockwise from the top.
function ring(pct, col, big, small, RW, RH) {
  RW = RW || 11; RH = RH || 5; const PH = RH * 2, cx = (RW - 1) / 2, cy = (PH - 1) / 2, Rr = Math.min(RW, PH) / 2, p = Math.max(0, Math.min(100, pct)) / 100;
  const pix = (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy); if (r > Rr || r < Rr - 1.8) return 0; let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2; return a / (Math.PI * 2) <= p ? 1 : 2; };
  const colr = (v) => (v === 1 ? col : N.rule), rows = [];
  for (let i = 0; i < RH; i++) { const cells = []; for (let j = 0; j < RW; j++) { const t = pix(j, 2 * i), bt = pix(j, 2 * i + 1);
    if (!t && !bt) cells.push(" "); else if (t && bt && t === bt) cells.push(fg(colr(t)) + "█"); else if (t && bt) cells.push(fg(colr(t)) + bgc(colr(bt)) + "▀" + bgc(N.bg)); else if (t) cells.push(fg(colr(t)) + "▀"); else cells.push(fg(colr(bt)) + "▄"); } rows.push(cells); }
  const put = (row, txt, bold) => { const chars = [...txt], st = Math.max(0, Math.floor((RW - chars.length) / 2)); chars.forEach((ch, k) => { if (st + k < RW) rows[row][st + k] = (bold ? B : "") + fg(N.txt) + bgc(N.bg) + ch + R0; }); };
  put(Math.floor(RH / 2), big, true);
  return rows.map((r) => r.join("") + R0);
}
function rule(w) { return c(N.rule, "\u2500".repeat(w)); }
function hostname() { try { return fs.readFileSync("/etc/hostname", "utf8").trim() || "butter-box"; } catch (e) { return "butter-box"; } }
function home(W, Hh) {
  const L = [], ind = "  ", inner = W - 4;
  L.push("");
  LOGO.forEach((l, i) => L.push(ind + B + c(N.yel, l) + (i === 0 ? c(N.mut, " " + users[cu].name.toLowerCase()) : "") + R0));
  L.push(ind + rule(inner));
  const running = D.servers.filter((s) => s.state === "running"), players = running.reduce((a, s) => a + (+s.players || 0), 0);
  const tempPct = D.temp == null ? 0 : Math.max(0, Math.min(100, (D.temp - 20) * 100 / 80));
  if (Hh >= 30) {
    const left = [c(N.mut, "machine ") + hostname(), c(N.mut, "network ") + (D.ip ? c(N.grn, "\u25a0 online") : c(N.red, "\u25a0 offline")), "         " + (D.ip || c(N.mut, "press w for Wi-Fi")), c(N.mut, "manage  ") + (D.ip ? c(N.cyn, "http://" + D.ip) : c(N.mut, "-")), "",
      c(N.mut, "down    ") + kb(D.rx), c(N.mut, "up      ") + kb(D.tx), c(N.mut, "load    ") + D.load.split(" ")[0] + c(N.mut, "  (" + D.cores + " cores)"), c(N.mut, "uptime  ") + upf(D.up)];
    const r1 = ring(D.cpu, N.cyn, D.cpu.toFixed(0) + "%", "CPU"), r2 = ring(100 * D.memUsed / D.memTotal, N.yel, (100 * D.memUsed / D.memTotal).toFixed(0) + "%", "MEMORY"), r3 = ring(tempPct, D.temp > 80 ? N.red : N.grn, D.temp == null ? "n/a" : D.temp.toFixed(0) + "\u00b0C", "TEMP");
    for (let i = 0; i < 5; i++) L.push(ind + pad(left[i] || "", 36) + r1[i] + "   " + r2[i] + "   " + r3[i]);
    const cap = (t) => { t = cut(t, 11); const l = Math.floor((11 - [...t].length) / 2); return " ".repeat(l) + pad(t, 11 - l); }; L.push(ind + pad(left[5] || "", 36) + c(N.mut, cap("CPU")) + "   " + c(N.mut, cap("MEMORY")) + "   " + c(N.mut, cap("TEMP"))); L.push(ind + pad(left[6] || "", 36) + c(N.mut, cap(D.cores + " cores")) + "   " + c(N.mut, cap(Math.round(D.memUsed) + "/" + Math.round(D.memTotal) + "M")) + "   " + c(N.mut, cap(D.temp == null ? "no sensor" : (D.tempLabel || "sensor").toLowerCase())));
  } else {
    const left = [c(N.mut, "machine ") + hostname(), c(N.mut, "network ") + (D.ip ? c(N.grn, "\u25a0 online") + " " + D.ip : c(N.red, "\u25a0 no network") + c(N.mut, "  (press w for Wi-Fi)")), c(N.mut, "manage  ") + (D.ip ? c(N.cyn, "http://" + D.ip) : c(N.mut, "-"))];
    const right = [c(N.mut, "cpu  ") + pad(D.cpu.toFixed(0) + "%", 5) + meter(D.cpu, 14, N.cyn), c(N.mut, "mem  ") + pad(Math.round(D.memUsed) + "/" + Math.round(D.memTotal) + "M", 11) + meter(100 * D.memUsed / D.memTotal, 8, N.yel), c(N.mut, "temp ") + (D.temp == null ? c(N.mut, "no sensor") : pad(D.temp.toFixed(0) + "\u00b0C", 5) + meter(tempPct, 14, D.temp > 80 ? N.red : N.grn)) + c(N.mut, "   net ") + "\u2193 " + kb(D.rx) + " \u2191 " + kb(D.tx)];
    const half = Math.floor(inner * 0.46); for (let i = 0; i < 3; i++) L.push(ind + pad(left[i], half) + right[i]);
  }
  L.push(ind + rule(inner));
  L.push(ind + c(N.mut, "SERVERS") + c(N.mut, "   " + running.length + " running, " + players + " player" + (players === 1 ? "" : "s") + " online, up " + upf(D.up)));
  if (!D.servers.length) L.push(ind + c(N.mut, D.agentOk || DEMO ? "  No servers yet. Press n to make one." : "  Starting the server engine. The first start takes a minute..."));
  const maxRows = Math.max(1, Hh - L.length - 9);
  D.servers.slice(0, maxRows).forEach((s, i) => {
    const on = i === sel, run = s.state === "running", kind = (s.type === "bedrock" ? "bedrock" : "java " + (s.flavor || "paper")) + " " + (s.version || "latest").toString().toLowerCase();
    const addr = s.join || (D.ip && s.port ? D.ip + ":" + s.port : "-");
    const line = (on ? c(N.yel, "> ") : "  ") + c(run ? N.grn : N.mut, "\u25a0") + " " + (on ? B : "") + pad(cut(String(s.name), 14), 15) + R0 + c(N.mut, pad(cut(kind, 24), 25)) + (run ? pad((s.players == null ? 0 : s.players) + " players", 12) : c(N.mut, pad(s.state || "stopped", 12))) + (s.join ? c(N.cyn, addr) : c(N.txt, addr));
    L.push(ind + line);
  });
  L.push(ind + rule(inner));
  L.push(ind + (Date.now() < msgT ? c(N.yel, msg) : c(N.mut, "Hosting Minecraft Java and Bedrock, nothing else.")));
  L.push(ind + rule(inner));
  const keys = [["n", "new server"], ["s", "start/stop"], ["d", "delete"], ["l", "console"], ["k", "cracked"], ["1", "play with friends"], ["w", "wi-fi"], ["i", "install"], ["a", "password"], ["x", "shell"], ["p", "power"]];
  let row = ind, rows = [];
  keys.forEach(([k, t]) => { const chip = bgc(N.chip) + c(N.yel, " " + k + " ") + R0 + " " + t + "  "; if (vlen(row) + vlen(chip) > W - 2) { rows.push(row); row = ind; } row += chip; }); rows.push(row);
  rows.forEach((r) => L.push(r));
  L.push("");
  L.push(ind + c(N.grn, "butter@" + hostname()) + ":" + c(N.cyn, "~") + "$ " + c(N.mut, "(up/down choose a server, press a key above)"));
  return L;
}
function login(W, Hh) {
  const L = [""]; const ind = " ".repeat(Math.max(2, Math.floor((W - 46) / 2)));
  L.push(""); LOGO.forEach((l) => L.push(ind + B + c(N.yel, l) + R0)); L.push("");
  L.push(ind + c(N.mut, "butter-box  " + (D.ip || "no network")) + "   " + new Date().toTimeString().slice(0, 5)); L.push("");
  if (users.length > 1) { L.push(ind + c(N.txt, "Who is hosting today?")); users.slice(0, 4).forEach((u, i) => L.push(ind + (i === cu ? c(N.yel, "> ") : "  ") + (i === cu ? B : "") + pad(u.name, 12) + R0 + c(N.mut, u.role || ""))); L.push(ind + c(N.mut, "  Up/Down to choose  (Tab)")); L.push(""); }
  const us = users[cu] || users[0];
  L.push(ind + c(N.mut, "account  ") + B + us.name + R0 + c(N.mut, "  " + (us.role || "Admin")));
  L.push(ind + c(N.mut, "password ") + (pw ? "*".repeat(pw.length) : c(N.mut, us.hash ? "" : "(none set, press Enter)")) + c(N.yel, "\u2588"));
  L.push(""); L.push(ind + (lerr ? c(N.red, lerr) : c(N.mut, "Enter to log in    F1/Ctrl-P power")));
  return L;
}
function overlay(L, W, Hh, title, lines, w) {
  w = Math.min(W - 4, w || 64); const x = Math.floor((W - w) / 2), y = Math.max(1, Math.floor((Hh - lines.length - 4) / 2));
  const box = [c(N.yel, "\u250c\u2500 ") + B + title + R0 + c(N.yel, " " + "\u2500".repeat(Math.max(0, w - 5 - vlen(title))) + "\u2510")];
  lines.forEach((l) => box.push(c(N.yel, "\u2502") + " " + pad(l, w - 4) + " " + c(N.yel, "\u2502"))); box.push(c(N.yel, "\u2514" + "\u2500".repeat(w - 2) + "\u2518"));
  box.forEach((bl, i) => { const row = y + i; while (L.length <= row) L.push(""); L[row] = " ".repeat(x) + bgc(N.bg) + bl + R0; });
}
function newBox() {
  const m = modal, jl = ["LATEST"].concat(ver ? ver.java : []), bl = ver ? ver.bedrock : ["LATEST"], list = m.type === "bedrock" ? bl : jl, sw = m.type === "bedrock" ? "bedrock (official)" : m.flavor;
  const row = (i, k, v, arrows) => (m.f === i ? c(N.yel, "> ") : "  ") + c(N.mut, pad(k, 10)) + (m.f === i ? B : "") + (arrows && m.f === i ? "< " + v + " >" : v) + R0;
  const vv = String(list[m.vi] || "LATEST").toLowerCase();
  return [row(0, "name", m.name + (m.f === 0 ? c(N.yel, "\u2588") : "")), row(1, "game", m.type === "java" ? "minecraft java" : "minecraft bedrock", 1), row(2, "software", sw, m.type === "java"), row(3, "version", vv, 1), "",
    m.err ? c(N.red, cut(m.err, 56)) : c(N.mut, !ver ? "loading the version list..." : m.type === "java" && m.flavor === "paper" ? "Paper runs 1.8 and newer. Older: pick vanilla." : "Any version. Mods: use fabric or forge."), "", c(N.mut, m.busy ? "creating... (the first start downloads the game)" : "arrows change   Tab next   Enter create   Esc cancel")];
}
function view(W, Hh) {
  let L;
  if (screen === "login") L = login(W, Hh); else L = home(W, Hh);
  if (screen === "home") {
    if (modal && modal.t === "new") overlay(L, W, Hh, "NEW SERVER", newBox(), 64);
    else if (modal && modal.t === "logs") overlay(L, W, Hh, "LOGS  " + modal.name, logs.slice(-(Hh - 13)).map((x) => cut(x.replace(/\x1b\[[0-9;]*m/g, ""), W - 12)).concat(["", c(N.mut, cut(modal.out || "", W - 12)), c(N.yel, "> ") + modal.cmd + c(N.yel, "_"), c(N.mut, "type a server command + Enter  |  Esc to close")]), W - 6);
    else if (modal && modal.t === "pw") overlay(L, W, Hh, "PASSWORD for " + users[cu].name, [c(N.mut, "new password (empty = no password)"), "*".repeat(modal.pw.length) + c(N.yel, "\u2588"), "", c(N.mut, "Enter save   Esc cancel")], 50);
  }
  if (power) overlay(L, W, Hh, "POWER", ["", c(N.yel, " y ") + " shut down", c(N.yel, " r ") + " restart", c(N.yel, " l ") + " lock screen", c(N.yel, " esc") + " cancel", ""], 36);
  return L;
}
function frame() { const L = view(COLS, ROWS); let out = "\x1b[H"; for (let i = 0; i < ROWS; i++) out += (L[i] || "") + "\x1b[K\n"; return out.replace(/\n$/, ""); }

// ---- snapshot / preview ----
function toHtml(s) { const cols = { 0: "#0a0a1c", 1: "#ff6b6b", 2: "#5ef2b0", 3: "#ffd23f", 4: "#23235a", 5: "#2e2e6e", 6: "#7dd3fc", 7: "#f1f1ff", 8: "#9a9acb", 9: "#ff6b6b", 10: "#5ef2b0", 11: "#ffd23f", 12: "#5b8cff", 13: "#c792ea", 14: "#7dd3fc", 15: "#fff" };
  let out = "", f = "#f1f1ff", b = "", bold = false; const re = /\x1b\[([0-9;]*)m|\x1b\[[HK]|([^\x1b])/g; let m;
  while ((m = re.exec(s))) { if (m[2] !== undefined) { const ch = m[2] === "<" ? "&lt;" : m[2] === ">" ? "&gt;" : m[2] === "&" ? "&amp;" : m[2]; out += ch === "\n" ? "\n" : '<span style="color:' + f + (b ? ";background:" + b : "") + (bold ? ";font-weight:700" : "") + '">' + ch + "</span>"; }
    else if (m[1] !== undefined) m[1].split(";").forEach((x) => { x = +x; if (x === 0) { f = "#f1f1ff"; b = ""; bold = false; } else if (x === 1) bold = true; else if (x >= 30 && x <= 37) f = cols[x - 30]; else if (x >= 90 && x <= 97) f = cols[x - 90 + 8]; else if (x >= 40 && x <= 47) b = x === 40 ? "" : cols[x - 40]; else if (x >= 100) b = cols[x - 100 + 8]; }); }
  return '<pre style="margin:0;padding:18px;background:#0a0a1c;font:17px/1.3 \'DejaVu Sans Mono\',monospace;width:' + COLS * 10.4 + 'px">' + out + "</pre>"; }
if (SNAP) {
  if (DEMO) { demo(); if (process.env.BUTTER_EMPTY) D.servers = []; if (process.env.BUTTER_SCREEN === "new") { ver = { java: ["1.21.4", "1.20.4", "1.16.5", "1.8.9"], bedrock: ["LATEST", "PREVIEW"] }; modal = { t: "new", name: "world4", type: "java", flavor: "paper", vi: 0, f: 3 }; } if (process.env.BUTTER_SCREEN === "logs") { modal = { t: "logs", name: "survival" }; logs = ["[12:01:12] [Server thread/INFO]: Done (8.214s)! For help, type \"help\"", "[12:03:40] [Server thread/INFO]: Steve joined the game", "[12:04:02] [Server thread/INFO]: <Steve> hello", "[12:05:17] [Server thread/INFO]: Alex joined the game"]; } if (process.env.BUTTER_SCREEN === "power") power = true; if (process.env.BUTTER_SCREEN === "login") screen = "login"; }
  const f = frame(); fs.writeSync(1, SNAP === "html" ? toHtml(f) : f + "\n"); process.exit(0);
}

// ---- actions ----
function external(cmd) { stop(); try { process.stdout.write("\x1b[2J\x1b[H\x1b[?25h" + R0); cp.spawnSync("/bin/sh", ["-c", cmd], { stdio: "inherit" }); } catch (e) {} start(); }
function openNew() { modal = { t: "new", name: "world" + (D.servers.length + 1), type: "java", flavor: "paper", vi: 0, f: 0, err: "", busy: false }; if (!ver) api("a=versions", (j) => { if (j && j.ok) ver = j; }, 25000); }
function create() { const m = modal; if (m.busy) return; m.busy = true; m.err = ""; const list = m.type === "bedrock" ? (ver ? ver.bedrock : ["LATEST"]) : ["LATEST"].concat(ver ? ver.java : []), v = list[m.vi] || "LATEST";
  api("a=create&n=" + encodeURIComponent(m.name) + "&type=" + m.type + "&mem=1024&ver=" + encodeURIComponent(v) + "&flavor=" + (m.type === "bedrock" ? "paper" : m.flavor), (j) => { m.busy = false; if (j && j.ok) { modal = null; toast("server " + m.name + " is starting"); agent(); } else m.err = (j && j.error) || "could not create"; render(); }, 300000); }
function toggle(s) { if (!s) return; const a = s.state === "running" ? "stop" : "start"; toast((a === "stop" ? "stopping " : "starting ") + s.name + "..."); api("a=" + a + "&n=" + encodeURIComponent(s.name), (j) => { toast(j && j.ok ? "done" : (j && j.error) || "failed"); agent(); render(); }, 90000); }
function remove(s) { if (!s) return; toast("removing " + s.name + "..."); api("a=delete&n=" + encodeURIComponent(s.name), (j) => { toast(j && j.ok ? "removed" : (j && j.error) || "failed"); agent(); render(); }, 90000); }
function key(k) {
  if (power) { power = false; if (k === "y") cp.exec("poweroff"); else if (k === "r") cp.exec("reboot"); else if (k === "l") { screen = "login"; pw = ""; lerr = ""; } return; }
  if (screen === "login") {
    if (k === "\x10" || k === "f1") { power = true; return; }
    if (k === "up" || k === "tab") { if (users.length > 1) { cu = (cu + (k === "up" ? users.length - 1 : 1)) % users.length; pw = ""; lerr = ""; } return; }
    if (k === "down") { cu = (cu + 1) % users.length; pw = ""; return; }
    if (k === "bs") { pw = pw.slice(0, -1); return; }
    if (k === "enter") { const us = users[cu]; if (!us.hash || hashpw(us.salt || "", pw) === us.hash) { screen = "home"; pw = ""; lerr = ""; toast("welcome, " + us.name); } else { lerr = "Wrong password, try again"; pw = ""; } return; }
    if (k.length === 1 && k >= " " && pw.length < 40) { pw += k; lerr = ""; } return; }
  if (modal) { const m = modal;
    if (m.t === "pw") { if (k === "esc") modal = null; else if (k === "enter") { const us = users[cu]; if (m.pw) { us.salt = crypto.randomBytes(8).toString("hex"); us.hash = hashpw(us.salt, m.pw); } else { delete us.hash; delete us.salt; } try { fs.writeFileSync(USERF, JSON.stringify({ users })); toast(m.pw ? "password saved" : "password removed"); } catch (e) { toast("could not save"); } modal = null; } else if (k === "bs") m.pw = m.pw.slice(0, -1); else if (k.length === 1 && k >= " " && m.pw.length < 40) m.pw += k; return; }
    if (m.t === "logs") { if (k === "esc") modal = null; else if (k === "enter") { const cm = m.cmd.trim(); if (cm) { m.out = "running..."; m.cmd = ""; api("a=cmd&n=" + encodeURIComponent(m.name) + "&c=" + encodeURIComponent(cm), (j) => { m.out = j ? (j.ok ? String(j.out || "(no output)").split("\n")[0] : j.error) : "no answer"; api("a=logs&n=" + encodeURIComponent(m.name), (l) => { logs = String((l && l.logs) || "").split("\n"); render(); }, 20000); render(); }, 20000); } } else if (k === "bs") m.cmd = m.cmd.slice(0, -1); else if (k.length === 1 && k >= " " && m.cmd.length < 150) m.cmd += k; return; }
    if (k === "esc") modal = null; else if (k === "enter") create();
    else if (k === "up" || k === "btab") m.f = (m.f + 3) % 4; else if (k === "down" || k === "tab") m.f = (m.f + 1) % 4;
    else if (k === "left" || k === "right") { const d = k === "left" ? -1 : 1; if (m.f === 1) { m.type = m.type === "java" ? "bedrock" : "java"; m.vi = 0; } else if (m.f === 2 && m.type === "java") { const o = ["paper", "vanilla", "fabric", "forge"]; m.flavor = o[(o.indexOf(m.flavor) + d + 4) % 4]; } else if (m.f === 3) { const n = m.type === "bedrock" ? (ver ? ver.bedrock.length : 1) : 1 + (ver ? ver.java.length : 0); m.vi = (m.vi + d + n) % n; } }
    else if (m.f === 0) { if (k === "bs") m.name = m.name.slice(0, -1); else if (/^[A-Za-z0-9-]$/.test(k) && m.name.length < 24) m.name += k; }
    return; }
  const s = D.servers[sel];
  if (k === "up") sel = Math.max(0, sel - 1); else if (k === "down") sel = Math.min(Math.max(0, D.servers.length - 1), sel + 1);
  else if (k === "n") openNew(); else if (k === "s" || k === "enter") toggle(s); else if (k === "d" || k === "del") remove(s);
  else if (k === "k" && s) { if (s.type !== "java") toast("cracked mode is for Java servers"); else api("a=cracked&n=" + encodeURIComponent(s.name) + "&v=" + (s.cracked ? 0 : 1), (j) => { toast(j && j.ok ? (j.cracked ? "cracked mode ON, restarting" : "cracked mode OFF, restarting") : (j && j.error) || "failed"); agent(); }, 30000); }
  else if (k === "l" && s) { modal = { t: "logs", name: s.name, cmd: "", out: "" }; logs = ["loading..."]; api("a=logs&n=" + encodeURIComponent(s.name), (j) => { logs = String((j && j.logs) || "no log yet").split("\n"); render(); }, 20000); }
  else if (k === "1") external("/usr/local/bin/butter-play; printf '\\nPress Enter '; read x");
  else if (k === "w") external("/usr/local/bin/butter-wifi"); else if (k === "i") external("/usr/local/bin/butter-install; printf '\\nPress Enter '; read x");
  else if (k === "a") modal = { t: "pw", pw: "" }; else if (k === "x") external("echo 'ButterOS shell. Type exit to come back.'; /bin/sh -l"); else if (k === "p") power = true; else if (k === "q") { /* stay */ }
}
const KEYS = { "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[3~": "del", "\x1b[Z": "btab", "\r": "enter", "\n": "enter", "\t": "tab", "\x7f": "bs", "\b": "bs", "\x1b": "esc", "\x1bOP": "f1", "\x1b[[A": "f1" };
function onData(d) { const s = d.toString("latin1"), k = KEYS[s] || (s.length === 1 ? s : null); if (!k) return; const raw = screen === "login" || (modal && (modal.t === "logs" || modal.t === "pw" || (modal.t === "new" && modal.f === 0))) || k.length > 1; key(raw ? k : k.toLowerCase()); render(); }
let timer = null;
function render() { process.stdout.write(frame()); }
function start() { try { process.stdin.setRawMode(true); } catch (e) {} process.stdin.resume(); process.stdin.on("data", onData); process.stdout.write(PAL.map((h, i) => "\x1b]P" + i.toString(16) + h).join("") + R0 + "\x1b[2J\x1b[?25l"); render(); }
function stop() { process.stdin.removeListener("data", onData); try { process.stdin.setRawMode(false); } catch (e) {} }
process.on("exit", () => { try { process.stdout.write("\x1b[?25h\x1b[0m\x1b[2J\x1b[H"); } catch (e) {} }); process.on("SIGTERM", () => process.exit(0)); process.stdout.on("resize", render);
local(); agent(); start(); timer = setInterval(() => { local(); render(); }, 1000); setInterval(agent, 4000);
