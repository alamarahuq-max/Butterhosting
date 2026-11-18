#!/usr/bin/env node
// ButterOS on-device GUI: draws straight to the framebuffer (/dev/fb0). No X, no browser: about 30 MB of RAM.
// Retro-futuristic HUD: live CPU / memory / temperature / network graphs, server cards, mouse + keyboard.
// Preview without a device: BUTTER_DEMO=1 BUTTER_FB=/tmp/f.raw BUTTER_FBSIZE=1280x720 BUTTER_PSF=/path/font.psf node gui.js
const fs = require("fs"), zlib = require("zlib"), cp = require("child_process");
const { H, D, local, agent, demo, push, api, THEMES } = require("./data");
const DEMO = process.env.BUTTER_DEMO === "1", FBP = process.env.BUTTER_FB || "/dev/fb0";
const UIF = process.env.BUTTER_UI_FILE || "/etc/butter-ui.json";
let ui = { theme: "NEON BUTTER" }; try { ui = Object.assign(ui, JSON.parse(fs.readFileSync(UIF, "utf8"))); } catch (e) {}
if (!THEMES[ui.theme]) ui.theme = "NEON BUTTER";
const THN = Object.keys(THEMES);

// ---- framebuffer geometry ----
function geom() {
  if (process.env.BUTTER_FBSIZE) { const [w, h] = process.env.BUTTER_FBSIZE.split("x").map(Number); return { w, h, bpp: 32, stride: w * 4 }; }
  const rd = (f) => fs.readFileSync("/sys/class/graphics/fb0/" + f, "utf8").trim();
  const [w, h] = rd("virtual_size").split(",").map(Number); return { w, h: Math.min(h, +rd("virtual_size").split(",")[1]), bpp: +rd("bits_per_pixel"), stride: +rd("stride") };
}
let G; try { G = geom(); } catch (e) { process.exit(3); }
if (G.w < 640 || G.h < 400 || (G.bpp !== 32 && G.bpp !== 16)) process.exit(3);
const { w: SW, h: SH } = G;
// ---- font (PSF1/PSF2, Terminus) ----
function loadPsf() {
  const cands = [process.env.BUTTER_PSF, "/usr/share/consolefonts/ter-v16b.psf.gz", "/usr/share/consolefonts/ter-v16n.psf.gz", "/usr/share/consolefonts/ter-v14b.psf.gz"].filter(Boolean);
  for (const p of cands) { try {
    let b = fs.readFileSync(p); if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
    if (b.readUInt32LE(0) === 0x864ab572) { const hs = b.readUInt32LE(8), n = b.readUInt32LE(16), bpg = b.readUInt32LE(20), h = b.readUInt32LE(24), w = b.readUInt32LE(28); return { b, hs, n, bpg, h, w }; }
    if (b[0] === 0x36 && b[1] === 0x04) { const n = b[2] & 1 ? 512 : 256, h = b[3]; return { b, hs: 4, n, bpg: h, h, w: 8 }; }
  } catch (e) {} } return null;
}
const F = loadPsf(); if (!F) process.exit(3);
const SC = SH >= 1000 ? 2 : 1, CW = F.w * SC, CH = F.h * SC;
const fbuf = Buffer.alloc(SW * SH * 4);
let T = THEMES[ui.theme].map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const col = (i) => T[i];
function px(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= SW || y >= SH) return; const o = (y * SW + x) * 4; fbuf[o] = c[2]; fbuf[o + 1] = c[1]; fbuf[o + 2] = c[0]; fbuf[o + 3] = 255; }
function rect(x, y, w, h, c) { x |= 0; y |= 0; w |= 0; h |= 0; for (let j = Math.max(0, y); j < Math.min(SH, y + h); j++) for (let i = Math.max(0, x); i < Math.min(SW, x + w); i++) { const o = (j * SW + i) * 4; fbuf[o] = c[2]; fbuf[o + 1] = c[1]; fbuf[o + 2] = c[0]; fbuf[o + 3] = 255; } }
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function frame(x, y, w, h, c, th) { th = th || SC; rect(x, y, w, th, c); rect(x, y + h - th, w, th, c); rect(x, y, th, h, c); rect(x + w - th, y, th, h, c); }
function text(x, y, s, c, k) { x = Math.round(x); y = Math.round(y); k = k || 1; s = String(s); const sc = SC * k;
  for (let n = 0; n < s.length; n++) { let code = s.charCodeAt(n); if (code >= F.n) code = 63; const o = F.hs + code * F.bpg, rb = Math.ceil(F.w / 8);
    for (let r = 0; r < F.h; r++) for (let q = 0; q < F.w; q++) if (F.b[o + r * rb + (q >> 3)] & (0x80 >> (q & 7))) { if (sc === 1) px(x + n * F.w + q, y + r, c); else rect(x + (n * F.w + q) * sc, y + r * sc, sc, sc, c); } } return s.length * F.w * sc; }
