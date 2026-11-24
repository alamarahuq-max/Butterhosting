"use strict";
// Shared helpers: paths, config file, running commands. No dependencies.
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");

const IS_OS = process.env.BUTTER_OS === "1" || fs.existsSync("/ram/butter") || fs.existsSync("/etc/alpine-release") && fs.existsSync("/ram");
const PLATFORM = IS_OS ? "linux-os" : process.platform;
const HOME = process.env.BUTTER_HOME || (IS_OS ? "/ram/butter" : path.join(os.homedir(), ".butter"));
const WORLDS = process.env.WORLD_DIR || (IS_OS ? "/ram/butter/worlds" : path.join(HOME, "worlds"));
const DATA = process.env.DATA_DIR || (IS_OS ? "/ram/butter/data" : path.join(HOME, "data"));
const BACKUPS = process.env.BACKUP_DIR_SERVERS || path.join(DATA, "backups");
const WEBROOT = process.env.BUTTER_WEB || path.join(__dirname, "..", "..", "os", "web");
for (const d of [WORLDS, DATA, BACKUPS]) { try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} }

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const clean = (s) => String(s == null ? "" : s).replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
const ok = (x) => Object.assign({ ok: true }, x || {});
class Fail extends Error {}
const fail = (m) => { throw new Fail(m); };

// run a command, never throws: {code, out, err}
function run(cmd, args, o = {}) {
  return new Promise((res) => {
    let done = false;
    const p = cp.spawn(cmd, args, { windowsHide: true, ...o.spawn });
    let out = "", err = "";
    const t = o.timeout ? setTimeout(() => { if (!done) { try { p.kill("SIGKILL"); } catch (e) {} } }, o.timeout) : null;
    p.stdout && p.stdout.on("data", (d) => { if (out.length < 8e6) out += d; });
    p.stderr && p.stderr.on("data", (d) => { if (err.length < 8e6) err += d; });
    p.on("error", (e) => { done = true; t && clearTimeout(t); res({ code: -1, out, err: err || String(e.message) }); });
    p.on("close", (c) => { done = true; t && clearTimeout(t); res({ code: c, out, err }); });
    if (o.input != null) { p.stdin.on("error", () => {}); p.stdin.end(o.input); }
  });
}

// ---- global config (config.json in DATA) ----
const CFG_FILE = path.join(DATA, "config.json");
const DEFAULTS = {
  setup_done: false, machine_name: os.hostname().slice(0, 24) || "butter", default_flavor: "paper", default_mem: 1536,
  share_default: "internet", theme: "butter",
  commercial: { enabled: false, ram_share_mb: 2048, max_servers: 2, wallet: "", node_id: "", secret: "", api: "", state: "off", last_heartbeat: 0, earned_usd: 0, pending_usd: 0, hosted: [], error: "" },
};
let cfg = null;
function loadCfg() {
  if (cfg) return cfg;
  let j = {}; try { j = JSON.parse(fs.readFileSync(CFG_FILE, "utf8")); } catch (e) {}
  cfg = { ...DEFAULTS, ...j, commercial: { ...DEFAULTS.commercial, ...(j.commercial || {}) } };
  return cfg;
}
function saveCfg() { try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(CFG_FILE + ".tmp", JSON.stringify(cfg, null, 1), { mode: 0o600 }); fs.renameSync(CFG_FILE + ".tmp", CFG_FILE); } catch (e) {} }
function publicCfg() { const c = JSON.parse(JSON.stringify(loadCfg())); delete c.commercial.secret; return c; }
const SETTABLE = { machine_name: (v) => String(v).replace(/[^\w .-]/g, "").slice(0, 24), default_flavor: (v) => ["paper", "vanilla", "fabric", "forge"].includes(v) ? v : "paper",
  default_mem: (v) => Math.max(512, Math.min(16384, parseInt(v, 10) || 1536)), share_default: (v) => v === "none" ? "none" : "internet", theme: (v) => String(v).slice(0, 20), setup_done: (v) => !!v };
function setCfg(b) {
  loadCfg();
  for (const k of Object.keys(SETTABLE)) if (b && k in b) cfg[k] = SETTABLE[k](b[k]);
  saveCfg(); return publicCfg();
}

module.exports = { IS_OS, PLATFORM, HOME, WORLDS, DATA, BACKUPS, WEBROOT, NAME_RE, WALLET_RE, clean, ok, Fail, fail, run, loadCfg, saveCfg, publicCfg, setCfg, fs, path, os, cp };
