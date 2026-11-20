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
_X = []
def flush_results(extra=""):
    extra = extra or "\n".join(_X)
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
            try: self.sock.send(b"\necho SHELL_READY\n")
            except OSError: time.sleep(3)
            self.read(3)
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

def mc_ping(port=25565, host="127.0.0.1"):
    s = socket.create_connection((host, port), timeout=15)
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
    extra = _X
    if os.environ.get('ONLY_DUALBOOT'): dualboot(ISO); usbboot(ISO); flush_results(); return
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
            c, o = vm.sh("rc-status -a 2>&1 | head -40; echo ---; ps w | grep -E 'httpd|node|dockerd' | grep -v grep; echo ---; netstat -ltn; echo ---; ip -4 a | grep inet; echo ---; tail -15 /var/log/messages; echo ---; tail -15 /var/log/butterhosting.log; echo ---; ls -l /opt/butterweb /opt/butterweb/cgi-bin; cat /opt/butterweb/httpd.conf; busybox-extras httpd --help 2>&1 | head -3; which busybox-extras; rc-service butterweb restart 2>&1; sleep 2; netstat -ltn | grep ':80 '", 60)
            extra.append("Diagnostics (web page down):\n```\n" + o + "\n```"); open(os.path.join(OUT, "diag-web.txt"), "w").write(o)
        try:
            html = urllib.request.urlopen("http://127.0.0.1:8081/", timeout=10).read().decode()
            check("Local web page serves the UI", "Butter" in html and "Overview" in html)
        except Exception as e: check("Local web page serves the UI", False, e)
        if os.environ.get("ONLY_BEDROCK"):
            ping = 'const d=require("dgram").createSocket("udp4");const m=Buffer.from("00ffff00fefefefefdfdfdfd12345678","hex");const p=Buffer.concat([Buffer.from([1]),Buffer.alloc(8),m,Buffer.alloc(8)]);d.on("message",b=>{console.log("PONG"+b[0]);process.exit(0)});setInterval(()=>d.send(p,19132,"127.0.0.1"),500);setTimeout(()=>{console.log("NOPONG");process.exit(1)},8000)'
            for ver in os.environ.get("BEDROCK_VERS", "LATEST").split(","):
                r = api("a=create&n=bb&type=bedrock&ver=%s" % ver, timeout=900); check("Create Bedrock %s" % ver, r.get("ok"), r)
                for i in range(40):
                    lg = api("a=logs&n=bb").get("logs", "")
                    if "Server started" in lg or "failed to download" in lg: break
                    time.sleep(8)
                time.sleep(15)
                pg = vm.sh("node -e '" + ping + "' 2>&1 | tail -1", 30)[1].strip().splitlines()[-1:]
                check("Bedrock %s answers RakNet ping inside the machine" % ver, pg == ["PONG28"], pg)
                c, o = vm.sh("P=$(pgrep -f 'bedrock_server' | tail -1); echo PID $P; ls -l /proc/$P/fd 2>&1 | grep -c socket; cat /proc/$P/net/udp6 | cut -c1-90; cat /proc/$P/net/udp | cut -c1-90; echo NETNS; readlink /proc/$P/ns/net /proc/1/ns/net; echo LOG; docker logs bw-bb 2>&1 | cut -c1-200 | tail -45; echo CAP; grep -E 'Cap|Seccomp|NoNewPrivs' /proc/$P/status; echo FLAGS; grep -m1 flags /proc/cpuinfo | tr ' ' '\n' | grep -cE 'avx|sse4'", 60)
                extra.append("Bedrock %s diagnostics:\n```\n%s\n```" % (ver, o[-5000:]))
                api("a=delete&n=bb"); time.sleep(6)
            flush_results(); return
        rss = st.get("web_rss_mb", 99); check("Web agent RSS under 30 MB", rss is not None and 0 < rss < 30, "%s MB" % rss)
        check("Status reports engine ok and capacity advice", st.get("engine") == "ok" and "capacity" in st, st.get("engine"))
        # versions, GUI, Wi-Fi
        vj = api("a=versions", timeout=60); check("Version list API: Java releases and Bedrock choices", vj.get("ok") and len(vj.get("java", [])) > 20 and "LATEST" in vj.get("bedrock", []), "%d java versions, online=%s" % (len(vj.get("java", [])), vj.get("online")))
        check("Old Java versions are offered (1.8.9, 1.12.2, 1.16.5)", all(v in vj.get("java", []) for v in ("1.8.9", "1.12.2", "1.16.5")), "")
        c, o = vm.sh("BUTTER_DEMO=1 BUTTER_SNAPSHOT=ansi COLS=110 ROWS=34 node /usr/local/lib/butter/tui.js | sed 's/\\x1b\\[[0-9;]*[mHK]//g' | grep -c -E 'SERVERS|new server|machine'", 60)
        check("Home screen (monospace terminal UI) renders", re.search(r"\n3\s", o + " ") is not None or o.strip().endswith("3"), o.replace("\n", " ")[-200:])
        c, o = vm.sh("command -v setfont >/dev/null && echo SF\"_\"YES; echo FN\"_\"$(ls /usr/share/consolefonts/ | grep -c -E 'ter-v(22|24|28|32)b')", 20)
        check("Console font tools and the big Terminus fonts are present (screen is readable on HD displays)", "SF_YES" in o and re.search(r"FN_[1-9]", o), o.replace("\n", " ")[-200:])
        c, o = vm.sh("BUTTER_DEMO=1 BUTTER_SNAPSHOT=ansi COLS=100 ROWS=32 node /usr/local/lib/butter/tui.js | head -3 | wc -l", 30); check("Text HUD fallback renders", o.strip().endswith("3"), o.strip()[-80:])
        c, o = vm.sh("for x in iw wpa_supplicant butter-wifi butter-wifid rfkill dialog udhcpc; do command -v $x >/dev/null && echo OK\"_\"$x || echo MISSING\"_\"$x; done; echo FW\"_\"$(ls /lib/firmware/rtlwifi/ 2>/dev/null | grep -c 8188eufw)", 30)
        check("Wi-Fi tools are in the image (iw, wpa_supplicant, dialog, butter-wifi, hot-plug daemon) and Realtek firmware", "MISSING_" not in o and "OK_iw" in o and "OK_butter-wifid" in o and re.search(r"FW_[1-9]", o), o.replace("\n", " ")[-300:])
        c, o = vm.sh("[ -f /usr/lib/butter/8188eu.ko ] && echo DRV\"_\"FILE; V=$(modinfo -F vermagic /usr/lib/butter/8188eu.ko 2>/dev/null | cut -d' ' -f1); [ -n \"$V\" ] && [ \"$V\" = \"$(uname -r)\" ] && echo DRV\"_\"MATCHES_KERNEL; echo K\"_\"$(uname -r)\"_\"V$V", 30)
        check("RTL8188EU driver is shipped and built for this exact kernel", "DRV_FILE" in o and "DRV_MATCHES_KERNEL" in o, o.replace("\n", " ")[-200:])
        c, o = vm.sh("pgrep -f butter-wifid >/dev/null && echo WIFID\"_\"RUNNING; modprobe mac80211_hwsim radios=1 2>&1; for i in 1 2 3 4 5 6 7 8 9 10 11 12; do grep -q 'wifi adapter ready' /var/log/butter-wifid.log 2>/dev/null && break; sleep 1; done; cat /var/log/butter-wifid.log | tail -4; iw dev 2>&1 | head -3", 60)
        check("Hot-plug works: a Wi-Fi adapter that appears after boot is noticed by the daemon", "WIFID_RUNNING" in o and "adapter ready" in o, o.replace("\n", " ")[-300:])
        # Java server
        r = api("a=create&n=test-java&type=java&mem=1024&share=internet", timeout=900) if st.get("ok") else {"ok": False, "error": "skipped, web page is down"}; check("Create Java server via web API", r.get("ok"), r)
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
        if up:
            r = api("a=players&n=test-java"); check("Local tab: player list works (nobody online)", r.get("ok") and r.get("players") == [], r)
            r = api("a=kick&n=test-java&p=Nobody"); check("Local tab: kick command reaches the server", r.get("ok"), r)
            r = api("a=plugin&n=test-java&url=https%3A%2F%2Fevil.example%2Fx.jar"); check("Plugin install refuses links outside the allowed sites", not r.get("ok"), r)
            r = api("a=plugins&n=test-java"); check("Plugin list works", r.get("ok"), r)
            sj = [x for x in api("a=status").get("servers", []) if x["name"] == "test-java"]; jn = sj[0].get("join") if sj else None
            check("Create with 'free internet link' produced a join address", bool(jn), jn)
            if jn:
                try: h, pt = jn.split(":"); p = mc_ping(int(pt), h); check("Friend on the internet can reach the server through the join link", p and "players" in p, json.dumps(p)[:160])
                except Exception as e: check("Friend on the internet can reach the server through the join link", False, e)
        if up: subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "webshots.js"), OUT, "live"], capture_output=True, text=True)
        st = api("a=status"); extra.append("Status after Java:\n```\n" + json.dumps({k: st.get(k) for k in ("mem", "web_rss_mb", "capacity")}) + "\n```")
        check("Delete the Java server (frees RAM)", api("a=delete&n=test-java").get("ok")); time.sleep(8)
        # an old Java version (Vanilla 1.16.5 needs Java 8)
        r = api("a=create&n=old-java&type=java&mem=1024&ver=1.16.5&flavor=vanilla", timeout=900); check("Create Vanilla 1.16.5 server (old Java version)", r.get("ok"), r)
        up = False
        for i in range(90):
            lg = api("a=logs&n=old-java").get("logs", "")
            if re.search(r"Done \(", lg): up = True; break
        check("Vanilla 1.16.5 finished starting", up, lg[-300:])
        if up:
            try: p = mc_ping(); check("Vanilla 1.16.5 answers a real status ping and reports 1.16.5", p and "1.16.5" in json.dumps(p), json.dumps(p)[:160])
            except Exception as e: check("Vanilla 1.16.5 answers a real status ping and reports 1.16.5", False, e)
        sv = {x["name"]: x for x in api("a=status").get("servers", [])}; check("Status shows the chosen flavor and version", sv.get("old-java", {}).get("version") == "1.16.5" and sv.get("old-java", {}).get("flavor") == "vanilla", json.dumps(sv.get("old-java")))
        api("a=delete&n=old-java"); time.sleep(8)
        # Bedrock x2 (what a 4 GB machine is meant to hold)
        for nm in ("test-bed", "test-bed2"):
            r = api("a=create&n=%s&type=bedrock" % nm, timeout=900); check("Create Bedrock server %s via web API" % nm, r.get("ok"), r)
            up = False; lg = ""
            for i in range(60):
                lg = api("a=logs&n=%s" % nm).get("logs", "")
                if "Server started" in lg: up = True; break
                time.sleep(10)
            check("Bedrock %s finished starting (log says Server started)" % nm, up, lg[-200:])
        c, o = vm.sh("grep -E '^(allow-list|server-name)' /ram/butter/worlds/test-bed/server.properties"); check("Bedrock allow-list is off (friends can join)", "allow-list=false" in o, o.strip()[-120:])
        pong = raknet_ping(19132); check("Bedrock answers a RakNet ping on UDP (from the host, through the forwarded port)", pong is not None, pong)
        js = 'const d=require("dgram").createSocket("udp4");const m=Buffer.from("00ffff00fefefefefdfdfdfd12345678","hex");const p=Buffer.concat([Buffer.from([1]),Buffer.alloc(8),m,Buffer.alloc(8)]);d.on("message",b=>{console.log("PONG"+b[0]);process.exit(0)});setInterval(()=>d.send(p,19132,"127.0.0.1"),500);setTimeout(()=>{console.log("NOPONG");process.exit(1)},10000)'
        c, o = vm.sh("node -e '" + js + "'", 30); check("Bedrock answers a RakNet ping (inside the machine)", "PONG28" in o, o.strip()[-60:])
        if "PONG28" not in o:
            ip = vm.sh("docker inspect -f '{{.NetworkSettings.IPAddress}}' bw-test-bed")[1].strip().splitlines()[-1] if True else ""
            js2 = js.replace('"127.0.0.1"', '"' + ip + '"')
            c2, o2 = vm.sh("node -e '" + js2 + "'", 30); extra.append("Bedrock direct-to-container ping (" + ip + "): " + o2.strip()[-40:])
            c3, o3 = vm.sh("docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}'; ss -lunp 2>&1 | head; docker logs --tail 15 bw-test-bed 2>&1 | cut -c1-160; iptables -t nat -S 2>&1 | grep 1913 | head")
            extra.append("Bedrock diagnostics:\n```\n" + o3[-1800:] + "\n```")
        if "PONG28" not in o:
            c, o2 = vm.sh("docker logs --tail 6 bw-test-bed 2>&1; docker port bw-test-bed; netstat -lun; echo RAW:; " + "node -e '" + js + "' 2>&1 | tail -3", 40)
            extra.append("Bedrock ping diagnostics:\n```\n" + o2 + "\n```")
        st = api("a=status"); extra.append("Status after 2 Bedrock:\n```\n" + json.dumps({k: st.get(k) for k in ("mem", "web_rss_mb", "capacity", "servers")}) + "\n```")
        json.dump(st, open(os.path.join(OUT, "status-final.json"), "w"), indent=1)
        r = api("a=create&n=third&type=bedrock"); check("Refuses a 3rd server in live mode", not r.get("ok"), r.get("error"))
        r = api("a=create&n=x&type=java"); check("Rejects an invalid name", not r.get("ok"), r.get("error"))
        # control
        check("Stop works", api("a=stop&n=test-bed").get("ok"))
        time.sleep(3); sv = {s["name"]: s for s in api("a=status").get("servers", [])}
        check("Stopped server shows as not running", sv.get("test-bed", {}).get("state") != "running", sv.get("test-bed", {}).get("state"))
        api("a=delete&n=test-bed2"); time.sleep(6); check("Start works", api("a=start&n=test-bed").get("ok"))
        check("Delete works", api("a=delete&n=test-bed").get("ok"))
        # screenshots of the web page (done by the workflow with playwright)
        r = subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "webshots.js"), OUT], capture_output=True, text=True)
        log(r.stdout, r.stderr); check("Web page screenshots taken", r.returncode == 0, r.stderr[-200:])
        vm.shot("live-after-servers")
        # failover wiring on the OS (never takes over: FAILOVER_AUTO=0)
        tok = os.environ.get("E2E_REGISTRY_TOKEN"); repo = os.environ.get("E2E_REGISTRY_REPO")
        if tok and repo:
            envcmd = "cd /etc && grep -v -E '^(BUTTER_ROLE|REGISTRY_REPO|REGISTRY_TOKEN|SESSION_SECRET|FAILOVER_AUTO|DEVICE_ID)=' butterhosting.env > bh.tmp; printf 'BUTTER_ROLE=device\\nREGISTRY_REPO=" + repo + "\\nREGISTRY_TOKEN=" + tok + "\\nSESSION_SECRET=e2e-secret\\nFAILOVER_AUTO=0\\nDEVICE_ID=e2e-box\\nFAILOVER_TICK_MS=3000\\n' >> bh.tmp; mv bh.tmp butterhosting.env; chmod 600 butterhosting.env"
            vm.sh(envcmd, 20)
            vm.sh("rc-service butterhosting restart >/dev/null 2>&1; rc-service butterfailover restart >/dev/null 2>&1", 90)
            c, o = vm.sh("cloudflared --version 2>&1 | head -1", 20); check("cloudflared is in the image", c == 0 and "cloudflared" in o, o.strip()[:80])
            got = False
            for _ in range(40):
                c, o = vm.sh("test -s /run/butter-tunnel-url && echo HAVEURL", 15)
                if "HAVEURL" in o: got = True; break
                time.sleep(3)
            check("Tunnel comes up and its address is stored (address not printed)", got)
            time.sleep(8); c, o = vm.sh("wget -qO- http://127.0.0.1:8080/health", 20)
            check("API in device role is on standby (does not take over while primary is fine)", '"standby":true' in o and '"failover":"standby"' in o, o.strip()[-120:])
            try:
                req = urllib.request.Request("https://api.github.com/repos/%s/contents/_butter/device-e2e-box.json?ref=registry" % repo, headers={"Authorization": "Bearer " + tok, "Accept": "application/vnd.github.raw+json", "User-Agent": "e2e"})
                j = {}
                for _ in range(20):
                    try: j = json.loads(urllib.request.urlopen(req, timeout=20).read())
                    except Exception: j = {}
                    if j.get("url"): break
                    time.sleep(5)
                check("Device registered itself in the private registry (with a tunnel address, not shown)", bool(j.get("url")) and j.get("active") is False, "fields: %s" % sorted(j.keys()))
            except Exception as e: check("Device registered itself in the private registry", False, e)
            vm.sh("sed -i '/^BUTTER_ROLE=/d;/^REGISTRY_TOKEN=/d' /etc/butterhosting.env; rc-service butterhosting restart >/dev/null 2>&1; rc-service butterfailover stop >/dev/null 2>&1", 60)
        # installer: serve the ISO from the host
        ip = "10.0.2.2"
        c, o = vm.sh("which butter-install && ls /dev/vda", 20); check("Installer present and target disk visible", c == 0, o.replace("\n", " "))
        c, o = vm.sh("cd /tmp && BUTTER_ISO_URL=http://%s:8000/ButterOS.iso butter-install --disk /dev/vda --yes 2>&1 | tail -6" % ip, 900)
        check("Installer downloads, verifies checksum and writes the disk", "Verified" in o, o[-300:])
        c, o = vm.sh("BUTTER_ISO_URL=http://%s:8000/ButterOS.iso butter-install --disk /dev/sr0 --yes 2>&1 | tail -2" % ip, 60)
        check("Installer refuses the disk the system booted from", "not an allowed" in o or "not a disk" in o or "in use" in o, o[-120:])
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
    dualboot(ISO); usbboot(ISO)
    flush_results("\n".join(extra))

