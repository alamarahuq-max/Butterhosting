"use strict";
// Everything about game servers: create, settings, console, players, files, backups.
const { fs, path, os, cp, run, IS_OS, PLATFORM, WORLDS, DATA, BACKUPS, NAME_RE, clean, ok, fail, Fail, loadCfg } = require("./core");
const dk = require("./docker");
const sys = require("./sys");

const JAVA_NEED = 1536, BED_NEED = 700, KEEP = IS_OS ? 300 : 1024;
const HOSTNET = IS_OS || PLATFORM === "linux";          // Docker Desktop (Win/Mac) has no real host networking
const sdir = (n) => path.join(WORLDS, n);
const valid = (n) => NAME_RE.test(String(n || ""));
function need(n) { if (!valid(n)) fail("Bad server name"); }
async function must(n) { need(n); if (!(await dk.exists(n))) fail("No such server"); }
const confFile = (n) => path.join(sdir(n), "butter.json");

// ---------- server config (butter.json) ----------
const CONF_DEFAULT = { type: "java", flavor: "paper", version: "LATEST", mem: 1536, cpus: 0, port: 25565, bedrock_port: 19132, cross: true, auto_restart: true,
  restart_every_h: 0, jvm: "aikar", jvm_custom: "", java_tag: "", share: "none", backup_every_h: 0, backup_keep: 5, env: {}, owner: "", commercial: false };
function readConf(n) { try { return { ...CONF_DEFAULT, ...JSON.parse(fs.readFileSync(confFile(n), "utf8")) }; } catch (e) { return null; } }
function writeConf(n, c) { fs.mkdirSync(sdir(n), { recursive: true }); fs.writeFileSync(confFile(n), JSON.stringify(c, null, 1)); }
async function loadConf(n) { // butter.json, or rebuilt from container labels for servers made by older versions
  let c = readConf(n); if (c) return c;
  const i = await dk.inspect(n); if (!i) return null; const L = (i.Config && i.Config.Labels) || {};
  c = { ...CONF_DEFAULT, type: /bedrock/.test(i.Config.Image) ? "bedrock" : "java", flavor: L.butterflavor || "paper", version: L.butterver || "LATEST", port: +L.butterport || 25565 };
  writeConf(n, c); return c;
}
function javaTag(ver) {
  if (!ver || ver === "LATEST") return "latest";
  const p = String(ver).split("."), mnr = +p[1] || 0, pat = +p[2] || 0;
  if (mnr <= 16) return "java8";
  if (mnr <= 19 || (mnr === 20 && pat < 5)) return "java17";
  return "java21";
}
const PLUGIN_URLS = "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot,https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot";

// ---------- ports ----------
async function usedPorts() {
  const used = new Set(); for (const c of await dk.ps()) {
    (c.Ports || "").split(",").forEach((x) => { const m = x.match(/:(\d+)->/); if (m) used.add(+m[1]); });
    const L = {}; (c.Labels || "").split(",").forEach((kv) => { const i = kv.indexOf("="); if (i > 0) L[kv.slice(0, i)] = kv.slice(i + 1); });
    if (L.butterport) used.add(+L.butterport); if (L.butterbport) used.add(+L.butterbport);
  }
  return used;
}
async function nextPort(base, skip) { const used = await usedPorts(); let p = base; while (used.has(p) || p === skip) p++; return p; }

