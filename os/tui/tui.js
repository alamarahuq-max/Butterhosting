#!/usr/bin/env node
// ButterOS console screen: retro-futuristic HUD (CPU/memory/temperature/network graphs, servers, menu).
// Linux text console: only CP437 characters are used, so it works with every console font. The 16 console colours are re-programmed per theme.
const fs = require("fs"), cp = require("child_process"), http = require("http");
const DEMO = process.env.BUTTER_DEMO === "1", SNAP = process.env.BUTTER_SNAPSHOT || "";
const UIF = process.env.BUTTER_UI_FILE || "/etc/butter-ui.json";

// ---- themes: 16 colours each (0 background, 3/11 butter, 5/13 pink, 6/14 cyan, 2/10 ok, 1/9 bad, 7 text, 8 dim, 15 bright) ----
const THEMES = {
  "NEON BUTTER": ["0b0a1f","ff4d6d","3df5a5","ffb703","5b4bff","d946ef","22d3ee","cfcaf5","5a5690","ff7a93","7cffc4","ffe066","8b7dff","ff6bd6","7ef0ff","ffffff"],
  "GRID CYAN":   ["02121a","ff5d73","2de2a0","19c8e6","2f6bff","7b8cff","2de2c0","bfe9f2","3b6a78","ff8a9a","6dffc6","8ff4ff","6f9bff","a9b6ff","8ffff0","ffffff"],
  "AMBER CRT":   ["120800","ff5a1f","c8c000","ff9d00","8a4b00","c46a00","e8a33a","e6b155","6e4a1a","ff8a50","e0d800","ffc04d","b36a10","e08a2a","ffd28a","fff1d0"],
  "SUNSET":      ["14081f","ff3d6e","57f2a3","ff8a3d","6a3df5","ff3d81","a855f7","e6d3f5","5f4a7a","ff7a95","8dffc3","ffc371","9b7dff","ff7aa8","c9a0ff","ffffff"],
};
const FONTS = ["ter-v16b", "ter-v20b", "ter-v24b", "ter-v28b", "ter-v32b"];
let ui = { theme: "NEON BUTTER", font: 2 };
try { ui = Object.assign(ui, JSON.parse(fs.readFileSync(UIF, "utf8"))); } catch (e) {}
if (!THEMES[ui.theme]) ui.theme = "NEON BUTTER";
const saveUi = () => { try { fs.writeFileSync(UIF, JSON.stringify(ui)); } catch (e) {} };

