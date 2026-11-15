// Scenario test for failover: node failover.test.js   (uses a fake docker; no network)
const { spawn } = require("child_process"), fs = require("fs"), path = require("path"), os = require("os");
const T = fs.mkdtempSync(path.join(os.tmpdir(), "fo-")); const REG = path.join(T, "reg"); fs.mkdirSync(REG);
const STUB = process.env.DOCKER_STUB || path.join(__dirname, "test", "docker-stub.js");
let ok = 0, bad = 0; const t = (n, c, d) => { c ? ok++ : bad++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + (d || ""))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = { ...process.env, DOCKER_BIN: STUB, DEV_LOGIN: "1", SESSION_SECRET: "shared-secret", FRONTEND_URL: "http://localhost:3000", DISCORD_CLIENT_ID: "1", DISCORD_CLIENT_SECRET: "1",
  REGISTRY_DIR: REG, FAILOVER_TICK_MS: "400", FAILOVER_ALIVE_MS: "2500", FAILOVER_WORLD_MIN: "0.005", MAX_SERVERS_PER_USER: "3", TUNNEL_URL_FILE: path.join(T, "url") };
function node(name, port, role) {
  const d = path.join(T, name); fs.mkdirSync(d, { recursive: true });
  const env = { ...base, PORT: String(port), BUTTER_ROLE: role, DATA_DIR: path.join(d, "data"), WORLD_DIR: path.join(d, "worlds"), STUB_STATE: path.join(d, "stub.json"), DEVICE_ID: name };
  const p = spawn("node", [path.join(__dirname, "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  p.out = ""; p.stdout.on("data", (c) => p.out += c); p.stderr.on("data", (c) => p.out += c); p.dir = d; p.port = port; return p;
}
const get = async (port, p, tok) => { try { const r = await fetch("http://127.0.0.1:" + port + p, { headers: tok ? { Authorization: "Bearer " + tok } : {} }); return { s: r.status, j: await r.json().catch(() => ({})) }; } catch (e) { return { s: 0, j: {} }; } };
const post = async (port, p, tok, body) => { const r = await fetch("http://127.0.0.1:" + port + p, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const until = async (f, ms = 15000) => { const e = Date.now() + ms; while (Date.now() < e) { if (await f()) return true; await sleep(200); } return false; };
(async () => {
  fs.writeFileSync(path.join(T, "url"), "https://secret-tunnel.example");
  let P = node("primary", 8201, "primary");
  await until(async () => (await get(8201, "/health")).j.ok);
  t("primary comes up and is not on standby", await until(async () => (await get(8201, "/health")).j.standby === false));
  const r = await fetch("http://127.0.0.1:8201/auth/dev?id=7", { redirect: "manual" }); const tok = decodeURIComponent(r.headers.get("location").split("#token=")[1]);
  const c = await post(8201, "/servers", tok, { name: "alpha", tpl: "minecraft" }); t("create server on primary", c.s === 202, JSON.stringify(c));
  fs.mkdirSync(path.join(P.dir, "worlds", c.j.id), { recursive: true }); fs.writeFileSync(path.join(P.dir, "worlds", c.j.id, "level.dat"), "WORLD-v1");
  t("primary publishes heartbeat, state and world", await until(async () => fs.existsSync(path.join(REG, "primary.json")) && fs.existsSync(path.join(REG, "state.json")) && fs.existsSync(path.join(REG, "blobs", c.j.id + ".tgz"))));
  const D = node("device", 8202, "device");
  await until(async () => (await get(8202, "/health")).j.ok);
  const h = await get(8202, "/health"); t("device idles on standby while primary is alive", h.j.standby === true && h.j.failover === "standby", JSON.stringify(h));
  t("standby device refuses real requests", (await get(8202, "/servers", tok)).s === 503);
  await sleep(3500); t("device still standby after a few cycles (no false takeover)", (await get(8202, "/health")).j.standby === true);
  P.kill("SIGKILL"); // codespace goes to sleep
  t("device takes over when heartbeat stops", await until(async () => (await get(8202, "/health")).j.failover === "active", 20000), D.out.slice(-400));
  const l = await get(8202, "/servers", tok); t("same login token works on the device and shows the server", l.s === 200 && l.j.servers && l.j.servers.length === 1 || (Array.isArray(l.j) && l.j.length === 1), JSON.stringify(l).slice(0, 200));
  const sid = c.j.id; t("world files were restored on the device", fs.existsSync(path.join(D.dir, "worlds", sid, "level.dat")) && fs.readFileSync(path.join(D.dir, "worlds", sid, "level.dat"), "utf8") === "WORLD-v1");
  const c2 = await post(8202, "/servers", tok, { name: "beta", tpl: "bedrock" }); t("can create a new server while on the device", c2.s === 202, JSON.stringify(c2));
  fs.writeFileSync(path.join(D.dir, "worlds", sid, "level.dat"), "WORLD-v2-from-device");
  const dj = JSON.parse(fs.readFileSync(path.join(REG, "device-device.json"), "utf8")); t("device publishes its address only into the private store", dj.active === true && dj.url === "https://secret-tunnel.example");
  const hh = JSON.stringify(await get(8202, "/health")) + JSON.stringify(await get(8202, "/")); t("device address never appears in API responses", !hh.includes("secret-tunnel"));
  t("internal handback refuses calls without the local key", (await fetch("http://127.0.0.1:8202/internal/handback", { method: "POST" })).status === 403);
  t("internal handback refuses calls that came through a tunnel", (await fetch("http://127.0.0.1:8202/internal/handback", { method: "POST", headers: { "x-butter-internal": fs.readFileSync(path.join(D.dir, "data", "internal.key"), "utf8"), "x-forwarded-for": "1.2.3.4" } })).status === 403);
  P = node("primary", 8201, "primary"); // codespace wakes up
  t("returning primary asks for the work back and the device hands it back", await until(async () => fs.existsSync(path.join(REG, "handback.json")) || (await get(8201, "/health")).j.standby === false, 25000), P.out.slice(-300));
  t("primary becomes active after loading the handed-back work", await until(async () => (await get(8201, "/health")).j.standby === false, 25000), P.out.slice(-300));
  const l2 = await get(8201, "/servers", tok); const n = (l2.j.servers || l2.j || []).length; t("primary now has both servers (alpha + beta)", n === 2, JSON.stringify(l2).slice(0, 200));
  t("primary has the newer world from the device", fs.existsSync(path.join(P.dir, "worlds", sid, "level.dat")) && fs.readFileSync(path.join(P.dir, "worlds", sid, "level.dat"), "utf8") === "WORLD-v2-from-device");
  t("device is back on standby", await until(async () => (await get(8202, "/health")).j.failover === "standby", 10000));
  // shutdown path: take over again, then use the local handback endpoint like the OS shutdown script does
  P.kill("SIGKILL"); await until(async () => (await get(8202, "/health")).j.failover === "active", 20000);
  const key = fs.readFileSync(path.join(D.dir, "data", "internal.key"), "utf8");
  const hb = await fetch("http://127.0.0.1:8202/internal/handback", { method: "POST", headers: { "x-butter-internal": key } }); const hj = await hb.json();
  t("shutdown handback uploads everything", hb.status === 200 && hj.ok === true && fs.existsSync(path.join(REG, "handback.json")), JSON.stringify(hj));
  D.kill("SIGKILL"); P.kill("SIGKILL"); console.log(ok + " passed, " + bad + " failed"); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
