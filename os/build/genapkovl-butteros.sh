#!/bin/sh -e
# Builds the ButterOS overlay (config + our files) that Alpine unpacks into RAM at every boot.
HOSTNAME="$1"
[ -n "$HOSTNAME" ] || exit 1
SRC="${BUTTER_SRC:?BUTTER_SRC not set}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
rc_add() { mkdir -p "$tmp/etc/runlevels/$2"; ln -sf "/etc/init.d/$1" "$tmp/etc/runlevels/$2/$1"; }

mkdir -p "$tmp/etc/apk" "$tmp/etc/init.d" "$tmp/etc/docker" "$tmp/etc/network" "$tmp/usr/local/bin" "$tmp/opt/butterhosting"
echo "butter-box" > "$tmp/etc/hostname"
printf 'auto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet dhcp\n' > "$tmp/etc/network/interfaces"

# packages that must be installed at boot (they are on the ISO)
cat > "$tmp/etc/apk/world" <<W
alpine-base
$(cat "${BUTTER_APKS_FILE:-/dev/null}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d')
W
# our files
install -m 755 "$SRC/os/butter-tui"            "$tmp/usr/local/bin/butter-tui"
install -m 755 "$SRC/os/ramsync"               "$tmp/usr/local/bin/ramsync"
install -m 755 "$SRC/os/butterhosting.initd"   "$tmp/etc/init.d/butterhosting"
install -m 755 "$SRC/os/butterramsync.initd"   "$tmp/etc/init.d/butterramsync"
install -m 755 "$SRC/os/butterpersist.initd"   "$tmp/etc/init.d/butterpersist"
install -m 755 "$SRC/os/butterweb.initd"       "$tmp/etc/init.d/butterweb"
install -m 755 "$SRC/os/butterfailover.initd"  "$tmp/etc/init.d/butterfailover"
[ -x /home/build/cloudflared ] && { mkdir -p "$tmp/usr/bin"; install -m 755 /home/build/cloudflared "$tmp/usr/bin/cloudflared"; }
install -m 755 "$SRC/os/butter-install"        "$tmp/usr/local/bin/butter-install"
install -m 644 "$SRC/os/butter.dialogrc" "$tmp/etc/butter.dialogrc"
install -m 755 "$SRC/os/serial-getty"          "$tmp/usr/local/bin/serial-getty"
mkdir -p "$tmp/opt/butterweb"; cp -r "$SRC/os/web"/. "$tmp/opt/butterweb/"; chmod +x "$tmp/opt/butterweb/cgi-bin/api"
printf 'overlay\nbr_netfilter\nveth\nnf_conntrack\nnf_nat\nxt_MASQUERADE\nxt_conntrack\niptable_nat\niptable_filter\n' > "$tmp/etc/modules"
mkdir -p "$tmp/opt/butterhosting/hosting-api" && cp -r "$SRC/hosting-api"/. "$tmp/opt/butterhosting/hosting-api/"
rm -rf "$tmp/opt/butterhosting/hosting-api/data" "$tmp/opt/butterhosting/data" 2>/dev/null || true
# settings file (empty values; filled in from the console menu)
printf 'WORLD_DIR=/ram/butter/worlds\nDATA_DIR=/ram/butter/data\nBACKUP_DIR=/media/butter/butter-backup\n' > "$tmp/etc/butterhosting.env"
chmod 600 "$tmp/etc/butterhosting.env"
# the main screen is the ButterOS menu
cat > "$tmp/etc/inittab" <<'I'
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default
tty1::respawn:/sbin/getty -n -l /usr/local/bin/butter-tui 38400 tty1
tty2::respawn:/sbin/getty 38400 tty2
ttyS0::respawn:/usr/local/bin/serial-getty
::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
I
for s in devfs dmesg mdev hwdrivers modloop; do rc_add $s sysinit; done
for s in cgroups modules sysctl hostname bootmisc networking syslog chronyd butterpersist butterramsync; do rc_add $s boot; done
for s in docker butterhosting butterfailover butterweb acpid; do rc_add $s default; done
for s in mount-ro killprocs savecache; do rc_add $s shutdown; done
tar -c -C "$tmp" . | gzip -9n > "$HOSTNAME.apkovl.tar.gz"
