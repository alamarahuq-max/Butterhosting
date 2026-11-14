# ButterHosting backend

Real hosting, all inside this repo. The API runs in a **GitHub Codespace** (the cloud server) and starts every server
as a Docker container. People sign in with **Discord**, and each person only sees their own servers.

Templates: **Minecraft** (Paper), **Node.js**, **Python**, **Static site**.

## Set it up (about 10 minutes)

1. **Create a Discord application** at https://discord.com/developers/applications → *New Application*.
   Under **OAuth2**, copy the **Client ID** and **Client Secret**. Leave the redirect for step 4.
2. **Add secrets in GitHub**: your profile → *Settings → Codespaces → Secrets → New secret*. Give each one access to this repo.

   | Secret | Value |
   |---|---|
   | `DISCORD_CLIENT_ID` | from step 1 |
   | `DISCORD_CLIENT_SECRET` | from step 1 |
   | `FRONTEND_URL` | your Vercel URL, e.g. `https://butterhosting.vercel.app` (no trailing slash) |
   | `SESSION_SECRET` | any long random string (`openssl rand -hex 32`) |
   | `ADMIN_DISCORD_IDS` | optional: your Discord user ID(s), they get no server limit |
   | `PUBLIC_HOST` | optional: host for web template links outside Codespaces |

3. **Open a Codespace** on this repo (*Code → Codespaces → Create codespace on main*, pick at least 2 cores / 8 GB).
   The API starts by itself (`.devcontainer/start.sh`). Its log prints the exact **redirect URL** to use next.
4. **Back in Discord → OAuth2 → Redirects**, add:
   `https://<your-codespace-name>-8080.app.github.dev/auth/discord/callback`
5. **No manual port step.** Codespaces resets port 8080 to private after every restart, so the Codespace re-publishes it itself every minute. For that, add one more Codespaces secret once: `GH_TOKEN` = a [classic personal access token](https://github.com/settings/tokens/new?scopes=codespace) with only the `codespace` scope. (Without it you have to set 8080 to Public by hand each time.) The Codespace's own default token can't change port visibility, which is why this is needed.
6. Put the API address in **`config.js`** at the repo root, commit, and Vercel redeploys:
   ```js
   window.BUTTER_API = "https://<your-codespace-name>-8080.app.github.dev";
   ```
7. Open your Vercel site → **Open dashboard** → *Continue with Discord*.

## API

All routes except `/health` and `/auth/*` need `Authorization: Bearer <token>`.

| Route | What it does |
|---|---|
| `GET /auth/discord` | starts Discord login |
| `GET /me` | the signed-in user |
| `GET /servers` | your servers with live CPU, memory and players |
| `POST /servers` | `{ "name": "my-smp", "tpl": "minecraft" }` creates and starts one |
| `POST /servers/:id/start` `stop` `restart` `delete` | control a server |
| `GET /servers/:id/logs` | last 150 log lines |
| `POST /servers/:id/command` | `{ "cmd": "list" }` Minecraft console (RCON) |
| `POST /servers/:id/link` | Minecraft: create the free join link |

## Good to know

- **Codespaces sleep** when idle, and servers stop with them. Containers use `--restart unless-stopped`, so they come back when the Codespace wakes.
- **Join links (Minecraft).** In the dashboard, click **Make join link** on a running Minecraft server. It sets up
  [Minekube Connect](https://connect.minekube.com), which gives a free address like `bh-myserver-a1b2.play.minekube.net`.
  Nothing to forward or buy, and no domain. The server restarts once (about a minute). Catches, honestly:
  it's a third-party service (if Minekube is down, the link is down); Java Edition only; it turns off
  `enforce-secure-profile` (affects signed chat only); names are first come, first served and are not reserved by an account.
  Linking needs Codespace internet access to modrinth.com and minekube.net (default Codespaces allow it).
  Web templates (Node, Python, Static) are reachable at `https://<codespace>-<port>.app.github.dev` once that port is set to Public.
- Data lives in `hosting-api/data` (git-ignored). Each server has its own Docker volume.
- Limits: 3 servers per person by default (`MAX_SERVERS_PER_USER`), 1.5 GB for Minecraft, 256 MB for the rest.

## Run it on your own machine

```bash
cd hosting-api
FRONTEND_URL=http://localhost:3000 DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... node server.js
```
For testing without Discord, add `DEV_LOGIN=1` and open `/auth/dev?id=1`. Never set it in production.

## Settings, mods and Bedrock

- **Settings** (dashboard, Settings button on a Minecraft server): software (Paper, Purpur, Fabric, Forge, Vanilla), version, memory, game mode, difficulty, max players, view distance, seed, MOTD, whitelist, PvP, hardcore, nether, flight, auto-stop when empty. Saving recreates the container with the new settings; the world is kept.
- **Mods and plugins:** upload a `.jar` in the same dialog (max `MAX_UPLOAD_MB`, default 100). Paper and Purpur use `plugins/`, Fabric and Forge use `mods/`. Restart to load. Free join links only work on Paper and Purpur.
- `MAX_RAM_GB` (default 2) caps the memory a user can give one server.
- **Bedrock:** Minekube lists Bedrock support on its Hangar page ("handled by the Connect edge"), so the same join link should work for Bedrock players. This is not tested by us; their docs don't spell out the Bedrock port or address format.

## Bedrock servers (UDP)

Choose **Minecraft Bedrock only** when creating a server. It runs the official Bedrock server on a UDP port. Bedrock players need a UDP tunnel, and the Java link provider (Minekube) is TCP only, so this part is **not one-click**:

1. Make a free account at [playit.gg](https://playit.gg) and create an **agent** there. Copy its secret key.
2. In Codespaces secrets add `PLAYIT_SECRET` with that key and restart the Codespace. The agent then runs next to the servers.
3. On playit.gg click **Create Tunnel → Minecraft Bedrock**, and set the local address to `127.0.0.1:<port>`. The port is the one the dashboard shows for that server (25600 or above).
4. Copy the address playit shows (like `180.ip.ply.gg:17019`) and press **Address** on the server in the dashboard.

You do steps 1, 2 once. Step 3 and 4 are per server. I couldn't check playit's free-tier limits on tunnel count, so check them on their site.

## RAM mode

Set `WORLD_DIR` to a tmpfs folder and worlds are stored there instead of in Docker volumes (see `os/` for the backup service).


## Ads (free, ad-supported)

ButterHosting is meant to be free and paid for by ads. The code is ready: `ads.js` loads Google AdSense only when you fill `BUTTER_ADS` in `config.js` (publisher ID and one slot ID each for `landing` and `dash`). While it is empty, no ad script loads and no ad boxes show. Things to know:

- AdSense must approve your site first. They tend to reject pages that are mostly a login wall, or have very little content, and `*.vercel.app` addresses are often a poor fit; a custom domain helps a lot. I can't promise approval.
- Ads are on the landing page and below the server list. None sit next to buttons, because AdSense bans layouts that cause accidental clicks.
- Visitors in the EU/UK need a cookie-consent banner for personalised ads. That isn't built.
- Ad blockers hide ads. Income from a small site is usually tiny, so don't count on it covering a server bill.
- You could swap in another ad network by editing `ads.js`.
