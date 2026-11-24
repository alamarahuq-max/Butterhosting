#!/usr/bin/env node
// ButterOS home screen: a plain monospace terminal screen (works on the console, over SSH or a serial cable).
// Also runs as the terminal screen of the Butter app on Linux/macOS/Windows (BUTTER_APP=1, started by `butter`): no login, no
// Wi-Fi/power keys, API port from BUTTER_PORT. Without BUTTER_APP it behaves exactly like the ButterOS screen.
// Preview: BUTTER_DEMO=1 BUTTER_SNAPSHOT=html|ansi COLS=110 ROWS=36 [BUTTER_SCREEN=login|new|logs|power] node tui.js
const fs = require("fs"), cp = require("child_process"), crypto = require("crypto"), path = require("path");
const { H, D, local, agent, demo, api, apiPost, PORT } = require("./data");
const APP = !!process.env.BUTTER_APP;
const DEMO = process.env.BUTTER_DEMO === "1", SNAP = process.env.BUTTER_SNAPSHOT;
let COLS = +process.env.COLS || process.stdout.columns || 100, ROWS = +process.env.ROWS || process.stdout.rows || 32;
if (!SNAP && !process.stdin.isTTY) { if (APP) console.error("The Butter screen needs a real terminal. In scripts use: butter status"); process.exit(3); }
if (!SNAP && !APP && (COLS < 80 || ROWS < 24)) process.exit(3);

// ---- palette (re-programmed into the console's 16 colors) ----
const PAL = ["0a0a1c", "ff6b6b", "5ef2b0", "ffd23f", "23235a", "2e2e6e", "7dd3fc", "f1f1ff", "9a9acb", "ff6b6b", "5ef2b0", "ffd23f", "5b8cff", "c792ea", "7dd3fc", "ffffff"];
const N = { bg: 0, red: 1, grn: 2, yel: 3, chip: 4, rule: 5, cyn: 6, txt: 7, mut: 8 };
// the app uses exact colours where the terminal has 24-bit colour, else the terminal's own 16 colours
const TRUE = APP && !SNAP && (/truecolor|24bit/i.test(process.env.COLORTERM || "") || !!process.env.WT_SESSION || /iTerm|vscode|WezTerm/i.test(process.env.TERM_PROGRAM || ""));
const rgb = (i) => [0, 2, 4].map((k) => parseInt(PAL[i].slice(k, k + 2), 16)).join(";");
const fg = (i) => (TRUE ? "\x1b[38;2;" + rgb(i) + "m" : "\x1b[" + (i < 8 ? 30 + i : 90 + i - 8) + "m"), bgc = (i) => (TRUE ? "\x1b[48;2;" + rgb(i) + "m" : "\x1b[" + (i < 8 ? 40 + i : 100 + i - 8) + "m"), R0 = "\x1b[0m" + fg(N.txt) + bgc(N.bg), B = "\x1b[1m";
const c = (col, s) => fg(col) + s + fg(N.txt);
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const vlen = (s) => [...strip(s)].length;
const pad = (s, n) => s + " ".repeat(Math.max(0, n - vlen(s)));
const cut = (s, n) => (vlen(s) > n ? [...s].slice(0, n - 1).join("") + "~" : s);

// ---- accounts ----
const USERF = process.env.BUTTER_USERS || "/etc/butter-users.json";
let users = [{ name: "admin", role: "Admin" }]; try { const j = JSON.parse(fs.readFileSync(USERF, "utf8")); if (Array.isArray(j.users) && j.users.length) users = j.users; } catch (e) {}
const hashpw = (salt, pw) => crypto.createHash("sha256").update(salt + pw).digest("hex");

