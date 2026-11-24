"use strict";
const { run, PLATFORM, fs } = require("./core");
const D = (args, o) => run("docker", args, o);
async function info() {
  const v = await run("docker", ["--version"], { timeout: 8000 });
  if (v.code !== 0) return { installed: false, running: false, version: "" };
  const i = await run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 15000 });
  return { installed: true, running: i.code === 0 && !!i.out.trim(), version: (v.out.match(/version ([\d.]+)/) || [])[1] || "" };
}
function installHint() {
  if (PLATFORM === "win32") return "Run in PowerShell: winget install -e --id Docker.DockerDesktop   (then restart and open Docker Desktop once)";
  if (PLATFORM === "darwin") return "Run: brew install --cask docker   (then open Docker once)";
  return "Run: curl -fsSL https://get.docker.com | sudo sh   (then: sudo usermod -aG docker $USER and log in again)";
}
let engineCache = { t: 0, v: false };
async function engine() { if (Date.now() - engineCache.t < 4000) return engineCache.v; const i = await run("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 15000 }); engineCache = { t: Date.now(), v: i.code === 0 && !!i.out.trim() }; return engineCache.v; }
const cname = (n) => "bw-" + n;
async function inspect(n) { const r = await D(["inspect", cname(n)], { timeout: 15000 }); if (r.code !== 0) return null; try { return JSON.parse(r.out)[0]; } catch (e) { return null; } }
async function exists(n) { return !!(await inspect(n)); }
async function ps() { // all butter containers
  const r = await D(["ps", "-a", "--filter", "label=butterhosting=1", "--format", "{{json .}}"], { timeout: 20000 });
  return r.out.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
async function stats() {
  const r = await D(["stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"], { timeout: 25000 }); const m = {};
  r.out.split("\n").filter(Boolean).forEach((l) => { const [nm, cpu, mu] = l.split("|"); const v = (mu || "").split(" / ")[0]; let n = parseFloat(v) || 0; if (/GiB/.test(v)) n *= 1024; else if (/KiB/.test(v)) n /= 1024; else if (/B$/.test(v) && !/[MGK]iB/.test(v)) n /= 1048576; m[nm] = { ram: Math.round(n), cpu: parseFloat(cpu) || 0 }; });
  return m;
}
async function rcon(n, cmd, timeout = 12000) { return D(["exec", cname(n), "rcon-cli", cmd], { timeout }); }
const lastRun = {};
module.exports = { D, info, installHint, engine, cname, inspect, exists, ps, stats, rcon, lastRun };
