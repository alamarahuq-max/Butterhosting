#!/usr/bin/env bash
# Runs every time the Codespace starts. Secrets (DISCORD_CLIENT_ID, ...) arrive as environment variables.
cd "$(dirname "$0")/../hosting-api" || exit 1
# Optional: playit.gg agent for Bedrock (UDP) tunnels. Set the PLAYIT_SECRET Codespaces secret to enable.
if [ -n "${PLAYIT_SECRET:-}" ]; then
  docker rm -f bh-playit >/dev/null 2>&1 || true
  docker run -d --name bh-playit --restart unless-stopped --net=host -e SECRET_KEY="$PLAYIT_SECRET" playitcloud/playit:0.15.19 >/dev/null 2>&1 || echo "playit agent failed to start"
fi
pkill -f "node server.js" 2>/dev/null || true
nohup node server.js >/tmp/butterhosting.log 2>&1 &
sleep 2
# Make the API port reachable from the Vercel site (needs a public port). Harmless if it can't be set automatically.
gh codespace ports visibility 8080:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
echo "--- ButterHosting API log (also at /tmp/butterhosting.log) ---"
cat /tmp/butterhosting.log
