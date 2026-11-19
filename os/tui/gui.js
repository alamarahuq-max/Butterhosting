#!/usr/bin/env node
// ButterOS on-device screen. Draws straight to the framebuffer (/dev/fb0): no X, no browser, about 30 MB of RAM.
// Same look as the local web page: sidebar, cards, butter-yellow accent, serif headings, the Butter logo.
// Preview: BUTTER_DEMO=1 BUTTER_FB=/tmp/f.raw BUTTER_FBSIZE=1280x800 [BUTTER_PAGE=home|servers|network] [BUTTER_LIGHT=1] [BUTTER_DEMO_MODAL=1] node gui.js
const fs = require("fs"), zlib = require("zlib"), cp = require("child_process"), path = require("path");
const { H, D, local, agent, demo, api } = require("./data");
const DEMO = process.env.BUTTER_DEMO === "1", FBP = process.env.BUTTER_FB || "/dev/fb0", UIF = process.env.BUTTER_UI_FILE || "/etc/butter-ui.json";
let ui = { light: false }; try { ui = Object.assign(ui, JSON.parse(fs.readFileSync(UIF, "utf8"))); } catch (e) {}
if (process.env.BUTTER_LIGHT) ui.light = true;
const DIR = __dirname; let fd = null;

function geom() {
  if (process.env.BUTTER_FBSIZE) { const [w, h] = process.env.BUTTER_FBSIZE.split("x").map(Number); return { w, h, bpp: 32, stride: w * 4 }; }
  const rd = (f) => fs.readFileSync("/sys/class/graphics/fb0/" + f, "utf8").trim(), [w, h] = rd("virtual_size").split(",").map(Number);
  return { w, h, bpp: +rd("bits_per_pixel"), stride: +rd("stride") };
}
let G; try { G = geom(); } catch (e) { process.exit(3); }
if (G.w < 800 || G.h < 480 || (G.bpp !== 32 && G.bpp !== 16)) process.exit(3);
const SW = G.w, SH = G.h, S = SH >= 1300 ? 2 : SH >= 950 ? 1.5 : 1, U = SH / 800 > 1.25 ? S : 1; // U: layout unit multiplier follows font scale
const u = (n) => Math.round(n * Math.max(S, SH / 800 > 1 ? SH / 800 : 1));
let FONTS; try { FONTS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, "fonts.json.gz")))); } catch (e) { process.exit(3); }
const fcache = {}; function font(face, sz) { const k = face + sz + "@" + S; if (!fcache[k]) { const f = FONTS[k]; if (!f) return null; for (const c in f.g) if (typeof f.g[c][5] === "string") f.g[c][5] = Buffer.from(f.g[c][5], "base64"); fcache[k] = f; } return fcache[k]; }
function logo() { for (const n of [96, 64, 48, 32]) { try { const b = fs.readFileSync(path.join(DIR, "logo-" + n + ".raw")); let x0 = n, x1 = 0, y0 = n, y1 = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (b[(y * n + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { b, n, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; } catch (e) {} } return null; }
const LOGO = logo();

const PAL = { dark: { bg: "0f0f26", p: "1a1a40", p2: "23235a", b: "2e2e6e", t: "f1f1ff", m: "9a9acb", y: "ffd23f", yt: "222222", g: "5ef2b0", r: "ff6b6b", c: "7dd3fc" },
  light: { bg: "f6f4ee", p: "ffffff", p2: "ece8da", b: "ddd7c4", t: "1d1d2b", m: "6b6b85", y: "ffd23f", yt: "222222", g: "13966a", r: "d93b3b", c: "2a7fb0" } };
let C = {}; function theme() { const p = PAL[ui.light ? "light" : "dark"]; for (const k in p) C[k] = [parseInt(p[k].slice(0, 2), 16), parseInt(p[k].slice(2, 4), 16), parseInt(p[k].slice(4, 6), 16)]; } theme();
const fb = Buffer.alloc(SW * SH * 4);
function blend(x, y, c, a) { if (x < 0 || y < 0 || x >= SW || y >= SH || a <= 0) return; const o = (y * SW + x) * 4; if (a >= 1) { fb[o] = c[2]; fb[o + 1] = c[1]; fb[o + 2] = c[0]; } else { fb[o] += (c[2] - fb[o]) * a; fb[o + 1] += (c[1] - fb[o + 1]) * a; fb[o + 2] += (c[0] - fb[o + 2]) * a; } }
function rect(x, y, w, h, c, a) { x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); a = a == null ? 1 : a; const x0 = Math.max(0, x), x1 = Math.min(SW, x + w);
  for (let j = Math.max(0, y); j < Math.min(SH, y + h); j++) { if (a >= 1) for (let i = x0; i < x1; i++) { const o = (j * SW + i) * 4; fb[o] = c[2]; fb[o + 1] = c[1]; fb[o + 2] = c[0]; } else for (let i = x0; i < x1; i++) blend(i, j, c, a); } }
function rr(x, y, w, h, r, c, a) { x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); r = Math.min(r, w >> 1, h >> 1); a = a == null ? 1 : a;
  rect(x + r, y, w - 2 * r, h, c, a); rect(x, y + r, r, h - 2 * r, c, a); rect(x + w - r, y + r, r, h - 2 * r, c, a);
  for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) { const dx = r - i - 0.5, dy = r - j - 0.5, d = Math.sqrt(dx * dx + dy * dy), cov = Math.max(0, Math.min(1, r - d + 0.5)) * a; if (cov <= 0) continue;
    blend(x + i, y + j, c, cov); blend(x + w - 1 - i, y + j, c, cov); blend(x + i, y + h - 1 - j, c, cov); blend(x + w - 1 - i, y + h - 1 - j, c, cov); } }
function card(x, y, w, h, r, fill, border) { r = r || u(16); rr(x, y, w, h, r, border || C.b); rr(x + 1, y + 1, w - 2, h - 2, r - 1, fill || C.p); }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function tw(s, face, sz) { const f = font(face, sz); if (!f) return String(s).length * 8; let w = 0; for (const ch of String(s)) { const g = f.g[ch.charCodeAt(0)] || f.g[63]; w += g[0]; } return w; }
function text(x, y, s, face, sz, c, align) { const f = font(face, sz); if (!f) return 0; s = String(s); const w = tw(s, face, sz); if (align === "right") x -= w; else if (align === "center") x -= w / 2; let pen = x;
  for (const ch of s) { const g = f.g[ch.charCodeAt(0)] || f.g[63], b = g[5]; if (g[1]) for (let j = 0; j < g[2]; j++) for (let i = 0; i < g[1]; i++) { const a = b[j * g[1] + i]; if (a) blend(Math.round(pen) + g[3] + i, Math.round(y) + g[4] + j, c, a / 255); } pen += g[0]; } return w; }
const lh = (face, sz) => (font(face, sz) || { h: 16 }).h;
function drawLogo(x, y, h) { if (!LOGO) return 0; x = Math.round(x); y = Math.round(y); const sc = h / LOGO.h, w = Math.round(LOGO.w * sc); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const sx = LOGO.x0 + Math.min(LOGO.w - 1, Math.floor(i / sc)), sy = LOGO.y0 + Math.min(LOGO.h - 1, Math.floor(j / sc)), o = (sy * LOGO.n + sx) * 4, a = LOGO.b[o + 3] / 255; if (a) blend(x + i, y + j, [LOGO.b[o], LOGO.b[o + 1], LOGO.b[o + 2]], a); } return w; }
function area(x, y, w, h, data, lo, hi, c) { const n = Math.min(data.length, 120), d = data.slice(-n); if (d.length < 2) return; const val = (i) => Math.max(0, Math.min(1, (d[Math.max(0, Math.min(d.length - 1, i))] - lo) / (hi - lo || 1)));
  for (let i = 0; i < w; i++) { const fi = d.length - 1 - (w - 1 - i) * (d.length - 1) / (w - 1), i0 = Math.floor(fi), f = fi - i0, v = val(i0) * (1 - f) + val(i0 + 1) * f, top = Math.max(1, v * (h - 2)); for (let j = 0; j < top; j++) blend(x + i, y + h - 1 - j, c, 0.30 * (1 - j / h) + 0.06); blend(x + i, y + h - 1 - top, c, 1); blend(x + i, y + h - top, c, 0.5); } }
