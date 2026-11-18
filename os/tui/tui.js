#!/usr/bin/env node
// ButterOS console screen: retro-futuristic HUD (CPU/memory/temperature/network graphs, servers, menu).
// Linux text console: only CP437 characters are used, so it works with every console font. The 16 console colours are re-programmed per theme.
const fs = require("fs"), cp = require("child_process"), http = require("http");
const DEMO = process.env.BUTTER_DEMO === "1", SNAP = process.env.BUTTER_SNAPSHOT || "";
const UIF = process.env.BUTTER_UI_FILE || "/etc/butter-ui.json";

const { THEMES } = require("./data");
const FONTS = ["ter-v16b", "ter-v20b", "ter-v24b", "ter-v28b", "ter-v32b"];
let ui = { theme: "NEON BUTTER", font: 2 };
try { ui = Object.assign(ui, JSON.parse(fs.readFileSync(UIF, "utf8"))); } catch (e) {}
if (!THEMES[ui.theme]) ui.theme = "NEON BUTTER";
const saveUi = () => { try { fs.writeFileSync(UIF, JSON.stringify(ui)); } catch (e) {} };

const { H, D, local, agent, demo, push } = require("./data");
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
  const items = [["1", "PLAY WITH FRIENDS"], ["2", "WEB PAGE"], ["3", "INSTALL TO DISK"], ["4", "WI-FI"], ["T", "THEME"], ["F", "FONT"], ["P", "POWER OFF"], ["R", "RESTART"]];
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
  const w = +process.env.COLS || 100, h = +process.env.ROWS || 32; if (DEMO) demo(); init(w, h); W = w; Hh = h; frame(); fs.writeSync(1, SNAP === "html" ? toHtml() : toAnsi() + "\n"); process.exit(0);
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
  else if (c === "4") run("/usr/local/bin/butter-wifi");
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
