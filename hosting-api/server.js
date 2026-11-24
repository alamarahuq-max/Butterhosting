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

const TEMPLATES = {
  minecraft: { label: "Minecraft", kind: "game", image: "itzg/minecraft-server:latest", cport: 25565, mem: "2048m", cpus: 2, vol: "/data", env: [], cmd: [] },
  bedrock: { label: "Bedrock", kind: "game", proto: "udp", image: "itzg/minecraft-bedrock-server:latest", cport: 19132, mem: "768m", cpus: 1, vol: "/data", env: ["EULA=TRUE", "VERSION=LATEST", "SERVER_NAME=A ButterHosting server", "GAMEMODE=survival", "DIFFICULTY=normal", "MAX_PLAYERS=10", "ONLINE_MODE=true"], cmd: [] },
};
const cname = (id) => `bh-${id}`;
const vname = (id) => `bh-${id}-data`;
// RAM mode (ButterOS): worlds live in WORLD_DIR (a tmpfs) and are backed up to disk by os/ramsync. Without it, Docker named volumes are used.
const WORLD_DIR = env.WORLD_DIR || "";
const volSrc = (id) => { if (!WORLD_DIR) return vname(id); const d = path.join(WORLD_DIR, id); fs.mkdirSync(d, { recursive: true }); return d; };

/** Free space (GB) on the disk that holds Docker and the worlds. The Codespace disk is small; a full disk is the usual cause of "Docker error". */
function diskFreeGb() { try { const f = fs.statfsSync(WORLD_DIR || DATA_DIR || "/"); return Math.round((f.bavail * f.bsize) / 1073741824 * 10) / 10; } catch { return null; } }
const MIN_FREE_GB = Number(env.MIN_FREE_GB || 3);

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


/* ---------- Minecraft settings (what players of Aternos-style hosts expect) ---------- */
const MAX_RAM_GB = Number(env.MAX_RAM_GB || 2);
const MAX_UPLOAD = Number(env.MAX_UPLOAD_MB || 100) * 1024 * 1024;
const MOD_DIR = { PAPER: "plugins", PURPUR: "plugins", FABRIC: "mods", FORGE: "mods", VANILLA: null };
const MC_DEFAULTS = { software: "PAPER", version: "LATEST", memory: 1, motd: "A ButterHosting server", gamemode: "survival", difficulty: "normal",
  maxPlayers: 10, viewDistance: 10, pvp: true, hardcore: false, whitelist: false, whitelistNames: "", seed: "", allowNether: true, allowFlight: false, autostop: false };
const ONE_OF = { software: Object.keys(MOD_DIR), gamemode: ["survival", "creative", "adventure", "spectator"], difficulty: ["peaceful", "easy", "normal", "hard"] };
function cleanSettings(input, base) {
  const o = Object.assign({}, MC_DEFAULTS, base || {}), i = input || {};
  for (const k of Object.keys(ONE_OF)) if (i[k] !== undefined) { if (!ONE_OF[k].includes(i[k])) return { error: "Bad " + k }; o[k] = i[k]; }
  if (i.version !== undefined) { const v = String(i.version).trim(); if (!/^(LATEST|\d{1,2}\.\d{1,2}(\.\d{1,2})?)$/i.test(v)) return { error: "Version looks like 1.21.4 or LATEST" }; o.version = v.toUpperCase(); }
  const num = (k, lo, hi) => { if (i[k] === undefined) return null; const n = Number(i[k]); if (!Number.isInteger(n) || n < lo || n > hi) return "Bad " + k + " (" + lo + " to " + hi + ")"; o[k] = n; return null; };
  const bad = num("memory", 1, MAX_RAM_GB) || num("maxPlayers", 1, 100) || num("viewDistance", 3, 16);
  if (bad) return { error: bad };
  for (const k of ["pvp", "hardcore", "whitelist", "allowNether", "allowFlight", "autostop"]) if (i[k] !== undefined) o[k] = !!i[k];
  if (i.motd !== undefined) { const m = String(i.motd); if (m.length > 60 || /[\r\n]/.test(m)) return { error: "MOTD: one line, up to 60 characters" }; o.motd = m; }
  if (i.seed !== undefined) { const m = String(i.seed); if (m.length > 64 || /[\r\n]/.test(m)) return { error: "Seed is too long" }; o.seed = m; }
  if (i.whitelistNames !== undefined) {
    const names = String(i.whitelistNames).split(/[\s,]+/).filter(Boolean);
    if (names.length > 100 || names.some((n) => !/^[A-Za-z0-9_.]{2,16}$/.test(n))) return { error: "Whitelist: Minecraft usernames separated by commas" };
    o.whitelistNames = names.join(",");
  }
  if (o.whitelist && !o.whitelistNames) return { error: "Add at least one username to turn the whitelist on" };
  return { settings: o };
}
function mcEnv(st) {
  const e = ["EULA=TRUE", "TYPE=" + st.software, "VERSION=" + st.version, "MEMORY=" + st.memory + "G", "MOTD=" + st.motd, "MODE=" + st.gamemode, "DIFFICULTY=" + st.difficulty,
    "MAX_PLAYERS=" + st.maxPlayers, "VIEW_DISTANCE=" + st.viewDistance, "PVP=" + st.pvp, "HARDCORE=" + st.hardcore, "ALLOW_NETHER=" + st.allowNether, "ALLOW_FLIGHT=" + st.allowFlight,
    "ENFORCE_SECURE_PROFILE=FALSE", "ONLINE_MODE=TRUE"];
  if (st.seed) e.push("SEED=" + st.seed);
  if (st.whitelist) e.push("ENABLE_WHITELIST=TRUE", "WHITELIST=" + st.whitelistNames, "OVERRIDE_WHITELIST=TRUE");
  if (st.autostop) e.push("ENABLE_AUTOSTOP=TRUE", "AUTOSTOP_TIMEOUT_EST=600");
  if (linkable(st)) e.push("MODRINTH_PROJECTS=minekube-connect");
  return e;
}
const linkable = (st) => st.software === "PAPER" || st.software === "PURPUR"; // Minekube Connect is a Bukkit/Velocity plugin
const mcSettings = (s) => Object.assign({}, MC_DEFAULTS, s.settings || {});