const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB/s" : b >= 1e3 ? (b / 1e3).toFixed(0) + " KB/s" : Math.round(b) + " B/s");
const upf = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + "h " + m + "m" : m + "m"; };

// ---- state ----
let hits = [], modal = null, msg = "", msgT = 0, sel = 0, page = process.env.BUTTER_PAGE || "home", nav = 0, mouse = { x: SW >> 1, y: SH >> 1 }, ver = null, tick = 0, power = false;
const NAV = [["home", "Home"], ["servers", "Servers"], ["network", "Network"], ["wifi", "Wi-Fi"], ["install", "Install"], ["power", "Power"]];
function toast(s) { msg = s; msgT = Date.now() + 6000; }
function hit(x, y, w, h, key) { hits.push({ x, y, w, h, key }); }
function pill(x, y, label, sz, filled, right) { const w = tw(label, filled ? "bold" : "sans", sz) + u(28), h = lh("sans", sz) + u(12); if (right) x -= w; if (filled) rr(x, y, w, h, h / 2, C.y); else { rr(x, y, w, h, h / 2, C.b); rr(x + 1, y + 1, w - 2, h - 2, h / 2 - 1, C.bg); } text(x + w / 2, y + u(6), label, filled ? "bold" : "sans", sz, filled ? C.yt : C.t, "center"); return { w, h, x }; }
function btn(x, y, label, key, o) { o = o || {}; const sz = o.sz || 14, w = tw(label, o.y ? "bold" : "sans", sz) + u(o.pad || 28), h = lh("sans", sz) + u(o.vp || 16), r = u(10);
  if (o.danger) { rr(x, y, w, h, r, C.r); rr(x + 1, y + 1, w - 2, h - 2, r - 1, C.p); } else rr(x, y, w, h, r, o.y ? C.y : C.p2);
  if (mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h) rr(x, y, w, h, r, o.y ? [255, 255, 255] : C.t, 0.14);
  text(x + w / 2, y + (h - lh("sans", sz)) / 2, label, o.y ? "bold" : "sans", sz, o.danger ? C.r : o.y ? C.yt : C.t, "center"); hit(x, y, w, h, key); return w; }

function stat(x, y, w, h, label, value, sub, data, lo, hi, c) { card(x, y, w, h); text(x + u(20), y + u(16), label, "sans", 14, C.m); text(x + u(20), y + u(40), value, "serif", 34, C.t);
  if (sub) text(x + u(20), y + h - u(30) - (data ? u(40) : 0) + (data ? 0 : u(4)), sub, "sans", 12, C.m); if (data) area(x + u(20), y + h - u(22) - u(34), w - u(40), u(34), data, lo, hi, c); }
