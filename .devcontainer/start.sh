#!/usr/bin/env bash
# Runs every time the Codespace starts. Secrets (DISCORD_CLIENT_ID, ...) arrive as environment variables.
cd "$(dirname "$0")/../hosting-api" || exit 1
# Optional: playit.gg agent for Bedrock (UDP) tunnels. Set the PLAYIT_SECRET Codespaces secret to enable.
if [ -n "${PLAYIT_SECRET:-}" ]; then
  docker rm -f bh-playit >/dev/null 2>&1 || true
  docker run -d --name bh-playit --restart unless-stopped --net=host -e SECRET_KEY="$PLAYIT_SECRET" playitcloud/playit:0.15.19 >/dev/null 2>&1 || echo "playit agent failed to start"
fi
# Failover: if REGISTRY_REPO + REGISTRY_TOKEN secrets exist this Codespace is the "primary" and publishes its state for backup machines.
if [ -n "${REGISTRY_REPO:-}" ] && [ -n "${REGISTRY_TOKEN:-}" ]; then export BUTTER_ROLE=primary; export WORLD_DIR="${WORLD_DIR:-$HOME/butter-worlds}"; mkdir -p "$WORLD_DIR"; fi
pkill -f "node server.js" 2>/dev/null || true
nohup node server.js >/tmp/butterhosting.log 2>&1 &
sleep 2
# Keep port 8080 public so the Vercel site can reach the API. Codespaces resets it to private after a restart,
# so a background loop re-applies it every minute. It needs a token with the "codespace" scope: add one as the
# Codespaces secret GH_TOKEN (see hosting-api/README.md). Without it the loop just logs a hint.
if [ -n "${CODESPACE_NAME:-}" ]; then
  pkill -f portwatch.sh 2>/dev/null || true
  nohup setsid bash "$(dirname "$0")/portwatch.sh" >/dev/null 2>&1 &
fi
echo "--- ButterHosting API log (also at /tmp/butterhosting.log) ---"
cat /tmp/butterhosting.log