const tw = (s, k) => String(s).length * F.w * SC * (k || 1);
function grid(x, y, w, h) { const c = mix(col(0), col(4), 0.35); for (let i = 0; i <= w; i += CW * 2) rect(x + i, y, 1, h, c); for (let j = 0; j <= h; j += CH * 2) rect(x, y + j, w, 1, c); }
function chart(x, y, w, h, data, lo, hi, c1, c2) { // filled line chart with scanline glow
  rect(x, y, w, h, mix(col(0), [0, 0, 0], 0.25)); grid(x, y, w, h);
  const n = Math.min(data.length, Math.floor(w / (2 * SC))), step = 2 * SC, d = data.slice(-n);
  for (let i = 0; i < d.length; i++) { const v = Math.max(0, Math.min(1, (d[i] - lo) / (hi - lo || 1))), bh = Math.max(SC, v * (h - 2)), bx = x + w - (d.length - i) * step;
    for (let j = 0; j < bh; j += 2) rect(bx, y + h - 1 - j, step - 1, 1, mix(c1, c2, j / (h - 2))); rect(bx, y + h - 1 - bh, step - 1, SC, col(15)); }
  frame(x, y, w, h, mix(col(0), col(4), 0.8), 1);
}
const bar = (x, y, w, h, v, c) => { rect(x, y, w, h, mix(col(0), col(4), 0.4)); rect(x, y, Math.max(0, Math.min(1, v)) * w, h, c); };
const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB/s" : b >= 1e3 ? (b / 1e3).toFixed(0) + " KB/s" : Math.round(b) + " B/s");
const tmf = (s) => { s = Math.floor(s); const p = (n) => String(n).padStart(2, "0"); return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s % 3600 / 60)) + ":" + p(s % 60); };

// ---- state ----
let hits = [], modal = null, msg = "", msgT = 0, sel = 0, mouse = { x: SW >> 1, y: SH >> 1 }, ver = null, tick = 0;
const MENU = [["1", "PLAY"], ["2", "WEB"], ["3", "INSTALL"], ["4", "WI-FI"], ["N", "NEW SERVER"], ["T", "THEME"], ["P", "POWER"]];
function toast(s) { msg = s; msgT = Date.now() + 6000; }
function button(x, y, w, h, label, key, c) { rect(x, y, w, h, mix(col(0), c, 0.18)); frame(x, y, w, h, c); text(x + (w - tw(label)) / 2, y + (h - CH) / 2, label, c); hits.push({ x, y, w, h, key }); }

