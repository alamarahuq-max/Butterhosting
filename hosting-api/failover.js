"use strict";
/* ButterHosting failover. One "primary" (the Codespace) and any number of "device" machines (ButterOS boxes).
   They never talk to each other directly. They share a small private store (a branch + a release in your private GitHub repo,
   or a plain folder for tests). Roles:  BUTTER_ROLE=primary | device  (unset = failover off).
   - primary: heartbeat, publishes the app database and the worlds. If a device is holding the work when it starts, it asks for it back first.
   - device : watches the heartbeat. If the primary is silent it loads the database + worlds and runs the servers (active).
              When the primary is back (or the machine is shutting down) it stops the servers, uploads everything and hands back.
   The browser never learns the device address: the site's own Vercel function (api/relay.js) forwards to it. */
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const { execFile } = require("child_process");

const sh = (cmd, args, opt = {}) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 26, timeout: 20 * 60 * 1000, ...opt }, (e, o, er) => e ? rej(new Error((er || e.message).toString().slice(0, 300))) : res(String(o))));

/* ---------- stores ---------- */
function fsStore(dir) {
  fs.mkdirSync(path.join(dir, "blobs"), { recursive: true });
  return {
    kind: "folder",
    async get(n) { try { return fs.readFileSync(path.join(dir, n), "utf8"); } catch { return null; } },
    async put(n, s) { fs.writeFileSync(path.join(dir, n), s); },
    async del(n) { try { fs.unlinkSync(path.join(dir, n)); } catch {} },
    async list(prefix) { return fs.readdirSync(dir).filter((f) => f.startsWith(prefix)); },
    async putBlob(n, file) { fs.copyFileSync(file, path.join(dir, "blobs", n)); },
    async getBlob(n, file) { const p = path.join(dir, "blobs", n); if (!fs.existsSync(p)) return false; fs.copyFileSync(p, file); return true; },
  };
}
function githubStore(repo, token) {
  const A = { Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "butterhosting" };
  const api = (p, o = {}) => fetch("https://api.github.com/repos/" + repo + p, { ...o, headers: { ...A, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...(o.headers || {}) } });
  const BR = "registry", REL = "butter-worlds";
  let ready = false;
  async function init() {
    if (ready) return;
    let r = await api("/branches/" + BR);
    if (r.status === 404) {
      const repoInfo = await (await api("")).json();
      const head = await (await api("/git/ref/heads/" + repoInfo.default_branch)).json();
      r = await api("/git/refs", { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + BR, sha: head.object.sha }) });
      if (!r.ok) throw new Error("cannot create registry branch: " + r.status);
    }
    ready = true;
  }
  async function release() {
    let r = await api("/releases/tags/" + REL);
    if (r.status === 404) r = await api("/releases", { method: "POST", body: JSON.stringify({ tag_name: REL, name: "ButterHosting world backups (private)", body: "Automatic. Do not delete.", prerelease: true }) });
    return r.json();
  }
  const file = (n) => "/contents/_butter/" + n;
  return {
    kind: "github",
    async get(n) { await init(); const r = await api(file(n) + "?ref=" + BR, { headers: { Accept: "application/vnd.github.raw+json" } }); return r.ok ? r.text() : null; },
    async put(n, s) {
      await init(); let sha; const cur = await api(file(n) + "?ref=" + BR); if (cur.ok) sha = (await cur.json()).sha;
      const r = await api(file(n), { method: "PUT", body: JSON.stringify({ message: "registry " + n, branch: BR, content: Buffer.from(s).toString("base64"), sha }) });
      if (!r.ok) throw new Error("registry write failed " + r.status);
    },
    async del(n) { await init(); const cur = await api(file(n) + "?ref=" + BR); if (!cur.ok) return; const sha = (await cur.json()).sha; await api(file(n), { method: "DELETE", body: JSON.stringify({ message: "registry rm " + n, branch: BR, sha }) }); },
    async list(prefix) { await init(); const r = await api("/contents/_butter?ref=" + BR); if (!r.ok) return []; return (await r.json()).map((f) => f.name).filter((x) => x.startsWith(prefix)); },
    async putBlob(n, f) {
      const rel = await release(); const old = (rel.assets || []).find((a) => a.name === n);
      if (old) await api("/releases/assets/" + old.id, { method: "DELETE" });
      await sh("curl", ["-sS", "-f", "-X", "POST", "-H", "Authorization: Bearer " + token, "-H", "Content-Type: application/gzip", "--data-binary", "@" + f,
        "https://uploads.github.com/repos/" + repo + "/releases/" + rel.id + "/assets?name=" + encodeURIComponent(n)]);
    },
    async getBlob(n, f) {
      const rel = await release(); const a = (rel.assets || []).find((x) => x.name === n); if (!a) return false;
      await sh("curl", ["-sS", "-f", "-L", "-H", "Authorization: Bearer " + token, "-H", "Accept: application/octet-stream", "-o", f, "https://api.github.com/repos/" + repo + "/releases/assets/" + a.id]);
      return true;
    },
  };
}