function serverRows(x, y, w, rowH, max, actions) { const cols = [0, 0.27, 0.45, 0.53, 0.78].map((f) => x + f * w);
  ["Name", "State", "Players", "Join address"].forEach((s, i) => text(cols[i], y, s, "sans", 12, C.m)); rect(x, y + u(22), w, 1, C.b);
  if (!D.servers.length) { const e = D.agentOk || DEMO ? "No servers yet. Press N or tap + New to make one." : "Starting the server engine. The first start takes a minute..."; text(x, y + u(50), e, "sans", 16, C.m); return; }
  D.servers.slice(0, max).forEach((s, i) => { const ry = y + u(30) + i * rowH, run = s.state === "running", on = i === sel && page === "servers";
    if (on) rr(x - u(8), ry - u(4), w + u(16), rowH - u(4), u(10), C.p2, 0.7); hit(x - u(8), ry - u(4), w + u(16), rowH - u(4), "sel" + i);
    text(cols[0], ry + u(2), String(s.name).slice(0, 18), "bold", 16, C.t); text(cols[0], ry + u(24), (s.type === "bedrock" ? "Bedrock" : "Java") + " · " + (s.type === "bedrock" ? "" : cap(s.flavor || "paper") + " ") + (s.version || "latest"), "sans", 12, C.m);
    const sw = tw(s.state || "", "sans", 12) + u(20); rr(cols[1], ry + u(4), sw, u(24), u(12), run ? C.g : C.m, 0.9); rr(cols[1] + 1, ry + u(5), sw - 2, u(22), u(11), C.p); text(cols[1] + sw / 2, ry + u(9), run ? "running" : s.state || "stopped", "sans", 12, run ? C.g : C.m, "center");
    text(cols[2], ry + u(6), s.players == null ? "-" : s.players, "sans", 16, C.t);
    if (D.ip && s.port) text(cols[3], ry + u(2), D.ip + ":" + s.port, "sans", 14, C.t); if (s.join) text(cols[3], ry + u(22), "internet: " + s.join, "bold", 12, C.c);
    if (actions) { let bx = x + w; const del = tw("Delete", "sans", 14) + u(28); bx -= del; btn(bx, ry, "Delete", "del" + i, { danger: 1, vp: 12 }); bx -= u(8); const lw = tw("Start", "bold", 14) + u(28); bx -= lw + u(8); btn(bx, ry, run ? "Stop" : "Start", "tog" + i, { y: !run, vp: 12 }); } }); }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let prevWifi = -1;
