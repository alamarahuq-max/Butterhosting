"use strict";
/**
 * ButterHosting API — runs inside a GitHub Codespace (or any Docker host).
 * Zero npm dependencies. Node 20+. Real servers are Docker containers.
 *
 * Config comes from environment variables (Codespaces secrets in production, see hosting-api/README.md).
 */
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const env = process.env;
const PORT = Number(env.PORT || 8080);
const DATA_DIR = env.DATA_DIR || path.join(__dirname, "data");
const FRONTENDS = (env.FRONTEND_URL || "http://localhost:3000").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
const CS = env.CODESPACE_NAME ? { name: env.CODESPACE_NAME, domain: env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev" } : null;
const csUrl = (port) => `https://${CS.name}-${port}.${CS.domain}`;
const BACKEND_URL = (env.BACKEND_URL || (CS ? csUrl(PORT) : `http://localhost:${PORT}`)).replace(/\/$/, "");
const DISCORD_ID = env.DISCORD_CLIENT_ID || "";
const DISCORD_SECRET = env.DISCORD_CLIENT_SECRET || "";
const ADMINS = new Set((env.ADMIN_DISCORD_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));
const MAX_SERVERS = Number(env.MAX_SERVERS_PER_USER || 3);
const PUBLIC_HOST = env.PUBLIC_HOST || "localhost";
const PORT_MIN = Number(env.GAME_PORT_MIN || 25600);
const PORT_MAX = Number(env.GAME_PORT_MAX || 25799);
const DEV_LOGIN = env.DEV_LOGIN === "1"; // local testing only, never enable in production
const DOCKER = env.DOCKER_BIN || "docker";

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- secrets & storage ---------- */
const SECRET = (() => {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const f = path.join(DATA_DIR, "session.key");
  try { return fs.readFileSync(f, "utf8"); } catch {}
  const k = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(f, k, { mode: 0o600 });
  return k;
})();

const DB_FILE = path.join(DATA_DIR, "db.json");
let db = { users: {}, servers: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, "utf8"))); } catch {}
function saveDb() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------- signed tokens ---------- */
function sign(obj) {
  const b = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return b + "." + crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
}
function verify(tok) {
  if (typeof tok !== "string") return null;
  const [b, s] = tok.split(".");
  if (!b || !s) return null;
  const e = crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
  if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  try {
    const o = JSON.parse(Buffer.from(b, "base64url").toString());
    return o.exp > Date.now() ? o : null;
  } catch { return null; }
}

/* ---------- docker ---------- */
function dk(args, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(DOCKER, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error((stderr || err.message).trim().slice(0, 400)), { stdout, stderr }));
      resolve({ out: stdout, err: stderr });
    });
  });
}

const HELLO_NODE = "require('http').createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<h1>Hello from ButterHosting</h1>')}).listen(process.env.PORT||3000)";
const TEMPLATES = {
  minecraft: { label: "Minecraft", kind: "game", image: "itzg/minecraft-server:latest", cport: 25565, mem: "1536m", cpus: 2, vol: "/data", env: ["EULA=TRUE", "TYPE=PAPER", "MEMORY=1G"], cmd: [] },
  node: { label: "Node.js", kind: "web", image: "node:22-alpine", cport: 3000, mem: "256m", cpus: 0.5, vol: "/app", env: ["PORT=3000", "BH_DEFAULT=" + HELLO_NODE], cmd: ["sh", "-c", 'cd /app && [ -f server.js ] || printf "%s" "$BH_DEFAULT" > server.js; exec node server.js'] },
  python: { label: "Python", kind: "web", image: "python:3.12-alpine", cport: 8000, mem: "256m", cpus: 0.5, vol: "/srv/www", env: [], cmd: ["sh", "-c", 'cd /srv/www && [ -f index.html ] || echo "<h1>Hello from ButterHosting</h1>" > index.html; exec python -m http.server 8000'] },
  static: { label: "Static site", kind: "web", image: "nginx:alpine", cport: 80, mem: "128m", cpus: 0.25, vol: "/usr/share/nginx/html", env: [], cmd: [] },
};
const cname = (id) => `bh-${id}`;
const vname = (id) => `bh-${id}-data`;