// ---- data ----
const H = { cpu: [], mem: [], temp: [], rx: [], tx: [] };
const D = { cores: 1, load: "0 0 0", memTotal: 1, memUsed: 0, memAvail: 0, cpu: 0, temp: null, tempLabel: "", rx: 0, tx: 0, rxTotal: 0, txTotal: 0, ip: "", up: 0, servers: [], persist: false, engine: "...", web: 0, wifi: 0 };
let prevCpu = null, prevNet = null, prevT = Date.now();
const push = (a, v) => { a.push(v); if (a.length > 240) a.shift(); };
function local() {
  const now = Date.now(), dt = Math.max(0.2, (now - prevT) / 1000); prevT = now;
  try {
    const l = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
    const tot = l.reduce((a, b) => a + b, 0), idle = l[3] + (l[4] || 0);
    if (prevCpu) { const dtot = tot - prevCpu[0], did = idle - prevCpu[1]; D.cpu = dtot > 0 ? Math.max(0, Math.min(100, 100 * (1 - did / dtot))) : 0; }
    prevCpu = [tot, idle]; push(H.cpu, D.cpu);
    const mi = {}; fs.readFileSync("/proc/meminfo", "utf8").split("\n").forEach((x) => { const m = x.match(/^(\w+):\s+(\d+)/); if (m) mi[m[1]] = +m[2]; });
    D.memTotal = mi.MemTotal / 1024; D.memAvail = mi.MemAvailable / 1024; D.memUsed = D.memTotal - D.memAvail; push(H.mem, 100 * D.memUsed / D.memTotal);
    D.load = fs.readFileSync("/proc/loadavg", "utf8").split(" ").slice(0, 3).join(" "); D.up = +fs.readFileSync("/proc/uptime", "utf8").split(" ")[0];
    let rx = 0, tx = 0; fs.readFileSync("/proc/net/dev", "utf8").split("\n").slice(2).forEach((x) => { const p = x.trim().split(/[:\s]+/); if (p[0] && p[0] !== "lo") { rx += +p[1]; tx += +p[9]; } });
    if (prevNet) { D.rx = Math.max(0, (rx - prevNet[0]) / dt); D.tx = Math.max(0, (tx - prevNet[1]) / dt); } prevNet = [rx, tx]; D.rxTotal = rx; D.txTotal = tx; push(H.rx, D.rx); push(H.tx, D.tx);
    const t = []; const rd = (p) => { try { return +fs.readFileSync(p, "utf8") / 1000; } catch (e) { return NaN; } };
    try { fs.readdirSync("/sys/class/thermal").filter((z) => z.startsWith("thermal_zone")).forEach((z) => { const c = rd("/sys/class/thermal/" + z + "/temp"); if (c > 0 && c < 130) t.push([c, (fs.readFileSync("/sys/class/thermal/" + z + "/type", "utf8").trim())]); }); } catch (e) {}
    try { fs.readdirSync("/sys/class/hwmon").forEach((h) => { let nm = ""; try { nm = fs.readFileSync("/sys/class/hwmon/" + h + "/name", "utf8").trim(); } catch (e) {} fs.readdirSync("/sys/class/hwmon/" + h).filter((f) => /^temp\d+_input$/.test(f)).forEach((f) => { const c = rd("/sys/class/hwmon/" + h + "/" + f); if (c > 0 && c < 130) t.push([c, nm]); }); }); } catch (e) {}
    if (t.length) { t.sort((a, b) => b[0] - a[0]); D.temp = t[0][0]; D.tempLabel = t[0][1]; push(H.temp, D.temp); } else { D.temp = null; }
    D.cores = require("os").cpus().length || 1;
  } catch (e) {}
}
function agent() {
  const r = http.get({ host: "127.0.0.1", port: 80, path: "/cgi-bin/api?a=status", timeout: 6000 }, (res) => {
    let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { const j = JSON.parse(b); if (j.ok) { D.servers = j.servers || []; D.ip = j.ip || ""; D.persist = j.persist; D.engine = j.engine; D.web = j.web_rss_mb; D.wifi = j.wifi_adapters || 0; D.agentOk = true; } } catch (e) {} });
  }); r.on("error", () => {}); r.on("timeout", () => r.destroy());
}
function demo() {
  D.cores = 4; D.memTotal = 3920; D.ip = "192.168.1.20"; D.persist = true; D.engine = "ok"; D.web = 0.7; D.up = 2543;
  let c = 30, m = 24, t = 52, rx = 40000; for (let i = 0; i < 120; i++) { c = Math.max(3, Math.min(98, c + (Math.sin(i / 7) * 9 + (i % 5) - 2))); m = Math.min(90, m + 0.35 + Math.sin(i / 5)); t = 48 + c * 0.35 + Math.sin(i / 9) * 2; rx = Math.max(0, 40000 + Math.sin(i / 3) * 30000 + (i % 11) * 5000); push(H.cpu, c); push(H.mem, m); push(H.temp, t); push(H.rx, rx); push(H.tx, rx / 9); }
  D.cpu = c; D.memUsed = D.memTotal * m / 100; D.memAvail = D.memTotal - D.memUsed; D.temp = t; D.tempLabel = "cpu_thermal"; D.rx = rx; D.tx = rx / 9; D.rxTotal = 812e6; D.txTotal = 96e6; D.load = "0.62 0.48 0.40";
  D.servers = [{ name: "survival", type: "java", flavor: "paper", version: "1.21.4", state: "running", players: 3, ram: 1210, port: 25565, join: "bore.pub:60270" },
               { name: "bedwars", type: "java", flavor: "fabric", version: "1.20.1", state: "running", players: 0, ram: 980, port: 25566, join: null },
               { name: "pocket", type: "bedrock", flavor: "bedrock", version: "LATEST", state: "exited", players: null, ram: 0, port: 19132, join: null }];
}

