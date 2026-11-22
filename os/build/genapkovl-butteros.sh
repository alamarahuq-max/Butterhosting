#!/bin/sh -e
# Builds the ButterOS overlay (config + our files) that Alpine unpacks into RAM at every boot.
HOSTNAME="$1"
[ -n "$HOSTNAME" ] || exit 1
SRC="${BUTTER_SRC:?BUTTER_SRC not set}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
rc_add() { mkdir -p "$tmp/etc/runlevels/$2"; ln -sf "/etc/init.d/$1" "$tmp/etc/runlevels/$2/$1"; }

mkdir -p "$tmp/etc/apk" "$tmp/etc/init.d" "$tmp/etc/docker" "$tmp/etc/network" "$tmp/usr/local/bin" "$tmp/opt/butterhosting"
echo "butter-box" > "$tmp/etc/hostname"
printf 'auto lo\niface lo inet loopback\n' > "$tmp/etc/network/interfaces"   # NetworkManager runs the cable and Wi-Fi
mkdir -p "$tmp/etc/NetworkManager"
cat > "$tmp/etc/NetworkManager/NetworkManager.conf" <<'NM'
[main]
dhcp=internal
plugins=keyfile

[keyfile]
unmanaged-devices=interface-name:docker0;interface-name:veth*;interface-name:br-*;interface-name:lo

[device]
wifi.scan-rand-mac-address=no

[connection]
wifi.powersave=2
NM

# packages that must be installed at boot (they are on the ISO)
cat > "$tmp/etc/apk/world" <<W
alpine-base
$(cat "${BUTTER_APKS_FILE:-/dev/null}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d')
W
# our files
install -m 755 "$SRC/os/butter-tui"            "$tmp/usr/local/bin/butter-tui"
install -m 755 "$SRC/os/butter-tui-lite"       "$tmp/usr/local/bin/butter-tui-lite"
install -m 755 "$SRC/os/butter-backup-setup"   "$tmp/usr/local/bin/butter-backup-setup"
install -m 755 "$SRC/os/butter-wifi"           "$tmp/usr/local/bin/butter-wifi"
install -m 755 "$SRC/os/butter-wifid"          "$tmp/usr/local/bin/butter-wifid"
install -m 755 "$SRC/os/butterwifi.initd"      "$tmp/etc/init.d/butterwifi"
mkdir -p "$tmp/usr/local/lib/butter" "$tmp/usr/lib/butter"
install -m 644 "$SRC/os/tui/tui.js" "$SRC/os/tui/data.js" "$tmp/usr/local/lib/butter/"
install -m 755 "$SRC/os/wifi-load" "$tmp/usr/lib/butter/load-wifi"
install -m 755 "$SRC/os/wifi-guard" "$tmp/usr/lib/butter/rtl8xxxu-guard"
mkdir -p "$tmp/etc/modprobe.d"; echo "install rtl8xxxu /usr/lib/butter/rtl8xxxu-guard" > "$tmp/etc/modprobe.d/butter-wifi.conf"
install -m 755 "$SRC/os/wifi-save" "$tmp/usr/lib/butter/wifi-save"
install -m 755 "$SRC/os/wifi-askpass" "$tmp/usr/lib/butter/wifi-askpass"
[ -f /home/build/8188eu.ko ] && install -m 644 /home/build/8188eu.ko "$tmp/usr/lib/butter/8188eu.ko"
install -m 755 "$SRC/os/ramsync"               "$tmp/usr/local/bin/ramsync"
install -m 755 "$SRC/os/butterhosting.initd"   "$tmp/etc/init.d/butterhosting"
install -m 755 "$SRC/os/butterramsync.initd"   "$tmp/etc/init.d/butterramsync"
install -m 755 "$SRC/os/butterpersist.initd"   "$tmp/etc/init.d/butterpersist"
install -m 755 "$SRC/os/butterweb.initd"       "$tmp/etc/init.d/butterweb"
install -m 755 "$SRC/os/butterfailover.initd"  "$tmp/etc/init.d/butterfailover"
[ -x /home/build/cloudflared ] && { mkdir -p "$tmp/usr/bin"; install -m 755 /home/build/cloudflared "$tmp/usr/bin/cloudflared"; }
install -m 755 "$SRC/os/butter-play"           "$tmp/usr/local/bin/butter-play"
[ -x /home/build/bore ] && { mkdir -p "$tmp/usr/bin"; install -m 755 /home/build/bore "$tmp/usr/bin/bore"; }
printf '#!/bin/sh\ncase "$1" in play) shift; exec /usr/local/bin/butter-play "$@";; install) shift; exec /usr/local/bin/butter-install "$@";; *) echo "usage: butter play [name] | butter install"; exit 1;; esac\n' > "$tmp/usr/local/bin/butter"; chmod 755 "$tmp/usr/local/bin/butter"
install -m 755 "$SRC/os/butter-install"        "$tmp/usr/local/bin/butter-install"
install -m 644 "$SRC/os/butter.dialogrc" "$tmp/etc/butter.dialogrc"
install -m 755 "$SRC/os/serial-getty"          "$tmp/usr/local/bin/serial-getty"
mkdir -p "$tmp/opt/butterweb"; cp -r "$SRC/os/web"/. "$tmp/opt/butterweb/"; chmod +x "$tmp/opt/butterweb/cgi-bin/api"
printf 'overlay\nbr_netfilter\nveth\nnf_conntrack\nnf_nat\nxt_MASQUERADE\nxt_conntrack\niptable_nat\niptable_filter\nmousedev\nusbhid\nhid_generic\npsmouse\nevdev\ncfg80211\n' > "$tmp/etc/modules"
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
for s in cgroups modules sysctl hostname bootmisc butterwifi networking syslog chronyd butterpersist butterramsync; do rc_add $s boot; done
rc_add dbus default; rc_add networkmanager default
cat > "$tmp/etc/init.d/butterslim" <<'SL'
#!/sbin/openrc-run
description="Free RAM: remove docker plugins and docs this box never uses (the root filesystem lives in RAM)"
start() { rm -rf /usr/libexec/docker/cli-plugins /usr/share/man /usr/share/doc /usr/share/bash-completion /usr/share/zsh /usr/share/fish /usr/share/info; return 0; }
SL
chmod 755 "$tmp/etc/init.d/butterslim"; rc_add butterslim boot
for s in docker butterhosting butterfailover butterweb acpid; do rc_add $s default; done
for s in mount-ro killprocs savecache; do rc_add $s shutdown; done
tar -c -C "$tmp" . | gzip -9n > "$HOSTNAME.apkovl.tar.gz"