function draw() {
  if (screen !== "app") { drawLogin(); return; }
  if (prevWifi >= 0 && D.wifi > prevWifi) toast("Wi-Fi adapter found. Press 4 to pick a network."); prevWifi = D.wifi;
  hits = []; rect(0, 0, SW, SH, C.bg);
  const SB = u(200), M = u(24);
  // sidebar
  rect(SB, 0, 1, SH, C.b); let lx = u(16); lx += text(lx, u(26), "Butter", "serif", 20, C.t) + u(6); const lw = drawLogo(lx, u(24), u(24)); text(lx + lw + u(6), u(26), "Os", "serif", 20, C.t);
  NAV.forEach((n, i) => { const y = u(80) + i * u(46), on = n[0] === page || (page === "home" && i === 0); if (on) rr(u(14), y, SB - u(28), u(40), u(10), C.y); text(u(30), y + u(11), n[1], on ? "bold" : "sans", 16, on ? C.yt : C.m); hit(u(14), y, SB - u(28), u(40), "nav" + i); });
  const bx = u(14), bh = u(96), by = SH - bh - u(16); card(bx, by, SB - u(28), bh, u(12)); text(bx + u(14), by + u(12), "This screen uses", "sans", 12, C.m); text(bx + u(14), by + u(30), D.guiMb ? D.guiMb.toFixed(0) + " MB" : "~30 MB", "bold", 20, C.g); text(bx + u(14), by + u(66), "of RAM (limit 400 MB)", "sans", 12, C.m);
  // top bar
  const X = SB + M, W = SW - SB - 2 * M, titles = { home: "Home", servers: "Servers", network: "Network" };
  text(X, u(22), titles[page] || "Home", "serif", 34, C.t);
  let rx = SW - M; const np = pill(rx, u(24), "+ New", 14, true, true); hit(np.x, u(24), np.w, np.h, "n"); rx = np.x - u(8);
  const lp = pill(rx, u(24), ui.light ? "Dark" : "Light", 14, false, true); hit(lp.x, u(24), lp.w, lp.h, "t"); rx = lp.x - u(8);
  const up = pill(rx, u(24), "up " + upf(D.up), 14, false, true); rx = up.x - u(8); pill(rx, u(24), "butter-box · " + (D.ip || "no network"), 14, false, true);
  const top = u(86);
  if (page === "home") {
    const gw = (W - 3 * u(16)) / 4, gh = u(150);
    stat(X, top, gw, gh, "CPU", D.cpu.toFixed(0) + "%", D.cores + " cores · load " + D.load.split(" ")[0], H.cpu, 0, 100, C.c);
    stat(X + gw + u(16), top, gw, gh, "Memory", (D.memUsed / 1024).toFixed(1) + " GB", "of " + (D.memTotal / 1024).toFixed(1) + " GB", H.mem, 0, 100, C.y);
    stat(X + 2 * (gw + u(16)), top, gw, gh, "Temperature", D.temp == null ? "n/a" : D.temp.toFixed(0) + "°C", D.temp == null ? "no sensor found" : (D.tempLabel || "sensor").toLowerCase(), H.temp, 30, 100, C.r);
    stat(X + 3 * (gw + u(16)), top, gw, gh, "Network", kb(D.rx), "sending " + kb(D.tx), H.rx, 0, Math.max(50000, ...H.rx.slice(-120)), C.g);
    const sy = top + gh + u(16), sh = SH - sy - u(56); card(X, sy, W, sh); text(X + u(22), sy + u(18), "Servers", "serif", 26, C.t);
    serverRows(X + u(22), sy + u(66), W - u(44), u(54), Math.floor((sh - u(100)) / u(54)), true);
  } else if (page === "servers") {
    const sh = SH - top - u(56); card(X, top, W, sh); text(X + u(22), top + u(18), "Your servers", "serif", 26, C.t); serverRows(X + u(22), top + u(66), W - u(44), u(60), Math.floor((sh - u(100)) / u(60)), true);
    if (D.servers.length) text(X + u(22), top + sh - u(34), "Up/Down choose · Enter start or stop · Del remove · N new", "sans", 12, C.m);
  } else if (page === "network") {
    const h1 = u(190); card(X, top, W, h1); text(X + u(22), top + u(18), "Open the web page", "serif", 26, C.t);
    text(X + u(22), top + u(70), D.ip ? "On any phone or PC on the same network, open:" : "No network yet. Plug in a cable, or press 4 for Wi-Fi.", "sans", 16, C.m); if (D.ip) text(X + u(22), top + u(96), "http://" + D.ip, "serif", 34, C.y);
    text(X + u(22), top + h1 - u(34), "Wi-Fi adapters found: " + D.wifi + (D.wifi ? "" : "  (plug in a USB adapter such as RTL8188EU)"), "sans", 14, C.m);
    const y2 = top + h1 + u(16), h2 = SH - y2 - u(56); card(X, y2, W, h2); text(X + u(22), y2 + u(18), "Traffic", "serif", 26, C.t); text(X + u(22), y2 + u(60), "Receiving " + kb(D.rx) + "   ·   sending " + kb(D.tx), "sans", 16, C.t); area(X + u(22), y2 + u(96), W - u(44), h2 - u(120), H.rx, 0, Math.max(50000, ...H.rx.slice(-120)), C.g);
  }
  text(X, SH - u(34), Date.now() < msgT ? msg : "Hosting Minecraft Java and Bedrock, nothing else.", "sans", 13, Date.now() < msgT ? C.y : C.m);
  text(SW - M, SH - u(34), "keys: 1 play  2 web  3 install  4 wi-fi  n new  t theme  p power", "sans", 12, C.m, "right");
  if (modal) drawModal(); if (power) drawPower();
}
function dim() { rect(0, 0, SW, SH, [0, 0, 0], 0.55); }
function drawPower() { dim(); const w = u(520), h = u(220), x = (SW - w) / 2, y = (SH - h) / 2; card(x, y, w, h); text(x + u(26), y + u(24), "Power", "serif", 26, C.t); text(x + u(26), y + u(70), "What would you like to do?", "sans", 16, C.m);
  let bx = x + u(26); bx += btn(bx, y + u(110), "Shut down", "pw-off", { y: 1 }) + u(10); bx += btn(bx, y + u(110), "Restart", "pw-re") + u(10); bx += btn(bx, y + u(110), "Lock", "pw-lock") + u(10); btn(bx, y + u(110), "Cancel", "pw-no"); }
function drawAcct() { dim(); const w = u(520), h = u(250), x = (SW - w) / 2, y = (SH - h) / 2; card(x, y, w, h); text(x + u(28), y + u(22), "Password for " + (users[cu] || users[0]).name, "serif", 26, C.t);
  text(x + u(28), y + u(74), "New password (empty = no password)", "sans", 12, C.m); rr(x + u(28), y + u(92), w - u(56), u(40), u(10), C.y); rr(x + u(29), y + u(93), w - u(58), u(38), u(9), C.bg); text(x + u(42), y + u(102), "\u2022".repeat(modal.pw.length) || "", "sans", 16, C.t);
  btn(x + u(28), y + h - u(72), "Save", "enter", { y: 1 }); btn(x + u(130), y + h - u(72), "Cancel", "esc"); }
function drawModal() {
  if (modal.acct) return drawAcct();
  dim(); const w = Math.min(SW - u(40), u(640)), h = u(470), x = (SW - w) >> 1, y = (SH - h) >> 1, m = modal; card(x, y, w, h); text(x + u(28), y + u(22), "New server", "serif", 26, C.t);
  const list = m.type === "bedrock" ? (ver ? ver.bedrock : ["LATEST"]) : ["LATEST"].concat(ver ? ver.java : []), rows = [["Name", m.name + (m.f === 0 && tick % 2 ? "|" : "")], ["Game", m.type === "java" ? "Minecraft Java" : "Minecraft Bedrock"], ["Software", m.type === "bedrock" ? "Bedrock (official)" : cap(m.flavor)], ["Version", String(list[m.vi] || "LATEST").replace("LATEST", "Latest").replace("PREVIEW", "Preview")]];
  rows.forEach((r, i) => { const ry = y + u(80) + i * u(62), on = m.f === i; text(x + u(28), ry - u(2), r[0], "sans", 12, C.m); rr(x + u(28), ry + u(16), w - u(56), u(38), u(10), on ? C.y : C.b); rr(x + u(28) + 1, ry + u(17), w - u(56) - 2, u(36), u(9), C.bg);
    text(x + u(42), ry + u(25), i ? "<   " + r[1] + "   >" : r[1], "sans", 16, C.t); hit(x + u(28), ry + u(16), w - u(56), u(38), "field" + i); });
  const note = !ver ? "Loading the version list..." : m.err ? m.err.slice(0, 70) : m.type === "java" && m.flavor === "paper" ? "Paper runs 1.8 and newer. For older versions pick Vanilla." : "Pick any version. Mods: use Fabric or Forge.";
  text(x + u(28), y + h - u(110), note, "sans", 13, m.err ? C.r : C.m); btn(x + u(28), y + h - u(70), m.busy ? "Creating..." : "Create", "enter", { y: 1 }); btn(x + u(150), y + h - u(70), "Cancel", "esc");
  text(x + w - u(28), y + h - u(58), "arrows change · Tab next · Enter create", "sans", 12, C.m, "right"); }