// ---------- docker run arguments from a config ----------
function runArgs(n, c) {
  const a = ["run", "-d", "--name", dk.cname(n), "--label", "butterhosting=1", "--label", "butterlocal=" + (c.commercial ? 0 : 1), "--label", "butterflavor=" + (c.type === "bedrock" ? "bedrock" : c.flavor),
    "--label", "butterver=" + c.version, "--label", "butterport=" + c.port];
  if (c.commercial) a.push("--label", "buttercommercial=1", "--label", "butterowner=" + String(c.owner || "").replace(/[^\w-]/g, ""));
  a.push("--restart", c.auto_restart ? "unless-stopped" : "no");
  if (c.cpus > 0) a.push("--cpus", String(c.cpus));
  if (process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0) a.push("-e", "UID=" + process.getuid(), "-e", "GID=" + process.getgid());
  const vol = ["-v", sdir(n) + ":/data"];
  if (c.type === "bedrock") {
    a.push("--label", "butterbport=" + c.port);
    if (HOSTNET) a.push("--network", "host", "-e", "SERVER_PORT=" + c.port, "-e", "SERVER_PORT_V6=" + (c.port + 10000));
    else a.push("-p", c.port + ":19132/udp", "-p", (c.port + 10000) + ":19133/udp");
    a.push("-e", "EULA=TRUE", "-e", "ALLOW_LIST=false", "-e", "VERSION=" + c.version, "-e", "SERVER_NAME=" + n, "-e", "MAX_MEMORY=" + c.mem, ...vol, "itzg/minecraft-bedrock-server:latest");
    return a;
  }
  const TY = c.flavor.toUpperCase();
  if (c.cross) {
    a.push("--label", "butterbport=" + c.bedrock_port);
    if (HOSTNET) a.push("--network", "host", "-e", "SERVER_PORT=" + c.port);
    else a.push("-p", c.port + ":25565", "-p", c.bedrock_port + ":" + c.bedrock_port + "/udp", "-p", c.bedrock_port + ":" + c.bedrock_port + "/tcp");
    a.push("-e", "PLUGINS=" + PLUGIN_URLS);
  } else a.push("-p", c.port + ":25565");
  a.push("-e", "EULA=TRUE", "-e", "TYPE=" + TY, "-e", "VERSION=" + c.version, "-e", "MEMORY=" + c.mem + "M");
  if (c.jvm === "aikar") a.push("-e", "USE_AIKAR_FLAGS=true");
  else if (c.jvm === "custom" && c.jvm_custom) a.push("-e", "JVM_OPTS=" + c.jvm_custom.replace(/[\r\n]/g, " ").slice(0, 400));
  for (const [k, v] of Object.entries(c.env || {})) if (/^[A-Z][A-Z0-9_]{1,40}$/.test(k) && !/^(EULA|TYPE|VERSION|MEMORY|UID|GID)$/.test(k)) a.push("-e", k + "=" + String(v).slice(0, 500));
  a.push(...vol, "itzg/minecraft-server:" + (c.java_tag || javaTag(c.version)));
  return a;
}
function geyserConfig(n, c) {
  if (c.type !== "java" || !c.cross) return;
  const d = path.join(sdir(n), "plugins", "Geyser-Spigot"); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "config.yml"), "bedrock:\n  address: 0.0.0.0\n  port: " + c.bedrock_port + "\n  transport: nethernet\nremote:\n  auth-type: floodgate\n");
}
async function launch(n, c) {
  geyserConfig(n, c);
  const tag = c.type === "java" ? "itzg/minecraft-server:" + (c.java_tag || javaTag(c.version)) : "";
  if (tag && IS_OS && (await run("docker", ["image", "inspect", tag])).code !== 0) { // RAM-only: free runtimes nobody uses before pulling another
    await run("docker", ["image", "prune", "-af"]); await run("docker", ["builder", "prune", "-af"]);
  }
  const r = await run("docker", runArgs(n, c), { timeout: 30 * 60 * 1000 });
  if (r.code !== 0) {
    const e = clean(r.err);
    if (/no space/i.test(e)) fail("Not enough room to download this Java runtime. " + (IS_OS ? "Install ButterOS to a disk, or use a machine with more RAM." : "Free some disk space and try again."));
    if (/port is already allocated|address already in use/i.test(e)) fail("That port is already used by something else on this machine.");
    fail("docker run failed: " + e.trim().split("\n").pop().slice(0, 200));
  }
}

