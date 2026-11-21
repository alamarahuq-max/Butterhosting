# ButterOS end-to-end test

KVM acceleration: True

- PASS **ISO boots straight into ButterOS with no boot menu (BIOS, shell on serial)** 
- PASS **RAM-only: root is tmpfs/ramfs, nothing mounted from a disk** 
- PASS **Docker engine runs** — docker info 2>&1 | grep -E 'Storage Driver|Cgroup|Server Version'; echo __E" | "ND1795264333644__$? |  Server Version: 28.3.3 |  Storage Driver: overlay2 |  Cgroup Driver: cgroupfs |  Cgroup Version: 2 | 
- PASS **Local web page answers (status JSON)** — {"ok": true, "mem": {"total": 3920, "avail": 2856, "os": 1064, "servers": 0, "worlds": 0}, "web_rss_mb": 0.7, "limit_web_mb": 30, "temps": [], "cpu_total": 6555, "cpu_idle": 4832, "net_rx": 2473, "net
- PASS **Local web page serves the UI** 

Idle:
```
cat /etc/hostname; uname -r; free -m | sed -n 2p; echo __E""ND1795264330504_
_$?
butter-box
6.12.118-0-lts
Mem:           3920         168        2408         685        1345        2854

```
Memory diagnostics:
```
du -xsm /lib/firmware/* 2>/dev/null | sort -rn | head -28; echo BIN; du -xsm
 /usr/bin/* 2>/dev/null | sort -rn | head -14; echo LIBEXEC; du -xsm /usr/libexe
c/* /usr/libexec/*/* 2>/dev/null | sort -rn | head -10; echo ULIB; du -xsm /usr/
lib/* 2>/dev/null | sort -rn | head -8; echo __E""ND1795264335340__$?
41	/lib/firmware/nvidia
26	/lib/firmware/amdgpu
24	/lib/firmware/intel
23	/lib/firmware/mediatek
23	/lib/firmware/ath11k
10	/lib/firmware/i915
9	/lib/firmware/ath10k
8	/lib/firmware/brcm
5	/lib/firmware/cypress
4	/lib/firmware/rtw89
2	/lib/firmware/radeon
2	/lib/firmware/phanfw.bin.zst
1	/lib/firmware/wsm_22.bin.zst
1	/lib/firmware/wil6210.fw.zst
1	/lib/firmware/wil6210.brd.zst
1	/lib/firmware/whiteheat_loader.fw.zst
1	/lib/firmware/whiteheat.fw.zst
1	/lib/firmware/vntwusb.fw.zst
1	/lib/firmware/v4l-cx25840.fw.zst
1	/lib/firmware/v4l-cx23885-avcore-01.fw.zst
1	/lib/firmware/v4l-cx23418-dig.fw.zst
1	/lib/firmware/v4l-cx23418-cpu.fw.zst
1	/lib/firmware/v4l-cx23418-apu.fw.zst
1	/lib/firmware/v4l-cx231xx-avcore-01.fw.zst
1	/lib/firmware/usbduxsigma_firmware.bin.zst
1	/lib/firmware/usbduxfast_firmware.bin.zst
1	/lib/firmware/usbdux_firmware.bin.zst
1	/lib/firmware/tsse_firmware.bin.zst
BIN
74	/usr/bin/dockerd
54	/usr/bin/node
43	/usr/bin/containerd
39	/usr/bin/cloudflared
31	/usr/bin/docker
12	/usr/bin/runc
9	/usr/bin/containerd-shim-runc-v2
3	/usr/bin/docker-proxy
3	/usr/bin/bore
1	/usr/bin/whereis
1	/usr/bin/wcurl
1	/usr/bin/wall
1	/usr/bin/waitpid
1	/usr/bin/uuidparse
LIBEXEC
69	/usr/libexec/docker
2	/usr/libexec/rc
1	/usr/libexec/rc/version
1	/usr/libexec/p11-kit/trust-extract-compat
1	/usr/libexec/p11-kit/p11-kit-remote
1	/usr/libexec/p11-kit
1	/usr/libexec/ifupdown-ng/wifi
1	/usr/libexec/ifupdown-ng/static
1	/usr/libexec/ifupdown-ng/link
1	/usr/libexec/ifupdown-ng/ipv6-ra
ULIB
33	/usr/lib/butter
5	/usr/lib/libcrypto.so.3
3	/usr/lib/libstdc++.so.6.0.33
3	/usr/lib/libicui18n.so.76.1
2	/usr/lib/xtables
2	/usr/lib/libunistring.so.5.2.0
2	/usr/lib/libsqlite3.so.3.49.2
2	/usr/lib/libp11-kit.so.0.4.8

```