// ---- drawing ----
const C = { bg: 0, bad: 1, ok: 2, a1: 3, a1b: 11, a2: 5, a2b: 13, a3: 6, a3b: 14, txt: 7, dim: 8, hi: 15 };
let W = 80, Hh = 25, grid = [];
function init(w, h) { W = w; Hh = h; grid = Array.from({ length: h }, () => Array.from({ length: w }, () => [" ", 7])); }
function put(r, c, s, fg) { if (r < 0 || r >= Hh) return; for (const ch of String(s)) { if (c >= 0 && c < W) grid[r][c] = [ch, fg]; c++; } }
function center(r, s, fg, lo, hi) { lo = lo ?? 0; hi = hi ?? W; put(r, lo + Math.floor((hi - lo - [...s].length) / 2), s, fg); }
function box(r, c, w, h, fg, title, tfg) {
  put(r, c, "┌" + "─".repeat(w - 2) + "┐", fg); put(r + h - 1, c, "└" + "─".repeat(w - 2) + "┘", fg);
  for (let i = 1; i < h - 1; i++) { put(r + i, c, "│", fg); put(r + i, c + w - 1, "│", fg); }
  if (title) put(r, c + 2, "╡" + title + "╞", tfg ?? C.a1b);
}
function graph(r, c, w, h, data, lo, hi, cols) { // h rows, half-block resolution
  const n = data.slice(-w); const off = w - n.length;
  for (let i = 0; i < n.length; i++) {
    const v = Math.max(0, Math.min(1, (n[i] - lo) / (hi - lo || 1))), lv = Math.round(v * h * 2);
    for (let k = 0; k < h; k++) { const full = Math.floor(lv / 2); const row = r + h - 1 - k; if (k < full) put(row, c + off + i, "█", cols[k]); else if (k === full && lv % 2) put(row, c + off + i, "▄", cols[k]); }
  }
  for (let i = 0; i < off; i++) put(r + h - 1, c + i, "─", C.dim);
}
const bar = (v, w) => { const f = Math.round(Math.max(0, Math.min(1, v)) * w); return "█".repeat(f) + "░".repeat(w - f); };
const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + "M" : b >= 1e3 ? (b / 1e3).toFixed(0) + "K" : Math.round(b) + "B");
const gbs = (m) => (m >= 1024 ? (m / 1024).toFixed(1) + "G" : Math.round(m) + "M");
const tm = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
const LOGO = ["█████▄ ██  ██ ██████ ██████ ██████ █████▄    ▄████▄ ▄█████",
  "██  ██ ██  ██   ██     ██   ██     ██  ██    ██  ██ ██",
  "█████▀ ██  ██   ██     ██   ████   █████▀    ██  ██ ▀████▄",
  "██  ██ ██  ██   ██     ██   ██     ██ ▀█▄   ██  ██     ██",
  "█████▀ ▀████▀   ██     ██   ██████ ██  ▀█    ▀████▀ █████▀"];
const LOGO_COLS = [C.a1b, C.a1b, C.a1, C.a2b, C.a2];