// ---------- create / recreate ----------
async function create(p) {
  const cfg = loadCfg(); const n = p.n; need(n);
  if (!(await dk.engine())) fail("Docker is not running. Start Docker, then try again.");
  if (await dk.exists(n)) fail("A server with that name already exists");
  const type = p.type || "java"; if (!["java", "bedrock"].includes(type)) fail("type must be java or bedrock");
  let flavor = p.flavor || cfg.default_flavor || "paper", ver = p.ver || "LATEST"; let mem = parseInt(p.mem, 10) || cfg.default_mem || 1536;
  if (type === "java") {
    if (!["paper", "vanilla", "fabric", "forge"].includes(flavor)) fail("flavor must be paper, vanilla, fabric or forge");
    if (ver !== "LATEST" && !/^1\.\d{1,2}(\.\d{1,2})?$/.test(ver)) fail("Version looks like 1.21.4");
    const mnr = +ver.split(".")[1] || 99;
    if (flavor === "paper" && ver !== "LATEST" && mnr < 8) fail("Paper starts at 1.8. For older versions pick Vanilla.");
    if (flavor === "fabric" && ver !== "LATEST" && mnr < 14) fail("Fabric starts at 1.14");
  } else { flavor = "bedrock"; if (!(ver === "LATEST" || ver === "PREVIEW" || /^1\.\d+\.\d+(\.\d+)?$/.test(ver))) fail("Bedrock version looks like 1.21.44.01, or LATEST / PREVIEW"); }
  mem = Math.max(512, Math.min(type === "java" ? 16384 : 4096, mem));
  const m = sys.mem(), nd = type === "java" ? Math.min(JAVA_NEED, mem + 400) : BED_NEED;
  if (m.avail - nd < KEEP) fail("Not enough free memory: this server needs about " + nd + " MB (estimate) and " + KEEP + " MB must stay free");
  const c = { ...CONF_DEFAULT, type, flavor, version: ver, mem, share: p.share || cfg.share_default || "none" };
  if (IS_OS && (await run("sh", ["-c", "ip route | grep -q '^default'"])).code !== 0) fail("This machine has no internet yet. Plug in a network cable, or press w on the machine's screen to set up Wi-Fi. The first server downloads about 500 MB.");
  const limit = IS_OS ? ((fs.existsSync("/run/butter-persist")) ? 6 : 2) : 50;
  if ((await dk.ps()).filter((x) => /butterlocal=1/.test(x.Labels || "")).length >= limit) fail("Limit reached: " + limit + " servers in this mode");
  if (type === "java") {
    c.port = await nextPort(25565); const x = p.cross; c.cross = (x === undefined || x === "") ? true : String(x) !== "0";
    if (flavor !== "paper" || (ver !== "LATEST" && (+ver.split(".")[1] || 99) < 16)) c.cross = false;
    if (c.cross) c.bedrock_port = await nextPort(19132, c.port);
    c.java_tag = javaTag(ver);
  } else c.port = await nextPort(19132);
  fs.mkdirSync(sdir(n), { recursive: true });
  try { await launch(n, c); } catch (e) { fs.rmSync(sdir(n), { recursive: true, force: true }); throw e; }
  writeConf(n, c);
  let join = null; if (c.share === "internet" && type === "java") { await new Promise((r) => setTimeout(r, 1000)); join = await share(n).catch(() => null); }
  return ok({ port: c.port, join });
}
async function recreate(n, c, { backup = false } = {}) {
  if (backup) await makeBackup(n, "pre-change").catch(() => {});
  await run("docker", ["stop", "-t", "30", dk.cname(n)], { timeout: 60000 });
  await run("docker", ["rm", "-f", dk.cname(n)]);
  writeConf(n, c); await launch(n, c);
}

// ---------- status ----------
async function status() {
  const cfg = loadCfg(); const m = sys.mem(); const eng = await dk.info();
  let list = [], st = {};
  if (eng.running) { list = await dk.ps(); st = await dk.stats(); }
  const servers = await Promise.all(list.map(async (c) => {
    const n = c.Names.replace(/^bw-/, ""); const L = {}; (c.Labels || "").split(",").forEach((kv) => { const i = kv.indexOf("="); if (i > 0) L[kv.slice(0, i)] = kv.slice(i + 1); });
    const type = /bedrock/.test(c.Image) ? "bedrock" : "java"; const conf = readConf(n) || {};
    let players = null;
    if (c.State === "running" && type === "java") { const r = await dk.rcon(n, "list", 3000); const x = clean(r.out).match(/There are (\d+) of a max/); if (x) players = +x[1]; }
    const props = readProps(n);
    return { name: n, container: c.Names, state: c.State, type, flavor: L.butterflavor || conf.flavor, version: L.butterver || conf.version, port: +(conf.port || L.butterport) || null,
      bedrock_port: type === "bedrock" ? +(conf.port || L.butterport) : (conf.cross ? conf.bedrock_port : null), join: joins[n] || null, cracked: props["online-mode"] === "false", players,
      ram: (st[c.Names] || {}).ram || 0, cpu: (st[c.Names] || {}).cpu || 0, motd: props.motd || "", max_players: +props["max-players"] || null, auto_restart: conf.auto_restart !== false, mem_limit: conf.mem || null,
      commercial: L.buttercommercial === "1", owner: L.butterowner || "" };
  }));
  const sum = servers.reduce((a, s) => a + s.ram, 0); const osMb = Math.max(0, m.total - m.avail - sum);
  const net = sys.netRate(), tmp = sys.temps();
  const co = require("./commercial").summary();
  return ok({ mem: { total: m.total, avail: m.avail, os: osMb, servers: sum, worlds: 0 }, servers, ip: sys.ips(), temps: tmp, temp: tmp.length ? Math.max(...tmp.map((t) => t.c)) : null,
    cpu: sys.cpuPct(), net_rx: net.rx, net_tx: net.tx, uptime: Math.round(IS_OS || process.platform === "linux" ? +fs.readFileSync("/proc/uptime", "utf8").split(" ")[0] : os.uptime()),
    load: os.loadavg().map((x) => x.toFixed(2)).join(" "), cores: os.cpus().length, kernel: os.release(), persist: IS_OS ? fs.existsSync("/run/butter-persist") : true,
    max_servers: IS_OS ? (fs.existsSync("/run/butter-persist") ? 6 : 2) : 50, engine: eng.running ? "ok" : "down", platform: PLATFORM, app: !IS_OS, docker: eng,
    setup_done: cfg.setup_done, machine_name: cfg.machine_name, commercial: { enabled: cfg.commercial.enabled, state: cfg.commercial.state },
    capacity: { java_need: JAVA_NEED, bedrock_need: BED_NEED, keep_free: KEEP, java_fits: m.avail - JAVA_NEED >= KEEP, bedrock_fits: m.avail - BED_NEED >= KEEP, estimate: true },
    backup: { usb: IS_OS ? fs.existsSync("/run/butter-persist") : true, last: null }, web_rss_mb: +(process.memoryUsage().rss / 1048576).toFixed(1), limit_web_mb: 80 });
}

