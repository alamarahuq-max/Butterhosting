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

# 2. GRUB (UEFI + BIOS-grub) menu. Dark/light picture swap is done with an extra menu entry.
mkdir -p "$W/grub/butter"
cp "$HERE/boot/bg-dark-1920x1080.png"  "$W/grub/butter/bg-dark.png"
cp "$HERE/boot/bg-light-1920x1080.png" "$W/grub/butter/bg-light.png"
for th in dark light; do
  cp "$HERE"/boot/sel-${th}_*.png "$W/grub/butter/"
  cat > "$W/grub/butter/theme-$th.txt" <<T
desktop-image: "bg-$th.png"
desktop-color: "#000000"
title-text: ""
+ boot_menu {
  left = 41%
  top = 72%
  width = 18%
  height = 17%
  item_height = 60
  item_padding = 0
  item_spacing = 0
  item_icon_space = 0
  selected_item_pixmap_style = "sel-${th}_*.png"
}
T
done
# (the light/dark entry just reloads the menu with the other picture; the choice resets at next boot, which is fine for a boot menu)
cat > "$W/grub.cfg" <<G
set timeout=-1
set default=0
insmod all_video
search --no-floppy --file --set=isoroot /boot/grub/butter/bg-dark.png
echo "butter: isoroot=[\$isoroot] root=[\$root] prefix=[\$prefix]"
if [ -n "\$isoroot" ]; then set root=\$isoroot; set prefix=(\$isoroot)/boot/grub; fi
ls (\$isoroot)/boot/grub/x86_64-efi/png.mod (\$isoroot)/boot/grub/x86_64-efi/gfxmenu.mod
insmod (\$isoroot)/boot/grub/x86_64-efi/png.mod
echo "png rc=\$?"
insmod (\$isoroot)/boot/grub/x86_64-efi/gfxmenu.mod
echo "gfxmenu rc=\$?"
insmod gfxterm
sleep 12
if loadfont /boot/grub/butter/unicode.pf2 ; then true; elif loadfont unicode ; then true; fi
set gfxmode=1920x1080,1280x720,auto
set gfxpayload=keep
terminal_output gfxterm
if ! background_image /boot/grub/butter/bg-dark.png ; then echo "butter: background_image failed"; lsmod; sleep 9; fi
if [ -z "\$butter_theme" ]; then set butter_theme=dark; fi
set theme=/boot/grub/butter/theme-\$butter_theme.txt

menuentry " " {
  linux $KFILE $KARGS butter=live
  initrd $IFILE
}
menuentry "  " {
  linux $KFILE $KARGS butter=install
  initrd $IFILE
}
if [ "\$butter_theme" = dark ]; then
  menuentry "   " {
    set butter_theme=light
    export butter_theme
    configfile /boot/grub/grub.cfg
  }
else
  menuentry "   " {
    set butter_theme=dark
    export butter_theme
    configfile /boot/grub/grub.cfg
  }
fi
G
# a font GRUB can use (small, ships with the grub package: unicode.pf2 is usually in /usr/share/grub)
ls /usr/share/grub /usr/share/fonts 2>&1 | head -20
for f in /usr/share/grub/unicode.pf2 /usr/share/grub/unifont.pf2; do [ -f "$f" ] && cp "$f" "$W/grub/butter/unicode.pf2" && break; done
[ -f "$W/grub/butter/unicode.pf2" ] && echo "grub font: bundled unicode.pf2" || echo "grub font: NOT FOUND"

for d in /usr/lib/grub/x86_64-efi /usr/lib/grub/i386-pc; do
  [ -d "$d" ] && { mkdir -p "$W/grubmods"; cp -r "$d" "$W/grubmods/$(basename $d)"; echo "grub modules: $d"; }
done
# 3. syslinux (BIOS) menu, vesamenu with a background picture
mkdir -p "$W/sys"
cp "$HERE/boot/bg-dark-800x600.png"  "$W/sys/bg-dark.png"
cp "$HERE/boot/bg-light-800x600.png" "$W/sys/bg-light.png"
for f in vesamenu.c32 libcom32.c32 libutil.c32; do
  for d in /usr/share/syslinux /usr/lib/syslinux/modules/bios; do [ -f "$d/$f" ] && cp "$d/$f" "$W/sys/$f" && break; done
done
mk_sys() { # $1 theme  $2 other theme  -> file
  if [ $1 = dark ]; then SEL="ffffd23f"; else SEL="ff3b34c9"; fi
  cat > "$3" <<S
UI vesamenu.c32
PROMPT 0
TIMEOUT 0
MENU RESOLUTION 800 600
MENU BACKGROUND bg-$1.png
MENU TITLE
MENU CLEAR
MENU MARGIN 0
MENU ROWS 5
MENU VSHIFT 21
MENU HSHIFT 33
MENU WIDTH 24
MENU TABMSG
MENU AUTOBOOT
MENU HELPMSGROW 24
MENU COLOR screen   0 #ffffffff #00000000 none
MENU COLOR border   0 #00000000 #00000000 none
MENU COLOR title    0 #00000000 #00000000 none
MENU COLOR unsel    0 #00000000 #00000000 none
MENU COLOR sel      0 #$SEL #00000000 none
MENU COLOR hotsel   0 #$SEL #00000000 none
MENU COLOR hotkey   0 #00000000 #00000000 none
MENU COLOR hotkey   0 #00000000 #00000000 none
MENU COLOR tabmsg   0 #00000000 #00000000 none
DEFAULT live
LABEL live
  MENU LABEL >
  LINUX $KFILE
  INITRD $IFILE
  APPEND $KARGS butter=live
MENU SEPARATOR
LABEL install
  MENU LABEL >
  LINUX $KFILE
  INITRD $IFILE
  APPEND $KARGS butter=install
MENU SEPARATOR
LABEL $2
  MENU LABEL >
  KERNEL vesamenu.c32
  APPEND $2.cfg
S
}
mk_sys dark  light "$W/sys/syslinux.cfg" "Light mode"
mk_sys light dark  "$W/sys/light.cfg"    "Dark mode"
cp "$W/sys/syslinux.cfg" "$W/sys/dark.cfg"

# 4. write them into the ISO (keeping the boot records Alpine made)
set -- -indev "$IN" -outdev "$OUT" -boot_image any replay \
  -map "$W/grub.cfg" /boot/grub/grub.cfg \
  -map "$W/grub/butter" /boot/grub/butter \
  -map "$W/grubmods/x86_64-efi" /boot/grub/x86_64-efi \
  -map "$W/sys" /boot/syslinux
# keep syslinux's own other .c32 files (the -map above only adds/overwrites ours)
rm -f "$OUT"
if xorriso "$@" -commit 2>&1 | tail -5; then echo "branded ISO written: $OUT"; else echo "!! branding failed, using stock menus"; cp "$IN" "$OUT"; fi
[ -s "$OUT" ] || cp "$IN" "$OUT"
