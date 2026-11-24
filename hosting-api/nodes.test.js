const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path");
const f = require("./failover"); let t = 1e12;
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nodes-")), N = require("./nodes")(f._fsStore(dir), () => t);
  const id = "0123456789abcdef", w = "0x" + "a".repeat(40);
  let r = await N.enroll({ id, ram_share_mb: 4096, max_servers: 3, wallet: w }); assert(r.ok && r.secret);
  assert.equal((await N.enroll({ id })).code, 409);
  assert.equal((await N.heartbeat({ id, secret: "x" })).code, 403);
  const secret = r.secret;
  r = await N.heartbeat({ id, secret, active: true, servers: 0, free_mb: 6000 }); assert(r.ok); assert.deepEqual(r.work, []);
  const placed = await N.place({ name: "cust-1", owner: "u1", flavor: "paper", version: "LATEST", mem: 1024 }); assert.equal(placed, id);
  t += 60000; r = await N.heartbeat({ id, secret, active: true, servers: 1, free_mb: 4000 }); assert.equal(r.work.length, 1); assert.equal(r.work[0].name, "cust-1");
  assert.equal((await N.heartbeat({ id, secret, active: true })).code, 429);
  t += 60000; r = await N.heartbeat({ id, secret, active: true, servers: 1 }); assert(r.today_server_hours > 0);
  await N.unplace("cust-1"); t += 60000; r = await N.heartbeat({ id, secret, active: true, servers: 0 }); assert.equal(r.work.length, 0);
  console.log("nodes ok");
})().catch((e) => { console.error(e); process.exit(1); });