// ---------- versions ----------
let verCache = { t: 0, v: null };
async function versions() {
  if (verCache.v && Date.now() - verCache.t < 6 * 3600e3) return verCache.v;
  try {
    const r = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", { signal: AbortSignal.timeout(15000) }); const j = await r.json();
    verCache = { t: Date.now(), v: ok({ online: true, latest: j.latest.release, java: j.versions.filter((v) => v.type === "release").map((v) => v.id), bedrock: ["LATEST", "PREVIEW"] }) };
  } catch (e) { return verCache.v || ok({ online: false, latest: "LATEST", java: ["LATEST"], bedrock: ["LATEST", "PREVIEW"] }); }
  return verCache.v;
}

// ---------- basic control ----------
async function logs(n, lines = 80) { await must(n); const r = await run("docker", ["logs", "--tail", String(lines), dk.cname(n)]); return ok({ logs: clean(r.out + r.err) }); }
async function control(a, n) {
  await must(n);
  if (a !== "stop") {
    const i = await dk.inspect(n); const bed = /bedrock/.test(i.Config.Image);
    if (a === "start" && !i.State.Running && sys.mem().avail - (bed ? BED_NEED : JAVA_NEED) < KEEP) fail("Not enough free memory to start this server safely");
  }
  const r = await run("docker", [a, dk.cname(n)], { timeout: 120000 }); if (r.code !== 0) fail(a + " failed"); return ok();
}
async function del(n) {
  await must(n); unshare(n); await run("docker", ["rm", "-f", dk.cname(n)]); fs.rmSync(sdir(n), { recursive: true, force: true }); return ok();
}
const isJava = async (n) => { const i = await dk.inspect(n); return !!i && /minecraft-server/.test(i.Config.Image); };
async function players(n) {
  await must(n); if (!(await isJava(n))) fail("Player list works on Java servers");
  const r = await dk.rcon(n, "list", 5000); const l = clean(r.out).split("\n")[0].replace(/^[^:]*:\s*/, "");
  return ok({ players: l.split(",").map((s) => s.trim()).filter(Boolean) });
}
async function playerCmd(a, n, p) {
  await must(n); if (!(await isJava(n))) fail("Works on Java servers"); if (!/^[\w.]{1,16}$/.test(p || "")) fail("bad player name");
  const r = await dk.rcon(n, a + " " + p, 8000); if (r.code !== 0) fail(a + " failed (is the server running?)"); return ok();
}
async function cmd(n, c) {
  await must(n); c = String(c || "").replace(/[\r\n]/g, "").slice(0, 200); if (!c) fail("type a command");
  const i = await dk.inspect(n); if (!i.State.Running) fail("Start the server first");
  let o;
  if (/minecraft-server/.test(i.Config.Image)) { const r = await dk.rcon(n, c, 12000); o = r.out + r.err; }
  else { await run("docker", ["exec", dk.cname(n), "send-command", ...c.split(" ")]); await new Promise((r) => setTimeout(r, 1000)); const r = await run("docker", ["logs", "--tail", "4", dk.cname(n)]); o = r.out + r.err; }
  return ok({ out: clean(o) });
}