let snapCache = { at: 0, p: null };
const invalidate = () => { snapCache = { at: 0, p: null }; };
/** One docker ps + one docker stats call per few seconds, shared by all requests. */
function snapshot() {
  if (snapCache.p && Date.now() - snapCache.at < 3000) return snapCache.p;
  snapCache.at = Date.now();
  snapCache.p = (async () => {
    const map = {};
    try {
      const ps = await dk(["ps", "-a", "--filter", "label=butterhosting=1", "--format", "{{json .}}"], { timeout: 15000 });
      for (const line of ps.out.split("\n").filter(Boolean)) {
        const o = JSON.parse(line);
        map[o.Names] = { state: o.State };
      }
      const running = Object.keys(map).filter((n) => map[n].state === "running");
      if (running.length) {
        const st = await dk(["stats", "--no-stream", "--format", "{{json .}}", ...running], { timeout: 15000 });
        for (const line of st.out.split("\n").filter(Boolean)) {
          const o = JSON.parse(line);
          if (map[o.Name]) Object.assign(map[o.Name], { cpu: parseFloat(o.CPUPerc) || 0, ram: parseFloat(o.MemPerc) || 0 });
        }
      }
      map.__ok = true;
    } catch (e) { map.__ok = false; map.__err = e.message; }
    return map;
  })();
  return snapCache.p;
}

const playerCache = {};
async function players(id) {
  const c = playerCache[id];
  if (c && Date.now() - c.at < 15000) return c.n;
  let n = 0;
  try {
    const r = await dk(["exec", cname(id), "rcon-cli", "list"], { timeout: 2500 });
    const m = /There are (\d+)/.exec(r.out);
    n = m ? Number(m[1]) : 0;
  } catch {}
  playerCache[id] = { at: Date.now(), n };
  return n;
}

const jobs = new Set(); // server ids currently being created
async function view(s, snap) {
  const t = TEMPLATES[s.tpl];
  const d = snap[cname(s.id)];
  let status = "off", cpu = 0, ram = 0, pl = 0;
  if (jobs.has(s.id)) status = "busy";
  else if (s.state === "error") status = "error";
  else if (d && d.state === "running") {
    status = "on";
    cpu = Math.min(100, Math.round((d.cpu || 0) / t.cpus));
    ram = Math.round(d.ram || 0);
    if (s.tpl === "minecraft") pl = await players(s.id);
  } else if (d && (d.state === "restarting" || d.state === "created")) status = "busy";
  const address = t.kind === "game" ? `${PUBLIC_HOST}:${s.port}` : CS ? csUrl(s.port) : `http://${PUBLIC_HOST}:${s.port}`;
  return { id: s.id, name: s.name, tpl: t.label, tplKey: s.tpl, kind: t.kind, status, cpu, ram, players: pl, port: s.port, address, error: s.error || null, createdAt: s.createdAt };
}

function freePort() {
  const used = new Set(Object.values(db.servers).map((s) => s.port));
  for (let p = PORT_MIN; p <= PORT_MAX; p++) if (!used.has(p)) return p;
  return null;
}

async function provision(s) {
  const t = TEMPLATES[s.tpl];
  jobs.add(s.id);
  try {
    await dk(["run", "-d", "--name", cname(s.id), "--restart", "unless-stopped",
      "--label", "butterhosting=1", "--label", "bh.owner=" + s.owner, "--label", "bh.id=" + s.id,
      "--memory", t.mem, "--cpus", String(t.cpus),
      "-p", `${s.port}:${t.cport}`, "-v", `${vname(s.id)}:${t.vol}`,
      ...t.env.flatMap((e) => ["-e", e]), t.image, ...t.cmd], { timeout: 15 * 60 * 1000 });
    s.state = "ready"; s.error = null;
  } catch (e) {
    s.state = "error"; s.error = e.message;
    dk(["rm", "-f", cname(s.id)]).catch(() => {});
  } finally {
    jobs.delete(s.id); invalidate(); saveDb();
  }
}

/* ---------- http helpers ---------- */
function setCors(req, res) {
  const o = req.headers.origin;
  if (o && FRONTENDS.includes(o.replace(/\/$/, ""))) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}
function json(req, res, code, body) {
  setCors(req, res);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function redirect(res, url) { res.writeHead(302, { Location: url, "Cache-Control": "no-store" }); res.end(); }
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 16384) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("bad json")); } });
  });
}
function authUser(req) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  const o = verify(tok);
  return o && o.t === "session" && db.users[o.sub] ? db.users[o.sub] : null;
}
function avatar(u) {
  return u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
}
function publicUser(u) { return { id: u.id, name: u.name, avatar: avatar(u), admin: ADMINS.has(u.id), limit: ADMINS.has(u.id) ? null : MAX_SERVERS }; }
function startSession(res, user, req) {
  const token = sign({ t: "session", sub: user.id, exp: Date.now() + 7 * 864e5 });
  redirect(res, `${FRONTENDS[0]}/auth.html#token=${encodeURIComponent(token)}`);
}
const lastCreate = {};

