"use strict";
/* Butter web UI core: helpers, API, router, dialogs, shared components. Vanilla JS, no dependencies. */
const B = window.B = { S: null, CFG: null, HI: null, ACT: {}, pages: {}, cur: { p: "overview", n: "", t: "overview" }, VL: null };
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n, c) => `<svg class="ic${c ? " " + c : ""}" aria-hidden="true" focusable="false"><use href="#i-${n}"/></svg>`;
const gb = (m) => m >= 1024 ? (m / 1024).toFixed(1) + " GB" : Math.round(m) + " MB";
const fsize = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B";
const fmtUp = (s) => { s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return "up " + (d ? d + "d " : "") + (h ? h + "h " : "") + m + "m"; };
const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : new Date(t * 1000).toLocaleDateString(); };
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,23}$/, WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function api(q, body) {
  try {
    const o = { cache: "no-store" };
    if (body !== undefined) { o.method = "POST"; if (typeof Blob !== "undefined" && body instanceof Blob) o.body = body; else { o.body = JSON.stringify(body); o.headers = { "Content-Type": "application/json" }; } }
    const r = await fetch("/cgi-bin/api?" + q, o); return await r.json();
  } catch (e) { return { ok: false, error: "cannot reach the machine" }; }
}
const enc = encodeURIComponent;

/* ---------- toasts and dialogs ---------- */
function toast(msg, bad) {
  const t = document.createElement("div"); t.className = "toast" + (bad ? " bad" : ""); t.innerHTML = ic(bad ? "warn" : "check") + "<span></span>"; t.lastChild.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), bad ? 7000 : 3500);
}
function ask(o) {
  return new Promise((res) => {
    const d = document.createElement("dialog"); d.className = "dlg"; d.setAttribute("aria-label", o.title);
    d.innerHTML = `<form method="dialog"><h3>${ic(o.icon || (o.danger ? "meteor" : "info"))} ${esc(o.title)}</h3><div class="dbody">${o.body || ""}</div>` +
      (o.typed ? `<label class="fld">Type <b>${esc(o.typed)}</b> to confirm<input id="dtyped" autocomplete="off" autocapitalize="off" spellcheck="false"></label>` : "") +
      (o.input != null ? `<label class="fld">${esc(o.label || "")}<input id="dinp" value="${esc(o.input)}" autocomplete="off" autocapitalize="off" spellcheck="false" ${o.pattern ? `pattern="${o.pattern}"` : ""} ${o.max ? `maxlength="${o.max}"` : ""}></label>` : "") +
      `<div class="row end"><button class="btn ${o.danger ? "d" : "p"}" value="ok" id="dok" ${o.typed ? "disabled" : ""}>${esc(o.ok || "OK")}</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div></form>`;
    document.body.appendChild(d);
    const t = $("#dtyped", d); if (t) t.oninput = () => { $("#dok", d).disabled = t.value !== o.typed; };
    d.onclose = () => { const v = d.returnValue === "ok" ? ($("#dinp", d) ? $("#dinp", d).value.trim() : true) : false; d.remove(); res(v); };
    d.showModal(); const f = $("#dtyped", d) || $("#dinp", d); if (f) f.focus();
  });
}
async function copy(txt) {
  try { await navigator.clipboard.writeText(txt); } catch (e) { const t = document.createElement("textarea"); t.value = txt; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (x) {} t.remove(); }
  toast("Copied");
}