// ---------- server.properties ----------
const propFile = (n) => path.join(sdir(n), "server.properties");
function readProps(n) { const o = {}; try { fs.readFileSync(propFile(n), "utf8").split("\n").forEach((l) => { if (l && l[0] !== "#") { const i = l.indexOf("="); if (i > 0) o[l.slice(0, i)] = l.slice(i + 1).replace(/\r$/, ""); } }); } catch (e) {} return o; }
function writeProps(n, upd) {
  let L = []; try { L = fs.readFileSync(propFile(n), "utf8").split("\n"); } catch (e) {}
  const left = { ...upd };
  L = L.map((l) => { const i = l.indexOf("="); if (l[0] === "#" || i < 1) return l; const k = l.slice(0, i); if (k in left) { const v = left[k]; delete left[k]; return k + "=" + v; } return l; });
  while (L.length && L[L.length - 1] === "") L.pop();
  for (const k in left) L.push(k + "=" + left[k]);
  fs.writeFileSync(propFile(n), L.join("\n") + "\n");
}
const PROP_KEY = /^[a-z0-9][a-z0-9.-]{0,60}$/;
async function withStopped(n, fn, restart = true) {
  const i = await dk.inspect(n); const was = i && i.State.Running;
  if (was) await run("docker", ["stop", "-t", "25", dk.cname(n)], { timeout: 60000 });
  try { await fn(); } finally { if (was && restart) await run("docker", ["start", dk.cname(n)]); }
}
async function srvconf(n) { await must(n); const c = await loadConf(n); const pr = readProps(n); const { env, ...rest } = c; return ok({ conf: { ...rest, env }, props: pr, props_available: fs.existsSync(propFile(n)) }); }
async function setprops(n, b) {
  await must(n); if (!fs.existsSync(propFile(n))) fail("Start the server once first so it creates server.properties");
  const upd = {}; for (const [k, v] of Object.entries((b && b.props) || {})) { if (!PROP_KEY.test(k)) fail("bad property name " + k); if (/[\r\n]/.test(String(v))) fail("bad value for " + k); upd[k] = String(v).slice(0, 500); }
  if ("enable-rcon" in upd) delete upd["enable-rcon"]; // the console depends on it
  await withStopped(n, () => writeProps(n, upd), !b || b.restart !== false); return ok();
}
async function setsrvconf(n, b) {
  await must(n); const c = await loadConf(n); const u = (b && b.conf) || {}; const old = JSON.stringify(c);
  const num = (v, lo, hi, d) => { const x = parseFloat(v); return isNaN(x) ? d : Math.max(lo, Math.min(hi, x)); };
  if ("mem" in u) c.mem = num(u.mem, 512, c.type === "java" ? 16384 : 4096, c.mem);
  if ("cpus" in u) c.cpus = num(u.cpus, 0, os.cpus().length, 0);
  if ("auto_restart" in u) c.auto_restart = !!u.auto_restart;
  if ("restart_every_h" in u) c.restart_every_h = num(u.restart_every_h, 0, 168, 0);
  if ("jvm" in u) c.jvm = ["aikar", "default", "custom"].includes(u.jvm) ? u.jvm : "aikar";
  if ("jvm_custom" in u) c.jvm_custom = String(u.jvm_custom).slice(0, 400);
  if ("cross" in u && c.type === "java" && c.flavor === "paper") c.cross = !!u.cross;
  if ("backup_every_h" in u) c.backup_every_h = num(u.backup_every_h, 0, 168, 0);
  if ("backup_keep" in u) c.backup_keep = num(u.backup_keep, 1, 50, 5);
  if ("env" in u && u.env && typeof u.env === "object") c.env = u.env;
  if ("share" in u) c.share = u.share === "internet" ? "internet" : "none";
  if (JSON.stringify(c) !== old) await recreate(n, c); else writeConf(n, c);
  return ok();
}
async function setversion(n, ver, flavor) {
  await must(n); const c = await loadConf(n);
  if (c.type === "java") { if (ver !== "LATEST" && !/^1\.\d{1,2}(\.\d{1,2})?$/.test(ver || "")) fail("Version looks like 1.21.4"); if (flavor && ["paper", "vanilla", "fabric", "forge"].includes(flavor)) c.flavor = flavor; c.java_tag = javaTag(ver); if (c.flavor !== "paper") c.cross = false; }
  c.version = ver || "LATEST"; await recreate(n, c, { backup: true }); return ok();
}
async function rename(n, to) {
  await must(n); need(to); if (await dk.exists(to) || fs.existsSync(sdir(to))) fail("That name is taken");
  const c = await loadConf(n); await run("docker", ["stop", "-t", "30", dk.cname(n)], { timeout: 60000 }); await run("docker", ["rm", "-f", dk.cname(n)]);
  fs.renameSync(sdir(n), sdir(to)); unshare(n); await launch(to, c); return ok();
}
async function clone(n, to) {
  await must(n); need(to); if (await dk.exists(to) || fs.existsSync(sdir(to))) fail("That name is taken");
  await withStopped(n, () => fs.cpSync(sdir(n), sdir(to), { recursive: true }));
  const c = await loadConf(n); c.port = await nextPort(c.port + 1); if (c.cross) c.bedrock_port = await nextPort(c.bedrock_port + 1, c.port);
  writeConf(to, c); await launch(to, c); await run("docker", ["stop", "-t", "20", dk.cname(to)]); return ok();
}

