#!/usr/bin/env bash
# ButterOS in one command (Linux and macOS). No dual-boot, no reboot: it downloads ButterOS once,
# runs it as a small virtual machine, creates a Minecraft server and prints how to join.
#
#   curl -fsSL https://raw.githubusercontent.com/alamarahuq-max/Butterhosting/main/os/run/butter-run.sh | bash
#   ... | bash -s -- --flavor vanilla --version 1.16.5 --mem 1024 --name old
#
# Options: --name N  --flavor paper|vanilla|fabric|forge  --version 1.21.4|LATEST  --mem MB (server)
#          --ram MB (VM, default 4096)  --no-persist (keep nothing)  --no-share (no internet link)
#          --window (show the ButterOS screen)  --iso FILE (use a local ISO)  --ci (exit when the server answers)
#          --reset (forget the saved world and disk)  --help
set -u
REPO=alamarahuq-max/Butterhosting
ISO_URL="${BUTTER_ISO_URL:-https://github.com/$REPO/releases/download/latest-iso/ButterOS.iso}"
HOME_DIR="${BUTTER_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/butteros}"
NAME=minecraft; FLAVOR=paper; VER=LATEST; MEM=1536; VMRAM=4096; PERSIST=1; SHARE=internet; WINDOW=0; ISO=""; CI=0; RESET=0
HPORT=${BUTTER_WEB_PORT:-8080}; MPORT=${BUTTER_MC_PORT:-25565}; BPORT=${BUTTER_BEDROCK_PORT:-19132}
while [ $# -gt 0 ]; do case "$1" in
  --name) NAME=$2; shift;; --flavor) FLAVOR=$2; shift;; --version) VER=$2; shift;; --mem) MEM=$2; shift;;
  --ram) VMRAM=$2; shift;; --no-persist) PERSIST=0;; --no-share) SHARE=none;; --window) WINDOW=1;;
  --iso) ISO=$2; shift;; --ci) CI=1;; --reset) RESET=1;;
  -h|--help) sed -n 2,12p "$0" 2>/dev/null || echo "see the comments at the top of butter-run.sh"; exit 0;;
  *) echo "unknown option $1"; exit 1;; esac; shift; done

C1=$'\033[1;33m'; C2=$'\033[0;36m'; C0=$'\033[0m'
say() { printf '%s\n' "${C1}ButterOS${C0} $*"; }
die() { printf '%s\n' "${C1}ButterOS${C0} ERROR: $*" >&2; exit 1; }
OS=$(uname -s); ARCH=$(uname -m)
mkdir -p "$HOME_DIR" || die "cannot create $HOME_DIR"
[ "$RESET" = 1 ] && { rm -f "$HOME_DIR/data.qcow2"; say "saved world and disk removed"; }

# 1) QEMU
if ! command -v qemu-system-x86_64 >/dev/null 2>&1; then
  say "QEMU (the program that runs the virtual machine) is missing. Installing it."
  SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
  if   [ "$OS" = Darwin ] && command -v brew >/dev/null 2>&1; then brew install qemu
  elif command -v apt-get >/dev/null 2>&1; then $SUDO apt-get update -qq && $SUDO apt-get install -y qemu-system-x86 qemu-utils
  elif command -v dnf     >/dev/null 2>&1; then $SUDO dnf install -y qemu-system-x86 qemu-img
  elif command -v pacman  >/dev/null 2>&1; then $SUDO pacman -S --noconfirm qemu-system-x86 qemu-img
  elif command -v zypper  >/dev/null 2>&1; then $SUDO zypper install -y qemu-x86 qemu-tools
  elif command -v apk     >/dev/null 2>&1; then $SUDO apk add qemu-system-x86_64 qemu-img
  else die "Install QEMU (qemu-system-x86_64 and qemu-img) with your package manager, then run this again."; fi
  command -v qemu-system-x86_64 >/dev/null 2>&1 || die "QEMU did not install. Install it by hand and run this again."
fi

