#!/bin/sh
# Turns a fresh Alpine Linux install (setup-alpine, "sys" disk mode, NOT diskless) into ButterOS.
# Run as root:  sh install.sh https://github.com/alamarahuq-max/Butterhosting.git
set -eu
REPO=${1:?usage: install.sh <git repo url>}
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
echo "ButterOS installed. Reboot. Then set the Discord values in the menu and start the API."
