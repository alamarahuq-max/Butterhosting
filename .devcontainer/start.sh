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
# Docker-in-Docker starts a little after the Codespace does. Wait for it, and try to start it if it never comes up.
for i in $(seq 1 45); do docker info >/dev/null 2>&1 && break; sleep 2; done
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not up yet, trying to start it..."; (sudo -n /usr/local/share/docker-init.sh >/tmp/docker-init.log 2>&1 &); for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
fi
# The Codespace disk is small (32 GB). Free what is safe to free: stopped non-server containers, dangling images, build cache. Servers and their worlds are not touched.
docker ps -a --filter status=exited --format '{{.Names}}' 2>/dev/null | grep -v '^bh-' | xargs -r docker rm >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true; docker builder prune -f >/dev/null 2>&1 || true
rm -rf "$HOME/.npm/_cacache" /tmp/*.tgz 2>/dev/null || true
echo "Disk: $(df -h / | awk 'END{print $4" free of "$2}')  Docker: $(docker system df --format '{{.Type}} {{.Size}}' 2>/dev/null | tr '\n' ';')"
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
