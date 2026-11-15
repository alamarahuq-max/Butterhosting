const http = require("http");
process.env.REGISTRY_REPO = "o/r"; process.env.REGISTRY_READ_TOKEN = "x"; process.env.PRIMARY_URL = "http://127.0.0.1:9101";
let now = Date.now(), reg = { primary: now, device: { active: true, url: "http://127.0.0.1:9102", ts: now } };
const realFetch = global.fetch;
global.fetch = async (u, o) => {
  u = String(u);
  if (u.startsWith("https://api.github.com")) {
    if (u.includes("/contents/_butter?")) return new Response(JSON.stringify(reg.device ? [{ name: "device-a.json" }] : []));
    if (u.includes("primary.json")) return new Response(JSON.stringify({ ts: reg.primary }));
    if (u.includes("device-a.json")) return new Response(JSON.stringify(reg.device));
  }
  return realFetch(u, o);
};
const mk = (name, port) => http.createServer((q, r) => { r.setHeader("Content-Type", "application/json"); r.end(JSON.stringify({ from: name, path: q.url, auth: q.headers.authorization || null })); }).listen(port);
const relay = require("../api/relay.js"); let ok = 0, bad = 0; const t = (n, c, d) => { c ? ok++ : bad++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : " " + d)); };
const call = (path, method = "GET", extra = {}) => new Promise((resolve) => {
  const chunks = []; const req = require("stream").Readable.from(extra.body ? [Buffer.from(extra.body)] : []); req.method = method; req.url = "/api/relay?p=" + path; req.headers = { authorization: "Bearer tok", ...(extra.headers || {}) };
  const res = { h: {}, code: 200, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.send(Buffer.from(JSON.stringify(o))); }, send(b) { resolve({ code: this.code, body: String(b), h: this.h }); } };
  relay(req, res);
});
(async () => {
  const A = mk("primary", 9101), B = mk("device", 9102);
  let r = await call("servers"); t("primary alive -> goes to primary, token forwarded", JSON.parse(r.body).from === "primary" && JSON.parse(r.body).auth === "Bearer tok", r.body);
  reg.primary = now - 400000; await new Promise((x) => setTimeout(x, 8100)); // cache expiry
  r = await call("servers"); t("primary silent -> goes to the device", JSON.parse(r.body).from === "device", r.body);
  t("response never contains the device address", !r.body.includes("9102") && !JSON.stringify(r.h).includes("9102"));
  r = await call("__status"); t("status endpoint says backup without any address", JSON.parse(r.body).mode === "backup" && !r.body.includes("127.0.0.1"), r.body);
  r = await call("auth/discord"); t("sign-in is blocked in backup mode", r.code === 503, r.body);
  r = await call("servers", "POST", { body: Buffer.alloc(4.5 * 1024 * 1024).toString(), headers: { "content-type": "application/json" } }); t("oversize body rejected in backup mode", r.code === 413, r.code);
  reg.device = null; await new Promise((x) => setTimeout(x, 8100));
  r = await call("servers"); t("primary silent and no device -> falls back to primary url", JSON.parse(r.body).from === "primary", r.body);
  A.close(); B.close(); console.log(ok + " passed, " + bad + " failed"); process.exit(bad ? 1 : 0);
})();
