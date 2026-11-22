# ButterOS end-to-end test

KVM acceleration: True

- PASS **ISO boots straight into ButterOS with no boot menu (BIOS, shell on serial)** 
- PASS **RAM-only: root is tmpfs/ramfs, nothing mounted from a disk** 
- PASS **Docker engine runs** — docker info 2>&1 | grep -E 'Storage Driver|Cgroup|Server Version'; echo __E" | "ND1795358895608__$? |  Server Version: 28.3.3 |  Storage Driver: overlay2 |  Cgroup Driver: cgroupfs |  Cgroup Version: 2 | 

Idle:
```
cat /etc/hostname; uname -r; free -m | sed -n 2p; echo __E""ND1795358892489_
_$?
butter-box
6.12.118-0-lts
Mem:           3920         165        2800         456         955        3049

```
nmcli:
```
nmcli -t device 2>&1 | head; nmcli device wifi list 2>&1 | head -5; echo __E
""ND1795358939895__$?
eth0:ethernet:connected:Wired connection 1
wlan0:wifi:unavailable:
docker0:bridge:unmanaged:
lo:loopback:unmanaged:
hwsim0:unknown:unmanaged:
IN-USE  BSSID  SSID  MODE  CHAN  RATE  SIGNAL  BARS  SECURITY 

```