function openNew() { modal = { name: "world" + (D.servers.length + 1), type: "java", flavor: "paper", vi: 0, f: 0, err: "", busy: false }; if (!ver) api("a=versions", (j) => { if (j && j.ok) ver = j; }, 25000); }
function create() { const m = modal; if (m.busy) return; m.busy = true; m.err = ""; const list = m.type === "bedrock" ? (ver ? ver.bedrock : ["LATEST"]) : ["LATEST"].concat(ver ? ver.java : []), v = list[m.vi] || "LATEST";
  api("a=create&n=" + encodeURIComponent(m.name) + "&type=" + m.type + "&mem=1024&ver=" + encodeURIComponent(v) + "&flavor=" + (m.type === "bedrock" ? "paper" : m.flavor), (j) => { m.busy = false; if (j && j.ok) { modal = null; toast("Server " + m.name + " is starting"); agent(); } else m.err = (j && j.error) || "could not create"; }, 300000); }
function external(cmd) { stopInput(); try { fs.writeSync(1, "\x1b[2J\x1b[H\x1b[?25h"); cp.spawnSync("/bin/sh", ["-c", cmd], { stdio: "inherit" }); } catch (e) {} startInput(); toast("Welcome back"); }
function toggle(s) { if (!s) return; const a = s.state === "running" ? "stop" : "start"; toast((a === "stop" ? "Stopping " : "Starting ") + s.name + "..."); api("a=" + a + "&n=" + encodeURIComponent(s.name), (j) => { toast(j && j.ok ? "Done" : (j && j.error) || "Failed"); agent(); }, 90000); }
function remove(s) { if (!s) return; toast("Removing " + s.name + "..."); api("a=delete&n=" + encodeURIComponent(s.name), (j) => { toast(j && j.ok ? "Removed" : (j && j.error) || "Failed"); agent(); }, 90000); }
function go(i) { const k = NAV[i][0]; if (k === "wifi") key("4"); else if (k === "install") key("3"); else if (k === "power") power = true; else page = k; nav = i; }
function powerKey(k) { power = false; if (k === "pw-off" || k === "y") cp.exec("poweroff"); else if (k === "pw-re" || k === "r") cp.exec("reboot"); else if (k === "pw-lock" || k === "l") { screen = users.length > 1 ? "picker" : "login"; pw = ""; lerr = ""; } }
function key(k) {
  if (screen !== "app") { loginKey(k); return; }
  if (power) { powerKey(k); return; }
  if (modal && modal.acct) { const m = modal; if (k === "esc") modal = null; else if (k === "enter") { const us = users[cu] || users[0]; if (m.pw) { us.salt = crypto.randomBytes(8).toString("hex"); us.hash = hashpw(us.salt, m.pw); } else { delete us.hash; delete us.salt; } try { fs.writeFileSync(USERF, JSON.stringify({ users })); toast(m.pw ? "Password saved" : "Password removed"); } catch (e) { toast("Could not save"); } modal = null; } else if (k === "bs") m.pw = m.pw.slice(0, -1); else if (k.length === 1 && k >= " " && m.pw.length < 40) m.pw += k; return; }
  if (modal) { const m = modal;
    if (k === "esc") modal = null; else if (k === "enter") create(); else if (k.startsWith("field")) m.f = +k.slice(5);
    else if (k === "up" || k === "btab") m.f = (m.f + 3) % 4; else if (k === "down" || k === "tab") m.f = (m.f + 1) % 4;
    else if (k === "left" || k === "right") { const d = k === "left" ? -1 : 1; if (m.f === 1) { m.type = m.type === "java" ? "bedrock" : "java"; m.vi = 0; } else if (m.f === 2 && m.type === "java") { const o = ["paper", "vanilla", "fabric", "forge"]; m.flavor = o[(o.indexOf(m.flavor) + d + 4) % 4]; } else if (m.f === 3) { const n = m.type === "bedrock" ? (ver ? ver.bedrock.length : 1) : 1 + (ver ? ver.java.length : 0); m.vi = (m.vi + d + n) % n; } }
    else if (m.f === 0) { if (k === "bs") m.name = m.name.slice(0, -1); else if (/^[A-Za-z0-9-]$/.test(k) && m.name.length < 24) m.name += k; }
    return; }
  const s = D.servers[sel];
  if (k.startsWith("nav")) go(+k.slice(3)); else if (k.startsWith("sel")) sel = +k.slice(3); else if (k.startsWith("tog")) toggle(D.servers[+k.slice(3)]); else if (k.startsWith("del")) remove(D.servers[+k.slice(3)]);
  else if (k === "up") sel = Math.max(0, sel - 1); else if (k === "down") sel = Math.min(Math.max(0, D.servers.length - 1), sel + 1);
  else if (k === "left") go((nav + 5) % 6); else if (k === "right") go((nav + 1) % 6);
  else if (k === "enter") toggle(s); else if (k === "d" || k === "del") remove(s);
  else if (k === "1") external("/usr/local/bin/butter-play; printf '\\nPress Enter '; read x"); else if (k === "2") page = "network";
  else if (k === "3") external("/usr/local/bin/butter-install; printf '\\nPress Enter '; read x"); else if (k === "4") external("/usr/local/bin/butter-wifi");
  else if (k === "n") openNew(); else if (k === "t") { ui.light = !ui.light; theme(); try { fs.writeFileSync(UIF, JSON.stringify(ui)); } catch (e) {} } else if (k === "a") modal = { acct: true, pw: "", f: 0 }; else if (k === "p") power = true; else if (k === "h") page = "home"; else if (k === "s") page = "servers";
}