// ---------- whitelist / ops / bans ----------
const LISTS = { whitelist: "whitelist.json", ops: "ops.json", "banned-players": "banned-players.json", "banned-ips": "banned-ips.json" };
async function list(n, l) {
  await must(n); if (!LISTS[l]) fail("unknown list");
  let j = []; try { j = JSON.parse(fs.readFileSync(path.join(sdir(n), LISTS[l]), "utf8")); } catch (e) {}
  return ok({ entries: j.map((x) => ({ name: x.name || x.ip, uuid: x.uuid, reason: x.reason })) });
}
async function listEdit(add, n, l, p) {
  await must(n); if (!(await isJava(n))) fail("Works on Java servers"); if (!LISTS[l]) fail("unknown list"); if (!/^[\w.:]{1,45}$/.test(p || "")) fail("bad name");
  const cmds = { whitelist: ["whitelist add", "whitelist remove"], ops: ["op", "deop"], "banned-players": ["ban", "pardon"], "banned-ips": ["ban-ip", "pardon-ip"] }[l];
  const r = await dk.rcon(n, cmds[add ? 0 : 1] + " " + p, 8000); if (r.code !== 0) fail("Start the server first"); await new Promise((r) => setTimeout(r, 500)); return ok();
}

// ---------- plugins / mods ----------
async function pdir(n) { const c = await loadConf(n); return ["fabric", "forge"].includes(c && c.flavor) ? "mods" : "plugins"; }
async function plugin(n, url) {
  await must(n); if (!(await isJava(n))) fail("Plugins work on Java servers");
  if (!/^https:\/\/(cdn\.modrinth\.com\/.*\.jar|hangarcdn\.papermc\.io\/.*\.jar|github\.com\/.*\.jar|objects\.githubusercontent\.com\/)/.test(url || "")) fail("Use a direct .jar link from Modrinth, Hangar or GitHub");
  const f = path.basename(url.split("?")[0]).replace(/[^\w.-]/g, ""); if (!f) fail("bad file name");
  const d = path.join(sdir(n), await pdir(n)); fs.mkdirSync(d, { recursive: true });
  try { const r = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: "follow" }); if (!r.ok) throw 0; fs.writeFileSync(path.join(d, f), Buffer.from(await r.arrayBuffer())); } catch (e) { fail("download failed"); }
  await run("docker", ["restart", dk.cname(n)]); return ok({ file: f });
}
async function plugins(n) { need(n); const d = path.join(sdir(n), await pdir(n)); let l = []; try { l = fs.readdirSync(d).filter((x) => x.endsWith(".jar")); } catch (e) {} return ok({ plugins: l }); }
async function rmplugin(n, f) { need(n); f = path.basename(String(f || "")); const p = path.join(sdir(n), await pdir(n), f); if (!f || !fs.existsSync(p)) fail("not found"); fs.rmSync(p); return ok(); }
async function cracked(n, v) {
  await must(n); if (!(await isJava(n))) fail("Cracked mode works on Java servers"); if (!fs.existsSync(propFile(n))) fail("Start the server once first");
  const on = String(v) === "1";
  await withStopped(n, () => writeProps(n, { "online-mode": on ? "false" : "true", "enforce-secure-profile": on ? "false" : "true" }));
  return ok({ cracked: on });
}

