// Shared by the text screen (tui.js) and the graphical screen (gui.js): live machine data.
const fs = require("fs"), http = require("http");
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
    if (!D.agentOk || !D.ip) { const ni = require("os").networkInterfaces(); for (const k in ni) for (const a of ni[k]) if (a.family === "IPv4" && !a.internal && !/^(docker|br-|veth)/.test(k)) D.ip = a.address; }
  } catch (e) {}
}
function agent() {
  const r = http.get({ host: "127.0.0.1", port: 80, path: "/cgi-bin/api?a=status", timeout: 25000 }, (res) => {
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


function api(q, cb, timeout) {
  const r = http.get({ host: "127.0.0.1", port: 80, path: "/cgi-bin/api?" + q, timeout: timeout || 8000 }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { cb(JSON.parse(b)); } catch (e) { cb({ ok: false, error: "bad answer" }); } }); });
  r.on("error", () => cb({ ok: false, error: "cannot reach the machine" })); r.on("timeout", () => { r.destroy(); cb({ ok: false, error: "timed out" }); });
}
// ---- themes: 16 colours each (0 background, 3/11 butter, 5/13 pink, 6/14 cyan, 2/10 ok, 1/9 bad, 7 text, 8 dim, 15 bright) ----
const THEMES = {
  "NEON BUTTER": ["0b0a1f","ff4d6d","3df5a5","ffb703","5b4bff","d946ef","22d3ee","cfcaf5","5a5690","ff7a93","7cffc4","ffe066","8b7dff","ff6bd6","7ef0ff","ffffff"],
  "GRID CYAN":   ["02121a","ff5d73","2de2a0","19c8e6","2f6bff","7b8cff","2de2c0","bfe9f2","3b6a78","ff8a9a","6dffc6","8ff4ff","6f9bff","a9b6ff","8ffff0","ffffff"],
  "AMBER CRT":   ["120800","ff5a1f","c8c000","ff9d00","8a4b00","c46a00","e8a33a","e6b155","6e4a1a","ff8a50","e0d800","ffc04d","b36a10","e08a2a","ffd28a","fff1d0"],
  "SUNSET":      ["14081f","ff3d6e","57f2a3","ff8a3d","6a3df5","ff3d81","a855f7","e6d3f5","5f4a7a","ff7a95","8dffc3","ffc371","9b7dff","ff7aa8","c9a0ff","ffffff"],
};
module.exports = { H, D, local, agent, demo, push, api, THEMES };
