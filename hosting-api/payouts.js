// PROOF OF CONCEPT: pay machine owners (hosters) for the hours they hosted. No money moves here.
// 1. The main server watches each backup machine's heartbeat and adds "server-seconds" to that machine's ledger,
//    but only for time the machine said it was running servers, and never more than MAXGAP seconds per heartbeat
//    (so a machine that goes offline earns nothing for the gap).
// 2. Once a day, settle() splits the day's pool (in USD, e.g. a share of ad revenue) between machines by server-seconds.
//    Amounts are whole micro-dollars (USDC has 6 decimals), so the payouts add up to exactly what was paid out; dust and anything
//    under the minimum is carried to the next day.
// 3. settle() writes payout-<day>.json with status "pending". Sending the crypto is a separate step (see send()), which is NOT implemented:
//    it needs a treasury wallet key, and that must not live in this repo.
const WALLET = /^0x[0-9a-fA-F]{40}$/;           // EVM address (USDC on Base/Polygon etc.)
const MAXGAP = 300, MAX_SERVERS = 6;            // seconds credited per heartbeat at most; servers counted per machine at most
const day = (t) => new Date(t).toISOString().slice(0, 10);

module.exports = function ledger(store, now = () => Date.now()) {
  const key = (id) => "ledger-" + String(id).replace(/[^A-Za-z0-9-]/g, "") + ".json";
  async function load(id) { const s = await store.get(key(id)); return s ? JSON.parse(s) : { id, wallet: null, last: null, secs: {}, carry: 0, paid: 0 }; }
  return {
    // heartbeat = the machine's device-<id>.json: { id, ts, active, servers, wallet }
    async observe(hb) {
      const L = await load(hb.id), t = now();
      if (hb.wallet && WALLET.test(hb.wallet)) L.wallet = hb.wallet;
      if (L.last != null && hb.active && hb.servers > 0) {
        const dt = Math.max(0, Math.min((t - L.last) / 1000, MAXGAP)), d = day(t);
        L.secs[d] = (L.secs[d] || 0) + dt * Math.min(hb.servers, MAX_SERVERS);
      }
      L.last = t; await store.put(key(hb.id), JSON.stringify(L)); return L;
    },
    // split poolUsd for one day. minUsd: smaller balances wait (carry) until they reach it.
    async settle(d, poolUsd, { minUsd = 1 } = {}) {
      const micro = Math.floor(poolUsd * 1e6), files = (await store.list("ledger-")), L = [];
      for (const f of files) L.push(JSON.parse(await store.get(f)));
      const total = L.reduce((a, x) => a + (x.secs[d] || 0), 0), out = [];
      if (total <= 0) return { day: d, pool: micro, total_server_hours: 0, payouts: [], note: "nobody hosted, nothing paid" };
      let given = 0;
      for (const x of L) {
        const share = Math.floor(micro * (x.secs[d] || 0) / total); given += share;
        x.carry = (x.carry || 0) + share;
        const ok = x.wallet && x.carry >= Math.round(minUsd * 1e6);
        out.push({ id: x.id, wallet: x.wallet, server_hours: +((x.secs[d] || 0) / 3600).toFixed(3), earned_usd: share / 1e6, pay_usd: ok ? x.carry / 1e6 : 0, held_usd: ok ? 0 : x.carry / 1e6, held_reason: ok ? null : (x.wallet ? "below minimum" : "no wallet set") });
        if (ok) { x.paid += x.carry; x.carry = 0; }
      }
      for (const x of L) await store.put(key(x.id), JSON.stringify(x));
      const res = { day: d, pool_usd: micro / 1e6, unassigned_dust_usd: (micro - given) / 1e6, total_server_hours: +(total / 3600).toFixed(3), payouts: out, status: "pending" };
      await store.put("payout-" + d + ".json", JSON.stringify(res)); return res;
    },
    WALLET,
  };
};