def sudo(cmd, timeout=600):
    r = subprocess.run(["sudo", "sh", "-c", cmd], capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr)

def dualboot(iso):
    iso = os.path.abspath(iso)
    """Boot ButterOS from an ISO FILE on a disk that has another OS's layout: (A) BIOS + ext4 (Linux host), (B) UEFI + NTFS (Windows layout)."""
    # ---------- A: BIOS GRUB + ext4, installed with the real Linux installer ----------
    c, o = sudo("rm -f /tmp/a.img; truncate -s 3G /tmp/a.img && losetup -fP --show /tmp/a.img"); dev = o.strip().splitlines()[-1]
    c, o = sudo("parted -s %s mklabel msdos mkpart primary ext4 1MiB 100%% && sleep 1 && mkfs.ext4 -q -L hostroot %sp1 && mkdir -p /mnt/a && mount %sp1 /mnt/a && mkdir -p /mnt/a/boot/grub && "
                "grub-install --target=i386-pc --boot-directory=/mnt/a/boot --modules='part_msdos ext2' %s && blkid -s UUID -o value %sp1" % (dev, dev, dev, dev, dev))
    check("DualBoot A: test disk with GRUB on ext4 created", c == 0, o[-300:])
    if c == 0:
        uuid = o.strip().splitlines()[-1]
        sudo("printf 'set timeout=1\\ninsmod part_msdos\\ninsmod ext2\\nsearch --no-floppy --fs-uuid --set=root %s\\nsource ($root)/boot/butteros/grub-entry.cfg\\nset default=0\\n' > /mnt/a/boot/grub/grub.cfg" % uuid)
        c, o = sudo("sh %s/os/dualboot/butter-dualboot-linux.sh --root /mnt/a --iso %s --no-update 2>&1 | tail -8; df -h /mnt/a | tail -1; cat /mnt/a/boot/butteros/grub-entry.cfg" % (REPO, iso))
        check("DualBoot A: Linux installer copies ISO + boot files and writes the GRUB entry", "Done." in o and "butter_iso=UUID=" in o, o[-500:])
        _X.append("DualBoot A installer output:\n```\n" + o[-900:] + "\n```")
    sudo("umount /mnt/a; losetup -d %s; chmod 666 /tmp/a.img" % dev)
    vmA = VM("dbA", ["-drive", "file=/tmp/a.img,if=virtio,format=raw", "-boot", "c"], port_off=20)
    try:
        time.sleep(45); vmA.shot("dbA-45s")
        ok = vmA.boot_to_shell(first_enter=False, timeout=360); vmA.shot("dbA-end"); check("DualBoot A: ButterOS boots from the ISO file on the ext4 disk (BIOS)", ok, vmA.buf.decode(errors="ignore")[-400:])
        if ok:
            vmA.sh("killall dialog 2>/dev/null; true")
            c, o = vmA.sh("grep -o 'butter_iso=[^ ]*' /proc/cmdline; mount | grep -c butteriso; cat /etc/hostname; wget -qO- http://127.0.0.1/cgi-bin/api?a=ping")
            check("DualBoot A: the ISO is loop-mounted and the web agent answers", "butter_iso=" in o and '"ok":true' in o.replace(" ", ""), o.replace("\n", " ")[-300:]); vmA.shot("dualboot-A")
        else: _X.append("DualBoot A boot log tail:\n```\n" + vmA.buf.decode(errors="ignore")[-1500:] + "\n```")
    finally: vmA.kill()
    # ---------- B: UEFI GRUB on an ESP + the ISO on an NTFS 'C:' drive (the layout the Windows program will create) ----------
    c, o = sudo("rm -f /tmp/b.img; truncate -s 3G /tmp/b.img && losetup -fP --show /tmp/b.img"); dev = o.strip().splitlines()[-1]
    c, o = sudo("parted -s %s mklabel gpt mkpart ESP fat32 1MiB 200MiB set 1 esp on mkpart Windows ntfs 200MiB 100%% && sleep 1 && mkfs.vfat -F32 %sp1 && mkfs.ntfs -Q -L Windows %sp2 && "
                "mkdir -p /mnt/e /mnt/c && mount %sp1 /mnt/e && mount -t ntfs-3g %sp2 /mnt/c" % (dev, dev, dev, dev, dev))
    check("DualBoot B: test disk with an EFI partition and an NTFS partition created", c == 0, o[-300:])
    if c == 0:
        nt = sudo("blkid -s UUID -o value %sp2" % dev)[1].strip().splitlines()[-1]; _X.append("NTFS id as read by blkid: " + nt)
        c, o = sudo("mkdir -p /mnt/c/ButterOS /mnt/e/EFI/ButterOS /mnt/e/EFI/BOOT && cp %s /mnt/c/ButterOS/ButterOS.iso && mkdir -p /mnt/iso && mount -o loop,ro %s /mnt/iso && "
                    "cp /mnt/iso/boot/vmlinuz-lts /mnt/iso/boot/initramfs-lts /mnt/e/EFI/ButterOS/ && umount /mnt/iso && "
                    "printf 'set timeout=1\\nsearch --no-floppy --file --set=esp /EFI/ButterOS/vmlinuz-lts\\nmenuentry ButterOS {\\n linux ($esp)/EFI/ButterOS/vmlinuz-lts butter_iso=UUID=%s:/ButterOS/ButterOS.iso modules=loop,squashfs,sd-mod,usb-storage quiet\\n initrd ($esp)/EFI/ButterOS/initramfs-lts\\n}\\n' > /mnt/e/EFI/ButterOS/grub.cfg && "
                    "grub-mkimage -O x86_64-efi -p /EFI/ButterOS -o /mnt/e/EFI/ButterOS/grubx64.efi part_gpt fat ntfs search normal linux configfile echo && cp /mnt/e/EFI/ButterOS/grubx64.efi /mnt/e/EFI/BOOT/BOOTX64.EFI && ls -la /mnt/e/EFI/ButterOS /mnt/e/EFI/BOOT" % (iso, iso, nt))
        check("DualBoot B: boot files placed on the EFI partition and the ISO on the NTFS drive", c == 0, o[-400:])
    sudo("umount /mnt/e /mnt/c; losetup -d %s; chmod 666 /tmp/b.img" % dev)
    vmB = VM("dbB", ["-drive", "if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd", "-drive", "file=/tmp/b.img,if=virtio,format=raw", "-boot", "c"], port_off=30)
    try:
        time.sleep(45); vmB.shot("dbB-45s")
        ok = vmB.boot_to_shell(first_enter=False, timeout=360); vmB.shot("dbB-end"); check("DualBoot B: ButterOS boots (UEFI) from the ISO file on the NTFS drive", ok, vmB.buf.decode(errors="ignore")[-400:])
        if ok:
            vmB.sh("killall dialog 2>/dev/null; true")
            c, o = vmB.sh("grep -o 'butter_iso=[^ ]*' /proc/cmdline; mount | grep -E 'hostdisk|butteriso' | cut -c1-90; wget -qO- http://127.0.0.1/cgi-bin/api?a=ping")
            check("DualBoot B: NTFS read, ISO loop-mounted, web agent answers", "butter_iso=" in o and '"ok":true' in o.replace(" ", ""), o.replace("\n", " ")[-300:]); vmB.shot("dualboot-B")
        else: _X.append("DualBoot B boot log tail:\n```\n" + vmB.buf.decode(errors="ignore")[-1500:] + "\n```")
    finally: vmB.kill()

