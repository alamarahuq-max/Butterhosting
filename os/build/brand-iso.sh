#!/bin/sh
# usage: brand-iso.sh in.iso out.iso
# Replaces the stock Alpine boot menus (GRUB for UEFI, syslinux for BIOS) with the ButterOS one:
# big title picture on top, 3 entries at the bottom, dark by default. If anything goes wrong the stock menu is kept,
# so you always still get a bootable ISO.
IN="$1"; OUT="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
cp "$IN" "$OUT"

# 1. read the kernel/initrd command lines Alpine itself generated, so we never guess them
xorriso -osirrox on -indev "$IN" -extract /boot/grub/grub.cfg "$W/orig-grub.cfg" 2>/dev/null || true
xorriso -osirrox on -indev "$IN" -extract /boot/syslinux/syslinux.cfg "$W/orig-sys.cfg" 2>/dev/null || true
mkdir -p "$(dirname "$OUT")/diag"; cp "$W"/orig-*.cfg "$(dirname "$OUT")/diag/" 2>/dev/null || true
KARGS=$(sed -n 's/^[[:space:]]*linux[[:space:]]\+[^ ]\+[[:space:]]\+//p' "$W/orig-grub.cfg" | head -1)
[ -n "$KARGS" ] || KARGS="modules=loop,squashfs,sd-mod,usb-storage quiet"
KARGS=$(echo "$KARGS" | sed 's/[[:space:]]*quiet//')
echo "kernel args: $KARGS"
KFILE=$(sed -n 's/^[[:space:]]*linux[[:space:]]\+\([^ ]\+\).*/\1/p' "$W/orig-grub.cfg" | head -1); [ -n "$KFILE" ] || KFILE=/boot/vmlinuz-lts
IFILE=$(sed -n 's/^[[:space:]]*initrd[[:space:]]\+\([^ ]\+\).*/\1/p' "$W/orig-grub.cfg" | head -1); [ -n "$IFILE" ] || IFILE=/boot/initramfs-lts
MODLOOP=$(echo "$KARGS" | tr ' ' '\n' | grep -c '^modloop=' || true)
echo "kernel=$KFILE initrd=$IFILE"

# 2. GRUB (UEFI + BIOS-grub): no menu at all. Plain text console, a few terminal-style lines, boots at once.
# (hold Shift / press Esc at the GRUB stage to get the old two-entry menu: Live, or Install to this computer)
cat > "$W/grub.cfg" <<G
set timeout=1
set timeout_style=hidden
set default=0
terminal_output console
echo 'ButterOS: starting (Minecraft hosting only) ...'
menuentry "ButterOS - live (RAM only)" {
  linux $KFILE $KARGS butter=live
  initrd $IFILE
}
menuentry "ButterOS - install to this computer" {
  linux $KFILE $KARGS butter=install
  initrd $IFILE
}
G
# 3. syslinux (BIOS): text mode, no picture menu, boots after half a second
mkdir -p "$W/sys"
cat > "$W/sys/syslinux.cfg" <<S
PROMPT 1
TIMEOUT 5
DEFAULT live
SAY ButterOS: starting (Minecraft hosting only) ...
SAY (type 'install' now to install to this computer)
LABEL live
  LINUX $KFILE
  INITRD $IFILE
  APPEND $KARGS butter=live
LABEL install
  LINUX $KFILE
  INITRD $IFILE
  APPEND $KARGS butter=install
S
# 4. write them into the ISO (keeping the boot records Alpine made)
set -- -indev "$IN" -outdev "$OUT" -boot_image any replay \
  -map "$W/grub.cfg" /boot/grub/grub.cfg \
  -map "$W/sys" /boot/syslinux
# keep syslinux's own other .c32 files (the -map above only adds/overwrites ours)
rm -f "$OUT"
if xorriso "$@" -commit 2>&1 | tail -5; then echo "branded ISO written: $OUT"; else echo "!! branding failed, using stock menus"; cp "$IN" "$OUT"; fi
[ -s "$OUT" ] || cp "$IN" "$OUT"
