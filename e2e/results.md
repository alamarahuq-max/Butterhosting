# ButterOS end-to-end test

KVM acceleration: True

- PASS **ISO boots straight into ButterOS with no boot menu (BIOS, shell on serial)** 
- PASS **RAM-only: root is tmpfs/ramfs, nothing mounted from a disk** 
- PASS **Docker engine runs** — docker info 2>&1 | grep -E 'Storage Driver|Cgroup|Server Version'; echo __E" | "ND1795614810787__$? |  Server Version: 28.3.3 |  Storage Driver: overlay2 |  Cgroup Driver: cgroupfs |  Cgroup Version: 2 | 
- PASS **Local web page answers (status JSON)** — {"ok": true, "mem": {"total": 3920, "avail": 3067, "os": 853, "servers": 0, "worlds": 0}, "servers": [], "ip": "10.0.2.15", "temps": [], "temp": null, "cpu": 9.78792822185971, "net_rx": 122.3958333333
- PASS **Local web page serves the UI** 
- PASS **Web agent RSS under 80 MB** — 52 MB
- PASS **Status reports engine ok and capacity advice** — ok
- PASS **Version list API: Java releases and Bedrock choices** — 103 java versions, online=True
- PASS **Old Java versions are offered (1.8.9, 1.12.2, 1.16.5)** 
- PASS **Home screen (monospace terminal UI) renders** — UTTER_DEMO=1 BUTTER_SNAPSHOT=ansi COLS=110 ROWS=34 node /usr/local/lib/butt er/tui.js | sed 's/\x1b\[[0-9;]*[mHK]//g' | grep -c -E 'SERVERS|new server|machi ne'; echo __E""ND1795614812709__$? 3 
- PASS **Console font tools and the big Terminus fonts are present (screen is readable on HD displays)** — command -v setfont >/dev/null && echo SF"_"YES; echo FN"_"$(ls /usr/share/co nsolefonts/ | grep -c -E 'ter-v(22|24|28|32)b'); echo __E""ND1795614813803__$? SF_YES FN_4 
- PASS **Text HUD fallback renders** — r/local/lib/butt
er/tui.js | head -3 | wc -l; echo __E""ND1795614814853__$?
3
- PASS **RTL8188EU adapters are steered to the separate 8188eu driver, other chips keep rtl8xxxu** — iscFFipFFin00' sh /usr/lib/butter/rtl8
xxxu-guard; modprobe -n -v rtl8xxxu 2>&1 | head -2; echo __E""ND1795614815964__$
?
15
install rtl8xxxu /usr/lib/butter/rtl8xxxu-guard
USE_8188EU
USE_RTL8XXXU
modprobe: unrecognized option: n
BusyBox v1.37.0 (2025-11-21 22:40:56 UTC) multi-call binary.
- PASS **Wi-Fi tool scripts are valid** — OK; sh -n /usr/lib/butter/load
-wifi && echo LW"_"OK; echo __E""ND1795614817127__$?
SYN_OK
LW_OK
- PASS **butter-wifid brings the cable up by itself (address and default route, no NetworkManager)** —  route | grep -q default && break; sleep 2; done;
 pgrep -f butter-wifid >/dev/null && echo WIFID"_"UP; ip route | head -2; echo _
_E""ND1795614818171__$?
WIFID_UP
default via 10.0.2.2 dev eth0  metric 202 
10.0.2.0/24 dev eth0 scope link  src 10.0.2.15
- PASS **Wi-Fi tools are in the image (iw, wpa_supplicant, dialog, butter-wifi, hot-plug daemon) and Realtek firmware** — dhcpc; do command -v $x >/dev/null && echo OK"_"$x || echo MISSING"_"$x; done;  echo FW"_"$(ls /lib/firmware/rtlwifi/ 2>/dev/null | grep -c 8188eufw); echo __E ""ND1795614819230__$? OK_iw OK_wpa_supplicant OK_butter-wifi OK_butter-wifid OK_butter-net OK_rfkill OK_dialog OK_udhcpc FW_1 
- PASS **RTL8188EU driver is shipped and built for this exact kernel** —  [ -n "$V" ] && [ "$V" =  "$(uname -r)" ] && echo DRV"_"MATCHES_KERNEL; echo K"_"$(uname -r)"_"V$V; echo  __E""ND1795614820294__$? DRV_FILE DRV_MATCHES_KERNEL K_6.12.119-0-lts_V6.12.119-0-lts 
- PASS **Hot-plug works: a Wi-Fi adapter that appears after boot is noticed by the daemon** — ep -q 'wifi adapt er ready' /var/log/butter-wifid.log 2>/dev/null && break; sleep 1; done; grep 'a dapter ready' /var/log/butter-wifid.log | tail -2; iw dev 2>&1 | head -3; echo _ _E""ND1795614821382__$? WIFID_RUNNING 13:53:41 wifi adapter ready: wlan0 phy#0 	Interface wlan0 		ifindex 4 
- PASS **butter-net sees the Wi-Fi adapter and reports status as JSON** — butter-net status; butter-net scan | head -c 200; echo __E""ND1795614823489_
_$?
{"ok":true,"ip":"10.0.2.15","wired":true,"wifi_adapter":true,"wifi_iface":"wlan0","ssid":"","saved":false}
{"ok":true,"networks":[]}
- PASS **Create Java server via web API** — {'ok': True, 'port': 25565, 'join': {'ok': True, 'join': 'bore.pub:17768'}}
- PASS **Java (Paper) server finished starting (log says Done)** — tomicHelper (file:/data/plugins/floodgate-spigot.jar)
WARNING: Please consider reporting this to the maintainers of class org.geysermc.floodgate.shadow.com.google.common.util.concurrent.AbstractFuture$UnsafeAtomicHelper
WARNING: sun.misc.Unsafe::objectFieldOffset will be removed in a future release

- PASS **Phones: Geyser's NetherNet signaling answers on TCP port 19132** — 748__$?
Connecting to 127.0.0.1:19132 (127.0.0.1:19132)
  HTTP/1.1 404 Not Found
wget: server returned error: HTTP/1.1 404 Not Found
---
[13:55:07 INFO]: [Geyser-Spigot] Built-in signaling started on http://0.0.0.0:19132
[13:55:07 INFO]: [Geyser-Spigot] Done (4.35s)! Run /geyser help for help!
- PASS **Java server answers a real Minecraft status ping** — {"description": "A Minecraft Server", "players": {"max": 20, "online": 0}, "version": {"name": "Paper 26.3", "protocol": 777}, "enforcesSecureChat": true}
- PASS **Local tab: player list works (nobody online)** — {'ok': True, 'players': []}
- PASS **Local tab: kick command reaches the server** — {'ok': True}
- PASS **Plugin install refuses links outside the allowed sites** — {'ok': False, 'error': 'Use a direct .jar link from Modrinth, Hangar or GitHub'}
- PASS **Plugin list works** — {'ok': True, 'plugins': ['Geyser-Spigot.jar', 'floodgate-spigot.jar']}
- PASS **Create with 'free internet link' produced a join address** — bore.pub:17768
- PASS **Friend on the internet can reach the server through the join link** — {"description": "A Minecraft Server", "players": {"max": 20, "online": 0}, "version": {"name": "Paper 26.3", "protocol": 777}, "enforcesSecureChat": true}
- PASS **Console: a command typed on the web page runs on the server** — wget -q -O- 'http://127.0.0.1/cgi-bin/api?a=cmd&n=test-java&c=list'; echo __
E""ND1795614925156__$?
{"ok":true,"out":"There are 0 of a max of 20 players online: \n"}
- PASS **Upload: a .jar sent from the web page lands in the server's plugins folder** — tp://127.0.0.1/cgi-bin/api?a=upload&n=test-java&f=t-up.jar'; echo; ls -l /ram
/butter/worlds/test-java/plugins/ | grep -c t-up.jar; echo __E""ND1795614926331_
_$?
{"ok":true,"file":"t-up.jar"}
1
- PASS **Upload: refuses non-.jar files** — i?a=upload&n=test-java&f=x.txt' --po
st-data=hi; echo __E""ND1795614928107__$?
{"ok":false,"error":"Only .jar files"}
- PASS **Cracked mode: turning it on sets online-mode=false** — -E '^(online-mode|enforce-secure-profile)' /ram/butter/worlds/test-java/ser
ver.properties; echo __E""ND1795614949212__$?
{"ok":true,"cracked":true}
enforce-secure-profile=false
online-mode=false
- PASS **Cracked mode: status reports it** — True
- PASS **Cracked mode: turning it off restores online-mode=true** —  echo; 
grep -E '^online-mode' /ram/butter/worlds/test-java/server.properties; echo __E"
"ND1795614992634__$?
{"ok":true,"cracked":false}
online-mode=true
- PASS **Delete the Java server (frees RAM)** 
- PASS **Create Vanilla 1.16.5 server (old Java version)** — {'ok': True, 'port': 25565, 'join': {'ok': True, 'join': 'bore.pub:57537'}}
- PASS **Vanilla 1.16.5 finished starting** —  thread/INFO]: Time elapsed: 23260 ms
[13:58:10] [Server thread/INFO]: Done (28.347s)! For help, type "help"
[13:58:10] [Server thread/INFO]: Starting remote control listener
[13:58:10] [Server thread/INFO]: Thread RCON Listener started
[13:58:10] [Server thread/INFO]: RCON running on 0.0.0.0:25575

