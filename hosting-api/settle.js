#!/usr/bin/env node
// node settle.js <YYYY-MM-DD> <pool in USD> [--min 1]   (proof of concept: writes payout-<day>.json to the registry, sends nothing)
const f = require("./failover"); const ledger = require("./payouts");
const [d, pool] = process.argv.slice(2); const min = +(process.argv[process.argv.indexOf("--min") + 1] || 1);
if (!/^\d{4}-\d\d-\d\d$/.test(d || "") || !(+pool > 0)) { console.error("usage: node settle.js 2026-11-16 12.50 [--min 1]"); process.exit(1); }
const e = process.env, store = e.REGISTRY_DIR ? f._fsStore(e.REGISTRY_DIR) : f._githubStore(e.REGISTRY_REPO, e.REGISTRY_TOKEN);
ledger(store).settle(d, +pool, { minUsd: min }).then((r) => console.log(JSON.stringify(r, null, 2)), (x) => { console.error(x.message); process.exit(1); });
