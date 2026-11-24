# ButterOS / Butter app local agent API (contract)

One Node agent (`app/agent.js`) serves BOTH the ButterOS machine and the native Butter app. It serves the web UI from `os/web/`
(static) and the API at `GET|POST /cgi-bin/api?a=<action>&...` (same URL the old shell CGI used, so the TUI and old pages keep working).
Every reply is JSON `{ok:true,...}` or `{ok:false,error:"human readable"}`. Query values are URL-encoded. POST bodies are JSON unless noted.
`n` = server name (`^[a-z0-9][a-z0-9-]{1,23}$`).

## Existing actions (unchanged behaviour)
`ping`, `status`, `versions`, `logs&n`, `start|stop|restart&n`, `delete&n`, `players&n`, `kick|op|ban&n&p`, `plugin&n&url`,
`plugins&n`, `rmplugin&n&f`, `cmd&n&c`, `cracked&n&v=0|1`, `upload&n&f` (raw body = .jar), `share&n`, `unshare&n`,
`create&n&type=java|bedrock&mem&ver&flavor=paper|vanilla|fabric|forge&cross=0|1&share=internet|none`.
`status` gains: `platform` ("linux-os" on ButterOS, "linux"|"darwin"|"win32" in the app), `app` (true in the app),
`docker:{installed,running,version}`, `setup_done` (bool), `machine_name`, `commercial:{enabled,state}`; each server also gets
`motd`, `max_players`, `auto_restart`, `mem_limit`.

## Global config
- `a=config` -> `{ok, config:{setup_done, machine_name, default_flavor, default_mem, share_default, theme, commercial:{enabled, ram_share_mb, max_servers, wallet, node_id, api, state, last_heartbeat, earned_usd, hosted}}}`
- `a=setconfig` POST JSON (any subset of the keys above, `commercial` merged key by key) -> `{ok, config}`
- `a=docker` -> `{ok, installed, running, version, platform, install_hint}`
- `a=hostinfo` -> `{ok, cores, mem_total_mb, mem_avail_mb, disk_free_gb, platform, hostname, ip, lan_ip}` (used by the setup wizard to recommend sizes)

## Per-server settings (the "commercial panel")
- `a=srvconf&n` -> `{ok, conf:{...}, props:{...}, props_available:bool}`
  `conf` (stored in `<server dir>/butter.json`): `type, flavor, version, mem (MB), cpus (0 = unlimited), port, bedrock_port, cross (Geyser on/off),
  auto_restart (bool), restart_every_h (0 = off), jvm ("aikar"|"default"|"custom"), jvm_custom (string), java_tag, share (internet|none), cracked,
  backup_every_h (0 = off), backup_keep (int), env: {KEY:VALUE extra env vars for the container}`
  `props` = parsed `server.properties` (strings).
- `a=setsrvconf&n` POST `{conf:{...subset}}` -> applies and recreates the container (data kept) -> `{ok}`
- `a=setprops&n` POST `{props:{key:value,...}, restart:true|false}` -> writes server.properties (server stopped around the edit) -> `{ok}`
  Common keys the UI should offer: motd, max-players, difficulty, gamemode, force-gamemode, hardcore, pvp, view-distance, simulation-distance,
  allow-flight, allow-nether, spawn-protection, spawn-animals, spawn-monsters, spawn-npcs, enable-command-block, level-seed, level-type,
  level-name, online-mode, white-list, enforce-whitelist, enable-rcon (leave on), player-idle-timeout, max-world-size, resource-pack, resource-pack-sha1,
  require-resource-pack, op-permission-level, function-permission-level, entity-broadcast-range-percentage, sync-chunk-writes, network-compression-threshold.
- `a=list&n&l=whitelist|ops|banned-players|banned-ips` -> `{ok, entries:[{name,uuid?,reason?}]}`
- `a=listadd&n&l&p` / `a=listdel&n&l&p` -> `{ok}` (whitelist add/remove, op/deop, ban/pardon through the console)
- `a=setversion&n&ver&flavor` -> backup first, switch version, recreate -> `{ok}`
- `a=rename&n&to` -> `{ok}`
- `a=clone&n&to` -> copy world+config into a new stopped server -> `{ok}`

## Files (sandboxed to the server's data folder)
- `a=ls&n&p=/` -> `{ok, path, entries:[{name,dir,size,mtime}]}`
- `a=cat&n&p` -> `{ok, content, size}` (text, max 512 KB; else error)
- `a=write&n` POST `{p, content}` -> `{ok}`
- `a=mkdir&n&p`, `a=rm&n&p` -> `{ok}`
- `a=put&n&p` raw body = file (any type, max 150 MB; world zip is fine) -> `{ok}`
- `a=get&n&p` -> the file bytes (download)

## Backups
- `a=backups&n` -> `{ok, backups:[{file,size,mtime}]}`
- `a=backup&n` -> `{ok,file}` (tar.gz of the server folder, taken while running with save-off/save-all when Java+rcon is up)
- `a=restore&n&f` -> `{ok}` (stops the server, creates a safety backup, restores)
- `a=delbackup&n&f` -> `{ok}`; `a=dlbackup&n&f` -> bytes

## Commercial (paid host for ButterHosting)
- `a=commercial` -> `{ok, enabled, state:"off"|"registering"|"online"|"offline"|"error", node_id, wallet, ram_share_mb, max_servers, hosted:[{name,owner,state}], earned_usd, pending_usd, last_heartbeat, error}`
- `a=setcommercial` POST `{enabled, ram_share_mb, max_servers, wallet}` -> `{ok, ...same as commercial}`
  wallet must match `^0x[0-9a-fA-F]{40}$` (USDC on an EVM chain) or be empty. Turning it on registers this machine with the ButterHosting network and starts a heartbeat.

## Setup wizard state
`setup_done` in config. The UI shows the wizard while it is false and calls `setconfig {setup_done:true,...}` at the end.