let flash = "";
function frame(ts) {
  init(W, Hh);
  const wide = W >= 100, big = Hh >= 30;
  // outer frame with title and status
  put(0, 0, "╔" + "═".repeat(W - 2) + "╗", C.a3); put(Hh - 1, 0, "╚" + "═".repeat(W - 2) + "╝", C.a3);
  for (let r = 1; r < Hh - 1; r++) { put(r, 0, "║", C.a3); put(r, W - 1, "║", C.a3); }
  put(0, 3, "╡ BUTTER-OS ╞", C.a1b); const right = "╡ " + (D.ip || "NO NETWORK") + " ╞═╡ UP " + tm(D.up) + " ╞"; put(0, W - 3 - right.length, right, C.a3b);
  // logo
  let r = 2;
  if (W >= 84) { LOGO.forEach((l, i) => center(r + i, l, LOGO_COLS[i])); r += 5; } else { center(r, "B U T T E R   O S", C.a1b); r += 1; }
  center(r++, "M I N E C R A F T   H O S T I N G  •  N O T H I N G   E L S E", C.dim);
  put(r, 2, "═".repeat(W - 4), C.a2); r += 1;
  // panels
  const pw = Math.floor((W - 2 - (wide ? 0 : 0)) / 4), ph = 7;
  const P = (i) => 1 + i * pw, pwi = (i) => (i === 3 ? W - 1 - P(3) : pw);
  const gcols = [C.a3b, C.a1b, C.a2b];
  const t = D.temp, tcol = t == null ? C.dim : t >= 80 ? C.bad : t >= 65 ? C.a1b : C.ok;
  const panels = [
    { t: "CPU", v: D.cpu.toFixed(0) + "%", vc: D.cpu > 85 ? C.bad : C.a3b, d: H.cpu, lo: 0, hi: 100, cap: "LOAD " + D.load.split(" ")[0] + "  " + D.cores + " CORES" },
    { t: "MEMORY", v: gbs(D.memUsed) + "/" + gbs(D.memTotal), vc: D.memAvail < 300 ? C.bad : C.a1b, d: H.mem, lo: 0, hi: 100, cap: "FREE " + gbs(D.memAvail) },
    { t: "TEMP", v: t == null ? "NO SENSOR" : t.toFixed(0) + "øC", vc: tcol, d: H.temp, lo: 25, hi: 95, cap: t == null ? "THIS MACHINE HIDES IT" : (D.tempLabel || "SENSOR").toUpperCase().slice(0, pw - 6) },
    { t: "NETWORK", v: "↓" + kb(D.rx) + " ↑" + kb(D.tx), vc: C.a2b, d: H.rx, lo: 0, hi: Math.max(50000, ...H.rx.slice(-60)), cap: "TOTAL ↓" + kb(D.rxTotal) + " ↑" + kb(D.txTotal) },
  ];
  panels.forEach((p, i) => {
    const c = P(i), w = pwi(i); box(r, c, w, ph, i === 2 ? tcol : C.a3, p.t, C.a1b);
    put(r + 1, c + 2, p.v, p.vc); graph(r + 2, c + 1, w - 2, 3, p.d, p.lo, p.hi, i === 2 ? [C.ok, C.a1b, C.bad] : gcols); put(r + 5, c + 2, p.cap.slice(0, w - 4), C.dim);
  });
  r += ph;
  // servers
  const menuRows = 3, sh = Hh - 1 - menuRows - r;
  if (sh >= 3) {
    box(r, 1, W - 2, sh, C.a3, "SERVERS", C.a1b);
    const run = D.servers.filter((s) => s.state === "running").length; put(r, W - 2 - 14, " " + run + "/" + D.servers.length + " ONLINE ", run ? C.ok : C.dim);
    put(r + 1, 3, "NAME".padEnd(16) + "GAME".padEnd(20) + "PLAYERS".padEnd(9) + "MEMORY".padEnd(9) + "JOIN", C.dim);
    if (!D.servers.length) put(r + 2, 3, "NO SERVERS YET. PRESS 1 TO MAKE ONE FOR YOU AND YOUR FRIENDS.", C.a1);
    D.servers.slice(0, sh - 3).forEach((s, i) => {
      const on = s.state === "running", g = (s.type === "bedrock" ? "BEDROCK" : (s.flavor || "java").toUpperCase()) + " " + (s.version || ""), addr = s.join || (D.ip && s.port ? D.ip + ":" + s.port : "-");
      put(r + 2 + i, 3, on ? "●" : "○", on ? C.ok : C.dim); put(r + 2 + i, 5, s.name.slice(0, 14).padEnd(14), on ? C.hi : C.dim);
      put(r + 2 + i, 19, g.slice(0, 19).padEnd(20), C.txt); put(r + 2 + i, 39, String(s.players == null ? "-" : s.players).padEnd(9), C.a3b); put(r + 2 + i, 48, (on ? gbs(s.ram) : "-").padEnd(9), C.txt); put(r + 2 + i, 57, addr.slice(0, W - 60), s.join ? C.a2b : C.txt);
    });
    r += sh;
  }
  // menu
  const items = [["1", "PLAY WITH FRIENDS"], ["2", "WEB PAGE"], ["3", "INSTALL TO DISK"], ["4", "BACKUP NODE"], ["5", "WI-FI" + (D.wifi ? "" : "")], ["T", "THEME"], ["F", "FONT"], ["P", "POWER OFF"], ["R", "RESTART"]];
  const l1 = items.slice(0, 4), l2 = items.slice(4);
  const draw = (row, arr) => { const len = arr.reduce((a, x) => a + x[1].length + 6, 0) - 2; let c = Math.max(2, Math.floor((W - len) / 2)); arr.forEach((x) => { put(row, c, "[", C.dim); put(row, c + 1, x[0], C.a1b); put(row, c + 2, "]", C.dim); put(row, c + 4, x[1], C.txt); c += x[1].length + 6; }); };
  draw(Hh - 3, l1); draw(Hh - 2, l2);
  if (flash) center(Hh - 1, "╡ " + flash + " ╞", C.a2b);
  else put(Hh - 1, 3, "╡ " + ui.theme + " ╞", C.dim);
}
const sgrFg = (i) => (i < 8 ? "3" + i : "9" + (i - 8));
function toAnsi() { let s = "\x1b[H"; for (let r = 0; r < Hh; r++) { let cur = -1, line = ""; for (let c = 0; c < W; c++) { const [ch, fg] = grid[r][c]; if (fg !== cur) { line += "\x1b[" + sgrFg(fg) + ";40m"; cur = fg; } line += ch; } s += line + (r < Hh - 1 ? "\r\n" : ""); } return s + "\x1b[0m"; }
function toHtml() {
  const pal = THEMES[ui.theme]; let s = `<html><body style="margin:0;background:#${pal[0]}"><pre style="margin:0;padding:12px;font:15px/17px 'DejaVu Sans Mono',monospace;color:#${pal[7]}">`;
  for (let r = 0; r < Hh; r++) { for (let c = 0; c < W; c++) { const [ch, fg] = grid[r][c]; s += `<span style="color:#${pal[fg]}">${ch === "<" ? "&lt;" : ch === "&" ? "&amp;" : ch}</span>`; } s += "\n"; } return s + "</pre></body></html>";
}
const palSeq = () => THEMES[ui.theme].map((h, i) => "\x1b]P" + i.toString(16) + h).join("");