/* ---------- logic ---------- */
module.exports = function failover(ctx) {
  const env = ctx.env, role = env.BUTTER_ROLE || "";
  const log = (...a) => console.log("[failover]", ...a);
  const off = { enabled: false, standby: () => false, state: () => ({ enabled: false }), start() {}, handback: async () => ({ ok: false }) };
  if (!role) return off;
  if (!ctx.worldsDir) { log("disabled: set WORLD_DIR so worlds live in plain folders"); return off; }
  const store = env.REGISTRY_DIR ? fsStore(env.REGISTRY_DIR) : (env.REGISTRY_REPO && env.REGISTRY_TOKEN ? githubStore(env.REGISTRY_REPO, env.REGISTRY_TOKEN) : null);
  if (!store) { log("disabled: set REGISTRY_REPO and REGISTRY_TOKEN"); return off; }
  const ALIVE = Number(env.FAILOVER_ALIVE_MS || 150000), TICK = Number(env.FAILOVER_TICK_MS || 20000);
  const WORLD_CAP_MB = Number(env.FAILOVER_WORLD_CAP_MB || 400), WORLD_EVERY = Number(env.FAILOVER_WORLD_MIN || 60) * 60000;
  const ID = env.DEVICE_ID || os.hostname() + "-" + crypto.createHash("sha1").update(ctx.dataDir).digest("hex").slice(0, 6);
  let mode = role === "primary" ? "booting" : "standby"; // booting|primary|standby|active|handing-back
  let lastStateHash = "", lastWorlds = 0, missed = 0, seen = 0, busy = false;

  const age = (j) => { try { return Date.now() - JSON.parse(j).ts; } catch { return Infinity; } };
  async function worldIds() { return Object.keys(ctx.getDb().servers || {}).filter((id) => fs.existsSync(path.join(ctx.worldsDir, id))); }
  async function flush(id) { for (const c of ["save-off", "save-all flush"]) await ctx.dk(["exec", "bh-" + id, "rcon-cli", ...c.split(" ")]).catch(() => {}); }
  async function pushWorld(id) {
    const dir = path.join(ctx.worldsDir, id);
    const mb = Number((await sh("du", ["-sm", dir]).catch(() => "0")).split(/\s/)[0]);
    if (mb > WORLD_CAP_MB) { log(`world ${id} is ${mb} MB, over the ${WORLD_CAP_MB} MB cap, not synced`); return false; }
    const tmp = path.join(os.tmpdir(), "bw-" + id + ".tgz");
    await sh("tar", ["czf", tmp, "-C", dir, "."]); await store.putBlob(id + ".tgz", tmp); fs.unlinkSync(tmp); return true;
  }
  async function pullWorld(id) {
    const tmp = path.join(os.tmpdir(), "bw-" + id + ".tgz");
    if (!(await store.getBlob(id + ".tgz", tmp))) return false;
    const dir = path.join(ctx.worldsDir, id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await sh("tar", ["xzf", tmp, "-C", dir]); fs.unlinkSync(tmp); return true;
  }
  async function pushState(from) { const s = JSON.stringify({ ts: Date.now(), from, db: ctx.getDb() }); await store.put("state.json", s); lastStateHash = crypto.createHash("sha1").update(JSON.stringify(ctx.getDb())).digest("hex"); }
  async function pullState() { const s = await store.get("state.json"); if (!s) return false; const j = JSON.parse(s); ctx.setDb(Object.assign({ users: {}, servers: {} }, j.db)); return true; }
  async function pullAll() { if (!(await pullState())) return; for (const id of Object.keys(ctx.getDb().servers)) await pullWorld(id).catch((e) => log("pull world", id, e.message)); }
  async function pushAll(from, stop) {
    for (const id of await worldIds()) {
      if (stop) await ctx.dk(["exec", "bh-" + id, "rcon-cli", "save-all", "flush"]).catch(() => {}); else await flush(id);
      if (stop) await ctx.dk(["stop", "-t", "30", "bh-" + id]).catch(() => {});
      await pushWorld(id).catch((e) => log("push world", id, e.message));
      if (!stop) await ctx.dk(["exec", "bh-" + id, "rcon-cli", "save-on"]).catch(() => {});
    }
    await pushState(from);
  }
  const url = () => { try { return env.PUBLIC_URL || fs.readFileSync(env.TUNNEL_URL_FILE || "/run/butter-tunnel-url", "utf8").trim(); } catch { return null; } };
  // coarse location (rounded to 0.5 degrees, about 50 km) so the site can pick the nearest machine; never the exact place
  let geo = null; const rnd = (x) => Math.round(Number(x) * 2) / 2;
  if (env.BUTTER_GEO) { const [a, b] = env.BUTTER_GEO.split(","); if (isFinite(a) && isFinite(b)) geo = { lat: rnd(a), lon: rnd(b) }; }
  async function findGeo() { if (geo || env.BUTTER_NO_GEO) return; try { const j = JSON.parse(await sh("curl", ["-sS", "-m", "8", "https://ipwho.is/?fields=latitude,longitude,success"])); if (j.success && isFinite(j.latitude)) geo = { lat: rnd(j.latitude), lon: rnd(j.longitude) }; } catch (e) { /* no location: it is still used, just never preferred as nearest */ } }
  const beat = () => role === "primary" ? store.put("primary.json", JSON.stringify({ ts: Date.now(), mode })) :
    store.put("device-" + ID + ".json", JSON.stringify({ ts: Date.now(), id: ID, active: mode === "active", url: url(), geo, servers: Object.keys(ctx.getDb().servers || {}).length }));

  async function takeover() {
    log("primary is silent, taking over"); mode = "active"; // set first so we stop re-entering
    try {
      await pullAll();
      for (const s of Object.values(ctx.getDb().servers)) { await ctx.dk(["rm", "-f", "bh-" + s.id]).catch(() => {}); await ctx.provision(s); }
      await beat(); log("active with", Object.keys(ctx.getDb().servers).length, "servers");
    } catch (e) { log("takeover failed:", e.message); mode = "standby"; }
  }
  async function handback(why) {
    if (mode !== "active") return { ok: false, error: "not active" };
    log("handing back:", why); mode = "handing-back";
    try {
      await pushAll(ID, true);
      await store.put("handback.json", JSON.stringify({ ts: Date.now(), from: ID }));
      for (const s of Object.values(ctx.getDb().servers)) await ctx.dk(["rm", "-f", "bh-" + s.id]).catch(() => {});
      ctx.setDb({ users: {}, servers: {} }); mode = "standby"; await beat(); return { ok: true };
    } catch (e) { log("handback failed:", e.message); mode = "active"; return { ok: false, error: e.message }; }
  }

  async function primaryBoot() {
    const devs = await store.list("device-");
    let holder = false;
    for (const f of devs) { const j = await store.get(f); if (j && age(j) < ALIVE && JSON.parse(j).active) holder = true; }
    if (holder) {
      log("a device is holding the work, asking for it back"); await store.put("reclaim.json", JSON.stringify({ ts: Date.now() }));
      while (true) { const h = await store.get("handback.json"); if (h) break; await store.put("reclaim.json", JSON.stringify({ ts: Date.now() })); await new Promise((r) => setTimeout(r, 10000)); }
    }
    if (await store.get("handback.json")) { log("loading work handed back by a device"); await pullAll(); await store.del("handback.json"); await store.del("reclaim.json"); }
    mode = "primary"; await beat(); log("primary ready");
  }

  async function tick() {
    if (busy) return; busy = true;
    try {
      if (role === "primary") {
        if (mode !== "primary") return;
        await beat();
        const h = crypto.createHash("sha1").update(JSON.stringify(ctx.getDb())).digest("hex");
        if (h !== lastStateHash) await pushState("primary");
        if (Date.now() - lastWorlds > WORLD_EVERY) { lastWorlds = Date.now(); for (const id of await worldIds()) { await flush(id); await pushWorld(id).catch((e) => log("push world", e.message)); await ctx.dk(["exec", "bh-" + id, "rcon-cli", "save-on"]).catch(() => {}); } }
      } else {
        const p = await store.get("primary.json"), alive = !!p && age(p) < ALIVE;
        await beat();
        if (mode === "standby") {
          if (alive) { missed = 0; return; }
          if (++missed >= 2 && env.FAILOVER_AUTO !== "0") await takeover();
        } else if (mode === "active") {
          const rc = await store.get("reclaim.json");
          if (alive) { if (++seen >= 2) { seen = 0; await handback("primary is back"); } } else seen = 0;
          if (rc && age(rc) < ALIVE) await handback("primary asked for it back");
          else if (ctx.getDb().servers) { const h = crypto.createHash("sha1").update(JSON.stringify(ctx.getDb())).digest("hex"); if (h !== lastStateHash) await pushState(ID); }
        }
      }
    } catch (e) { log("tick:", e.message); } finally { busy = false; }
  }
  return {
    enabled: true,
    standby: () => mode === "booting" || mode === "standby" || mode === "handing-back",
    state: () => ({ enabled: true, role, mode }),
    handback: () => handback("device shutting down"),
    start() { findGeo(); if (role === "primary") primaryBoot().catch((e) => { log("boot:", e.message); mode = "primary"; }); setInterval(tick, TICK); tick(); },
    _tick: tick, _mode: () => mode,
  };
};
module.exports._githubStore = githubStore; module.exports._fsStore = fsStore;