// ---- accounts (optional password; default is one account with no password) ----
const crypto = require("crypto"), USERF = process.env.BUTTER_USERS || "/etc/butter-users.json";
let users = [{ name: "Claude", role: "Admin" }]; try { const j = JSON.parse(fs.readFileSync(USERF, "utf8")); if (Array.isArray(j.users) && j.users.length) users = j.users; } catch (e) {}
const hashpw = (salt, pw) => crypto.createHash("sha256").update(salt + pw).digest("hex");
let screen = process.env.BUTTER_NOLOGIN ? "app" : process.env.BUTTER_SCREEN === "picker" ? "picker" : process.env.BUTTER_SCREEN === "login" || process.env.BUTTER_SCREEN === "wrong" ? "login" : users.length > 1 ? "picker" : "login";
let cu = 0, pw = "", lerr = process.env.BUTTER_SCREEN === "wrong" ? "Wrong password, try again" : "", me = users[0].name;
const AV = [["ffe27a", "ffc21a", "222222"], ["7dd3fc", "3b82f6", "0b1b3a"], ["5ef2b0", "13966a", "062a1e"], ["ff9ecb", "d63384", "3a0a22"]];
const hx = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
function avatar(cx, cy, r, i, name) { const a = AV[i % AV.length], c1 = hx(a[0]), c2 = hx(a[1]);
  for (let y = -r; y <= r; y++) { const half = Math.sqrt(r * r - y * y); for (let x = -Math.floor(half); x <= half; x++) { const edge = Math.min(1, (half - Math.abs(x)) + 0.5); blend(Math.round(cx + x), Math.round(cy + y), mix(c1, c2, (y + r) / (2 * r)), Math.max(0, edge)); } }
  text(cx, cy - lh("serif", r > 40 * U ? 52 : 34) / 2 + u(2), (name || "?").charAt(0).toUpperCase(), "serif", r > u(40) ? 52 : 34, hx(a[2]), "center"); }
