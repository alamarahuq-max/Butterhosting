"use strict";
// Machine info that works on Linux (ButterOS or normal), macOS and Windows.
const { fs, os, run, PLATFORM, IS_OS, WORLDS } = require("./core");
let prevCpu = null, prevNet = null, last = { cpu: 0, rx: 0, tx: 0 };
function mem() {
  if (process.platform === "linux") {
    try { const mi = {}; fs.readFileSync("/proc/meminfo", "utf8").split("\n").forEach((x) => { const m = x.match(/^(\w+):\s+(\d+)/); if (m) mi[m[1]] = +m[2]; });
      return { total: Math.round(mi.MemTotal / 1024), avail: Math.round(mi.MemAvailable / 1024) }; } catch (e) {}
  }
  return { total: Math.round(os.totalmem() / 1048576), avail: Math.round(os.freemem() / 1048576) };
}
function cpuSample() {
  if (process.platform === "linux") {
    try { const l = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).slice(1).map(Number); return [l.reduce((a, b) => a + b, 0), l[3] + (l[4] || 0)]; } catch (e) {}
  }
  let t = 0, i = 0; for (const c of os.cpus()) { for (const k in c.times) t += c.times[k]; i += c.times.idle; } return [t, i];
}
function cpuPct() {
  const s = cpuSample(); let v = last.cpu;
  if (prevCpu) { const dt = s[0] - prevCpu[0], di = s[1] - prevCpu[1]; if (dt > 0) v = Math.max(0, Math.min(100, 100 * (1 - di / dt))); }
  prevCpu = s; last.cpu = v; return v;
}
function net() {
  if (process.platform !== "linux") return { rx: 0, tx: 0 };
  try { let rx = 0, tx = 0; fs.readFileSync("/proc/net/dev", "utf8").split("\n").slice(2).forEach((x) => { const p = x.trim().split(/[:\s]+/); if (p[0] && p[0] !== "lo") { rx += +p[1] || 0; tx += +p[9] || 0; } });
    return { rx, tx }; } catch (e) { return { rx: 0, tx: 0 }; }
}
function ips() {
  let lan = ""; const ni = os.networkInterfaces();
  for (const k in ni) for (const a of ni[k]) if (a.family === "IPv4" && !a.internal && !/^(docker|br-|veth|vEthernet|VirtualBox|vmnet|utun)/i.test(k) && !/^169\.254\./.test(a.address)) { if (!lan) lan = a.address; }
  return lan;
}
function temps() {
  const out = [];
  if (process.platform === "linux") {
    try { for (const z of fs.readdirSync("/sys/class/thermal").filter((z) => z.startsWith("thermal_zone"))) { const c = +fs.readFileSync("/sys/class/thermal/" + z + "/temp", "utf8") / 1000; let ty = ""; try { ty = fs.readFileSync("/sys/class/thermal/" + z + "/type", "utf8").trim(); } catch (e) {} if (c > 0 && c < 130) out.push({ label: ty, c }); } } catch (e) {}
  }
  return out;
}
async function diskFreeGb(dir) {
  try { if (fs.statfsSync) { const s = fs.statfsSync(dir); return +((s.bavail * s.bsize) / 1073741824).toFixed(1); } } catch (e) {}
  return null;
}
function netRate() {
  const n = net(), t = Date.now(); let rx = last.rx, tx = last.tx;
  if (prevNet) { const dt = Math.max(0.2, (t - prevNet[2]) / 1000); rx = Math.max(0, (n.rx - prevNet[0]) / dt); tx = Math.max(0, (n.tx - prevNet[1]) / dt); }
  prevNet = [n.rx, n.tx, t]; last.rx = rx; last.tx = tx; return { rx, tx, rxTotal: n.rx, txTotal: n.tx };
}
module.exports = { mem, cpuPct, netRate, ips, temps, diskFreeGb };
