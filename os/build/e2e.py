#!/usr/bin/env python3
"""End-to-end test of the ButterOS ISO in QEMU. Writes results.md + screenshots into $OUTDIR.
Needs: qemu-system-x86_64, an ISO, internet for the guest (docker pulls, Paper download)."""
import os, sys, time, json, socket, subprocess, urllib.request, urllib.parse, struct, re, shutil

ISO = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
KVM = os.path.exists("/dev/kvm") and os.access("/dev/kvm", os.W_OK)
RES = []
def log(*a):
    print(*a, flush=True)
def check(name, ok, detail=""):
    RES.append((name, bool(ok), str(detail)[:400])); log(("PASS " if ok else "FAIL ") + name, detail)
def flush_results(extra=""):
    with open(os.path.join(OUT, "results.md"), "w") as f:
        f.write("# ButterOS end-to-end test\n\nKVM acceleration: %s\n\n" % KVM)
        for n, ok, d in RES: f.write("- %s **%s** %s\n" % ("PASS" if ok else "FAIL", n, ("— " + d) if d else ""))
        f.write("\n" + extra)

class VM:
    def __init__(self, name, args, port_off=0):
        self.name = name; self.ser = "/tmp/%s.ser" % name; self.mon = "/tmp/%s.mon" % name
        for p in (self.ser, self.mon):
            if os.path.exists(p): os.remove(p)
        cmd = ["qemu-system-x86_64", "-m", "4096", "-smp", "2", "-vga", "std", "-display", "none",
               "-serial", "unix:%s,server,nowait" % self.ser, "-monitor", "unix:%s,server,nowait" % self.mon,
               "-nic", "user,model=e1000,hostfwd=tcp::%d-:80,hostfwd=tcp::%d-:25565,hostfwd=udp::%d-:19132" % (8081 + port_off, 25565 + port_off, 19132 + port_off)] + args
        cmd += (["-accel", "kvm", "-cpu", "host"] if KVM else ["-accel", "tcg"])
        self.p = subprocess.Popen(cmd); self.sock = None; self.buf = b""
        for _ in range(60):
            if os.path.exists(self.ser): break
            time.sleep(0.5)
        self.sock = socket.socket(socket.AF_UNIX); self.sock.connect(self.ser); self.sock.settimeout(1)
    def mon_cmd(self, c):
        s = socket.socket(socket.AF_UNIX); s.connect(self.mon); s.settimeout(2)
        try: s.recv(4096)
        except Exception: pass
        s.send((c + "\n").encode()); time.sleep(1); s.close()
    def shot(self, name):
        ppm = os.path.join(OUT, name + ".ppm"); self.mon_cmd("screendump " + ppm)
        try: subprocess.run(["convert", ppm, os.path.join(OUT, name + ".png")], check=True); os.remove(ppm)
        except Exception as e: log("screenshot failed", e)
    def read(self, secs):
        end = time.time() + secs
        while time.time() < end:
            try:
                d = self.sock.recv(65536)
                if d: self.buf += d
            except socket.timeout: pass
            except OSError: break
    def wait_for(self, pat, timeout):
        end = time.time() + timeout
        while time.time() < end:
            self.read(1)
            if re.search(pat, self.buf.decode(errors="ignore")): return True
        return False
    def sh(self, cmd, timeout=120):
        n = str(int(time.time() * 1000)); tag = "__END" + n + "__"
        self.buf = b""
        # the marker is built from two pieces so the terminal echo of this line can never match it
        self.sock.send(("%s; echo __E\"\"ND%s__$?\n" % (cmd, n)).encode())
        end = time.time() + timeout
        while time.time() < end:
            self.read(1)
            txt = self.buf.decode(errors="ignore")
            m = re.search(tag + r"(\d+)", txt)
            if m: return int(m.group(1)), txt[:m.start()]
        return 124, self.buf.decode(errors="ignore")
    def boot_to_shell(self, first_enter=True, timeout=300):
        if first_enter:
            time.sleep(25); self.shot(self.name + "-menu"); self.mon_cmd("sendkey ret")
        self.sock.send(b"\nstty -echo cols 500 2>/dev/null\n"); t0 = time.time()
        while time.time() - t0 < timeout:
            self.sock.send(b"\necho SHELL_READY\n"); self.read(3)
            if b"SHELL_READY" in self.buf.replace(b"echo SHELL_READY", b""): return True
        return False
    def kill(self):
        try: self.p.kill()
        except Exception: pass

