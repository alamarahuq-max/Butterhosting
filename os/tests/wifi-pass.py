# Checks that Wi-Fi passwords with special characters survive typing -> dialog -> wifi-save, and that Show/Hide works.
import os, pty, subprocess, sys, time, hashlib, select, tempfile, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PWS = ["plain-pass-123", "p@$$ w0rd!#\"'\\&;%`<>|(){}[]~^*?", "  lead and trail  ", "dollar$HOME$(id)`id`", "ünïcödé-ß-пароль"]
SSIDS = ["Home", "My \"quoted\" net", "Wi Fi $x"]
fails = 0
def ok(n, c, d=""):
    global fails; print(("PASS " if c else "FAIL ") + n, d if not c else ""); fails += (not c)
# 1) wifi-save -> psk must equal the real WPA2 PBKDF2 of the exact password
for pw in PWS:
    for ss in SSIDS:
        if not 8 <= len(pw.encode()) <= 63: continue
        d = tempfile.mkdtemp(); conf = d + "/w.conf"
        r = subprocess.run([ROOT + "/wifi-save", ss, pw], env=dict(os.environ, WPA_CONF=conf), capture_output=True, text=True)
        txt = open(conf).read() if os.path.exists(conf) else ""
        m = re.search(r"^\s*psk=([0-9a-f]{64})\s*$", txt, re.M)
        want = hashlib.pbkdf2_hmac("sha1", pw.encode(), ss.encode(), 4096, 32).hex()
        ok("wifi-save keeps %r on %r" % (pw, ss), bool(m) and m.group(1) == want and pw not in txt, txt[:200])
# 2) dialog: type the password (hidden), reveal with Show, accept with Enter; output must equal the typed text
def drive(keys, pw):
    out = tempfile.mktemp(); pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm"; os.environ["DIALOGRC"] = "/dev/null"
        os.execvp("sh", ["sh", "-c", "%s/wifi-askpass Home > %s" % (ROOT, out)])
    buf = b""
    def pump(t):
        nonlocal buf; end = time.time() + t
        while time.time() < end:
            if select.select([fd], [], [], 0.1)[0]:
                try: buf += os.read(fd, 65536)
                except OSError: return
    pump(1.0)
    for k in keys:
        os.write(fd, k if isinstance(k, bytes) else k.encode()); pump(0.5)
    pump(1.0)
    try: os.waitpid(pid, 0)
    except Exception: pass
    return (open(out).read() if os.path.exists(out) else None), buf
for pw in PWS:
    if "\n" in pw: continue
    res, screen = drive([pw.encode(), b"\r"], pw); ok("askpass (hidden entry) returns %r" % pw, res == pw, (res, screen[-200:]))
pw = "Sh0w-Me_p@ss!"
res, screen = drive([pw.encode(), b"\t", b"\t", b"\r", b"\r"], pw)
clean = re.sub(rb"\x1b(\[[0-9;?]*[A-Za-z]|\([A-Z0-9])", b"", screen)
ok("Show button reveals the password and it is still returned", res == pw and b"visible now" in clean and pw.encode() in clean.split(b"visible now")[-1], (res, clean[-300:]))
sys.exit(1 if fails else 0)
