// ButterHosting backend starter (Node 18+, zero dependencies).
// Run on your cloud server:  PORT=8080 ALLOW_ORIGIN=https://your-site.vercel.app node server.js
// Servers live in memory for now. Swap the STORE for a database and the start/stop hooks for real provisioning.
const http = require("http");
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.ALLOW_ORIGIN || "*";
let STORE = [{ id: 1, name: "survival-smp", tpl: "Minecraft", region: "Mumbai", status: "on", cpu: 40, ram: 55, players: 8 }];
const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(body));
};
http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "health") return send(res, 200, { ok: true });
  if (parts[0] !== "servers") return send(res, 404, { error: "not found" });
  if (req.method === "GET" && parts.length === 1) return send(res, 200, { servers: STORE });
  if (req.method === "POST" && parts.length === 1) {
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      try {
        const b = JSON.parse(raw || "{}");
        const name = String(b.name || "").slice(0, 24).replace(/[^\w-]/g, "-");
        if (!name) return send(res, 400, { error: "name required" });
        const s = { id: Date.now(), name, tpl: String(b.tpl || "Node.js"), region: String(b.region || "Mumbai"), status: "on", cpu: 5, ram: 10, players: 0 };
        STORE.push(s); send(res, 201, s); // TODO: provision a real container/VM here
      } catch { send(res, 400, { error: "bad json" }); }
    }); return;
  }
  const s = STORE.find((x) => x.id === Number(parts[1]));
  if (!s) return send(res, 404, { error: "no such server" });
  if (req.method === "POST") {
    const a = parts[2];
    if (a === "start" || a === "restart") s.status = "on";
    else if (a === "stop") { s.status = "off"; s.cpu = s.ram = s.players = 0; }
    else if (a === "delete") STORE = STORE.filter((x) => x !== s);
    else return send(res, 404, { error: "unknown action" });
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: "method not allowed" });
}).listen(PORT, () => console.log("ButterHosting API on :" + PORT));
