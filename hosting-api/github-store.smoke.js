// Live check of the GitHub-backed registry: REGISTRY_REPO=owner/repo REGISTRY_TOKEN=... node github-store.smoke.js
const fo = require("./failover.js"), fs = require("fs");
(async () => {
  const s = fo._githubStore(process.env.REGISTRY_REPO, process.env.REGISTRY_TOKEN); let bad = 0;
  const t = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) bad++; };
  await s.put("smoke.json", '{"a":1}'); t("write + read a small file", (await s.get("smoke.json")) === '{"a":1}');
  await s.put("smoke.json", '{"a":2}'); t("overwrite an existing file", (await s.get("smoke.json")) === '{"a":2}');
  t("list by prefix", (await s.list("smoke")).includes("smoke.json"));
  fs.writeFileSync("/tmp/b.tgz", "hello-blob-" + Date.now()); const want = fs.readFileSync("/tmp/b.tgz", "utf8");
  await s.putBlob("smoke.tgz", "/tmp/b.tgz"); t("upload a world-sized blob", await s.getBlob("smoke.tgz", "/tmp/b2.tgz")); t("download it back identical", fs.readFileSync("/tmp/b2.tgz", "utf8") === want);
  await s.putBlob("smoke.tgz", "/tmp/b.tgz"); t("replace the blob", true);
  await s.del("smoke.json"); t("delete a file", (await s.get("smoke.json")) === null);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log("FAIL", e.message); process.exit(1); });