if (SNAP) { // preview without a terminal
  const w = +process.env.COLS || 100, h = +process.env.ROWS || 32; if (DEMO) demo(); init(w, h); W = w; Hh = h; frame(); process.stdout.write(SNAP === "html" ? toHtml() : toAnsi() + "\n"); process.exit(0);
}

// ---- terminal session ----
const out = process.stdout, inp = process.stdin;
if (!out.isTTY || (out.columns || 80) < 60 || (out.rows || 25) < 20) { try { cp.execFileSync("/usr/local/bin/butter-tui-lite", { stdio: "inherit" }); } catch (e) {} process.exit(0); }
const sh = (c) => cp.spawnSync("sh", ["-c", c], { stdio: "ignore" });
function applyFont() { sh("setfont /usr/share/consolefonts/" + FONTS[ui.font % FONTS.length] + ".psf.gz 2>/dev/null || setfont /usr/share/consolefonts/ter-v20n.psf.gz 2>/dev/null"); }
function size() { W = out.columns || 80; Hh = out.rows || 25; }
function setup() { out.write(palSeq() + "\x1b[0;37;40m\x1b[2J\x1b[?25l"); }
let busy = false, timer = null;
function draw() { if (busy) return; size(); init(W, Hh); frame(); out.write(toAnsi()); }
function toLeave() { busy = true; clearInterval(timer); inp.setRawMode(false); inp.pause(); out.write("\x1b[0;37;40m\x1b[2J\x1b[H\x1b[?25h"); }
function back() { inp.setRawMode(true); inp.resume(); busy = false; applyFont(); setup(); draw(); timer = setInterval(() => { local(); draw(); }, 1000); }
function run(cmd, args) { toLeave(); cp.spawnSync(cmd, args || [], { stdio: "inherit" }); process.stdout.write("\nPress Enter to go back "); const b = Buffer.alloc(1); try { fs.readSync(0, b, 0, 1); } catch (e) {} back(); }
function modal(lines, fg) { busy = true; size(); init(W, Hh); frame(); const w = Math.max(...lines.map((l) => l.length)) + 6, h = lines.length + 4, r0 = Math.floor((Hh - h) / 2), c0 = Math.floor((W - w) / 2);
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) grid[r][c] = [" ", 7]; box(r0, c0, w, h, C.a2b); lines.forEach((l, i) => put(r0 + 2 + i, c0 + 3, l, fg ?? C.txt)); out.write(toAnsi()); }
const ask = (cb) => { const f = (k) => { inp.removeListener("data", f); busy = false; cb(String(k)); }; inp.once("data", f); };
function key(k) {
  const c = String(k).toLowerCase();
  if (busy) return;
  if (c === "1") run("/usr/local/bin/butter-play");
  else if (c === "2") { modal(["OPEN THIS ON ANY PHONE OR PC ON YOUR NETWORK:", "", "http://" + (D.ip || "<no network>"), "", "PRESS ANY KEY"]); ask(() => draw()); }
  else if (c === "3") run("/usr/local/bin/butter-install");
  else if (c === "4") run("/usr/local/bin/butter-backup-setup");
  else if (c === "5") run("/usr/local/bin/butter-wifi");
  else if (c === "t") { const n = Object.keys(THEMES); ui.theme = n[(n.indexOf(ui.theme) + 1) % n.length]; saveUi(); out.write(palSeq()); flash = "THEME: " + ui.theme; setTimeout(() => (flash = ""), 2500); draw(); }
  else if (c === "f") { ui.font = (ui.font + 1) % FONTS.length; saveUi(); applyFont(); flash = "FONT SIZE " + (ui.font + 1) + "/" + FONTS.length; setTimeout(() => (flash = ""), 2500); size(); draw(); }
  else if (c === "p") { modal(["POWER OFF THIS MACHINE?", "", "Servers stop and worlds are backed up first.", "", "[Y] YES    [ANY OTHER KEY] NO"], C.a1b); ask((x) => { if (x.toLowerCase() === "y") { out.write("\x1b[2J\x1b[H POWERING OFF...\n"); cp.spawnSync("poweroff"); } else draw(); }); }
  else if (c === "r") { modal(["RESTART THIS MACHINE?", "", "[Y] YES    [ANY OTHER KEY] NO"], C.a1b); ask((x) => { if (x.toLowerCase() === "y") cp.spawnSync("reboot"); else draw(); }); }
}
function intro(done) {
  if (process.env.BUTTER_FAST) return done();
  size(); out.write(palSeq() + "\x1b[0;37;40m\x1b[2J\x1b[?25l");
  const lines = ["BUTTER-OS  SYSTEM CHECK", "", "MEMORY ........... OK", "NETWORK .......... SEARCHING", "CONTAINER ENGINE . STARTING", "MINECRAFT AGENT .. STARTING", ""]; let n = 0, ready = 0, tries = 0;
  const tick = setInterval(() => {
    size(); init(W, Hh); const logoW = W >= 84; let r = 3; if (logoW) { LOGO.forEach((l, i) => center(r + i, l, LOGO_COLS[i])); r += 7; } else { center(r, "B U T T E R   O S", C.a1b); r += 3; }
    lines.forEach((l, i) => { if (i === 0) center(r + i, l, C.a1b); else if (l) center(r + i, l.replace("SEARCHING", ready > 1 ? "ONLINE" : "SEARCHING").replace("STARTING", ready > 2 ? "READY" : "STARTING"), C.txt); });
    const bw = Math.min(40, W - 10), f = Math.min(bw, Math.floor(bw * (n + 1) / 28)); center(r + 8, "[" + "▓".repeat(f) + "░".repeat(bw - f) + "]", C.a2b);
    out.write(toAnsi()); n++; tries++;
    if (n % 4 === 0 && !ready) { ready = 1; } if (n === 10) ready = 2; if (n === 18) ready = 3;
    if (tries > 24 && (n >= 28)) { clearInterval(tick); done(); } if (tries > 90) { clearInterval(tick); done(); }
  }, 250);
}
process.on("SIGTERM", () => { out.write("\x1b[?25h"); process.exit(0); });
out.on("resize", () => { if (!busy) draw(); });
applyFont(); size(); if (DEMO) demo();
intro(() => { local(); setTimeout(local, 700); agent(); setInterval(agent, 5000); back(); inp.setRawMode(true); inp.on("data", key); });