/* ---------- small components ---------- */
const sw = (o) => `<label class="sw"><input type="checkbox" role="switch" ${o.attrs || ""} ${o.on ? "checked" : ""} ${o.dis ? "disabled" : ""}><span class="tr" aria-hidden="true"></span><span class="tx">${o.label}${o.hint ? `<small>${o.hint}</small>` : ""}</span></label>`;
const stBadge = (st) => { const on = st === "running", busy = st === "restarting" || st === "created" || st === "paused"; return `<span class="st ${on ? "" : busy ? "busy" : "off"}">${esc(st === "exited" ? "stopped" : st)}</span>`; };
function ring(pct, txt, label, col) {
  pct = clamp(Math.round(pct || 0), 0, 100);
  return `<div class="ring" role="img" aria-label="${esc(label)} ${esc(txt)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rt" cx="18" cy="18" r="15.9" pathLength="100"/><circle class="rv" cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray="${pct} 100" style="stroke:${col || "var(--y)"}"/></svg><b>${esc(txt)}</b></div>`;
}
const fitBar = (need, avail, keep) => {
  const pct = avail > 0 ? clamp(need / avail * 100, 0, 100) : 100, okk = avail - need >= keep, warn = !okk && avail - need >= 0;
  return `<div class="fit"><div class="bar" aria-hidden="true"><i style="width:${pct}%;background:${okk ? "var(--ok)" : warn ? "var(--warn)" : "var(--bad)"}"></i></div><div class="k fitx">${okk ? "Fits: about " + gb(need) + " of " + gb(avail) + " free." : warn ? "Tight: about " + gb(need) + " of " + gb(avail) + " free. The machine may become slow." : "Does not fit: needs about " + gb(need) + " but only " + gb(avail) + " is free."}</div></div>`;
};
const keepFree = () => B.S && B.S.app ? 1024 : 300;
const javaNeed = (mem) => Math.min(1536, mem + 400);

/* ---------- address helpers ---------- */
function addrList(s) {
  const ip = (B.S && B.S.ip) || "", a = [];
  if (!s) return a;
  if (s.type === "bedrock") { if (s.port) a.push({ l: "Bedrock (UDP)", v: ip + ":" + s.port, sub: "Add server " + ip + ", port " + s.port }); return a; }
  if (s.port) a.push({ l: "Java, this network", v: ip + ":" + s.port });
  if (s.bedrock_port) a.push({ l: "Phones & consoles (Bedrock)", v: ip + ":" + s.bedrock_port, sub: "Add server " + ip + " port " + s.bedrock_port });
  if (s.join) a.push({ l: "Java, internet link", v: s.join });
  return a;
}
const addrHtml = (s) => { const a = addrList(s); if (!a.length) return `<p class="k">No address yet.</p>`;
  return `<ul class="addrs">${a.map((x) => `<li><span class="k">${esc(x.l)}</span><code>${esc(x.v)}</code><button class="btn sm" type="button" data-do="copy" data-v="${esc(x.v)}" aria-label="Copy ${esc(x.l)} address">${ic("copy")}Copy</button></li>`).join("")}</ul>` +
    (s.type === "java" && s.bedrock_port ? `<p class="k">Phones &amp; consoles (Bedrock): add server <b>${esc(B.S.ip)}</b> port <b>${s.bedrock_port}</b></p>` : ""); };
const wrapMem = () => B.S ? B.S.mem : { total: 1, avail: 0, os: 0, servers: 0, worlds: 0 };

/* ---------- theme and cursors ---------- */
B.THEMES = [["butter", "Dark butter", "Warm indigo and butter yellow"], ["daylight", "Daylight", "Light and calm"], ["swamp", "Swamp", "Deep green, fern accents"]];
B.theme = () => document.documentElement.dataset.theme || "butter";
B.setTheme = (t, save) => {
  if (!B.THEMES.some((x) => x[0] === t)) t = "butter";
  document.documentElement.dataset.theme = t; try { localStorage.setItem("bt-theme", t); } catch (e) {}
  const n = (B.THEMES.find((x) => x[0] === t) || [])[1]; if ($("#themename")) $("#themename").textContent = n;
  if (save) api("a=setconfig", { theme: t });
};
B.setDino = (on) => { document.documentElement.classList.toggle("dino", on); try { localStorage.setItem("bt-dino", on ? "1" : "0"); } catch (e) {} };