function draw() {
  hits = []; const bg = col(0); rect(0, 0, SW, SH, bg);
  for (let j = 0; j < SH; j += 3) rect(0, j, SW, 1, mix(bg, [0, 0, 0], 0.22)); // scanlines
  const m = Math.round(CW * 1.5), top = m;
  // header
  const k = SC >= 2 ? 3 : 4; let x = m; const L = "BUTTER";
  for (let i = 0; i < L.length; i++) x += text(x, top, L[i], mix(col(11), col(13), i / 5), k);
  x += tw(" ", k); text(x, top, "OS", col(14), k);
  text(m, top + CH * k + 2, "FREE MINECRAFT HOSTING  /  JAVA + BEDROCK", col(8)); const rs = "UP " + tmf(D.up);
  text(SW - m - tw(rs), top + 2, rs, col(14)); const ipx = D.ip ? "http://" + D.ip : "NO NETWORK"; text(SW - m - tw(ipx), top + 2 + CH, ipx, D.ip ? col(10) : col(1));
  const lines = ["DISK " + (D.persist ? "STORAGE READY" : "RAM ONLY"), "WIFI ADAPTERS " + D.wifi]; lines.forEach((s, i) => text(SW - m - tw(s), top + 2 + CH * (2 + i), s, col(8)));
  rect(m, top + CH * k + CH + 8, SW - 2 * m, SC * 2, col(13)); rect(m, top + CH * k + CH + 8 + SC * 2, SW - 2 * m, 1, col(5));
  // four graph panels
  const py = top + CH * k + CH + 8 + SC * 6 + 8, gap = m, pw = Math.floor((SW - 2 * m - 3 * gap) / 4), ph = Math.floor(SH * 0.30);
  const panels = [
    ["CPU", D.cpu.toFixed(0) + "%", H.cpu, 0, 100, col(10), col(1), D.cores + " CORES  LOAD " + D.load.split(" ")[0], D.cpu / 100],
    ["MEMORY", (D.memUsed / 1024).toFixed(1) + "/" + (D.memTotal / 1024).toFixed(1) + "G", H.mem, 0, 100, col(14), col(13), (100 * D.memUsed / D.memTotal).toFixed(0) + "% IN USE", D.memUsed / D.memTotal],
    ["TEMP", D.temp == null ? "N/A" : D.temp.toFixed(0) + "C", H.temp, 30, 100, col(11), col(1), D.temp == null ? "NO SENSOR" : (D.tempLabel || "SENSOR").toUpperCase().slice(0, 18), D.temp == null ? 0 : (D.temp - 30) / 70],
    ["NETWORK", kb(D.rx), H.rx, 0, Math.max(50000, ...H.rx.slice(-120)), col(12), col(13), "UP " + kb(D.tx), Math.min(1, D.rx / Math.max(50000, ...H.rx.slice(-120)))],
  ];
  panels.forEach((p, i) => { const px0 = m + i * (pw + gap), c = i % 2 ? col(13) : col(14);
    frame(px0, py, pw, ph, c); rect(px0 + CW, py - CH / 2, tw(" " + p[0] + " "), CH, bg); text(px0 + CW, py - CH / 2, " " + p[0] + " ", c);
    text(px0 + CW, py + CH, p[1], col(15), 2); bar(px0 + CW, py + CH * 3 + 4, pw - 2 * CW, CH / 2, p[8], p[5]);
    chart(px0 + CW, py + CH * 4 + 8, pw - 2 * CW, ph - CH * 6 - 6, p[2], p[3], p[4], p[5], p[6]); text(px0 + CW, py + ph - CH - 4, p[7], col(8)); });
  // servers
  const sy = py + ph + CH * 2, mh = CH * 4, sh = SH - sy - mh - m;
  frame(m, sy, SW - 2 * m, sh, col(5)); rect(m + CW, sy - CH / 2, tw(" SERVERS "), CH, bg); text(m + CW, sy - CH / 2, " SERVERS ", col(13));
  const cols = [0, 0.26, 0.40, 0.55, 0.68, 0.80].map((f) => m + CW + f * (SW - 2 * m - 2 * CW));
  ["NAME", "KIND", "VERSION", "STATE", "PLAYERS", "RAM"].forEach((s, i) => text(cols[i], sy + CH / 2, s, col(8)));
  const rows = Math.max(1, Math.floor((sh - CH * 3) / (CH + 6)));
  if (!D.servers.length) { text(m + CW, sy + CH * 3, D.engine === "ok" || DEMO ? "No servers yet. Press N to make one." : "Engine starting... (" + (D.engine || "") + ")", col(7)); }
  if (sel >= D.servers.length) sel = Math.max(0, D.servers.length - 1);
  D.servers.slice(0, rows).forEach((s, i) => { const y = sy + CH * 2 + i * (CH + 6), on = i === sel, run = s.state === "running";
    if (on) { rect(m + 4, y - 3, SW - 2 * m - 8, CH + 6, mix(bg, col(13), 0.22)); } hits.push({ x: m + 4, y: y - 3, w: SW - 2 * m - 8, h: CH + 6, key: "sel" + i });
    rect(cols[0], y + CH / 4, CH / 2, CH / 2, run ? col(10) : col(8));
    text(cols[0] + CH, y, String(s.name).slice(0, 18), on ? col(15) : col(7)); text(cols[1], y, (s.type === "bedrock" ? "BEDROCK" : (s.flavor || "java").toUpperCase()), col(14));
    text(cols[2], y, String(s.version || "LATEST").slice(0, 10), col(11)); text(cols[3], y, run ? "ONLINE" : String(s.state || "").toUpperCase(), run ? col(10) : col(1));
    text(cols[4], y, s.players == null ? "-" : s.players, col(7)); text(cols[5], y, s.ram ? s.ram + " MB" : "-", col(7));
    if (s.join) text(SW - m - CW - tw(s.join), y, s.join, col(12)); });
  if (D.servers.length) { const s = D.servers[sel]; if (s) { const by = sy + sh - CH * 2 - 4; text(m + CW, by + 4, "ENTER " + (s.state === "running" ? "STOP" : "START") + "   DEL REMOVE   UP/DOWN SELECT", col(8)); } }
  // menu
  const my = SH - mh - m / 2, bw = Math.floor((SW - 2 * m - 6 * 8) / 7); MENU.forEach((it, i) => button(m + i * (bw + 8), my + CH, bw, CH * 2, it[0] + "  " + it[1], it[0].toLowerCase(), i === 4 ? col(10) : i % 2 ? col(13) : col(14)));
  if (Date.now() < msgT) text(m, my, msg, col(11)); else text(m, my, "BUTTER OS  -  MINECRAFT HOSTING, NOTHING ELSE", col(8));
  if (modal) drawModal();
  // mouse cursor
  for (let i = 0; i < 12; i++) for (let j = 0; j <= i && j < 8; j++) px(mouse.x + j, mouse.y + i, col(15)); // simple arrow
  for (let i = 0; i < 12; i++) px(mouse.x, mouse.y + i, col(0));
}
function drawModal() {
  const w = Math.min(SW - 40, CW * 64), h = CH * 17, x = (SW - w) >> 1, y = (SH - h) >> 1;
  rect(0, 0, SW, SH, mix(col(0), [0, 0, 0], 0.6)); for (let j = 0; j < SH; j += 3) rect(0, j, SW, 1, [0, 0, 0]);
  rect(x, y, w, h, col(0)); frame(x, y, w, h, col(11), SC * 2); text(x + CW * 2, y + CH / 2, "NEW SERVER", col(11), 2);
  const mm = modal, f = ["name", "type", "flavor", "ver"], lab = { name: "NAME", type: "GAME", flavor: "SOFTWARE", ver: "VERSION" };
  const list = mm.type === "bedrock" ? (ver ? ver.bedrock : ["LATEST"]) : ["LATEST"].concat(ver ? ver.java : []);
  f.forEach((k, i) => { const yy = y + CH * (3 + i * 2.6), on = mm.f === i; text(x + CW * 2, yy, lab[k], on ? col(15) : col(8));
    let v = mm[k]; if (k === "ver") v = list[mm.vi] || "LATEST"; if (k === "name" && on && tick % 2) v += "_";
    const a = on && k !== "name" ? "<  " + String(v).toUpperCase() + "  >" : String(v).toUpperCase(); text(x + CW * 14, yy, a, on ? col(11) : col(7));
    if (on) rect(x + CW, yy + 2, SC * 2, CH - 4, col(13)); });
  if (mm.type === "java" && mm.flavor === "paper") text(x + CW * 2, y + CH * 12.4, "Paper starts at 1.8. Older: pick Vanilla.", col(8));
  if (!ver) text(x + CW * 2, y + CH * 12.4, "Loading the version list...", col(8));
  if (mm.err) text(x + CW * 2, y + CH * 13.4, mm.err.slice(0, 60), col(1));
  button(x + CW * 2, y + h - CH * 2.4, CW * 14, CH * 1.8, "CREATE", "enter", col(10)); button(x + CW * 18, y + h - CH * 2.4, CW * 12, CH * 1.8, "CANCEL", "esc", col(1));
  text(x + CW * 34, y + h - CH * 2, "ARROWS  TAB  ENTER", col(8));
}
function openNew() { modal = { name: "world" + (D.servers.length + 1), type: "java", flavor: "paper", vi: 0, f: 0, err: "", busy: false }; if (!ver) api("a=versions", (j) => { if (j.ok) ver = j; }, 20000); }
function create() {
  const m = modal; if (m.busy) return; m.busy = true; m.err = "";
  const list = m.type === "bedrock" ? (ver ? ver.bedrock : ["LATEST"]) : ["LATEST"].concat(ver ? ver.java : []);
  const v = list[m.vi] || "LATEST";
  api("a=create&n=" + encodeURIComponent(m.name) + "&type=" + m.type + "&mem=2&ver=" + encodeURIComponent(v) + "&flavor=" + (m.type === "bedrock" ? "paper" : m.flavor), (j) => {
    m.busy = false; if (j.ok) { modal = null; toast("SERVER " + m.name.toUpperCase() + " IS STARTING"); agent(); } else m.err = j.error || "could not create"; }, 120000);
}
function external(cmd) { // leave the GUI for a text tool, then come back
  stopInput(); try { fs.writeSync(1, "\x1b[2J\x1b[H\x1b[?25h"); cp.spawnSync("/bin/sh", ["-c", cmd], { stdio: "inherit" }); } catch (e) {}
  startInput(); toast("BACK");
}
function key(k) {
  if (modal) { const m = modal;
    if (k === "esc") modal = null; else if (k === "enter") create();
    else if (k === "up" || k === "btab") m.f = (m.f + 3) % 4; else if (k === "down" || k === "tab") m.f = (m.f + 1) % 4;
    else if (k === "left" || k === "right") { const d = k === "left" ? -1 : 1;
      if (m.f === 1) { m.type = m.type === "java" ? "bedrock" : "java"; m.vi = 0; } else if (m.f === 2) { const o = ["paper", "vanilla", "fabric", "forge"]; m.flavor = o[(o.indexOf(m.flavor) + d + 4) % 4]; }
      else if (m.f === 3) { const n = (m.type === "bedrock" ? (ver ? ver.bedrock.length : 1) : 1 + (ver ? ver.java.length : 0)); m.vi = (m.vi + d + n) % n; } }
    else if (m.f === 0) { if (k === "bs") m.name = m.name.slice(0, -1); else if (/^[A-Za-z0-9-]$/.test(k) && m.name.length < 24) m.name += k; }
    return; }
  const s = D.servers[sel];
  if (k === "up") sel = Math.max(0, sel - 1); else if (k === "down") sel = Math.min(D.servers.length - 1, sel + 1);
  else if (k.startsWith("sel")) sel = +k.slice(3);
  else if (k === "enter" && s) { const a = s.state === "running" ? "stop" : "start"; toast(a.toUpperCase() + " " + s.name.toUpperCase() + "..."); api("a=" + a + "&n=" + encodeURIComponent(s.name), (j) => { toast(j.ok ? "DONE" : (j.error || "FAILED").toUpperCase()); agent(); }, 60000); }
  else if (k === "del" && s) { toast("REMOVING " + s.name.toUpperCase() + "..."); api("a=delete&n=" + encodeURIComponent(s.name), (j) => { toast(j.ok ? "REMOVED" : (j.error || "FAILED").toUpperCase()); agent(); }, 60000); }
  else if (k === "1") external("/usr/local/bin/butter-play; printf '\\nPress Enter '; read x");
  else if (k === "2") toast(D.ip ? "OPEN  http://" + D.ip + "  ON ANY PHONE OR PC" : "NO NETWORK YET - PRESS 4 FOR WI-FI");
  else if (k === "3") external("/usr/local/bin/butter-install; printf '\\nPress Enter '; read x");
  else if (k === "4") external("/usr/local/bin/butter-wifi");
  else if (k === "n") openNew();
  else if (k === "t") { ui.theme = THN[(THN.indexOf(ui.theme) + 1) % THN.length]; T = THEMES[ui.theme].map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]); try { fs.writeFileSync(UIF, JSON.stringify(ui)); } catch (e) {} }
  else if (k === "p") modal = null, powerAsk();
}
let power = false;
function powerAsk() { toast("PRESS Y TO POWER OFF, R TO RESTART, ANY OTHER KEY CANCELS"); power = true; }
// ---- input ----
const KEYS = { "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[3~": "del", "\x1b[Z": "btab", "\r": "enter", "\n": "enter", "\t": "tab", "\x7f": "bs", "\b": "bs", "\x1b": "esc" };
function onData(d) { const s = d.toString("latin1"); const k = KEYS[s] || (s.length === 1 ? s : null); if (!k) return;
  if (power) { power = false; msgT = 0; if (k.toLowerCase() === "y") cp.exec("poweroff"); else if (k.toLowerCase() === "r") cp.exec("reboot"); return; }
  key(modal ? k : k.length === 1 ? k.toLowerCase() : k); draw(); flush(); }