def usbboot(iso):
    """EtchDroid writes the ISO byte for byte to a USB stick: boot it as a USB mass-storage disk in BIOS and UEFI."""
    c, o = subprocess.getstatusoutput("file -s %s | head -c 300; xxd -s 510 -l 2 -p %s" % (iso, iso)); check("ISO is a hybrid image (MBR boot signature 55aa, so it works written raw to a USB stick)", o.strip().endswith("55aa"), o.replace("\n", " ")[-200:])
    usb = ["-drive", "if=none,id=u,file=%s,format=raw,readonly=on" % iso, "-device", "qemu-xhci", "-device", "usb-storage,drive=u,bootindex=1"]
    for nm, extra, off in (("usbBIOS", [], 40), ("usbUEFI", ["-drive", "if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd"], 50)):
        v = VM(nm, extra + usb, port_off=off)
        try:
            ok = v.boot_to_shell(first_enter=True, timeout=360); v.shot(nm + "-end")
            c, o = v.sh("mount | grep -E '^(tmpfs|rootfs|none) on / ' | head -1; cat /proc/cmdline | cut -c1-120; ls /dev/sd* 2>/dev/null | head -2") if ok else (1, "")
            check("USB stick boot (%s): ButterOS starts from the raw ISO on a USB disk" % nm[3:], ok, v.buf.decode(errors="ignore")[-400:] if not ok else o.replace("\n", " "))
        finally: v.kill()

REPO = os.environ.get('GITHUB_WORKSPACE', os.getcwd())
import traceback
try:
    main()
except Exception:
    traceback.print_exc(); RES.append(("script error", False, traceback.format_exc()[-300:]))
finally:
    flush_results()
    sys.exit(0)