// ---------- internet link (bore) ----------
const joins = {}; const tunnels = {};
async function share(n) {
  await must(n); if (!(await isJava(n))) fail("The free link carries Java servers (Bedrock is local network only)");
  const c = await loadConf(n); unshare(n);
  const hasBore = (await run(process.platform === "win32" ? "where" : "which", ["bore"])).code === 0;
  let p;
  if (hasBore) p = cp.spawn("bore", ["local", String(c.port), "--to", "bore.pub"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  else p = cp.spawn("docker", ["run", "--rm", "--name", "bw-bore-" + n, "--add-host", "host.docker.internal:host-gateway", "ekzhang/bore", "local", String(c.port), "--local-host", "host.docker.internal", "--to", "bore.pub"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  tunnels[n] = p; let buf = "";
  const got = await new Promise((res) => { const t = setTimeout(() => res(null), 30000); const f = (d) => { buf += d; const m = buf.match(/bore\.pub:\d+/); if (m) { clearTimeout(t); res(m[0]); } }; p.stdout.on("data", f); p.stderr.on("data", f); p.on("close", () => res(null)); });
  if (!got) { unshare(n); fail("Could not open the internet link (is this machine online?)"); }
  joins[n] = got; return ok({ join: got });
}
function unshare(n) { try { tunnels[n] && tunnels[n].kill(); } catch (e) {} try { run("docker", ["rm", "-f", "bw-bore-" + n]); } catch (e) {} delete tunnels[n]; delete joins[n]; return ok(); }

// ---------- files ----------
function safe(n, p) {
  need(n); const base = sdir(n); const full = path.resolve(base, "." + path.sep + String(p || "/").replace(/\\/g, "/").replace(/^\/+/, ""));
  if (full !== base && !full.startsWith(base + path.sep)) fail("Path is outside the server folder");
  try { const real = fs.realpathSync(fs.existsSync(full) ? full : path.dirname(full)); const rb = fs.realpathSync(base); if (real !== rb && !real.startsWith(rb + path.sep)) fail("Path is outside the server folder"); } catch (e) { if (e instanceof Fail) throw e; }
  return full;
}
const rel = (n, full) => "/" + path.relative(sdir(n), full).split(path.sep).join("/");
function ls(n, p) {
  const full = safe(n, p); let st; try { st = fs.statSync(full); } catch (e) { fail("Not found"); } if (!st.isDirectory()) fail("Not a folder");
  const e = fs.readdirSync(full, { withFileTypes: true }).map((d) => { let s = {}; try { s = fs.statSync(path.join(full, d.name)); } catch (x) {} return { name: d.name, dir: d.isDirectory(), size: d.isDirectory() ? 0 : s.size || 0, mtime: s.mtimeMs ? Math.round(s.mtimeMs / 1000) : 0 }; });
  e.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name)); return ok({ path: rel(n, full), entries: e });
}
function cat(n, p) { const full = safe(n, p); let st; try { st = fs.statSync(full); } catch (e) { fail("Not found"); } if (st.isDirectory()) fail("That is a folder"); if (st.size > 512 * 1024) fail("File is bigger than 512 KB, download it instead");
  const b = fs.readFileSync(full); if (b.includes(0)) fail("That looks like a binary file, download it instead"); return ok({ content: b.toString("utf8"), size: st.size }); }
function write(n, b) { const full = safe(n, b && b.p); if (full === sdir(n)) fail("bad path"); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, String(b.content == null ? "" : b.content)); return ok(); }
function mkdir(n, p) { const full = safe(n, p); fs.mkdirSync(full, { recursive: true }); return ok(); }
function rm(n, p) { const full = safe(n, p); if (full === sdir(n) || path.basename(full) === "butter.json") fail("That cannot be deleted"); if (!fs.existsSync(full)) fail("Not found"); fs.rmSync(full, { recursive: true, force: true }); return ok(); }
async function put(n, p, req, len) { // streamed upload into the server folder
  const full = safe(n, p); if (full === sdir(n)) fail("bad path"); if (!(len > 0)) fail("empty upload"); if (len > 150 * 1048576) fail("File is bigger than 150 MB");
  fs.mkdirSync(path.dirname(full), { recursive: true }); const tmp = full + ".part"; const ws = fs.createWriteStream(tmp); let got = 0;
  await new Promise((res, rej) => { req.on("data", (d) => { got += d.length; }); req.pipe(ws); ws.on("finish", res); ws.on("error", rej); req.on("error", rej); req.on("aborted", () => rej(new Error("aborted"))); }).catch(() => { try { fs.rmSync(tmp); } catch (e) {} fail("Upload was cut off, try again"); });
  if (got !== len) { fs.rmSync(tmp, { force: true }); fail("Upload was cut off, try again"); }
  fs.renameSync(tmp, full); return ok({ file: path.basename(full) });
}
async function uploadJar(n, f, req, len) {
  await must(n); if (!(await isJava(n))) fail("Uploads work on Java servers"); f = path.basename(String(f || "")).replace(/[^\w.-]/g, ""); if (!f.endsWith(".jar")) fail("Only .jar files");
  if (sys.mem().avail < len / 1048576 + 20) fail("Not enough free memory on this machine for that file");
  const r = await put(n, "/" + (await pdir(n)) + "/" + f, req, len); await run("docker", ["restart", dk.cname(n)]); return r;
}

// ---------- backups ----------
const bdir = (n) => path.join(BACKUPS, n);
async function makeBackup(n, tag) {
  need(n); fs.mkdirSync(bdir(n), { recursive: true }); const i = await dk.inspect(n); const run_ = i && i.State.Running && /minecraft-server/.test(i.Config.Image);
  if (run_) { await dk.rcon(n, "save-off", 5000); await dk.rcon(n, "save-all flush", 20000); }
  const f = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19) + (tag ? "-" + tag : "") + ".tar.gz";
  const r = await run("tar", ["-czf", path.join(bdir(n), f), "-C", WORLDS, n], { timeout: 30 * 60 * 1000 });
  if (run_) await dk.rcon(n, "save-on", 5000);
  if (r.code !== 0) { fs.rmSync(path.join(bdir(n), f), { force: true }); fail("Backup failed: " + clean(r.err).slice(0, 150)); }
  const c = readConf(n); const keep = (c && c.backup_keep) || 5;
  const all = backupList(n).filter((b) => !/pre-/.test(b.file)); for (const b of all.slice(keep)) fs.rmSync(path.join(bdir(n), b.file), { force: true });
  return f;
}
function backupList(n) { try { return fs.readdirSync(bdir(n)).filter((f) => f.endsWith(".tar.gz")).map((f) => { const s = fs.statSync(path.join(bdir(n), f)); return { file: f, size: s.size, mtime: Math.round(s.mtimeMs / 1000) }; }).sort((a, b) => b.mtime - a.mtime); } catch (e) { return []; } }
const bfile = (n, f) => { need(n); f = path.basename(String(f || "")); if (!f.endsWith(".tar.gz")) fail("bad file"); const p = path.join(bdir(n), f); if (!fs.existsSync(p)) fail("Backup not found"); return p; };
async function restore(n, f) {
  await must(n); const p = bfile(n, f); await makeBackup(n, "pre-restore").catch(() => {});
  await withStopped(n, async () => { const keep = readConf(n); fs.rmSync(sdir(n), { recursive: true, force: true }); const r = await run("tar", ["-xzf", p, "-C", WORLDS], { timeout: 30 * 60 * 1000 }); if (r.code !== 0) fail("Restore failed: " + clean(r.err).slice(0, 150)); if (!fs.existsSync(confFile(n)) && keep) writeConf(n, keep); });
  return ok();
}