// ---- state ----
let screen = APP || process.env.BUTTER_NOLOGIN || (DEMO && !process.env.BUTTER_SCREEN) ? "home" : (process.env.BUTTER_SCREEN === "login" ? "login" : "login");
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
function hostname() { if (APP) return String(D.machine || require("os").hostname() || "butter").slice(0, 24); try { return fs.readFileSync("/etc/hostname", "utf8").trim() || "butter-box"; } catch (e) { return "butter-box"; } }
const webUrl = () => (APP ? "http://localhost:" + PORT : D.ip ? "http://" + D.ip : "");
const dockerTxt = () => (!D.docker ? c(N.mut, "checking...") : D.docker.running ? c(N.grn, "running " + (D.docker.version || "")) : D.docker.installed ? c(N.red, "not running") : c(N.red, "not installed"));
const hostTxt = () => (D.commercial && D.commercial.enabled ? c(N.grn, "on (" + (D.commercial.state || "?") + ")") : c(N.mut, "off"));
function appNotice() { // what to tell the user when the app cannot do its job yet
  if (D.agentDown && !D.agentOk) return [c(N.red, "  Cannot reach the Butter agent on port " + PORT + "."), c(N.mut, "  Run: butter restart     (log: butter logs)")];
  if (D.docker && !D.docker.running) {
    const win = D.platform === "win32" || D.platform === "darwin";
    return [c(N.red, "  Docker is not " + (D.docker.installed ? "running." : "installed.")), c(N.mut, "  Servers run in Docker, so nothing can start until it works."),
      c(N.mut, D.docker.installed ? (win ? "  Open Docker Desktop and wait until it says it is running." : "  Start it: sudo systemctl start docker   (if it is running, log in again so your user is in the docker group)") : "  Install it with:  butter docker")];
  }
  return [];
}
function home(W, Hh) {
  const L = [], ind = "  ", inner = W - 4;
  if (sel >= D.servers.length) sel = Math.max(0, D.servers.length - 1);
  const srvRam = D.servers.reduce((a, s) => a + (+s.ram || 0), 0), srvPct = Math.min(100, 100 * srvRam / (D.memTotal || 1));
  L.push("");
  LOGO.forEach((l, i) => L.push(ind + B + c(N.yel, l) + (i === 0 ? c(N.mut, " " + (APP ? "app" : users[cu].name.toLowerCase())) : "") + R0));
  L.push(ind + rule(inner));
  const running = D.servers.filter((s) => s.state === "running"), players = running.reduce((a, s) => a + (+s.players || 0), 0);
  const tempPct = D.temp == null ? 0 : Math.max(0, Math.min(100, (D.temp - 20) * 100 / 80));
  if (Hh >= 30) {
    const left = [c(N.mut, "machine ") + hostname(), c(N.mut, "network ") + (D.ip ? c(N.grn, "\u25a0 online") : c(N.red, "\u25a0 offline")), "         " + (D.ip || (APP ? "" : c(N.mut, "press w for Wi-Fi"))), c(N.mut, "manage  ") + (webUrl() ? c(N.cyn, webUrl()) : c(N.mut, "-")), ""].concat(APP ? [c(N.mut, "docker  ") + dockerTxt(), c(N.mut, "hosting ") + hostTxt(), c(N.mut, "load    ") + D.load.split(" ")[0] + c(N.mut, "  (" + D.cores + " cores)"), c(N.mut, "uptime  ") + upf(D.up)] :
      [c(N.mut, "down    ") + kb(D.rx), c(N.mut, "up      ") + kb(D.tx), c(N.mut, "load    ") + D.load.split(" ")[0] + c(N.mut, "  (" + D.cores + " cores)"), c(N.mut, "uptime  ") + upf(D.up)]);
    const r1 = ring(D.cpu, N.cyn, D.cpu.toFixed(0) + "%", "CPU"), r2 = ring(100 * D.memUsed / D.memTotal, N.yel, (100 * D.memUsed / D.memTotal).toFixed(0) + "%", "MEMORY"), r3 = APP ? ring(srvPct, N.grn, srvPct.toFixed(0) + "%", "SERVERS") : ring(tempPct, D.temp > 80 ? N.red : N.grn, D.temp == null ? "n/a" : D.temp.toFixed(0) + "\u00b0C", "TEMP");
    for (let i = 0; i < 5; i++) L.push(ind + pad(left[i] || "", 36) + r1[i] + "   " + r2[i] + "   " + r3[i]);
    const cap = (t) => { t = cut(t, 11); const l = Math.floor((11 - [...t].length) / 2); return " ".repeat(l) + pad(t, 11 - l); }; L.push(ind + pad(left[5] || "", 36) + c(N.mut, cap("CPU")) + "   " + c(N.mut, cap("MEMORY")) + "   " + c(N.mut, cap(APP ? "SERVERS" : "TEMP"))); L.push(ind + pad(left[6] || "", 36) + c(N.mut, cap(D.cores + " cores")) + "   " + c(N.mut, cap(Math.round(D.memUsed) + "/" + Math.round(D.memTotal) + "M")) + "   " + c(N.mut, cap(APP ? Math.round(srvRam) + "M" : D.temp == null ? "no sensor" : (D.tempLabel || "sensor").toLowerCase())));
  } else {
    const left = [c(N.mut, "machine ") + hostname(), c(N.mut, "network ") + (D.ip ? c(N.grn, "\u25a0 online") + " " + D.ip : c(N.red, "\u25a0 no network") + (APP ? "" : c(N.mut, "  (press w for Wi-Fi)"))), c(N.mut, "manage  ") + (webUrl() ? c(N.cyn, webUrl()) : c(N.mut, "-"))];
    const right = [c(N.mut, "cpu  ") + pad(D.cpu.toFixed(0) + "%", 5) + meter(D.cpu, 14, N.cyn), c(N.mut, "mem  ") + pad(Math.round(D.memUsed) + "/" + Math.round(D.memTotal) + "M", 11) + meter(100 * D.memUsed / D.memTotal, 8, N.yel), (APP ? c(N.mut, "srvs ") + pad(Math.round(srvRam) + "M", 5) + meter(srvPct, 14, N.grn) + c(N.mut, "   docker ") + dockerTxt() : c(N.mut, "temp ") + (D.temp == null ? c(N.mut, "no sensor") : pad(D.temp.toFixed(0) + "\u00b0C", 5) + meter(tempPct, 14, D.temp > 80 ? N.red : N.grn)) + c(N.mut, "   net ") + "\u2193 " + kb(D.rx) + " \u2191 " + kb(D.tx))];
    const half = Math.floor(inner * 0.46); for (let i = 0; i < 3; i++) L.push(ind + pad(left[i], half) + right[i]);
  }
  L.push(ind + rule(inner));
  L.push(ind + c(N.mut, "SERVERS") + c(N.mut, "   " + running.length + " running, " + players + " player" + (players === 1 ? "" : "s") + " online, up " + upf(D.up)));
  const note = APP && !DEMO ? appNotice() : [];
  if (note.length) note.forEach((x) => L.push(ind + x));
  else if (!D.servers.length) L.push(ind + c(N.mut, D.agentOk || DEMO ? "  No servers yet. Press n to make one." : "  Starting the server engine. The first start takes a minute..."));
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
  const keys = APP ? [["n", "new server"], ["s", "start/stop"], ["d", "delete"], ["l", "console"], ["k", "cracked"], ["1", "join addresses"], ["c", "host commercially"], ["o", "web page"], ["q", "quit"]]
    : [["n", "new server"], ["s", "start/stop"], ["d", "delete"], ["l", "console"], ["k", "cracked"], ["1", "play with friends"], ["c", "commercial"], ["o", "web page"], ["w", "wi-fi"], ["i", "install"], ["a", "password"], ["x", "shell"], ["p", "power"]];
  let row = ind, rows = [];
  keys.forEach(([k, t]) => { const chip = bgc(N.chip) + c(N.yel, " " + k + " ") + R0 + " " + t + "  "; if (vlen(row) + vlen(chip) > W - 2) { rows.push(row); row = ind; } row += chip; }); rows.push(row);
  rows.forEach((r) => L.push(r));
  L.push("");
  L.push(ind + c(N.grn, "butter@" + hostname()) + ":" + c(N.cyn, "~") + "$ " + c(N.mut, APP ? "(up/down choose a server, press a key above, Ctrl+C quits)" : "(up/down choose a server, press a key above)"));
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
function coBox() {
  const m = modal, i = m.info || {}, st = i.state || "off", row = (n, k, v, arrows) => (m.f === n ? c(N.yel, "> ") : "  ") + c(N.mut, pad(k, 13)) + (m.f === n ? B : "") + (arrows && m.f === n ? "< " + v + " >" : v) + R0;
  const stc = st === "online" ? N.grn : st === "error" || st === "offline" ? N.red : N.mut;
  return [row(0, "host others", m.on ? c(N.grn, "ON") : "off", 1), row(1, "wallet", (m.wallet || (m.f === 1 ? "" : c(N.mut, "(none yet)"))) + (m.f === 1 ? c(N.yel, "\u2588") : "")), row(2, "RAM to share", m.ram + " MB", 1), row(3, "max servers", String(m.srv), 1), "",
    c(N.mut, "status       ") + c(stc, st) + (i.node_id ? c(N.mut, "   node " + i.node_id) : ""), c(N.mut, "hosting      ") + ((i.hosted || []).length + " customer server" + ((i.hosted || []).length === 1 ? "" : "s")) + c(N.mut, "   earned $" + (+i.earned_usd || 0).toFixed(2) + ", owed $" + (+i.pending_usd || 0).toFixed(2)),
    m.err ? c(N.red, cut(m.err, 60)) : i.error ? c(N.red, cut(i.error, 60)) : c(N.mut, "Proof of concept: other people's Minecraft servers run here."), "",
    c(N.mut, m.busy ? "saving... (registering with the network can take a few seconds)" : "Space on/off   Tab next   arrows change   Enter save   Esc close")];
}
function view(W, Hh) {
  let L;
  if (screen === "login") L = login(W, Hh); else L = home(W, Hh);
  if (screen === "home") {
    if (modal && modal.t === "new") overlay(L, W, Hh, "NEW SERVER", newBox(), 64);
    else if (modal && modal.t === "logs") overlay(L, W, Hh, "LOGS  " + modal.name, logs.slice(-(Hh - 13)).map((x) => cut(x.replace(/\x1b\[[0-9;]*m/g, ""), W - 12)).concat(["", c(N.mut, cut(modal.out || "", W - 12)), c(N.yel, "> ") + modal.cmd + c(N.yel, "_"), c(N.mut, "type a server command + Enter  |  Esc to close")]), W - 6);
    else if (modal && modal.t === "co") overlay(L, W, Hh, "HOST COMMERCIALLY", coBox(), 70);
    else if (modal && modal.t === "pw") overlay(L, W, Hh, "PASSWORD for " + users[cu].name, [c(N.mut, "new password (empty = no password)"), "*".repeat(modal.pw.length) + c(N.yel, "\u2588"), "", c(N.mut, "Enter save   Esc cancel")], 50);
  }
  if (power) overlay(L, W, Hh, "POWER", ["", c(N.yel, " y ") + " shut down", c(N.yel, " r ") + " restart", c(N.yel, " l ") + " lock screen", c(N.yel, " esc") + " cancel", ""], 36);
  return L;
}
function clip(s, W) { if (vlen(s) <= W) return s; let o = "", n = 0, m; const re = /\x1b\[[0-9;]*m|[^\x1b]/gu; while ((m = re.exec(s))) { if (m[0][0] === "\x1b") { o += m[0]; continue; } if (n >= W) break; o += m[0]; n++; } return o + "\x1b[0m"; }
function frame() {
  if (APP && !SNAP && (COLS < 80 || ROWS < 24)) return "\x1b[H" + R0 + ["Butter needs a window of at least 80 x 24.", "This one is " + COLS + " x " + ROWS + ". Make it bigger (Ctrl+C quits)."].map((x) => x + "\x1b[K\n").join("") + "\x1b[J";
  const L = view(COLS, ROWS); let out = "\x1b[H"; for (let i = 0; i < ROWS; i++) out += (APP ? clip(L[i] || "", COLS) : (L[i] || "")) + "\x1b[K\n"; return out.replace(/\n$/, ""); }

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
function openUrl(u) { try { let cmd = "xdg-open", a = [u]; if (process.platform === "win32") { cmd = "cmd"; a = ["/c", "start", "", u]; } else if (process.platform === "darwin") cmd = "open";
  const p = cp.spawn(cmd, a, { stdio: "ignore", detached: true, windowsHide: true }); p.on("error", () => { toast("Could not open a browser. Open " + u + " yourself."); render(); }); p.unref(); } catch (e) { toast("Could not open a browser. Open " + u + " yourself."); } }
function openWeb() { const u = webUrl(); if (!u) return toast("No network yet, so there is no web page address."); if (APP) { toast("opening " + u); openUrl(u); } else toast("Open " + u + " in a browser on a phone or PC on the same network."); }
function appRun(args) { stop(); try { process.stdout.write("\x1b[2J\x1b[H\x1b[?25h" + R0); cp.spawnSync(process.execPath, [process.env.BUTTER_BIN || path.resolve(__dirname, "..", "..", "app", "bin", "butter")].concat(args), { stdio: "inherit", env: process.env }); } catch (e) {}
  process.stdout.write("\nPress Enter to go back "); process.stdin.once("data", () => { start(); render(); }); }
function openCo() { modal = { t: "co", f: 0, on: false, wallet: "", ram: 2048, srv: 2, info: null, busy: false, err: "", dirty: false };
  const m = modal; api("a=commercial", (j) => { if (j && j.ok) { m.info = j; if (!m.dirty) { m.on = !!j.enabled; m.wallet = j.wallet || ""; m.ram = j.ram_share_mb || 2048; m.srv = j.max_servers || 2; } } else m.err = (j && j.error) || "could not read the settings"; render(); }, 15000); }
function saveCo() { const m = modal; if (m.busy) return; m.busy = true; m.err = "";
  apiPost("a=setcommercial", { enabled: m.on, wallet: m.wallet.trim(), ram_share_mb: m.ram, max_servers: m.srv }, (j) => { m.busy = false; if (j && j.ok) { m.info = j; toast(m.on ? "hosting commercially: " + (j.state || "on") : "commercial hosting is off"); agent(); } else m.err = (j && j.error) || "could not save"; render(); }, 90000); }
function openNew() { modal = { t: "new", name: "world" + (D.servers.length + 1), type: "java", flavor: "paper", vi: 0, f: 0, err: "", busy: false }; if (!ver) api("a=versions", (j) => { if (j && j.ok) ver = j; }, 25000); }
function create() { const m = modal; if (m.busy) return; m.busy = true; m.err = ""; const list = m.type === "bedrock" ? (ver ? ver.bedrock : ["LATEST"]) : ["LATEST"].concat(ver ? ver.java : []), v = list[m.vi] || "LATEST";
  api("a=create&n=" + encodeURIComponent(m.name) + "&type=" + m.type + (APP ? "" : "&mem=1024") + "&ver=" + encodeURIComponent(v) + "&flavor=" + (m.type === "bedrock" ? "paper" : m.flavor), (j) => { m.busy = false; if (j && j.ok) { modal = null; toast("server " + m.name + " is starting"); agent(); } else m.err = (j && j.error) || "could not create"; render(); }, 300000); }
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
    if (m.t === "co") { m.dirty = true;
      if (k === "esc") modal = null; else if (k === "enter") saveCo(); else if (k === "tab" || k === "down") m.f = (m.f + 1) % 4; else if (k === "up" || k === "btab") m.f = (m.f + 3) % 4;
      else if (m.f === 0 && (k === " " || k === "left" || k === "right")) m.on = !m.on;
      else if (m.f === 2 && (k === "left" || k === "right")) m.ram = Math.max(512, Math.min(262144, m.ram + (k === "left" ? -256 : 256)));
      else if (m.f === 3 && (k === "left" || k === "right")) m.srv = Math.max(1, Math.min(50, m.srv + (k === "left" ? -1 : 1)));
      else if (m.f === 1) { if (k === "bs") m.wallet = m.wallet.slice(0, -1); else if (/^[0-9a-zA-Z]$/.test(k) && m.wallet.length < 42) m.wallet += k; }
      return; }
    if (m.t === "logs") { if (k === "esc") modal = null; else if (k === "enter") { const cm = m.cmd.trim(); if (cm) { m.out = "running..."; m.cmd = ""; api("a=cmd&n=" + encodeURIComponent(m.name) + "&c=" + encodeURIComponent(cm), (j) => { m.out = j ? (j.ok ? String(j.out || "(no output)").split("\n")[0] : j.error) : "no answer"; api("a=logs&n=" + encodeURIComponent(m.name), (l) => { logs = String((l && l.logs) || "").split("\n"); render(); }, 20000); render(); }, 20000); } } else if (k === "bs") m.cmd = m.cmd.slice(0, -1); else if (k.length === 1 && k >= " " && m.cmd.length < 150) m.cmd += k; return; }
    if (k === "esc") modal = null; else if (k === "enter") create();
    else if (k === "up" || k === "btab") m.f = (m.f + 3) % 4; else if (k === "down" || k === "tab") m.f = (m.f + 1) % 4;
    else if (k === "left" || k === "right") { const d = k === "left" ? -1 : 1; if (m.f === 1) { m.type = m.type === "java" ? "bedrock" : "java"; m.vi = 0; } else if (m.f === 2 && m.type === "java") { const o = ["paper", "vanilla", "fabric", "forge"]; m.flavor = o[(o.indexOf(m.flavor) + d + 4) % 4]; } else if (m.f === 3) { const n = m.type === "bedrock" ? (ver ? ver.bedrock.length : 1) : 1 + (ver ? ver.java.length : 0); m.vi = (m.vi + d + n) % n; } }
    else if (m.f === 0) { if (k === "bs") m.name = m.name.slice(0, -1); else if (/^[A-Za-z0-9-]$/.test(k) && m.name.length < 24) m.name += APP ? k.toLowerCase() : k; }
    return; }
  const s = D.servers[sel];
  if (k === "up") sel = Math.max(0, sel - 1); else if (k === "down") sel = Math.min(Math.max(0, D.servers.length - 1), sel + 1);
  else if (k === "n") openNew(); else if (k === "s" || k === "enter") toggle(s); else if (k === "d" || k === "del") remove(s);
  else if (k === "k" && s) { if (s.type !== "java") toast("cracked mode is for Java servers"); else api("a=cracked&n=" + encodeURIComponent(s.name) + "&v=" + (s.cracked ? 0 : 1), (j) => { toast(j && j.ok ? (j.cracked ? "cracked mode ON, restarting" : "cracked mode OFF, restarting") : (j && j.error) || "failed"); agent(); }, 30000); }
  else if (k === "l" && s) { modal = { t: "logs", name: s.name, cmd: "", out: "" }; logs = ["loading..."]; api("a=logs&n=" + encodeURIComponent(s.name), (j) => { logs = String((j && j.logs) || "no log yet").split("\n"); render(); }, 20000); }
  else if (k === "c") openCo(); else if (k === "o") openWeb();
  else if (k === "1") { if (APP) appRun(s ? ["play", s.name] : ["play"]); else external("/usr/local/bin/butter-play; printf '\\nPress Enter '; read x"); }
  else if (!APP && k === "w") external("/usr/local/bin/butter-wifi"); else if (!APP && k === "i") external("/usr/local/bin/butter-install; printf '\\nPress Enter '; read x");
  else if (!APP && k === "a") modal = { t: "pw", pw: "" }; else if (!APP && k === "x") external("echo 'ButterOS shell. Type exit to come back.'; /bin/sh -l"); else if (!APP && k === "p") power = true; else if (k === "q") { if (APP) quit(0); /* on ButterOS: stay */ }
}
const KEYS = { "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[3~": "del", "\x1b[Z": "btab", "\r": "enter", "\n": "enter", "\t": "tab", "\x7f": "bs", "\b": "bs", "\x1b": "esc", "\x1bOP": "f1", "\x1b[[A": "f1" };
const textMode = () => screen === "login" || (modal && (modal.t === "logs" || modal.t === "pw" || (modal.t === "new" && modal.f === 0) || (modal.t === "co" && modal.f === 1)));
function onData(d) { const s = d.toString("latin1"); if (APP && s === "\x03") return quit(0); const k = KEYS[s] || (s.length === 1 ? s : null);
  if (!k) { if (APP && s.length > 1 && s[0] !== "\x1b" && textMode()) { for (const ch of s) if (ch >= " " && ch < "\x7f" && textMode()) key(ch); render(); } return; } // pasted text
  const raw = screen === "login" || (modal && (modal.t === "logs" || modal.t === "pw" || (modal.t === "new" && modal.f === 0) || (modal.t === "co" && modal.f === 1))) || k.length > 1; key(raw ? k : k.toLowerCase()); render(); }
let timer = null;
function render() { process.stdout.write(frame()); }
let alt = false;
function start() { try { process.stdin.setRawMode(true); } catch (e) {} process.stdin.resume(); process.stdin.on("data", onData);
  if (APP && !alt) { alt = true; process.stdout.write("\x1b[?1049h"); }
  process.stdout.write((APP ? "" : PAL.map((h, i) => "\x1b]P" + i.toString(16) + h).join("")) + R0 + "\x1b[2J\x1b[?25l"); render(); }
function quit(code) { stop(); process.exit(code || 0); }
function onResize() { COLS = +process.env.COLS || process.stdout.columns || COLS; ROWS = +process.env.ROWS || process.stdout.rows || ROWS; if (APP) process.stdout.write("\x1b[2J"); render(); }
function stop() { process.stdin.removeListener("data", onData); try { process.stdin.setRawMode(false); } catch (e) {} }
process.on("exit", () => { try { process.stdout.write(APP ? "\x1b[?25h\x1b[0m" + (alt ? "\x1b[?1049l" : "") : "\x1b[?25h\x1b[0m\x1b[2J\x1b[H"); } catch (e) {} }); process.on("SIGTERM", () => process.exit(0)); process.stdout.on("resize", onResize);
if (APP) { process.on("SIGINT", () => process.exit(0)); process.on("SIGHUP", () => process.exit(0)); process.on("uncaughtException", (e) => { try { process.stdin.setRawMode(false); } catch (x) {} process.stdout.write("\x1b[?25h\x1b[0m" + (alt ? "\x1b[?1049l" : "")); console.error("Butter screen crashed: " + (e && e.stack || e)); process.exit(1); }); }
local(); agent(); start(); timer = setInterval(() => { local(); render(); }, 1000); setInterval(agent, 4000);