/* ---------- router ---------- */
function parseHash() { const h = (location.hash || "#overview").slice(1).split("/"); return { p: h[0] || "overview", n: h[1] || "", t: h[2] || "overview" }; }
B.setView = (html, force) => { const v = $("#view"); if (force || v.dataset.h !== html) { v.innerHTML = html; v.dataset.h = html; return true; } return false; };
B.typing = () => { const f = document.activeElement; return !!(f && $("#view").contains(f) && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)); };
const TITLES = { overview: "Overview", servers: "Servers", local: "Local", backup: "Backup", network: "Network", system: "System", settings: "Settings", server: "Server" };
B.go = async () => {
  const c = B.cur = parseHash(); const wiz = c.p === "setup";
  document.body.classList.toggle("wiz", wiz); $("#wizard").hidden = !wiz;
  if (wiz) { B.wizard.show(); return; }
  B.wizard && B.wizard.hide();
  const pg = B.pages[c.p] ? c.p : "overview";
  $$("#nav a").forEach((a) => { const on = a.dataset.p === (pg === "server" ? "servers" : pg); a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#title").textContent = pg === "server" ? c.n : TITLES[pg];
  document.title = (pg === "server" ? c.n : TITLES[pg]) + " - Butter Os";
  $("#view").dataset.h = ""; B.cur.page = pg;
  if (B.S) await B.pages[pg].show();
};
B.chrome = () => {
  const S = B.S; if (!S) return;
  $("#host").textContent = (S.machine_name || "butter-box") + " · " + (S.ip || "no network"); $("#up").textContent = fmtUp(S.uptime); $("#rss").textContent = S.web_rss_mb + " MB";
  $("#me").hidden = !!S.app; if (S.limit_web_mb) $("#lim").textContent = "of RAM (limit " + S.limit_web_mb + " MB)";
};
async function tick() {
  const r = await api("a=status"); if (!r.ok) return; B.S = r;
  if (r.setup_done === false && !B.wizardSeen) { B.wizardSeen = true; if (B.cur.p !== "setup") { location.hash = "#setup"; return; } }
  B.chrome(); if (B.cur.p === "setup") return;
  const f = document.activeElement; if (f && f.dataset && f.dataset.keep) return;
  const pg = B.pages[B.cur.page]; if (pg && pg.live) pg.live();
}
B.tick = tick;
B.loadCfg = async () => { const r = await api("a=config"); if (r.ok) B.CFG = r.config; return B.CFG; };
B.loadHI = async () => { const r = await api("a=hostinfo"); if (r.ok) B.HI = r; return B.HI; };
B.loadVL = async () => { if (!B.VL) { const v = await api("a=versions"); if (v.ok) B.VL = v; } return B.VL; };

/* ---------- global events ---------- */
async function busy(el, fn) {
  if (el.disabled || el.getAttribute("aria-busy") === "true") return; el.setAttribute("aria-busy", "true"); el.disabled = true; el.classList.add("busy");
  try { return await fn(); } finally { el.removeAttribute("aria-busy"); el.disabled = false; el.classList.remove("busy"); }
}
B.busy = busy;
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-do]");
  if (t) { const f = B.ACT[t.dataset.do]; if (f) { e.preventDefault(); await busy(t, () => f(t, e)); } return; }
  const id = e.target.closest("#theme");
  if (id) { const i = B.THEMES.findIndex((x) => x[0] === B.theme()); B.setTheme(B.THEMES[(i + 1) % B.THEMES.length][0], true); return; }
  if (e.target.closest("#add")) { B.newDialog(); return; }
});
document.addEventListener("input", (e) => {
  const t = e.target; if (t.dataset && t.dataset.out) { const o = document.getElementById(t.dataset.out); if (o) o.textContent = t.dataset.fmt === "gb" ? gb(+t.value) : t.dataset.fmt === "cpu" ? (+t.value ? (+t.value).toFixed(1) + " cores" : "unlimited") : t.value; }
});
B.ACT.copy = (t) => copy(t.dataset.v);
B.ACT.copyid = (t) => { const el = document.getElementById(t.dataset.id); return copy(el ? (el.value != null && el.value !== "" ? el.value : el.textContent) : ""); };

B.start = async () => {
  B.setTheme(B.theme());
  window.addEventListener("hashchange", () => B.go());
  await B.loadCfg(); if (B.CFG && B.CFG.theme && !(() => { try { return localStorage.getItem("bt-theme"); } catch (e) { return 1; } })()) B.setTheme(B.CFG.theme);
  await tick(); await B.go(); setInterval(tick, 4000);
};
