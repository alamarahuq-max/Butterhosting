#!/bin/sh
# Runs INSIDE an Alpine container (see build.sh / the GitHub Actions workflow). Builds the ButterOS ISO with Alpine's own mkimage.
set -eu
SRC="${SRC:-/work}"
OUT="${OUT:-/work/out}"
ALPINE_BRANCH="${ALPINE_BRANCH:-3.22}"
mkdir -p "$OUT"

echo "== packages for the build"
apk add --no-cache alpine-sdk alpine-conf apk-tools abuild squashfs-tools xorriso mtools dosfstools \
  grub grub-efi grub-bios syslinux git sudo bash coreutils fakeroot e2fsprogs python3 >/dev/null

echo "== build user + signing key"
adduser -D build 2>/dev/null || true
addgroup build abuild 2>/dev/null || true
echo "build ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/build
su build -c 'abuild-keygen -i -a -n' >/dev/null 2>&1 || su build -c 'abuild-keygen -a -n' 

echo "== aports (profile scripts), branch ${ALPINE_BRANCH}-stable"
su build -c "git clone --depth=1 --branch ${ALPINE_BRANCH}-stable https://gitlab.alpinelinux.org/alpine/aports.git /home/build/aports" \
 || su build -c "git clone --depth=1 --branch ${ALPINE_BRANCH}-stable https://github.com/alpinelinux/aports.git /home/build/aports"
S=/home/build/aports/scripts
install -m 644 -o build "$SRC/os/build/mkimg.butteros.sh" "$S/mkimg.butteros.sh"
install -m 755 -o build "$SRC/os/build/genapkovl-butteros.sh" "$S/genapkovl-butteros.sh"

# optional packages: only add the ones this Alpine release actually has (names change between releases)
apk update >/dev/null 2>&1 || apk update
OPT=""
for p in linux-firmware-rtl_nic linux-firmware-i915 linux-firmware-radeon \
         docker docker-openrc nodejs dialog e2fsprogs exfatprogs dosfstools util-linux lsblk chrony ethtool pciutils usbutils parted rsync terminus-font busybox-extras jq curl iptables ip6tables \
         wpa_supplicant iw wireless-regdb wireless-tools rfkill linux-firmware-rtlwifi linux-firmware-rtl_bt linux-firmware-rtw88 linux-firmware-rtw89 linux-firmware-mediatek linux-firmware-ath9k_htc linux-firmware-iwlwifi linux-firmware-brcm; do
  if [ -n "$(apk search -e "$p" 2>/dev/null)" ]; then OPT="$OPT $p"; else echo "   (skipping $p: not in this release)"; fi
done
# cloudflared (free quick tunnel for failover) is not packaged for Alpine 3.22: fetch the official static binary
apk add --no-cache curl >/dev/null 2>&1
if curl -fsSL -o /home/build/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && [ -s /home/build/cloudflared ]; then chmod 755 /home/build/cloudflared; chown build /home/build/cloudflared; echo "   cloudflared downloaded"; else rm -f /home/build/cloudflared; echo "   (no cloudflared: failover tunnel will not work in this build)"; fi
# bore (free TCP relay client for "butter play" join links)
BU=$(curl -fsSL https://api.github.com/repos/ekzhang/bore/releases/latest | grep -o 'https://[^"]*x86_64-unknown-linux-musl.tar.gz' | head -1)
if [ -n "$BU" ] && curl -fsSL -o /tmp/bore.tgz "$BU" && tar -xzf /tmp/bore.tgz -C /home/build bore 2>/dev/null && [ -s /home/build/bore ]; then chmod 755 /home/build/bore; chown build /home/build/bore; echo "   bore downloaded"; else echo "   (no bore: butter play will be local network only)"; fi
# Out-of-tree RTL8188EU driver (the Alpine kernel has none). Best effort: a failure here only means that one adapter family is missing.
echo "== rtl8188eu driver (best effort)"
( set +e; apk add --no-cache linux-lts-dev build-base git >/dev/null 2>&1
  KS=$(ls -d /usr/src/linux-headers-* 2>/dev/null | head -1); KV=${KS##*linux-headers-}; echo "   headers: $KS  kernel: $KV"
  for R in https://github.com/lwfinger/rtl8188eu.git https://github.com/aircrack-ng/rtl8188eus.git; do
    rm -rf /tmp/r8188; git clone --depth 1 "$R" /tmp/r8188 >/dev/null 2>&1 || { echo "   clone failed: $R"; continue; }
    ( cd /tmp/r8188 && make -j"$(nproc)" KVER="$KV" KSRC="$KS" >/tmp/r8188.log 2>&1 )
    if [ -f /tmp/r8188/8188eu.ko ]; then cp /tmp/r8188/8188eu.ko /home/build/8188eu.ko; chown build /home/build/8188eu.ko; echo "   8188eu.ko built from $R for $KV"; break
    else echo "   build failed for $R:"; grep -E "error|Error" /tmp/r8188.log | head -5; fi
  done ) || true
echo "$OPT" > /home/build/butter-apks.txt; chown build /home/build/butter-apks.txt

echo "== initramfs: boot from an ISO file on an existing disk (dual-boot)"
sh "$SRC/os/build/patch-init.sh"

echo "== mkimage"
chown -R build /work/out
su build -c "cd /home/build/aports/scripts && BUTTER_SRC=$SRC BUTTER_APKS_FILE=/home/build/butter-apks.txt \
  sh mkimage.sh --tag butteros --outdir $OUT --arch x86_64 \
  --repository https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_BRANCH}/main \
  --repository https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_BRANCH}/community \
  --profile butteros"

ISO=$(ls "$OUT"/*.iso | head -1)
echo "== branded boot menus: $ISO"
sh "$SRC/os/build/brand-iso.sh" "$ISO" "$OUT/ButterOS.iso"
rm -f "$ISO"
( cd "$OUT" && sha256sum ButterOS.iso > ButterOS.iso.sha256 && ls -lh )
