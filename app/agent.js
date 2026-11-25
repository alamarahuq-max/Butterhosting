#!/usr/bin/env node
"use strict";
// ButterOS / Butter app agent: serves the web page and the local API (see API.md). No dependencies, Node 18+.
const http = require("http"), { fs, path, os, IS_OS, PLATFORM, WEBROOT, clean, ok, Fail, loadCfg, publicCfg, setCfg, run } = Object.assign({}, require("./lib/core"));
const core = require("./lib/core"), dk = require("./lib/docker"), S = require("./lib/servers"), CO = require("./lib/commercial"), sys = require("./lib/sys");

const PORT = +(process.env.BUTTER_PORT || (IS_OS ? 80 : 8080));
const BIND = process.env.BUTTER_BIND || (IS_OS ? "0.0.0.0" : "127.0.0.1");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };

const priv = (ip) => { ip = String(ip || "").replace(/^::ffff:/, ""); return ip === "::1" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fe80:|fd|fc)/i.test(ip); };
function sameSite(req) { // block other websites from driving the API through the visitor's browser
  const sf = req.headers["sec-fetch-site"]; if (sf && !["same-origin", "none"].includes(sf)) return false;
  const o = req.headers.origin; if (o) { try { if (new URL(o).host !== req.headers.host) return false; } catch (e) { return false; } }
  return true;
}
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
function body(req, max = 2 << 20) { return new Promise((resolve, reject) => { let raw = ""; req.on("data", (c) => { raw += c; if (raw.length > max) { reject(new Fail("Request too big")); req.destroy(); } }); req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Fail("Bad JSON")); } }); req.on("error", reject); });
}
const lim = new Map();
function rate(ip, a) { // slow down heavy actions a little
  if (!["create", "setversion", "clone", "rename", "restore", "wifijoin", "wifiscan"].includes(a)) return true; const k = ip + a, t = Date.now(); if (lim.get(k) && t - lim.get(k) < 1500) return false; lim.set(k, t); return true; }