function ring(cx, cy, r, c, th) { for (let a = 0; a < 6.2832; a += 0.5 / r) for (let t = 0; t < th; t++) blend(Math.round(cx + Math.cos(a) * (r + t)), Math.round(cy + Math.sin(a) * (r + t)), c, 1); }
function batt() { try { for (const d of fs.readdirSync("/sys/class/power_supply")) { if (fs.readFileSync("/sys/class/power_supply/" + d + "/type", "utf8").trim() === "Battery") return fs.readFileSync("/sys/class/power_supply/" + d + "/capacity", "utf8").trim() + "%"; } } catch (e) {} return DEMO ? "87%" : null; }
function drawLogin() {
  hits = []; rect(0, 0, SW, SH, C.bg); const gx = SW / 2, gy = SH * 0.38, R = Math.min(SW, SH) * 0.62;
  for (let y = Math.max(0, Math.floor(gy - R)); y < Math.min(SH, gy + R); y++) for (let x = Math.max(0, Math.floor(gx - R * 1.4)); x < Math.min(SW, gx + R * 1.4); x++) { const d = Math.hypot((x - gx) / 1.4, y - gy) / R; if (d < 1) blend(x, y, C.y, ui.light ? 0.16 * (1 - d) * (1 - d) : 0.14 * (1 - d) * (1 - d)); }
  let lx = u(30); lx += text(lx, u(26), "Butter", "serif", 20, C.t) + u(6); const lw = drawLogo(lx, u(24), u(24)); text(lx + lw + u(6), u(26), "Os", "serif", 20, C.t);
  text(SW - u(30), u(28), "butter-box · " + (D.ip || "no network"), "sans", 14, C.m, "right");
  const cx = SW / 2, cy = SH * 0.38;
  if (screen === "picker") {
    text(cx, cy - u(110), "Who is hosting today?", "serif", 34, C.t, "center"); const n = Math.min(4, users.length), cw = u(170), gap = u(26), tot = n * cw + (n - 1) * gap;
    users.slice(0, 4).forEach((us, i) => { const x = cx - tot / 2 + i * (cw + gap), y = cy - u(50), on = i === cu; card(x, y, cw, u(190), u(18), on ? C.p2 : C.p, on ? C.y : C.b); avatar(x + cw / 2, y + u(66), u(36), i, us.name); text(x + cw / 2, y + u(120), us.name, "bold", 16, C.t, "center"); text(x + cw / 2, y + u(146), us.role === "Guest" ? "Nothing is saved" : us.role || "", "sans", 12, C.m, "center"); hit(x, y, cw, u(190), "user" + i); });
    text(cx, cy + u(180), "Left / Right to choose  ·  Enter to continue", "sans", 13, C.m, "center");
  } else {
    const r = u(60), us = users[cu] || users[0]; avatar(cx, cy - u(40), r, cu, us.name); ring(cx, cy - u(40), r + u(5), C.p, 2); ring(cx, cy - u(40), r + u(7), C.b, 1);
    text(cx, cy + u(36), us.name, "serif", 34, C.t, "center"); text(cx, cy + u(84), us.hash ? "Enter your password" : "Hosting account  ·  ready", "sans", 14, C.m, "center");
    const w = u(420), x = cx - w / 2, y = cy + u(116); rr(x, y, w, u(50), u(12), C.y); rr(x + 1, y + 1, w - 2, u(48), u(11), C.p); rr(x - 3, y - 3, w + 6, u(56), u(14), C.y, 0.18);
    text(x + u(18), y + u(15), pw ? "•".repeat(pw.length) : (us.hash ? "Password" : "Password (press Enter to skip)"), "sans", 16, pw ? C.t : C.m);
    rr(x, y + u(64), w, u(50), u(12), C.y); text(cx, y + u(64) + u(14), "Log in", "bold", 16, C.yt, "center"); hit(x, y + u(64), w, u(50), "enter");
    text(cx, y + u(134), lerr || (us.hash ? "Type your password and press Enter" : "No password is set. Press A inside to add one."), "sans", 13, lerr ? C.r : C.m, "center");
    if (users.length > 1) { text(cx, y + u(160), "Tab: switch user", "sans", 12, C.m, "center"); }
  }
  const d = new Date(), days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], tm = days[d.getDay()] + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  text(u(30), SH - u(42), tm, "sans", 14, C.m); let rx = SW - u(30); const b = batt();
  const P = (label, key, dot) => { const w = tw(label, "sans", 14) + u(28) + (dot ? u(18) : 0), h = lh("sans", 14) + u(12); rx -= w; rr(rx, SH - u(52), w, h, h / 2, C.b); rr(rx + 1, SH - u(51), w - 2, h - 2, h / 2 - 1, C.p); if (dot) { rr(rx + w - u(24), SH - u(52) + h / 2 - u(4), u(8), u(8), u(4), D.ip ? C.g : C.r); } text(rx + u(14), SH - u(46), label, "sans", 14, C.t); if (key) hit(rx, SH - u(52), w, h, key); rx -= u(8); };
  P("Power", "pwask"); if (b) P("Battery " + b); P("Wi-Fi", null, true); P("English (US)");
  if (power) drawPower();
}
function loginKey(k) {
  if (power) { powerKey(k); return; }
  if (k === "pwask") { power = true; return; }
  if (k.startsWith("user")) { cu = +k.slice(4); me = users[cu].name; screen = "login"; pw = ""; lerr = ""; return; }
  if (screen === "picker") { if (k === "left") cu = (cu + users.length - 1) % users.length; else if (k === "right") cu = (cu + 1) % users.length; else if (k === "enter") { screen = "login"; pw = ""; lerr = ""; } return; }
  if (k === "tab" && users.length > 1) { cu = (cu + 1) % users.length; pw = ""; lerr = ""; return; }
  if (k === "esc" && users.length > 1) { screen = "picker"; return; }
  if (k === "bs") { pw = pw.slice(0, -1); return; }
  if (k === "enter") { const us = users[cu]; if (!us.hash || hashpw(us.salt || "", pw) === us.hash) { screen = "app"; me = us.name; pw = ""; lerr = ""; toast("Welcome, " + me); } else { lerr = "Wrong password, try again"; pw = ""; } return; }
  if (k.length === 1 && k >= " " && pw.length < 40) { pw += k; lerr = ""; }
}
// ---- input ----
const KEYS = { "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[3~": "del", "\x1b[Z": "btab", "\r": "enter", "\n": "enter", "\t": "tab", "\x7f": "bs", "\b": "bs", "\x1b": "esc" };
function onData(d) { const s = d.toString("latin1"), k = KEYS[s] || (s.length === 1 ? s : null); if (!k) return; key(modal || screen !== "app" ? k : k.length === 1 ? k.toLowerCase() : k); draw(); flush(); }
let mfd = null, mbuf = [];
// ---- pointer: drawn as a small overlay straight on the screen so moving it never redraws the page ----
const CS = SH >= 1000 ? 2 : 1, SPEED = SH >= 1000 ? 1.5 : 1;
const ARROW = ["X", "XX", "XWX", "XWWX", "XWWWX", "XWWWWX", "XWWWWWX", "XWWWWWWX", "XWWWWWWWX", "XWWWWWXXXXX", "XWWXWWX", "XWX XWWX", "XX  XWWX", "X    XWWX", "     XWWX", "      XX"];
const CW_ = 12 * CS + 2, CH_ = 17 * CS + 2;
function overHit() { return hits.slice().reverse().find((r) => mouse.x >= r.x && mouse.x < r.x + r.w && mouse.y >= r.y && mouse.y < r.y + r.h); }
function stampCursor(buf, ox, oy, w, h) { const over = !!overHit(); for (let r = 0; r < ARROW.length; r++) for (let q = 0; q < ARROW[r].length; q++) { const ch = ARROW[r][q]; if (ch !== "X" && ch !== "W") continue;
  const c = ch === "X" ? [0, 0, 0] : over ? [255, 210, 63] : [255, 255, 255];
  for (let dy = 0; dy < CS; dy++) for (let dx = 0; dx < CS; dx++) { const x = mouse.x + q * CS + dx - ox, y = mouse.y + r * CS + dy - oy; if (x < 0 || y < 0 || x >= w || y >= h) continue; const o = (y * w + x) * 4; buf[o] = c[2]; buf[o + 1] = c[1]; buf[o + 2] = c[0]; } } }
