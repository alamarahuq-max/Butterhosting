#!/bin/sh
# ButterOS dual-boot for Linux: no new partition. ButterOS is one file (about 500 MB) on a disk you already have, plus a boot menu entry.
#   sudo sh butter-dualboot-linux.sh                 download the ISO and add "ButterOS" to the GRUB menu
#   sudo sh butter-dualboot-linux.sh --iso ButterOS.iso     use an ISO you already downloaded
#   sudo sh butter-dualboot-linux.sh --remove         take it out again (deletes the files, regenerates the menu)
# Needs: GRUB as the boot menu, the ISO on ext4 or xfs (not LVM, not encrypted), Secure Boot off.
set -eu
ISO_URL="${BUTTER_ISO_URL:-https://github.com/alamarahuq-max/Butterhosting/releases/latest/download/ButterOS.iso}"
ROOT=""; ISO=""; REMOVE=0; NOUPDATE=0; FORCE=0
while [ $# -gt 0 ]; do case "$1" in
  --iso) ISO=$2; shift;; --root) ROOT=$2; shift;; --remove) REMOVE=1;; --no-update) NOUPDATE=1;; --force) FORCE=1;;
  -h|--help) sed -n 2,8p "$0"; exit 0;; *) echo "unknown option $1"; exit 1;; esac; shift; done
die() { echo "ButterOS: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "run with sudo"
D="$ROOT/butteros"; B="$ROOT/boot/butteros"; G="$ROOT/etc/grub.d/40_butteros"

regen() {
  [ "$NOUPDATE" = 1 ] && return 0
  if command -v update-grub >/dev/null 2>&1; then update-grub
  elif command -v grub-mkconfig >/dev/null 2>&1 && [ -d /boot/grub ]; then grub-mkconfig -o /boot/grub/grub.cfg
  elif command -v grub2-mkconfig >/dev/null 2>&1 && [ -d /boot/grub2 ]; then grub2-mkconfig -o /boot/grub2/grub.cfg
  else echo "Could not find the GRUB tool to rebuild the menu. Add the entry in $B/grub-entry.cfg to your GRUB config by hand."; fi
}
if [ "$REMOVE" = 1 ]; then rm -rf "$D" "$B" "$G"; regen; echo "ButterOS removed."; exit 0; fi

[ -d /sys/firmware/efi ] && command -v mokutil >/dev/null 2>&1 && mokutil --sb-state 2>/dev/null | grep -qi "enabled" && [ "$FORCE" != 1 ] && \
  die "Secure Boot is on, and ButterOS's kernel is not signed, so it would not start. Turn Secure Boot off in the BIOS/UEFI settings, or use --force."
command -v mount >/dev/null && command -v blkid >/dev/null || die "need mount and blkid"
mkdir -p "$D" "$B"
# where will the files live?
SRC=$(df -P "$D" | awk 'END{print $1}'); FS=$(findmnt -no FSTYPE -T "$D" 2>/dev/null || true)
case "$FS" in ext4|ext3|ext2|xfs) ;; *) rmdir "$D" "$B" 2>/dev/null || true; die "this disk is $FS; ButterOS needs the file on ext4 or xfs (btrfs, LVM and encrypted disks are not supported yet)";; esac
case "$SRC" in /dev/mapper/*|/dev/dm-*) rmdir "$D" "$B" 2>/dev/null || true; die "this disk is LVM or encrypted ($SRC); the ButterOS boot code cannot open those yet";; esac
FREE=$(df -Pm "$D" | awk 'END{print $4}'); [ "$FREE" -ge 1500 ] || die "need 1.5 GB free on $SRC, have $FREE MB"
UUID=$(blkid -s UUID -o value "$SRC") || die "cannot read the disk id of $SRC"

if [ -z "$ISO" ]; then
  echo "Downloading ButterOS..."; command -v curl >/dev/null || die "need curl"
  curl -fL --progress-bar -o "$D/ButterOS.iso.part" "$ISO_URL" || die "download failed (the repo may be private; download the ISO yourself and use --iso)"
  curl -fsSL -o "$D/ButterOS.iso.sha256" "$ISO_URL.sha256" 2>/dev/null && { (cd "$D" && sed 's#  .*#  ButterOS.iso.part#' ButterOS.iso.sha256 | sha256sum -c - >/dev/null) || { rm -f "$D/ButterOS.iso.part"; die "checksum does not match"; }; }
  mv "$D/ButterOS.iso.part" "$D/ButterOS.iso"
else [ -f "$ISO" ] || die "no such file $ISO"; cp "$ISO" "$D/ButterOS.iso"; fi
sync

# boot files for GRUB (kernel + initramfs come out of the ISO; the ISO itself is opened at boot by ButterOS's init)
M=$(mktemp -d); mount -o loop,ro "$D/ButterOS.iso" "$M" || die "cannot open the ISO"
cp "$M/boot/vmlinuz-lts" "$M/boot/initramfs-lts" "$B/" || { umount "$M"; die "this ISO has no kernel"; }
umount "$M"; rmdir "$M"; sync

# GRUB entry (a static file, so it needs nothing from the distro's GRUB scripts)
BM=$(findmnt -no TARGET -T "$B"); BSRC=$(df -P "$B" | awk 'END{print $1}'); BUUID=$(blkid -s UUID -o value "$BSRC")
REL=${B#"$ROOT"}; [ "$BM" != "/" ] && REL=${REL#"${BM#"$ROOT"}"}; ISOREL=${D#"$ROOT"}/ButterOS.iso
[ "$ROOT" = "" ] || { BUUID=${BUUID:-$UUID}; }
cat > "$B/grub-entry.cfg" <<EOF
menuentry "ButterOS (Minecraft hosting)" --class os {
	insmod part_gpt
	insmod part_msdos
	insmod ext2
	insmod xfs
	search --no-floppy --fs-uuid --set=butterboot $BUUID
	linux (\$butterboot)$REL/vmlinuz-lts butter_iso=UUID=$UUID:$ISOREL modules=loop,squashfs,sd-mod,usb-storage ${BUTTER_KARGS:-quiet}
	initrd (\$butterboot)$REL/initramfs-lts
}
EOF
mkdir -p "$ROOT/etc/grub.d"
{ printf '#!/bin/sh\nexec tail -n +3 "$0"\n'; cat "$B/grub-entry.cfg"; } > "$G"; chmod 755 "$G"
regen
echo "Done. Restart and pick \"ButterOS (Minecraft hosting)\" in the boot menu. To undo: sudo sh $0 --remove"
