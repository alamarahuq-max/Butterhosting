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
for p in linux-firmware-rtl_nic linux-firmware-i915 linux-firmware-amdgpu linux-firmware-radeon linux-firmware-nvidia linux-firmware-intel \
         docker docker-openrc nodejs dialog e2fsprogs exfatprogs dosfstools util-linux lsblk chrony ethtool pciutils usbutils parted rsync busybox-extras jq curl iptables ip6tables; do
  if [ -n "$(apk search -e "$p" 2>/dev/null)" ]; then OPT="$OPT $p"; else echo "   (skipping $p: not in this release)"; fi
done
# cloudflared (free quick tunnel for failover) is not packaged for Alpine 3.22: fetch the official static binary
apk add --no-cache curl >/dev/null 2>&1
if curl -fsSL -o /home/build/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && [ -s /home/build/cloudflared ]; then chmod 755 /home/build/cloudflared; chown build /home/build/cloudflared; echo "   cloudflared downloaded"; else rm -f /home/build/cloudflared; echo "   (no cloudflared: failover tunnel will not work in this build)"; fi
echo "$OPT" > /home/build/butter-apks.txt; chown build /home/build/butter-apks.txt

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
