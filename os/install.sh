#!/bin/sh
# Turns a fresh Alpine Linux install (setup-alpine, "sys" disk mode, NOT diskless) into ButterOS.
# Run as root:  sh install.sh https://github.com/alamarahuq-max/Butterhosting.git
set -eu
REPO=${1:?usage: install.sh <git repo url> [--ram /media/usb]}
RAMMODE=${2:-}; USB=${3:-/media/usb}
apk add --no-cache docker nodejs dialog git openrc util-linux
rc-update add docker boot
rc-update add cgroups boot 2>/dev/null || true
# keep RAM free for game servers: no swap thrash, small journal
echo 'vm.swappiness=10' > /etc/sysctl.d/90-butter.conf
git clone --depth 1 "$REPO" /opt/butterhosting || (cd /opt/butterhosting && git pull)
install -m 755 /opt/butterhosting/os/butter-tui /usr/local/bin/butter-tui
install -m 755 /opt/butterhosting/os/butterhosting.initd /etc/init.d/butterhosting
rc-update add butterhosting default
# boot straight into the TUI on the main screen
sed -i 's#^tty1::.*#tty1::respawn:/sbin/getty -n -l /usr/local/bin/butter-tui 38400 tty1#' /etc/inittab
if [ "$RAMMODE" = "--ram" ]; then
  # RAM mode: worlds + API data run from a RAM disk, backed up to $USB/butter-backup every 5 min and on shutdown
  install -m 755 /opt/butterhosting/os/ramsync /usr/local/bin/ramsync
  install -m 755 /opt/butterhosting/os/butterramsync.initd /etc/init.d/butterramsync
  touch /etc/butterhosting.env; chmod 600 /etc/butterhosting.env
  grep -v '^\(WORLD_DIR\|DATA_DIR\|BACKUP_DIR\)=' /etc/butterhosting.env > /tmp/bh.env || true
  printf 'WORLD_DIR=/ram/butter/worlds\nDATA_DIR=/ram/butter/data\nBACKUP_DIR=%s/butter-backup\n' "$USB" >> /tmp/bh.env
  mv /tmp/bh.env /etc/butterhosting.env
  sed -i 's#^start() {#start() {\n  set -a; . /etc/butterhosting.env; set +a#' /etc/init.d/butterramsync
  rc-update add butterramsync boot
  echo "RAM mode on. Mount your USB at $USB (add it to /etc/fstab), and keep RAM_SIZE in mind: worlds live in RAM."
fi
echo "ButterOS installed. Reboot."
