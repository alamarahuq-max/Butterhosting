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
5. In the Codespace *Ports* tab, make port **8080** *Public* (the start script tries to do this for you).
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