def http(path, port=8081, timeout=20):
    with urllib.request.urlopen("http://127.0.0.1:%d%s" % (port, path), timeout=timeout) as r: return json.loads(r.read())
def api(q, port=8081, timeout=60):
    try: return http("/cgi-bin/api?" + q, port, timeout)
    except Exception as e: return {"ok": False, "error": "http: %s" % e}

def mc_ping(port=25565):
    s = socket.create_connection(("127.0.0.1", port), timeout=10)
    def vi(n):
        o = b""
        while True:
            b = n & 0x7F; n >>= 7
            o += bytes([b | (0x80 if n else 0)])
            if not n: return o
    host = b"localhost"; pkt = b"\x00" + vi(765) + vi(len(host)) + host + struct.pack(">H", port) + vi(1)
    s.send(vi(len(pkt)) + pkt); s.send(b"\x01\x00")
    data = b""
    while len(data) < 20:
        c = s.recv(65536)
        if not c: break
        data += c
        if b'"players"' in data and data.rstrip().endswith(b"}"): break
    s.close(); m = re.search(rb'\{.*\}', data); return json.loads(m.group(0)) if m else None

def raknet_ping(port=19132):
    magic = bytes.fromhex("00ffff00fefefefefdfdfdfd12345678")
    pkt = b"\x01" + struct.pack(">q", 1) + magic + struct.pack(">q", 2)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.settimeout(5)
    for _ in range(5):
        s.sendto(pkt, ("127.0.0.1", port))
        try:
            d, _ = s.recvfrom(4096)
            if d[:1] == b"\x1c": return d[35:].decode(errors="ignore")
        except socket.timeout: pass
    return None