/* ---------- routes ---------- */
async function handle(req, res) {
  if (req.method === "OPTIONS") { setCors(req, res); res.writeHead(204); return res.end(); }
  const u = new URL(req.url, "http://x");
  const parts = u.pathname.split("/").filter(Boolean);
  const m = req.method;

  if (!parts.length) return json(req, res, 200, { name: "ButterHosting API", discord: Boolean(DISCORD_ID && DISCORD_SECRET) });
  if (parts[0] === "health") return json(req, res, 200, { ok: true });

  /* Discord OAuth2 (authorization code flow, scope identify) */
  if (parts[0] === "auth" && parts[1] === "discord" && !parts[2]) {
    if (!DISCORD_ID || !DISCORD_SECRET) return redirect(res, `${FRONTENDS[0]}/auth.html#error=${encodeURIComponent("Discord login isn't configured on the server yet")}`);
    const state = sign({ t: "state", n: crypto.randomBytes(8).toString("hex"), exp: Date.now() + 10 * 60000 });
    const a = new URL("https://discord.com/oauth2/authorize");
    a.search = new URLSearchParams({ client_id: DISCORD_ID, response_type: "code", scope: "identify", redirect_uri: `${BACKEND_URL}/auth/discord/callback`, state, prompt: "none" });
    return redirect(res, a.toString());
  }
  if (parts[0] === "auth" && parts[1] === "discord" && parts[2] === "callback") {
    const fail = (msg) => redirect(res, `${FRONTENDS[0]}/auth.html#error=${encodeURIComponent(msg)}`);
    const st = verify(u.searchParams.get("state") || "");
    if (u.searchParams.get("error")) return fail("Discord login was cancelled");
    if (!st || st.t !== "state") return fail("Login expired, please try again");
    const code = u.searchParams.get("code");
    if (!code) return fail("Missing code from Discord");
    try {
      const tr = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: DISCORD_ID, client_secret: DISCORD_SECRET, grant_type: "authorization_code", code, redirect_uri: `${BACKEND_URL}/auth/discord/callback` }),
      });
      if (!tr.ok) return fail("Discord rejected the login");
      const tok = await tr.json();
      const ur = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tok.access_token}` } });
      if (!ur.ok) return fail("Couldn't read your Discord profile");
      const d = await ur.json();
      const user = Object.assign(db.users[d.id] || { createdAt: Date.now() }, { id: d.id, name: d.global_name || d.username, avatar: d.avatar || null, lastLogin: Date.now() });
      db.users[d.id] = user; saveDb();
      return startSession(res, user, req);
    } catch { return fail("Couldn't reach Discord"); }
  }
  if (DEV_LOGIN && parts[0] === "auth" && parts[1] === "dev") {
    const id = String(u.searchParams.get("id") || "1");
    if (!/^\d{1,20}$/.test(id)) return json(req, res, 400, { error: "bad id" });
    const user = (db.users[id] = Object.assign(db.users[id] || { createdAt: Date.now() }, { id, name: "dev-" + id, avatar: null }));
    saveDb();
    return startSession(res, user, req);
  }

  /* everything below needs a signed-in user */
  const user = authUser(req);
  if (!user) return json(req, res, 401, { error: "sign in required" });

  if (parts[0] === "me" && m === "GET") return json(req, res, 200, publicUser(user));

  if (parts[0] !== "servers") return json(req, res, 404, { error: "not found" });
  const mine = Object.values(db.servers).filter((s) => s.owner === user.id);

  if (parts.length === 1 && m === "GET") {
    const snap = await snapshot();
    const servers = await Promise.all(mine.sort((a, b) => a.createdAt - b.createdAt).map((s) => view(s, snap)));
    return json(req, res, 200, { servers, dockerOk: snap.__ok !== false, dockerError: snap.__err || null });
  }

  if (parts.length === 1 && m === "POST") {
    let b; try { b = await readJson(req); } catch (e) { return json(req, res, 400, { error: e.message }); }
    const name = String(b.name || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(name)) return json(req, res, 400, { error: "Name: 2-24 letters, numbers or dashes" });
    const tplKey = String(b.tpl || "").toLowerCase().replace(/[^a-z]/g, "");
    const key = Object.keys(TEMPLATES).find((k) => k === tplKey || TEMPLATES[k].label.toLowerCase().replace(/[^a-z]/g, "") === tplKey);
    if (!key) return json(req, res, 400, { error: "Unknown template" });
    if (mine.some((s) => s.name === name)) return json(req, res, 409, { error: "You already have a server with that name" });
    if (!ADMINS.has(user.id) && mine.length >= MAX_SERVERS) return json(req, res, 403, { error: `Plan limit reached (${MAX_SERVERS} servers)` });
    if (Date.now() - (lastCreate[user.id] || 0) < 5000) return json(req, res, 429, { error: "Slow down a little" });
    const port = freePort();
    if (!port) return json(req, res, 503, { error: "No free ports on this host" });
    lastCreate[user.id] = Date.now();
    const s = { id: crypto.randomBytes(4).toString("hex"), owner: user.id, name, tpl: key, port, state: "creating", error: null, createdAt: Date.now() };
    db.servers[s.id] = s; saveDb();
    provision(s); // runs in the background; the dashboard polls until it is online
    return json(req, res, 202, await view(s, await snapshot()));
  }

  const s = db.servers[parts[1]];
  if (!s || s.owner !== user.id) return json(req, res, 404, { error: "no such server" });
  const action = parts[2];

  if (m === "GET" && action === "logs") {
    try {
      const r = await dk(["logs", "--tail", "150", cname(s.id)], { timeout: 15000 });
      const text = (r.out + r.err).replace(/\x1b\[[0-9;]*m/g, "");
      return json(req, res, 200, { logs: text.split("\n").slice(-150).join("\n") });
    } catch (e) { return json(req, res, 200, { logs: s.error ? "Provisioning failed:\n" + s.error : "No logs yet" }); }
  }

  if (m !== "POST") return json(req, res, 405, { error: "method not allowed" });
  if (jobs.has(s.id)) return json(req, res, 409, { error: "Server is still being created" });

  try {
    if (action === "start") await dk(["start", cname(s.id)]);
    else if (action === "stop") await dk(["stop", "-t", "20", cname(s.id)], { timeout: 45000 });
    else if (action === "restart") await dk(["restart", "-t", "20", cname(s.id)], { timeout: 60000 });
    else if (action === "delete") {
      await dk(["rm", "-f", cname(s.id)]).catch(() => {});
      await dk(["volume", "rm", "-f", vname(s.id)]).catch(() => {});
      delete db.servers[s.id]; saveDb();
    } else if (action === "command") {
      if (s.tpl !== "minecraft") return json(req, res, 400, { error: "Console commands are for Minecraft servers" });
      let b; try { b = await readJson(req); } catch (e) { return json(req, res, 400, { error: e.message }); }
      const cmd = String(b.cmd || "").trim();
      if (!cmd || cmd.length > 200 || /[\r\n]/.test(cmd)) return json(req, res, 400, { error: "Bad command" });
      const r = await dk(["exec", cname(s.id), "rcon-cli", ...cmd.split(/\s+/)], { timeout: 15000 });
      return json(req, res, 200, { output: r.out.replace(/\x1b\[[0-9;]*m/g, "").trim() });
    } else return json(req, res, 404, { error: "unknown action" });
  } catch (e) { return json(req, res, 502, { error: e.message }); }
  invalidate();
  return json(req, res, 200, { ok: true });
}

// anything that was mid-creation when the process stopped is marked failed so the user can delete and retry
for (const s of Object.values(db.servers)) if (s.state === "creating") { s.state = "error"; s.error = "Interrupted, delete and create again"; }
saveDb();

if (require.main === module) {
  http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); try { json(req, res, 500, { error: "server error" }); } catch {} }))
    .listen(PORT, () => {
      console.log(`ButterHosting API on :${PORT}`);
      console.log(`  frontend : ${FRONTENDS.join(", ")}`);
      console.log(`  backend  : ${BACKEND_URL}`);
      console.log(`  discord  : ${DISCORD_ID && DISCORD_SECRET ? "configured" : "NOT configured (set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET)"}`);
      console.log(`  redirect : ${BACKEND_URL}/auth/discord/callback  <- add this in the Discord developer portal`);
    });
}
module.exports = { handle };