async function api(a, q, req, res) {
  const n = q.get("n") || "", g = (k) => q.get(k) || "";
  switch (a) {
    case "": case "status": return S.status();
    case "ping": return ok();
    case "netstatus": case "wifiscan": case "wifijoin": case "wififorget": { // ButterOS only: the app uses the host's own network
      if (!IS_OS) return ok({ managed: false, wired: true, wifi_adapter: false });
      const cmd = { netstatus: ["status"], wifiscan: ["scan"], wifijoin: ["join", g("ssid"), g("pass")], wififorget: ["forget"] }[a];
      if (a === "wifijoin" && !g("ssid")) throw new Fail("Choose a network first.");
      const r = await run("/usr/local/bin/butter-net", cmd, { timeout: 70000 });
      try { return JSON.parse(r.out.trim().split("\n").pop()); } catch (e) { throw new Fail("The network tool did not answer. Try again."); }
    }
    case "versions": return S.versions();
    case "logs": return S.logs(n);
    case "start": case "stop": case "restart": return S.control(a, n);
    case "delete": return S.del(n);
    case "players": return S.players(n);
    case "kick": case "op": case "ban": return S.playerCmd(a, n, g("p"));
    case "plugin": return S.plugin(n, g("url"));
    case "plugins": return S.plugins(n);
    case "rmplugin": return S.rmplugin(n, g("f"));
    case "cmd": return S.cmd(n, g("c"));
    case "cracked": return S.cracked(n, g("v"));
    case "upload": return S.uploadJar(n, g("f"), req, +req.headers["content-length"] || 0);
    case "share": return S.share(n);
    case "unshare": return S.unshare(n);
    case "create": return S.create({ n, type: g("type"), mem: g("mem"), ver: g("ver"), flavor: g("flavor"), cross: q.get("cross"), share: g("share") });
    // global
    case "config": return ok({ config: publicCfg() });
    case "setconfig": return ok({ config: setCfg(await body(req)) });
    case "docker": { const i = await dk.info(); return ok({ ...i, platform: PLATFORM, install_hint: dk.installHint() }); }
    case "hostinfo": return ok({ cores: os.cpus().length, mem_total_mb: sys.mem().total, mem_avail_mb: sys.mem().avail, disk_free_gb: await sys.diskFreeGb(core.WORLDS), platform: PLATFORM, hostname: os.hostname(), ip: sys.ips(), lan_ip: sys.ips() });
    // per server
    case "srvconf": return S.srvconf(n);
    case "setsrvconf": return S.setsrvconf(n, await body(req));
    case "setprops": return S.setprops(n, await body(req));
    case "list": return S.list(n, g("l"));
    case "listadd": return S.listEdit(true, n, g("l"), g("p"));
    case "listdel": return S.listEdit(false, n, g("l"), g("p"));
    case "setversion": return S.setversion(n, g("ver"), g("flavor"));
    case "rename": return S.rename(n, g("to"));
    case "clone": return S.clone(n, g("to"));
    // files
    case "ls": return S.ls(n, g("p") || "/");
    case "cat": return S.cat(n, g("p"));
    case "write": return S.write(n, await body(req));
    case "mkdir": return S.mkdir(n, g("p"));
    case "rm": return S.rm(n, g("p"));
    case "put": return S.put(n, g("p"), req, +req.headers["content-length"] || 0);
    case "get": { const f = S.safe(n, g("p")); let st; try { st = fs.statSync(f); } catch (e) { throw new Fail("Not found"); } if (st.isDirectory()) throw new Fail("That is a folder");
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": st.size, "Content-Disposition": 'attachment; filename="' + path.basename(f).replace(/"/g, "") + '"' }); fs.createReadStream(f).pipe(res); return null; }
    // backups
    case "backups": return ok({ backups: S.backupList(n) });
    case "backup": return ok({ file: await S.makeBackup(n, "") });
    case "restore": return S.restore(n, g("f"));
    case "delbackup": fs.rmSync(S.bfile(n, g("f"))); return ok();
    case "dlbackup": { const f = S.bfile(n, g("f")), st = fs.statSync(f); res.writeHead(200, { "Content-Type": "application/gzip", "Content-Length": st.size, "Content-Disposition": 'attachment; filename="' + path.basename(f) + '"' }); fs.createReadStream(f).pipe(res); return null; }
    // commercial
    case "commercial": return ok(CO.summary());
    case "setcommercial": return CO.set(await body(req));
    default: throw new Fail("unknown action");
  }
}

function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname); if (p === "/" || p === "") p = "/index.html";
  const f = path.resolve(WEBROOT, "." + p); if (!f.startsWith(path.resolve(WEBROOT) + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(f).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress;
  if (!priv(ip)) { res.writeHead(403); return res.end("local network only"); }
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/cgi-bin/api" || u.pathname === "/api") {
    if (!sameSite(req)) return send(res, 403, { ok: false, error: "blocked: request from another website" });
    const a = u.searchParams.get("a") || "";
    try {
      if (!rate(ip, a)) throw new Fail("Slow down a moment");
      const r = await api(a, u.searchParams, req, res); if (r !== null && r !== undefined) send(res, 200, r);
    } catch (e) { if (res.headersSent) return res.end(); send(res, 200, { ok: false, error: e instanceof Fail ? e.message : "Something went wrong: " + String(e.message || e).slice(0, 160) }); }
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res, u.pathname);
});
server.requestTimeout = 0; server.headersTimeout = 30000;
function start() {
  S.timers(); CO.start();
  server.listen(PORT, BIND, () => console.log("Butter agent on http://" + (BIND === "0.0.0.0" ? "localhost" : BIND) + ":" + PORT + "  (data: " + core.HOME + ")"));
  server.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? "Port " + PORT + " is already in use. Set BUTTER_PORT to another number." : e.message); process.exit(1); });
}
if (require.main === module) start();
module.exports = { start, server, api };
