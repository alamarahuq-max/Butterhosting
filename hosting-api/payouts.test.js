const fs = require("fs"), os = require("os"), path = require("path");
const { _fsStore } = require("./failover"); const ledger = require("./payouts");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pay-")); fs.mkdirSync(path.join(dir, "blobs"));
const store = _fsStore(dir); let T = Date.UTC(2026, 10, 16, 10, 0, 0); const L = ledger(store, () => T);
let ok = 0, bad = 0; const t = (n, c, d) => { c ? ok++ : bad++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + JSON.stringify(d))); };
const W1 = "0x" + "a".repeat(40), W2 = "0x" + "b".repeat(40), day = "2026-11-16";
(async () => {
  const beat = async (id, o) => { await L.observe({ id, wallet: o.w, active: o.active, servers: o.servers }); };
  // machine A hosts 2 servers for one hour (heartbeats every 60 s); B hosts 1 server for one hour; C is on standby; D has no wallet
  for (let i = 0; i <= 60; i++) { await beat("A", { w: W1, active: true, servers: 2 }); await beat("B", { w: W2, active: true, servers: 1 }); await beat("C", { w: W2, active: false, servers: 3 }); await beat("D", { active: true, servers: 1 }); T += 60000; }
  let r = await L.settle(day, 30, { minUsd: 1 }); const g = (id) => r.payouts.find((p) => p.id === id);
  t("A (2 servers x 1 h) has 2 server-hours", Math.abs(g("A").server_hours - 2) < 0.02, g("A"));
  t("B (1 server x 1 h) has 1 server-hour", Math.abs(g("B").server_hours - 1) < 0.02, g("B"));
  t("standby machine earns nothing", g("C").server_hours === 0 && g("C").pay_usd === 0);
  t("pool is split by server-hours (A about 2x B)", g("A").pay_usd > 1.9 * g("B").pay_usd && g("A").pay_usd < 2.1 * g("B").pay_usd, [g("A").pay_usd, g("B").pay_usd]);
  t("machine with no wallet is held, not paid", g("D").pay_usd === 0 && g("D").held_reason === "no wallet set", g("D"));
  const paid = r.payouts.reduce((a, p) => a + p.pay_usd + p.held_usd, 0);
  t("payouts + held + dust equal the pool exactly", Math.abs(paid + r.unassigned_dust_usd - 30) < 1e-9, [paid, r.unassigned_dust_usd]);
  // offline gap: machine A goes silent for 3 hours then beats once -> only MAXGAP seconds credited
  const before = JSON.parse(await store.get("ledger-A.json")).secs[day]; T += 3 * 3600 * 1000; await beat("A", { w: W1, active: true, servers: 2 });
  const after = JSON.parse(await store.get("ledger-A.json")).secs[day]; t("a 3-hour silence earns at most 5 minutes", after - before <= 300 * 2 + 1e-6, after - before);
  // minimum payout carries over
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "pay-")); fs.mkdirSync(path.join(dir2, "blobs")); const s2 = _fsStore(dir2); let T2 = Date.UTC(2026, 10, 17, 0, 0, 0); const L2 = ledger(s2, () => T2);
  for (let i = 0; i <= 10; i++) { await L2.observe({ id: "Z", wallet: W1, active: true, servers: 1 }); T2 += 60000; }
  let r2 = await L2.settle("2026-11-17", 0.5, { minUsd: 1 }); t("small balance is held below the minimum", r2.payouts[0].pay_usd === 0 && r2.payouts[0].held_reason === "below minimum", r2.payouts[0]);
  for (let i = 0; i <= 10; i++) { await L2.observe({ id: "Z", wallet: W1, active: true, servers: 1 }); T2 += 60000; }
  r2 = await L2.settle("2026-11-17", 0.6, { minUsd: 1 }); t("held balance is paid once it reaches the minimum", r2.payouts[0].pay_usd > 1 && r2.payouts[0].held_usd === 0, r2.payouts[0]);
  t("rejects a malformed wallet", !L.WALLET.test("0x123") && L.WALLET.test(W1));
  r2 = await L2.settle("2030-01-01", 10); t("nobody hosted, nothing paid", r2.payouts.length === 0);
  console.log(ok + " passed, " + bad + " failed"); process.exit(bad ? 1 : 0);
})();