- PASS **Vanilla 1.16.5 answers a real status ping and reports 1.16.5** — {"description": {"text": "A Minecraft Server"}, "version": {"name": "1.16.5", "protocol": 754}}
- PASS **Status shows the chosen flavor and version** — {"name": "old-java", "container": "bw-old-java", "state": "running", "type": "java", "flavor": "vanilla", "version": "1.16.5", "port": 25565, "bedrock_port": null, "join": "bore.pub:57537", "cracked": false, "players": 0, "ram": 1334, "cpu": 183.99, "motd": "A Minecraft Server", "max_players": 20, "auto_restart": true, "mem_limit": 1024, "commercial": false, "owner": ""}
- PASS **Create Bedrock server test-bed via web API** — {'ok': True, 'port': 19132, 'join': None}
- PASS **Bedrock test-bed finished starting (log says Server started)** — /11/25 13:58:30 Setting allow-list to false in server.properties
2026/11/25 13:58:30 Setting server-portv6 to 29132 in server.properties
2026/11/25 13:58:30 Setting server-ip to  in server.properties

- PASS **Create Bedrock server test-bed2 via web API** — {'ok': True, 'port': 19133, 'join': None}
- PASS **Bedrock test-bed2 finished starting (log says Server started)** — 11/25 13:58:40 Setting server-port to 19133 in server.properties
2026/11/25 13:58:40 Setting server-portv6 to 29133 in server.properties
2026/11/25 13:58:40 Setting server-ip to  in server.properties