const jobs = new Set(); // server ids currently being created
const linking = new Set(); // server ids waiting for a join link
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
  const address = t.kind === "game" ? (s.tpl === "bedrock" ? (s.bedrockAddr || "") : (s.link || "")) : CS ? csUrl(s.port) : `http://${PUBLIC_HOST}:${s.port}`;
  return { id: s.id, name: s.name, tpl: t.label, tplKey: s.tpl, kind: t.kind, status, cpu, ram, players: pl, port: s.port, address, error: s.error || null, linking: linking.has(s.id), udp: t.proto === "udp", settings: s.tpl === "minecraft" ? mcSettings(s) : null, canLink: s.tpl === "minecraft" ? linkable(mcSettings(s)) : false, modDir: s.tpl === "minecraft" ? MOD_DIR[mcSettings(s).software] : null, linkError: s.linkError || null, createdAt: s.createdAt };
}

/* Join link: Minekube Connect (free, no domain, no port forwarding) gives <name>.play.minekube.net */
async function makeLink(s) {
  linking.add(s.id);
  try {
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16) || "server";
    const endpoint = `bh-${slug}-${crypto.randomBytes(2).toString("hex")}`;
    await dk(["exec", cname(s.id), "sh", "-c", 'mkdir -p /data/plugins/connect && printf "endpoint: %s\\n" "$1" > /data/plugins/connect/config.yml', "sh", endpoint]);
    const since = String(Math.floor(Date.now() / 1000));
    await dk(["restart", "-t", "20", cname(s.id)], { timeout: 60000 });
    const re = /Your public address:\s*([a-z0-9-]+\.play\.minekube\.net)/i;
    for (let i = 0; i < 60 && !s.link; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await dk(["logs", "--since", since, cname(s.id)], { timeout: 15000 }).catch(() => null);
      const m = r && re.exec((r.out + r.err).replace(/\x1b\[[0-9;]*m/g, ""));
      if (m) s.link = m[1].toLowerCase();
    }
    s.linkError = s.link ? null : "No link yet. Open Logs and look for 'Your public address', then try again.";
  } catch (e) { s.linkError = e.message; }
  finally { linking.delete(s.id); invalidate(); saveDb(); }
}

function freePort() {
  const used = new Set(Object.values(db.servers).map((s) => s.port));
  for (let p = PORT_MIN; p <= PORT_MAX; p++) if (!used.has(p)) return p;
  return null;
}