def main():
    extra = []
    vm = VM("live", ["-cdrom", ISO, "-boot", "d", "-drive", "file=/tmp/target.img,if=virtio,format=raw"])
    try:
        ok = vm.boot_to_shell()
        check("ISO boots (BIOS menu -> Live USB -> shell on serial)", ok)
        if not ok: vm.shot("live-fail"); flush_results(vm.buf.decode(errors="ignore")[-3000:]); return
        vm.sh("killall dialog 2>/dev/null; true")
        c, o = vm.sh("cat /etc/hostname; uname -r; free -m | sed -n 2p"); extra.append("Idle:\n```\n" + o + "\n```")
        check("RAM-only: root is tmpfs/ramfs, nothing mounted from a disk", vm.sh("mount | grep -E '^(tmpfs|rootfs|none) on / '")[0] == 0)
        # docker
        for _ in range(30):
            if vm.sh("docker info >/dev/null 2>&1")[0] == 0: break
            time.sleep(3)
        c, o = vm.sh("docker info 2>&1 | grep -E 'Storage Driver|Cgroup|Server Version'"); check("Docker engine runs", c == 0, o.replace("\n", " | "))
        # web agent
        st = {}
        for _ in range(30):
            st = api("a=status")
            if st.get("ok"): break
            time.sleep(2)
        check("Local web page answers (status JSON)", st.get("ok"), json.dumps(st)[:200])
        if not st.get("ok"):
            c, o = vm.sh("rc-status -a 2>&1 | head -40; echo ---; ps w | grep -E 'httpd|node|dockerd' | grep -v grep; echo ---; netstat -ltn; echo ---; ip -4 a | grep inet; echo ---; tail -15 /var/log/messages; echo ---; tail -15 /var/log/butterhosting.log; echo ---; ls -l /opt/butterweb /opt/butterweb/cgi-bin; cat /opt/butterweb/httpd.conf; busybox httpd --help 2>&1 | head -3; rc-service butterweb restart 2>&1; sleep 2; netstat -ltn | grep ':80 '", 60)
            extra.append("Diagnostics (web page down):\n```\n" + o + "\n```"); open(os.path.join(OUT, "diag-web.txt"), "w").write(o)
        try:
            html = urllib.request.urlopen("http://127.0.0.1:8081/", timeout=10).read().decode()
            check("Local web page serves the UI", "Butter" in html and "Overview" in html)
        except Exception as e: check("Local web page serves the UI", False, e)
        rss = st.get("web_rss_mb", 99); check("Web agent RSS under 30 MB", rss is not None and rss < 30, "%s MB" % rss)
        check("Status reports engine ok and capacity advice", st.get("engine") == "ok" and "capacity" in st, st.get("engine"))
        # Java server
        r = api("a=create&n=test-java&type=java&mem=1024", timeout=900) if st.get("ok") else {"ok": False, "error": "skipped, web page is down"}; check("Create Java server via web API", r.get("ok"), r)
        lg = ""
        up = False
        for i in range(90 if st.get('ok') else 0):
            lg = api("a=logs&n=test-java").get("logs", "")
            if re.search(r"Done \(", lg): up = True; break
            time.sleep(10)
        check("Java (Paper) server finished starting (log says Done)", up, lg[-300:])
        if up:
            try: p = mc_ping(); check("Java server answers a real Minecraft status ping", p and "players" in p, json.dumps(p)[:200])
            except Exception as e: check("Java server answers a real Minecraft status ping", False, e)
        st = api("a=status"); extra.append("Status after Java:\n```\n" + json.dumps({k: st.get(k) for k in ("mem", "web_rss_mb", "capacity")}) + "\n```")
        # Bedrock
        r = api("a=create&n=test-bed&type=bedrock", timeout=900) if st.get("ok") else {"ok": False, "error": "skipped"}; check("Create Bedrock server via web API", r.get("ok"), r)
        up = False
        for i in range(60 if st.get('ok') else 0):
            lg = api("a=logs&n=test-bed").get("logs", "")
            if "Server started" in lg: up = True; break
            time.sleep(10)
        check("Bedrock server finished starting (log says Server started)", up, lg[-300:])
        if up:
            pong = raknet_ping(); check("Bedrock answers a RakNet ping on UDP", pong is not None, pong)
        st = api("a=status"); extra.append("Status after Bedrock:\n```\n" + json.dumps({k: st.get(k) for k in ("mem", "web_rss_mb", "capacity", "servers")}) + "\n```")
        json.dump(st, open(os.path.join(OUT, "status-final.json"), "w"), indent=1)
        # limits / safety
        r = api("a=create&n=third&type=bedrock"); check("Refuses a 3rd server in live mode", not r.get("ok"), r.get("error"))
        r = api("a=create&n=bad%20name&type=java"); check("Rejects an invalid name", not r.get("ok"), r.get("error"))
        # control
        check("Stop works", api("a=stop&n=test-bed").get("ok"))
        time.sleep(3); sv = {s["name"]: s for s in api("a=status").get("servers", [])}
        check("Stopped server shows as not running", sv.get("test-bed", {}).get("state") != "running", sv.get("test-bed", {}).get("state"))
        check("Start works", api("a=start&n=test-bed").get("ok"))
        check("Delete works", api("a=delete&n=test-bed").get("ok"))
        # screenshots of the web page (done by the workflow with playwright)
        r = subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "webshots.js"), OUT], capture_output=True, text=True)
        log(r.stdout, r.stderr); check("Web page screenshots taken", r.returncode == 0, r.stderr[-200:])
        vm.shot("live-after-servers")
        # installer: serve the ISO from the host
        ip = "10.0.2.2"
        c, o = vm.sh("which butter-install && ls /dev/vda", 20); check("Installer present and target disk visible", c == 0, o.replace("\n", " "))
        c, o = vm.sh("cd /tmp && BUTTER_ISO_URL=http://%s:8000/ButterOS.iso butter-install --disk /dev/vda --yes 2>&1 | tail -6" % ip, 900)
        check("Installer downloads, verifies checksum and writes the disk", "Verified" in o, o[-300:])
        c, o = vm.sh("BUTTER_ISO_URL=http://%s:8000/ButterOS.iso butter-install --disk /dev/sr0 --yes 2>&1 | tail -2" % ip, 60)
        check("Installer refuses the disk the system booted from", "not an allowed" in o or "not a disk" in o, o[-120:])
        vm.sh("poweroff", 5); time.sleep(5)
    finally:
        vm.kill()
    # boot from the installed disk only
    vm2 = VM("installed", ["-drive", "file=/tmp/target.img,if=virtio,format=raw", "-boot", "c"], port_off=10)
    try:
        ok = vm2.boot_to_shell(timeout=240)
        check("Boots from the internal disk after install (no USB/CD)", ok)
        if ok:
            vm2.sh("killall dialog 2>/dev/null; true")
            c, o = vm2.sh("cat /etc/hostname; ls /opt/butterweb | head -3"); check("Installed system is ButterOS", "butter-box" in o, o.replace("\n", " "))
            vm2.shot("installed-boot")
    finally:
        vm2.kill()
    flush_results("\n".join(extra))
try:
    main()
finally:
    flush_results()
    sys.exit(0)