# 2) the ISO (downloaded once; checked against its checksum; refreshed only when a new one is published)
if [ -z "$ISO" ]; then
  ISO="$HOME_DIR/ButterOS.iso"
  DL=0; curl -fsSL --retry 3 "$ISO_URL.sha256" -o "$HOME_DIR/ButterOS.iso.sha256.new" 2>/dev/null || { [ -f "$ISO" ] || die "Could not reach $ISO_URL (no internet?)"; rm -f "$HOME_DIR/ButterOS.iso.sha256.new"; }
  if [ -f "$HOME_DIR/ButterOS.iso.sha256.new" ]; then
    if [ ! -f "$ISO" ] || ! cmp -s "$HOME_DIR/ButterOS.iso.sha256.new" "$HOME_DIR/ButterOS.iso.sha256" 2>/dev/null; then DL=1; fi
  fi
  if [ "$DL" = 1 ]; then
    say "Downloading ButterOS (about 600 MB, once)"
    curl -fL --retry 3 -C - -o "$ISO.part" "$ISO_URL" || die "Download failed"
    WANT=$(cut -d' ' -f1 "$HOME_DIR/ButterOS.iso.sha256.new")
    if command -v sha256sum >/dev/null 2>&1; then GOT=$(sha256sum "$ISO.part" | cut -d' ' -f1); else GOT=$(shasum -a 256 "$ISO.part" | cut -d' ' -f1); fi
    [ "$WANT" = "$GOT" ] || { rm -f "$ISO.part"; die "Checksum mismatch, download discarded"; }
    mv "$ISO.part" "$ISO"; mv "$HOME_DIR/ButterOS.iso.sha256.new" "$HOME_DIR/ButterOS.iso.sha256"
  else rm -f "$HOME_DIR/ButterOS.iso.sha256.new"; say "Using the ButterOS you already downloaded"; fi
fi
[ -f "$ISO" ] || die "ISO not found: $ISO"

# 3) speed: hardware acceleration where there is one
ACCEL=tcg; CPU=max
if [ "$OS" = Linux ] && [ -r /dev/kvm ] && [ -w /dev/kvm ]; then ACCEL=kvm; CPU=host
elif [ "$OS" = Darwin ] && [ "$ARCH" = x86_64 ]; then ACCEL=hvf; CPU=host; fi
[ "$ACCEL" = tcg ] && say "No hardware acceleration found (Linux: /dev/kvm). It will work but be slow; the first start can take 10+ minutes."
FREE_MB=0
if [ "$OS" = Linux ]; then FREE_MB=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
elif [ "$OS" = Darwin ]; then FREE_MB=$(( $(sysctl -n hw.memsize) / 1048576 )); fi
[ "$FREE_MB" -gt 0 ] && [ "$FREE_MB" -lt $((VMRAM + 512)) ] && say "Only $FREE_MB MB of free RAM on this PC; the virtual machine wants $VMRAM MB. Use --ram 3072 if it struggles."

# 4) a disk that keeps the world and the downloaded server software between runs
DISKARGS=()
if [ "$PERSIST" = 1 ]; then
  [ -f "$HOME_DIR/data.qcow2" ] || qemu-img create -q -f qcow2 "$HOME_DIR/data.qcow2" 24G >/dev/null || die "could not create the data disk"
  DISKARGS=(-drive "file=$HOME_DIR/data.qcow2,if=virtio,format=qcow2")
fi
CFG="butter;auto;flavor=$FLAVOR;ver=$VER;mem=$MEM;name=$NAME;share=$SHARE"; [ "$PERSIST" = 1 ] && CFG="butter;persist;auto;flavor=$FLAVOR;ver=$VER;mem=$MEM;name=$NAME;share=$SHARE"