function openFb() { if (fd === null) fd = fs.openSync(FBP, process.env.BUTTER_FB ? "w" : "r+"); return fd; }
function putRegion(x, y, w, h, src) { try { const f = openFb(); for (let j = 0; j < h; j++) { let row; if (G.bpp === 32) row = src.subarray(j * w * 4, (j + 1) * w * 4); else { row = Buffer.alloc(w * 2); for (let i = 0; i < w; i++) { const o = (j * w + i) * 4; row.writeUInt16LE(((src[o + 2] >> 3) << 11) | ((src[o + 1] >> 2) << 5) | (src[o] >> 3), i * 2); } } fs.writeSync(f, row, 0, row.length, (y + j) * G.stride + x * (G.bpp / 8)); } } catch (e) {} }
function region(x, y) { const x0 = Math.max(0, Math.min(SW - 1, x)), y0 = Math.max(0, Math.min(SH - 1, y)), w = Math.min(CW_, SW - x0), h = Math.min(CH_, SH - y0), buf = Buffer.alloc(w * h * 4); for (let j = 0; j < h; j++) fb.copy(buf, j * w * 4, ((y0 + j) * SW + x0) * 4, ((y0 + j) * SW + x0 + w) * 4); return { x0, y0, w, h, buf }; }
function paintCursor() { const r = region(mouse.x, mouse.y); stampCursor(r.buf, r.x0, r.y0, r.w, r.h); putRegion(r.x0, r.y0, r.w, r.h, r.buf); }
function eraseCursor(x, y) { const r = region(x, y); putRegion(r.x0, r.y0, r.w, r.h, r.buf); }
const acc = (d) => d * (1 + Math.min(2.5, Math.abs(d) / 8)) * SPEED;
let hoverK = null;
function onMouse(d) { let moved = false, click = null; const ox = mouse.x, oy = mouse.y;
  for (const b of d) { mbuf.push(b); if (mbuf.length === 3) { const [f, dx, dy] = mbuf; mbuf = []; if (!(f & 8)) { mbuf = []; continue; }
    const sx = dx - (f & 0x10 ? 256 : 0), sy = dy - (f & 0x20 ? 256 : 0); if (sx || sy) { mouse.fx = (mouse.fx || 0) + acc(sx); mouse.fy = (mouse.fy || 0) - acc(sy); const ix = Math.trunc(mouse.fx), iy = Math.trunc(mouse.fy); mouse.fx -= ix; mouse.fy -= iy; mouse.x = Math.max(0, Math.min(SW - 1, mouse.x + ix)); mouse.y = Math.max(0, Math.min(SH - 1, mouse.y + iy)); moved = true; }
    if (f & 1 && !mouse.down) { mouse.down = true; const h = overHit(); if (h) click = h.key; } else if (!(f & 1)) mouse.down = false; } }
  if (click) { key(click); draw(); flush(); return; }
  if (moved) { const h = overHit(), hk = h ? h.key : null; if (hk !== hoverK) { hoverK = hk; draw(); flush(); } else { eraseCursor(ox, oy); paintCursor(); } } }
function startInput() { try { process.stdin.setRawMode && process.stdin.setRawMode(true); } catch (e) {} process.stdin.resume(); process.stdin.on("data", onData);
  try { mfd = fs.createReadStream("/dev/input/mice"); mfd.on("data", onMouse); mfd.on("error", () => {}); } catch (e) {} fs.writeSync(1, "\x1b[?25l\x1b[2J"); }
function stopInput() { process.stdin.removeListener("data", onData); try { process.stdin.setRawMode && process.stdin.setRawMode(false); } catch (e) {} if (mfd) { mfd.destroy(); mfd = null; } }
function flush() { let out;
  if (G.bpp === 32 && G.stride === SW * 4) out = fb; else if (G.bpp === 32) { out = Buffer.alloc(G.stride * SH); for (let y = 0; y < SH; y++) fb.copy(out, y * G.stride, y * SW * 4, (y + 1) * SW * 4); }
  else { out = Buffer.alloc(G.stride * SH); for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const o = (y * SW + x) * 4; out.writeUInt16LE(((fb[o + 2] >> 3) << 11) | ((fb[o + 1] >> 2) << 5) | (fb[o] >> 3), y * G.stride + x * 2); } }
  try { if (fd === null) fd = fs.openSync(FBP, process.env.BUTTER_FB ? "w" : "r+"); fs.writeSync(fd, out, 0, out.length, 0); } catch (e) {} if (!process.env.BUTTER_NOCURSOR) paintCursor(); }
if (DEMO) { demo(); mouse.x = Math.round(SW * 0.62); mouse.y = Math.round(SH * 0.47); if (process.env.BUTTER_EMPTY) D.servers = []; if (process.env.BUTTER_DEMO_MODAL) { ver = { java: ["1.21.4", "1.21.1", "1.20.4", "1.16.5", "1.8.9"], bedrock: ["LATEST", "PREVIEW"] }; openNew(); modal.f = 3; } draw(); flush(); process.exit(0); }
process.on("exit", () => { try { fs.writeSync(1, "\x1b[?25h\x1b[2J"); } catch (e) {} }); process.on("SIGTERM", () => process.exit(0));
local(); agent(); startInput(); draw(); flush();
setInterval(() => { local(); D.guiMb = process.memoryUsage().rss / 1048576; tick++; draw(); flush(); }, 1000); setInterval(agent, 4000);
