"use strict";
/* Paid-host network. Anyone can turn on "Host commercially" in ButterOS or the Butter app. The machine enrolls here, sends a heartbeat every minute,
   and is credited server-seconds in the payouts ledger (see payouts.js; no money moves in this proof of concept).
   Work: the site (or an admin) assigns customer servers to a node with assign(); the node fetches them in its heartbeat reply and runs them.
   A node's secret is shown to it once and only a hash is stored. */
const crypto = require("crypto");
const ledgerOf = require("./payouts");
const ID = /^[a-f0-9]{16}$/, WALLET = /^0x[0-9a-fA-F]{40}$/;
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

module.exports = function nodes(store, now = () => Date.now()) {
  const ledger = ledgerOf(store, now), key = (id) => "node-" + id + ".json", wkey = (id) => "work-" + id + ".json";
  const rl = new Map(); // tiny per-id rate limit: at most one heartbeat per 10 s
  async function load(id) { const s = await store.get(key(id)); return s ? JSON.parse(s) : null; }
  const n = (v, lo, hi, d) => { const x = parseInt(v, 10); return isNaN(x) ? d : Math.max(lo, Math.min(hi, x)); };
  return {
    async enroll(b) {
      if (!ID.test(b.id || "")) return { code: 400, error: "bad id" };
      if (await load(b.id)) return { code: 409, error: "already enrolled (use your saved secret)" };
      const secret = crypto.randomBytes(24).toString("hex");
      const rec = { id: b.id, hash: sha(secret), created: now(), platform: String(b.platform || "").slice(0, 20), version: String(b.version || "").slice(0, 20), ram_share_mb: n(b.ram_share_mb, 512, 262144, 2048), max_servers: n(b.max_servers, 1, 50, 2), wallet: WALLET.test(b.wallet || "") ? b.wallet : null, last: 0, active: false, servers: 0 };
      await store.put(key(b.id), JSON.stringify(rec)); return { code: 200, ok: true, secret };
    },
    async heartbeat(b) {
      if (!ID.test(b.id || "")) return { code: 400, error: "bad id" };
      const rec = await load(b.id); if (!rec || sha(b.secret || "") !== rec.hash) return { code: 403, error: "unknown node or wrong secret" };
      const t = now(); if (rl.get(b.id) && t - rl.get(b.id) < 10000) return { code: 429, error: "slow down" }; rl.set(b.id, t);
      rec.last = t; rec.active = !!b.active; rec.servers = n(b.servers, 0, 50, 0); rec.free_mb = n(b.free_mb, 0, 1e7, 0);
      rec.ram_share_mb = n(b.ram_share_mb, 512, 262144, rec.ram_share_mb); rec.max_servers = n(b.max_servers, 1, 50, rec.max_servers);
      if (b.wallet !== undefined) rec.wallet = WALLET.test(b.wallet || "") ? b.wallet : null;
      await store.put(key(b.id), JSON.stringify(rec));
      const L = await ledger.observe({ id: rec.id, ts: t, active: rec.active, servers: rec.servers, wallet: rec.wallet });
      const work = JSON.parse((await store.get(wkey(b.id))) || "[]");
      const today = new Date(t).toISOString().slice(0, 10), pend = (L.carry || 0) / 1e6;
      return { code: 200, ok: true, work, earned_usd: (L.paid || 0) / 1e6, pending_usd: pend, today_server_hours: +(((L.secs || {})[today] || 0) / 3600).toFixed(3) };
    },
    async online() { const out = []; for (const f of await store.list("node-")) { const r = JSON.parse(await store.get(f)); if (now() - r.last < 180000) out.push(r); } return out; },
    // give a customer server to the least loaded online node that has room (ram in MB). Returns the node id or null.
    async place(srv) {
      const c = (await this.online()).filter((r) => r.active !== undefined && r.servers < r.max_servers && (r.free_mb || 0) >= srv.mem + 512 && r.ram_share_mb >= srv.mem);
      c.sort((a, z) => a.servers - z.servers); const t = c[0]; if (!t) return null;
      const w = JSON.parse((await store.get(wkey(t.id))) || "[]"); if (!w.find((x) => x.name === srv.name)) w.push({ name: srv.name, owner: srv.owner, flavor: srv.flavor, version: srv.version, mem: srv.mem });
      await store.put(wkey(t.id), JSON.stringify(w)); return t.id;
    },
    async unplace(name) { for (const f of await store.list("work-")) { const w = JSON.parse(await store.get(f)).filter((x) => x.name !== name); await store.put(f, JSON.stringify(w)); } },
    ledger,
  };
};