let mfd = null, mbuf = [];
function onMouse(d) { for (const b of d) { mbuf.push(b); if (mbuf.length === 3) { const [f, dx, dy] = mbuf; mbuf = []; if (!(f & 8)) continue;
  mouse.x = Math.max(0, Math.min(SW - 1, mouse.x + (dx - ((f & 0x10) ? 256 : 0)))); mouse.y = Math.max(0, Math.min(SH - 1, mouse.y - (dy - ((f & 0x20) ? 256 : 0))));
  if (f & 1 && !mouse.down) { mouse.down = true; const h = hits.slice().reverse().find((r) => mouse.x >= r.x && mouse.x < r.x + r.w && mouse.y >= r.y && mouse.y < r.y + r.h); if (h) { power ? onData(Buffer.from("x")) : key(h.key); } } else if (!(f & 1)) mouse.down = false; } } draw(); flush(); }
function startInput() { try { process.stdin.setRawMode && process.stdin.setRawMode(true); } catch (e) {} process.stdin.resume(); process.stdin.on("data", onData);
  try { mfd = fs.createReadStream("/dev/input/mice", { flags: "r" }); mfd.on("data", onMouse); mfd.on("error", () => {}); } catch (e) {} fs.writeSync(1, "\x1b[?25l\x1b[2J"); }
