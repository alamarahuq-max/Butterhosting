#!/usr/bin/env bash
# Butter app installer for Linux and macOS. Installs Node.js and Docker if they are missing, downloads Butter, adds the `butter` command.
#   curl -fsSL https://raw.githubusercontent.com/alamarahuq-max/Butterhosting/main/app/install.sh | bash
# Flags (after `bash -s --`): --yes (no questions)  --no-docker (do not install Docker)  --no-pull (skip pre-downloading the server image)  --update (only refresh the files)
# Env: BUTTER_SRC=<local checkout> copies files from there instead of downloading.
set -u
REPO=alamarahuq-max/Butterhosting; TARBALL="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
YES=0; NODOCKER=0; NOPULL=0; UPDATE=0
for a in "$@"; do case "$a" in --yes|-y) YES=1;; --no-docker) NODOCKER=1;; --no-pull) NOPULL=1;; --update) UPDATE=1;; -h|--help) sed -n 2,6p "$0" 2>/dev/null; exit 0;; *) echo "unknown option $a"; exit 1;; esac; done
BH="${BUTTER_HOME:-$HOME/.butter}"; APPDIR="$BH/app"; BIN="$HOME/.local/bin"
Y=$'\033[1;33m'; R=$'\033[1;31m'; G=$'\033[1;32m'; D=$'\033[2m'; Z=$'\033[0m'
say() { printf '%s\n' "${Y}butter${Z} $*"; }
die() { printf '%s\n' "${R}butter: $*${Z}" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
OS=$(uname -s); ARCH=$(uname -m); SUDO=""
[ "$(id -u)" = 0 ] || SUDO="sudo"
case "$OS" in Linux|Darwin) ;; *) die "This installer is for Linux and macOS. On Windows use install.ps1 (see app/README.md).";; esac
ask() { [ "$YES" = 1 ] && return 0; (: </dev/tty) 2>/dev/null || return 0; printf '%s [Y/n] ' "$1" >/dev/tty; read -r r </dev/tty || return 0; case "$r" in n|N|no) return 1;; *) return 0;; esac; }
needsudo() { [ -z "$SUDO" ] && return 0; have sudo || die "sudo is needed to $1, but sudo is not installed. Run this as root or install sudo."; say "sudo is needed to $1 (it may ask for your password)."; }

# ---------- Node.js 18+ ----------
node_ok() { have node && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]; }
install_node() {
  say "Node.js 18 or newer is missing. Installing it."
  if [ "$OS" = Darwin ] && have brew; then brew install node && return
  elif have apt-get; then needsudo "install Node.js with apt"; $SUDO apt-get update -qq && $SUDO apt-get install -y nodejs npm && node_ok && return
  elif have dnf; then needsudo "install Node.js with dnf"; $SUDO dnf install -y nodejs && node_ok && return
  elif have pacman; then needsudo "install Node.js with pacman"; $SUDO pacman -S --noconfirm nodejs npm && node_ok && return
  elif have zypper; then needsudo "install Node.js with zypper"; $SUDO zypper install -y nodejs npm && node_ok && return
  elif have apk; then needsudo "install Node.js with apk"; $SUDO apk add nodejs npm && node_ok && return; fi
  say "The package manager did not give Node.js 18+. Downloading the official build into $BH/node (no root needed)."
  have curl || die "curl is needed to download Node.js."
  case "$ARCH" in x86_64|amd64) NA=x64;; aarch64|arm64) NA=arm64;; armv7l) NA=armv7l;; *) die "No Node.js build for $ARCH. Install Node.js 18+ yourself and run this again.";; esac
  NP=linux; [ "$OS" = Darwin ] && NP=darwin
  V=$(curl -fsSL https://nodejs.org/dist/index.json | tr '{' '\n' | grep '"lts":"' | head -1 | sed -n 's/.*"version":"\(v[0-9.]*\)".*/\1/p'); [ -n "$V" ] || V=v22.12.0
  mkdir -p "$BH/node" && curl -fsSL "https://nodejs.org/dist/$V/node-$V-$NP-$NA.tar.gz" | tar -xz -C "$BH/node" --strip-components=1 || die "Could not download Node.js."
  export PATH="$BH/node/bin:$PATH"; mkdir -p "$BIN"; for b in node npm; do ln -sf "$BH/node/bin/$b" "$BIN/$b"; done
}
node_ok || install_node
node_ok || die "Node.js 18+ is still missing."
say "Node.js $(node -v) ${G}ok${Z}"

