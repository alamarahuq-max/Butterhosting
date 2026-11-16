// Vercel function: forwards /relay/* to whichever machine is currently running ButterHosting.
// The browser only ever talks to this site, so the address of a home machine is never sent to it.
// Env (Vercel project settings): REGISTRY_REPO ("owner/repo"), REGISTRY_READ_TOKEN (fine-grained, contents: read), PRIMARY_URL (your Codespace API URL)
const ALIVE_MS = 150000;
// nearest machine to the visitor (great-circle distance between coarse locations); machines with no location are only used if none has one
const dist = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
function nearest(nodes, me) { if (!nodes.length) return null; if (!me) return nodes[0]; return nodes.slice().sort((p, q) => (p.geo ? dist(p.geo, me) : 1e9) - (q.geo ? dist(q.geo, me) : 1e9))[0]; }
let cache = { at: 0, v: null };
const gh = (p) => fetch("https://api.github.com/repos/" + process.env.REGISTRY_REPO + p, { headers: { Authorization: "Bearer " + process.env.REGISTRY_READ_TOKEN, Accept: "application/vnd.github.raw+json", "User-Agent": "butterhosting-relay" } });
async function registry() {
  if (Date.now() - cache.at < 8000 && cache.v) return cache.v;
  const v = { primaryAlive: false, device: null, devices: [] };
  try {
    const p = await gh("/contents/_butter/primary.json?ref=registry");
    if (p.ok) v.primaryAlive = Date.now() - JSON.parse(await p.text()).ts < ALIVE_MS;
    const l = await fetch("https://api.github.com/repos/" + process.env.REGISTRY_REPO + "/contents/_butter?ref=registry", { headers: { Authorization: "Bearer " + process.env.REGISTRY_READ_TOKEN, "User-Agent": "butterhosting-relay" } });
    if (l.ok) for (const f of (await l.json()).filter((x) => x.name.startsWith("device-"))) {
      const d = await gh("/contents/_butter/" + f.name + "?ref=registry"); if (!d.ok) continue;
      const j = JSON.parse(await d.text());
      if (j.active && j.url && Date.now() - j.ts < ALIVE_MS) v.devices.push({ url: j.url.replace(/\/$/, ""), geo: j.geo || null });
    }
  } catch (e) { /* registry unreachable: fall back to PRIMARY_URL below */ }
  cache = { at: Date.now(), v }; return v;
}
async function raw(req) { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); }
module.exports = async (req, res) => {
  const u = new URL(req.url, "http://x"); const sub = "/" + (u.searchParams.get("p") || ""); u.searchParams.delete("p");
  const reg = process.env.REGISTRY_REPO && process.env.REGISTRY_READ_TOKEN ? await registry() : { primaryAlive: true, devices: [] };
  const lat = parseFloat(req.headers["x-vercel-ip-latitude"]), lon = parseFloat(req.headers["x-vercel-ip-longitude"]); const me = isFinite(lat) && isFinite(lon) ? { lat, lon } : null;
  reg.device = (nearest(reg.devices || [], me) || {}).url || null;
  const primary = (process.env.PRIMARY_URL || "").replace(/\/$/, "");
  const target = reg.primaryAlive && primary ? primary : (reg.device || primary || null);
  const mode = target === reg.device && reg.device ? "backup" : "primary";
  res.setHeader("Cache-Control", "no-store");
  if (sub === "/__status") return res.status(200).json({ mode: target ? mode : "down" }); // never includes an address
  if (!target) return res.status(503).json({ error: "The servers are offline right now" });
  if (mode === "backup" && sub.startsWith("/auth")) return res.status(503).json({ error: "Sign-in is unavailable while the backup machine is running" });
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await raw(req);
  if (body && body.length > 4.4 * 1024 * 1024) return res.status(413).json({ error: "Too large for backup mode (4 MB limit)" });
  try {
    const r = await fetch(target + sub + (u.search || ""), { method: req.method, body, redirect: "manual", signal: AbortSignal.timeout(25000),
      headers: { ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}), ...(req.headers["content-type"] ? { "Content-Type": req.headers["content-type"] } : {}) } });
    res.status(r.status); const ct = r.headers.get("content-type"); if (ct) res.setHeader("Content-Type", ct);
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: "The machine did not answer" }); }
};
module.exports.nearest = nearest;
module.exports.config = { api: { bodyParser: false } };