# 5) is something already using the ports?
busy() { (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null && return 0 || return 1; }
for p in $HPORT $MPORT; do busy "$p" && die "Port $p is already in use (another Minecraft server? Close it, or set BUTTER_MC_PORT / BUTTER_WEB_PORT)."; done

MONPORT=$((HPORT + 2000))
DISP=(-display none); [ "$WINDOW" = 1 ] && DISP=()
say "Starting ButterOS ($ACCEL, $VMRAM MB RAM). First boot takes about a minute."
qemu-system-x86_64 -machine q35 -accel "$ACCEL" -cpu "$CPU" -m "$VMRAM" -smp 2 \
  -cdrom "$ISO" -boot d ${DISKARGS[@]+"${DISKARGS[@]}"} -smbios "type=1,serial=$CFG" \
  -netdev "user,id=n,hostfwd=tcp::$HPORT-:80,hostfwd=tcp::$MPORT-:25565,hostfwd=tcp::$BPORT-:19132,hostfwd=udp::$BPORT-:19132" -device e1000,netdev=n \
  -vga std ${DISP[@]+"${DISP[@]}"} -serial "file:$HOME_DIR/serial.log" -monitor "tcp:127.0.0.1:$MONPORT,server,nowait" &
QPID=$!

STOPPING=0
stop_vm() {
  [ "$STOPPING" = 1 ] && return; STOPPING=1; echo
  say "Stopping the server and saving the world..."
  (exec 3<>/dev/tcp/127.0.0.1/$MONPORT; printf 'system_powerdown\n' >&3; sleep 1) 2>/dev/null
  for i in $(seq 1 30); do kill -0 "$QPID" 2>/dev/null || break; sleep 1; done
  kill "$QPID" 2>/dev/null; wait "$QPID" 2>/dev/null; say "Stopped."; exit 0
}
trap stop_vm INT TERM
api() { curl -fsS -m 20 "http://127.0.0.1:$HPORT/cgi-bin/api?$1" 2>/dev/null; }
jget() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p" | head -1; }

say "Waiting for ButterOS to come up..."
T0=$(date +%s); UP=0
while kill -0 "$QPID" 2>/dev/null; do
  api a=ping | grep -q '"ok":true' && { UP=1; break; }
  [ $(( $(date +%s) - T0 )) -gt 900 ] && break; sleep 3; done
[ "$UP" = 1 ] || { kill "$QPID" 2>/dev/null; die "ButterOS did not start (see $HOME_DIR/serial.log)"; }
say "ButterOS is running. Creating your server (the first run downloads about 500 MB inside it)..."
READY=0; LAST=""
while kill -0 "$QPID" 2>/dev/null; do
  L=$(api "a=logs&n=$NAME" | sed 's/\\n/\n/g' | tail -1 | cut -c1-110)
  if api "a=logs&n=$NAME" | grep -q 'Done ('; then READY=1; break; fi
  [ -n "$L" ] && [ "$L" != "$LAST" ] && { echo "  $L"; LAST=$L; }
  [ $(( $(date +%s) - T0 )) -gt 2400 ] && break; sleep 5; done
[ "$READY" = 1 ] || { kill "$QPID" 2>/dev/null; die "The server did not finish starting. Look at $HOME_DIR/serial.log"; }

JOIN=""; for i in 1 2 3 4 5 6 7 8 9 10 11 12; do JOIN=$(api a=status | tr '{' '\n' | grep "\"name\":\"$NAME\"" | jget join); [ -n "$JOIN" ] && [ "$JOIN" != null ] && break; JOIN=""; [ "$SHARE" = none ] && break; sleep 5; done
LAN=$(hostname -I 2>/dev/null | awk '{print $1}'); [ -n "$LAN" ] || LAN=$(ipconfig getifaddr en0 2>/dev/null)
echo
printf '%s\n' "${C1}Your server is running.${C0}"
printf '  Java, this PC:        %s\n' "${C2}localhost:$MPORT${C0}"
[ -n "$LAN" ] && printf '  Java, same Wi-Fi:     %s\n' "${C2}$LAN:$MPORT${C0}"
[ -n "$JOIN" ] && printf '  Java, from anywhere:  %s   (free link, works while this window stays open)\n' "${C2}$JOIN${C0}"
printf '  Phones / Bedrock:     %s  port %s\n' "${C2}${LAN:-the address above}${C0}" "$BPORT"
printf '  Manage it (web page): %s\n' "${C2}http://localhost:$HPORT${C0}"
[ "$PERSIST" = 1 ] && printf '  Your world is saved in %s\n' "$HOME_DIR"
if [ "$CI" = 1 ]; then echo "CI_READY join=$JOIN"; stop_vm; fi
echo; say "Press Ctrl+C to stop the server."
wait "$QPID"