# ---------- files ----------
say "Installing Butter into $APPDIR"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if [ -n "${BUTTER_SRC:-}" ]; then mkdir -p "$TMP/src"; cp -R "$BUTTER_SRC/app" "$BUTTER_SRC/os" "$TMP/src/" 2>/dev/null || die "BUTTER_SRC has no app/ and os/"
else have curl || have wget || die "curl or wget is needed to download Butter."
  mkdir -p "$TMP/src"; if have curl; then curl -fsSL "$TARBALL" -o "$TMP/b.tgz"; else wget -qO "$TMP/b.tgz" "$TARBALL"; fi || die "Download failed (no internet, or GitHub is unreachable)."
  tar -xzf "$TMP/b.tgz" -C "$TMP" && mv "$TMP"/Butterhosting-*/app "$TMP"/Butterhosting-*/os "$TMP/src/" || die "The download was not what I expected."; fi
rm -rf "$APPDIR.new"; mkdir -p "$APPDIR.new/os"
cp -R "$TMP/src/app" "$APPDIR.new/app"; cp -R "$TMP/src/os/web" "$TMP/src/os/tui" "$APPDIR.new/os/"
rm -rf "$APPDIR.new/os/web/cgi-bin" "$APPDIR.new/os/web/httpd.conf"
rm -rf "$APPDIR"; mv "$APPDIR.new" "$APPDIR"; chmod +x "$APPDIR/app/bin/butter"
mkdir -p "$BIN"; printf '#!/bin/sh\nexec node "%s/app/bin/butter" "$@"\n' "$APPDIR" > "$BIN/butter"; chmod +x "$BIN/butter"
case ":$PATH:" in *":$BIN:"*) ;; *)
  for f in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.zshrc"; do [ -f "$f" ] && ! grep -q 'butter-path' "$f" && printf '\nexport PATH="$HOME/.local/bin:$PATH" # butter-path\n' >> "$f"; done
  export PATH="$BIN:$PATH"; say "Added $BIN to your PATH. Open a new terminal (or run: export PATH=\"$BIN:\$PATH\") to use the butter command.";; esac
[ "$UPDATE" = 1 ] && { say "${G}Updated.${Z}"; exit 0; }

# ---------- Docker ----------
docker_ok() { have docker && docker info >/dev/null 2>&1; }
if [ "$NODOCKER" = 1 ]; then say "Skipping Docker (--no-docker). Servers cannot run until Docker works."
elif docker_ok; then say "Docker ${G}ok${Z}"
elif have docker; then
  if docker info 2>&1 | grep -qi "permission denied"; then say "Docker is installed, but this user may not use it. Run: sudo usermod -aG docker \$USER   and log in again."
  else say "Docker is installed but not running."; [ "$OS" = Darwin ] && say "Open the Docker app and wait until it says it is running." || say "Start it: sudo systemctl start docker   (or: sudo service docker start)"; fi
else
  say "Docker is missing. Butter runs every Minecraft server inside Docker."
  if grep -qi microsoft /proc/version 2>/dev/null; then say "This is WSL: install Docker Desktop on Windows and turn on its WSL integration, then run this again."
  elif [ "$OS" = Darwin ]; then
    if have brew; then ask "Install Docker Desktop with Homebrew (brew install --cask docker)?" && brew install --cask docker && say "Open the Docker app once and wait until it says it is running." || true
    else say "Install Docker Desktop from https://www.docker.com/products/docker-desktop/ , open it once, then run this again."; fi
  else
    say "I will download Docker's official installer from https://get.docker.com and run it with sudo (installing Docker needs root)."
    if ask "Install Docker now?"; then
      needsudo "install Docker"; have curl || die "curl is needed for the Docker installer."
      curl -fsSL https://get.docker.com | $SUDO sh || die "The Docker installer failed. See https://docs.docker.com/engine/install/ for your system."
      if have systemctl; then $SUDO systemctl enable --now docker 2>/dev/null || true; elif have service; then $SUDO service docker start 2>/dev/null || true; fi
      [ "$(id -u)" = 0 ] || { $SUDO usermod -aG docker "$USER" 2>/dev/null && say "Added you to the docker group. ${Y}Log out and in again${Z} (or run: newgrp docker) so Butter can use it."; }
    else say "Skipped. Install Docker yourself, then run: butter setup"; fi
  fi
fi
if [ "$NOPULL" = 0 ] && docker_ok; then say "Downloading the Minecraft server image in the background (about 500 MB)."; (docker pull itzg/minecraft-server:latest >/dev/null 2>&1 &) ; fi
echo
say "${G}Installed.${Z} Starting setup. Later, just run: ${Y}butter${Z}   (web page: ${Y}butter web${Z})"
if (: </dev/tty) 2>/dev/null; then exec "$BIN/butter" setup </dev/tty; else say "Run: butter setup"; fi