async function provision(s) {
  const t = TEMPLATES[s.tpl];
  jobs.add(s.id);
  const st = s.tpl === "minecraft" ? mcSettings(s) : null;
  const envs = st ? mcEnv(st) : t.env, mem = st ? `${st.memory * 1024 + 512}m` : t.mem;
  try {
    await dk(["run", "-d", "--name", cname(s.id), "--restart", st && st.autostop ? "no" : "unless-stopped",
      "--label", "butterhosting=1", "--label", "bh.owner=" + s.owner, "--label", "bh.id=" + s.id,
      "--memory", mem, "--cpus", String(t.cpus),
      "-p", `${s.port}:${t.cport}${t.proto ? "/" + t.proto : ""}`, "-v", `${volSrc(s.id)}:${t.vol}`,
      ...envs.flatMap((e) => ["-e", e]), t.image, ...t.cmd], { timeout: 15 * 60 * 1000 });
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
  if (parts[0] === "health") return json(req, res, 200, { ok: true, standby: FO.standby(), failover: FO.state().mode || null });
  if (parts[0] === "internal" && parts[1] === "handback" && m === "POST") { // only for this machine's own shutdown script: needs the local key and must not arrive through a tunnel
    const k = (() => { try { return fs.readFileSync(path.join(DATA_DIR, "internal.key"), "utf8").trim(); } catch { return null; } })();
    if (!k || req.headers["x-butter-internal"] !== k || req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]) return json(req, res, 403, { error: "forbidden" });
    return json(req, res, 200, await FO.handback());
  }
  if (FO.standby()) return json(req, res, 503, { error: "This machine is on standby", standby: true });
  if (parts[0] === "node" && m === "POST" && (parts[1] === "enroll" || parts[1] === "heartbeat")) { // paid-host network: machines running ButterOS / the Butter app
    let b; try { b = await readJson(req); } catch (e) { return json(req, res, 400, { error: e.message }); }
    const r = await NODES[parts[1]](b); const { code, ...rest } = r; return json(req, res, code, rest);
  }

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
  const mine = Object.values(db.servers).filter((s) => s.owner === user.id && TEMPLATES[s.tpl]);

  if (parts.length === 1 && m === "GET") {
    const snap = await snapshot();
    const servers = await Promise.all(mine.sort((a, b) => a.createdAt - b.createdAt).map((s) => view(s, snap)));
    return json(req, res, 200, { servers, maxRam: MAX_RAM_GB, maxUploadMb: MAX_UPLOAD / 1048576, dockerOk: snap.__ok !== false, dockerError: snap.__err || null, diskFreeGb: diskFreeGb(), diskLow: (diskFreeGb() ?? 99) < MIN_FREE_GB });
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
    const free = diskFreeGb(); if (free != null && free < MIN_FREE_GB) return json(req, res, 507, { error: `The host disk is almost full (${free} GB free). Free some space on the Codespace, then try again.` });
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

  if (action === "files" && m === "GET") {
    if (s.tpl !== "minecraft") return json(req, res, 400, { error: "Mods and plugins are for Minecraft servers" });
    const dir = MOD_DIR[mcSettings(s).software];
    if (!dir) return json(req, res, 200, { dir: null, files: [] });
    const r = await dk(["exec", cname(s.id), "ls", "-1", "/data/" + dir]).catch(() => ({ out: "" }));
    return json(req, res, 200, { dir, files: r.out.split("\n").map((x) => x.trim()).filter((x) => /\.jar$/i.test(x)) });
  }
  if (m !== "POST") return json(req, res, 405, { error: "method not allowed" });
  if (jobs.has(s.id)) return json(req, res, 409, { error: "Server is still being created" });
  if (action === "address") {
    if (s.tpl !== "bedrock") return json(req, res, 400, { error: "Only Bedrock servers take a manual address" });
    let b; try { b = await readJson(req); } catch (e) { return json(req, res, 400, { error: e.message }); }
    const a = String(b.address || "").trim().toLowerCase();
    if (a && !/^[a-z0-9]([a-z0-9.-]{0,60}[a-z0-9])?:\d{2,5}$/.test(a)) return json(req, res, 400, { error: "Use host:port, like 123.ply.gg:12345" });
    s.bedrockAddr = a; saveDb();
    return json(req, res, 200, { ok: true });
  }
  if (action === "settings") {
    if (s.tpl !== "minecraft") return json(req, res, 400, { error: "Settings are for Minecraft servers" });
    let b; try { b = await readJson(req); } catch (e) { return json(req, res, 400, { error: e.message }); }
    const r = cleanSettings(b, s.settings);
    if (r.error) return json(req, res, 400, { error: r.error });
    s.settings = r.settings; s.state = "creating"; saveDb();
    await dk(["rm", "-f", cname(s.id)]).catch(() => {});
    provision(s); // same data volume, new settings; the dashboard shows "working" until it is back
    return json(req, res, 200, { ok: true });
  }
  if (action === "files") {
    if (s.tpl !== "minecraft") return json(req, res, 400, { error: "Mods and plugins are for Minecraft servers" });
    const dir = MOD_DIR[mcSettings(s).software];
    if (!dir) return json(req, res, 400, { error: "Vanilla can't load mods. Change the software to Paper, Purpur, Fabric or Forge in Settings." });
    const name = String(u.searchParams.get("name") || "");
    if (!/^[A-Za-z0-9._+-]{1,100}\.jar$/i.test(name) || name.includes("..")) return json(req, res, 400, { error: "File must be a .jar with a simple name" });
    if (parts[3] === "delete") {
      await dk(["exec", cname(s.id), "rm", "-f", `/data/${dir}/${name}`]).catch((e) => { throw e; });
      return json(req, res, 200, { ok: true });
    }
    const len = Number(req.headers["content-length"] || 0);
    if (!len) return json(req, res, 411, { error: "Empty upload" });
    if (len > MAX_UPLOAD) return json(req, res, 413, { error: `Max upload is ${MAX_UPLOAD / 1048576} MB` });
    try { const r = await dk(["inspect", "-f", "{{.State.Running}}", cname(s.id)]); if (!/true/.test(r.out)) throw new Error(); }
    catch { return json(req, res, 409, { error: "Start the server first, then upload" }); }
    const tmp = path.join(DATA_DIR, "up-" + crypto.randomBytes(6).toString("hex"));
    try {
      await new Promise((resolve, reject) => {
        let n = 0; const w = fs.createWriteStream(tmp);
        req.on("data", (c) => { n += c.length; if (n > MAX_UPLOAD) { reject(new Error("File too large")); req.destroy(); w.destroy(); } });
        req.on("aborted", () => reject(new Error("Upload cancelled")));
        req.on("error", reject); w.on("error", reject); w.on("finish", resolve); req.pipe(w);
      });
      const fd = fs.openSync(tmp, "r"), head = Buffer.alloc(4); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
      if (head.toString("hex") !== "504b0304") return json(req, res, 400, { error: "That isn't a valid .jar file" });
      await dk(["exec", "-u", "1000", cname(s.id), "mkdir", "-p", "/data/" + dir]);
      await dk(["cp", tmp, `${cname(s.id)}:/data/${dir}/${name}`], { timeout: 120000 });
      await dk(["exec", cname(s.id), "chown", "1000:1000", `/data/${dir}/${name}`]).catch(() => {});
    } catch (e) { return json(req, res, 502, { error: e.message }); }
    finally { fs.rm(tmp, { force: true }, () => {}); }
    return json(req, res, 200, { ok: true, restartNeeded: true });
  }
  if (action === "link") {
    if (s.tpl !== "minecraft") return json(req, res, 400, { error: "Join links are for Minecraft servers" });
    if (!linkable(mcSettings(s))) return json(req, res, 400, { error: "Free join links need Paper or Purpur (Fabric and Forge can't run the link plugin yet)" });
    if (s.link) return json(req, res, 200, { ok: true, link: s.link });
    if (linking.has(s.id)) return json(req, res, 200, { ok: true });
    try { await dk(["inspect", "-f", "{{.State.Running}}", cname(s.id)]).then((r) => { if (!/true/.test(r.out)) throw new Error("Start the server first"); }); }
    catch (e) { return json(req, res, 409, { error: e.message }); }
    s.linkError = null; makeLink(s);
    return json(req, res, 200, { ok: true });
  }

  try {
    if (action === "start") await dk(["start", cname(s.id)]);
    else if (action === "stop") await dk(["stop", "-t", "20", cname(s.id)], { timeout: 45000 });
    else if (action === "restart") await dk(["restart", "-t", "20", cname(s.id)], { timeout: 60000 });
    else if (action === "delete") {
      await dk(["rm", "-f", cname(s.id)]).catch(() => {});
      if (WORLD_DIR) fs.rmSync(path.join(WORLD_DIR, s.id), { recursive: true, force: true });
      else await dk(["volume", "rm", "-f", vname(s.id)]).catch(() => {});
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

const NODES = require("./nodes")(require("./failover")._fsStore(path.join(DATA_DIR, "nodes")));
const FO = require("./failover")({ env, dataDir: DATA_DIR, worldsDir: WORLD_DIR, getDb: () => db, setDb: (d) => { db = d; saveDb(); }, dk, provision });
try { const kf = path.join(DATA_DIR, "internal.key"); if (!fs.existsSync(kf)) fs.writeFileSync(kf, crypto.randomBytes(24).toString("hex"), { mode: 0o600 }); } catch {}

if (require.main === module) {
  http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); try { json(req, res, 500, { error: "server error" }); } catch {} }))
    .listen(PORT, () => {
      console.log(`ButterHosting API on :${PORT}`);
      console.log(`  frontend : ${FRONTENDS.join(", ")}`);
      console.log(`  backend  : ${BACKEND_URL}`);
      console.log(`  discord  : ${DISCORD_ID && DISCORD_SECRET ? "configured" : "NOT configured (set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET)"}`);
      FO.start();
      console.log(`  redirect : ${BACKEND_URL}/auth/discord/callback  <- add this in the Discord developer portal`);
    });
}
module.exports = { handle, FO, NODES };