function stopInput() { process.stdin.removeListener("data", onData); try { process.stdin.setRawMode && process.stdin.setRawMode(false); } catch (e) {} if (mfd) { mfd.destroy(); mfd = null; } }
// ---- output ----
let fd = null;
function flush() {
  let out;
  if (G.bpp === 32 && G.stride === SW * 4) out = fbuf; else if (G.bpp === 32) { out = Buffer.alloc(G.stride * SH); for (let y = 0; y < SH; y++) fbuf.copy(out, y * G.stride, y * SW * 4, (y + 1) * SW * 4); }
  else { out = Buffer.alloc(G.stride * SH); for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const o = (y * SW + x) * 4, v = ((fbuf[o + 2] >> 3) << 11) | ((fbuf[o + 1] >> 2) << 5) | (fbuf[o] >> 3); out.writeUInt16LE(v, y * G.stride + x * 2); } }
  try { if (fd === null) fd = fs.openSync(FBP, process.env.BUTTER_FB ? "w" : "r+"); fs.writeSync(fd, out, 0, out.length, 0); } catch (e) {}
}
if (DEMO) { demo(); if (process.env.BUTTER_DEMO_MODAL) { ver = { java: ["1.21.4", "1.21.1", "1.20.4", "1.16.5", "1.8.9"], bedrock: ["LATEST", "PREVIEW"] }; openNew(); modal.f = 3; } draw(); flush(); process.exit(0); }
process.on("exit", () => { try { fs.writeSync(1, "\x1b[?25h\x1b[2J"); } catch (e) {} });
process.on("SIGTERM", () => process.exit(0));
local(); agent(); startInput(); draw(); flush();
setInterval(() => { local(); tick++; draw(); flush(); }, 1000); setInterval(agent, 4000);