- PASS **Bedrock allow-list is off (friends can join)** —  /ram/butter/worlds/test-bed/server.prope
rties; echo __E""ND1795615127478__$?
server-name=test-bed
allow-list=false
- PASS **Bedrock registered with Mojang's NetherNet signaling (what 26.60+ phones use; RakNet is retired)** — ['[2026-11-25 13:58:30:562 INFO] Contents of server.properties: {"allow-cheats":"false","allow-inbound-script-debugging":"false","allow-list":"false","allow-outbound-script-debugging":"false","block-network-ids-are-hashes":"true","chat-restriction":"None","client-side-chunk-generation-enabled":"true","compression-algorithm":"zlib","compression-threshold":"1","content-log-console-output-enabled":"f
- PASS **Refuses a 3rd server in live mode** — Not enough free memory: this server needs about 700 MB (estimate) and 300 MB must stay free
- PASS **Rejects an invalid name** — Slow down a moment
- PASS **Stop works** 
- PASS **Stopped server shows as not running** — exited
- PASS **Start works** 
- PASS **Delete works** 
- PASS **Web page screenshots taken** 
- PASS **cloudflared is in the image** — cloudflared --version 2>&1 | head -1; echo __E""ND1795615151552__$?
cloudflared
- PASS **Tunnel comes up and its address is stored (address not printed)** 
- PASS **API in device role is on standby (does not take over while primary is fine)** — wget -qO- http://127.0.0.1:8080/health; echo __E""ND1795615161668__$?
{"ok":true,"standby":true,"failover":"standby"}
- PASS **Device registered itself in the private registry (with a tunnel address, not shown)** — fields: ['active', 'geo', 'id', 'servers', 'ts', 'url', 'wallet']
- PASS **Installer present and target disk visible** — which butter-install && ls /dev/vda; echo __E""ND1795615165110__$? /usr/local/bin/butter-install [1;35m/dev/vda[m 
- PASS **Installer downloads, verifies checksum and writes the disk** —      0  0:00:02  0:00:02 --:--:--  192M100  573M  100  573M    0     0   187M      0  0:00:03  0:00:03 --:--:--  187M
Checksum OK. Writing to /dev/vda ...
601161728 bytes (573.3MB) copied, 1.744671 seconds, 328.6MB/s
Verified. ButterOS is installed on /dev/vda. Remove the USB stick and reboot.

- PASS **Installer refuses the disk the system booted from** — ButterOS.iso butter-install --disk /d
ev/sr0 --yes 2>&1 | tail -2; echo __E""ND1795615186018__$?
/dev/sr0 is in use

- PASS **Boots from the internal disk after install (no USB/CD)** 
- PASS **Installed system is ButterOS** — butter-box app.css core.js cursors.css 
- PASS **DualBoot A: test disk with GRUB on ext4 created** — 24c1de30-ea9b-4fb9-bab4-69028d8d87e3
Installing for i386-pc platform.
Installation finished. No error reported.

- PASS **DualBoot A: Linux installer copies ISO + boot files and writes the GRUB entry** — butter-dualboot-linux.sh --remove
/dev/loop0p1    2.9G  699M  2.1G  26% /mnt/a
menuentry "ButterOS (Minecraft hosting)" --class os {
	insmod part_gpt
	insmod part_msdos
	insmod ext2
	insmod xfs
	search --no-floppy --fs-uuid --set=butterboot 24c1de30-ea9b-4fb9-bab4-69028d8d87e3
	linux ($butterboot)/boot/butteros/vmlinuz-lts butter_iso=UUID=24c1de30-ea9b-4fb9-bab4-69028d8d87e3:/butteros/ButterOS.iso
- PASS **DualBoot A: ButterOS boots from the ISO file on the ext4 disk (BIOS)** — 
~ # [6n
~ # stty -echo cols 500 2>/dev/null
~ # ~ # SHELL_READY
~ # 
- PASS **DualBoot A: the ISO is loop-mounted and the web agent answers** — butter_iso=UUID=24c1de30-ea9b-4fb9-bab4-69028d8d87e3:/butteros/ButterOS.iso 2 butter-box {"ok":true}
- PASS **DualBoot B: test disk with an EFI partition and an NTFS partition created** — he number of heads was not specified for /dev/loop0p2 and it could not be obtained automatically.  It has been set to 0.
To boot from a device, Windows needs the 'partition start sector', the 'sectors per track' and the 'number of heads' to be set.
Windows will not be able to boot from this device.

- PASS **DualBoot B: boot files placed on the EFI partition and the ISO on the NTFS drive** — root 688128 Nov 25 14:01 BOOTX64.EFI

/mnt/e/EFI/ButterOS:
total 122728
drwxr-xr-x 2 root root       512 Nov 25 14:01 .
drwxr-xr-x 4 root root       512 Nov 25 14:01 ..
-rwxr-xr-x 1 root root       283 Nov 25 14:01 grub.cfg
-rwxr-xr-x 1 root root    688128 Nov 25 14:01 grubx64.efi
-rwxr-xr-x 1 root root 111258830 Nov 25 14:01 initramfs-lts
-rwxr-xr-x 1 root root  13727232 Nov 25 14:01 vmlinuz-lts

- PASS **DualBoot B: ButterOS boots (UEFI) from the ISO file on the NTFS drive** — [2J[001;001H[=3h[2J[001;001H[2J[001;001H[8;056;240t[2J[001;001H[2J[001;001H[=3h[2J[001;001H[2J[001;001H[8;042;160t[2J[001;001HBdsDxe: loading Boot0002 "UEFI Misc Device" from PciRoot(0x0)/Pci(0x4,0x0)
BdsDxe: starting Boot0002 "UEFI Misc Device" from PciRootsty -echo cols 500 2>/dev/null

echo SHELL_READY

~ # [6n
~ # echo SHELL_READY
SHELL_READY
~ # [6n
- PASS **DualBoot B: NTFS read, ISO loop-mounted, web agent answers** — /ButterOS/ButterOS.iso /dev/vda2 on /media/hostdisk type ntfs (ro,relatime,uid=0,gid=0,iocharset=utf8) /media/hostdisk/ButterOS/ButterOS.iso on /media/butteriso type iso9660 (ro,relatime,nojoli /media/butteriso/boot/modloop-lts on /.modloop type squashfs (ro,relatime,errors=continue) {"ok":true}
- PASS **ISO is a hybrid image (MBR boot signature 55aa, so it works written raw to a USB stick)** — out/ButterOS.iso: ISO 9660 CD-ROM filesystem data (DOS/MBR boot sector) 'alpine-butteros butteros x86_64' (bootable) 55aa
- PASS **USB stick boot (BIOS): ButterOS starts from the raw ISO on a USB disk** — tmpfs on / type tmpfs (rw,relatime,mode=755,inode64) BOOT_IMAGE=/boot/vmlinuz-lts modules=loop,squashfs,sd-mod,usb-storage  butter=live initrd=/boot/initramfs-lts /dev/sda /dev/sda1 
- PASS **USB stick boot (UEFI): ButterOS starts from the raw ISO on a USB disk** — mount | grep -E '^(tmpfs|rootfs|none) on / ' | head -1; cat /proc/cmdline |  cut -c1-120; ls /dev/sd* 2>/dev/null | head -2; echo __E""ND1795615413441__$? tmpfs on / type tmpfs (rw,relatime,mode=755,inode64) BOOT_IMAGE=/boot/vmlinuz-lts modules=loop,squashfs,sd-mod,usb-storage butter=live /dev/sda /dev/sda1 

Idle:
```
cat /etc/hostname; uname -r; free -m | sed -n 2p; echo __E""ND1795614807663_
_$?
butter-box
6.12.119-0-lts
Mem:           3920         177        2807         442         936        3067

```
Status after Java:
```
{"mem": {"total": 3920, "avail": 344, "os": 1790, "servers": 1786, "worlds": 0}, "web_rss_mb": 73.8, "capacity": {"java_need": 1536, "bedrock_need": 700, "keep_free": 300, "java_fits": false, "bedrock_fits": false, "estimate": true}}
```
Status after 2 Bedrock:
```
{"mem": {"total": 3920, "avail": 914, "os": 1953, "servers": 1053, "worlds": 0}, "web_rss_mb": 76, "capacity": {"java_need": 1536, "bedrock_need": 700, "keep_free": 300, "java_fits": false, "bedrock_fits": false, "estimate": true}, "servers": [{"name": "test-bed2", "container": "bw-test-bed2", "state": "running", "type": "bedrock", "flavor": "bedrock", "version": "LATEST", "port": 19133, "bedrock_port": 19133, "join": null, "cracked": false, "players": null, "ram": 527, "cpu": 1.32, "motd": "", "max_players": 10, "auto_restart": true, "mem_limit": 1536, "commercial": false, "owner": ""}, {"name": "test-bed", "container": "bw-test-bed", "state": "running", "type": "bedrock", "flavor": "bedrock", "version": "LATEST", "port": 19132, "bedrock_port": 19132, "join": null, "cracked": false, "players": null, "ram": 526, "cpu": 1.27, "motd": "", "max_players": 10, "auto_restart": true, "mem_limit": 1536, "commercial": false, "owner": ""}]}
```
DualBoot A installer output:
```
Done. Restart and pick "ButterOS (Minecraft hosting)" in the boot menu. To undo: sudo sh /home/runner/work/Butterhosting/Butterhosting/os/dualboot/butter-dualboot-linux.sh --remove
/dev/loop0p1    2.9G  699M  2.1G  26% /mnt/a
menuentry "ButterOS (Minecraft hosting)" --class os {
	insmod part_gpt
	insmod part_msdos
	insmod ext2
	insmod xfs
	search --no-floppy --fs-uuid --set=butterboot 24c1de30-ea9b-4fb9-bab4-69028d8d87e3
	linux ($butterboot)/boot/butteros/vmlinuz-lts butter_iso=UUID=24c1de30-ea9b-4fb9-bab4-69028d8d87e3:/butteros/ButterOS.iso modules=loop,squashfs,sd-mod,usb-storage quiet
	initrd ($butterboot)/boot/butteros/initramfs-lts
}

```
NTFS id as read by blkid: 2105D9D441C67D54