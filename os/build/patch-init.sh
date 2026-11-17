#!/bin/sh
# Teaches Alpine's initramfs to boot from an ISO FILE that sits on a disk the machine already has (ext4, NTFS, exFAT, FAT, btrfs, xfs).
# Kernel argument:  butter_iso=<UUID=...|LABEL=...|/dev/xxx>:/path/to/ButterOS.iso
# Without that argument the stock boot (USB stick / CD) is untouched.
set -eu
INIT=${INIT:-/usr/share/mkinitfs/initramfs-init}
grep -q butter_iso_boot "$INIT" && exit 0
cat > /tmp/butter-fn.sh <<'EOF'
butter_iso_boot() {
	local spec=${KOPT_butter_iso%%:*} rel=${KOPT_butter_iso#*:} dev= i=0 m
	case "$rel" in /*) ;; *) rel=/$rel;; esac
	ebegin "ButterOS: looking for $rel on $spec"
	$MOCK modprobe -a loop isofs squashfs ext4 vfat exfat ntfs3 btrfs xfs 2>/dev/null
	$MOCK nlplug-findfs -p /sbin/mdev ${KOPT_uevent_buf_size:+-U $KOPT_uevent_buf_size} "$spec" >/dev/null 2>&1
	while [ $i -lt 40 ]; do dev=$(findfs "$spec" 2>/dev/null) && [ -n "$dev" ] && break; dev=; mdev -s 2>/dev/null; sleep 1; i=$((i+1)); done
	[ -n "$dev" ] || { eend 1; echo "ButterOS: disk $spec not found"; return 1; }
	mkdir -p "$ROOT"/media/hostdisk "$ROOT"/media/butteriso
	for m in "" "-t ntfs3" "-t exfat" "-t vfat" "-t btrfs"; do $MOCK mount $m -o ro "$dev" "$ROOT"/media/hostdisk 2>/dev/null && break; done
	[ -f "$ROOT/media/hostdisk$rel" ] || { eend 1; echo "ButterOS: $rel not found on $dev"; return 1; }
	$MOCK mount -t iso9660 -o loop,ro "$ROOT/media/hostdisk$rel" "$ROOT"/media/butteriso || { eend 1; echo "ButterOS: cannot open the ISO file"; return 1; }
	: > "$repofile"; ls "$ROOT"/media/butteriso/*.apkovl.tar.gz > "$ROOT"/tmp/apkovls 2>/dev/null
	eend 0
}
EOF
# define the function before the media step, and only run the normal media search when butter_iso is not used
awk -v fn=/tmp/butter-fn.sh '
/^# locate boot media and mount it/ { while ((getline l < fn) > 0) print l; print; next }
/^ebegin "Mounting boot media"/ { print "if [ -n \"$KOPT_butter_iso\" ] && butter_iso_boot; then :; else"; print; inblk=1; next }
inblk && /^eend \$\?/ { print; print "fi"; inblk=0; next }
{ print }' "$INIT" > /tmp/init.new && cat /tmp/init.new > "$INIT"
sh -n "$INIT" && echo "init patched"; sed -n '/^butter_iso_boot/,/^eend \$?/p' "$INIT" | head -5 >/dev/null
mkdir -p /etc/mkinitfs/features.d
cat > /etc/mkinitfs/features.d/butterhost.modules <<'EOF'
kernel/drivers/block/loop.ko*
kernel/fs/isofs
kernel/fs/squashfs
kernel/fs/ntfs3
kernel/fs/exfat
kernel/fs/fat
kernel/fs/btrfs
kernel/fs/xfs
kernel/fs/ext4
EOF