// ---------- timers: scheduled restarts and backups ----------
function timers() {
  setInterval(async () => {
    try {
      if (!(await dk.engine())) return;
      for (const c of await dk.ps()) {
        const n = c.Names.replace(/^bw-/, ""); const conf = readConf(n); if (!conf) continue; const now = Date.now(), L = dk.lastRun[n] || (dk.lastRun[n] = { b: now, r: now });
        if (conf.backup_every_h > 0 && now - L.b > conf.backup_every_h * 3600e3) { L.b = now; await makeBackup(n, "auto").catch(() => {}); }
        if (conf.restart_every_h > 0 && c.State === "running" && now - L.r > conf.restart_every_h * 3600e3) { L.r = now; if (/minecraft-server/.test(c.Image)) { await dk.rcon(n, "say Restarting in 30 seconds", 4000); await new Promise((r) => setTimeout(r, 30000)); } await run("docker", ["restart", c.Names], { timeout: 120000 }); }
      }
    } catch (e) {}
  }, 60000).unref();
}

module.exports = { status, versions, create, logs, control, del, players, playerCmd, cmd, srvconf, setprops, setsrvconf, setversion, rename, clone, list, listEdit, plugin, plugins, rmplugin, cracked, share, unshare,
  ls, cat, write, mkdir, rm, put, uploadJar, makeBackup, backupList, restore, bfile, bdir, timers, runArgs, launch, loadConf, readConf, writeConf, sdir, nextPort, valid, JAVA_NEED, KEEP, safe };
