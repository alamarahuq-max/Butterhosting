# Prompt for z.ai: build "Butter Os", a tiny server-hosting OS

You are a senior Linux, bootloader and embedded-systems engineer. Build **Butter Os**: a very small Linux-based operating system whose only job is to host game servers (mainly Minecraft Java and Bedrock) on old, weak hardware booted from a slow USB stick. Deliver working build scripts, configs, source and a README. Be honest at every step: say what you tested, what you could only syntax-check, and what you could not verify. Do not invent benchmark numbers, and do not claim anything works that you have not run.

I attached 7 mockup images and the logo file `logo.svg`. They are the design target. The numbers in them are placeholders, not measurements. Match the layout, hierarchy and behaviour, not the sample data.

1. `1-boot-menu-dark.png` (the default)
2. `2-boot-menu-light.png`
3. `3-hoster-console-home.png`
4. `4-hoster-console-servers.png`
5. `5-hoster-console-backup.png`
6. `6-local-web-ui-overview.png`
7. `7-local-web-ui-servers.png`

---

## 1. Target hardware and hard limits

- The worst case I care about: Intel Pentium G2020 (2 cores, 2 threads, no AVX), **4 GB RAM**, booting from a **slow USB stick**. It must also work on better machines (e.g. a 16 GB Ryzen).
- x86_64, BIOS (legacy) **and** UEFI boot.
- **The OS itself (kernel, init, container runtime, agent) uses under 200 MB of RAM when idle.** Measure it with `free -m` after boot and report the real number. If you cannot meet 200 MB, say by how much you missed and what the fix would be.
- **The local web UI uses under 30 MB of RAM.** Measure its resident memory (`RSS`) and show it in the UI.
- Everything else is for game servers.
- A slow USB stick must not make servers lag. See section 5 (RAM mode).

## 2. Base system (choose, justify in one paragraph)

Recommended: **Alpine Linux** (musl, busybox, OpenRC) with a custom kernel config or Alpine's `linux-lts`, plus **Podman** or Docker to run server containers. Podman has no always-on daemon and saves roughly 100 MB. Pick one and explain why. Container images used: `itzg/minecraft-server` (Java) and `itzg/minecraft-bedrock-server` (Bedrock).

The system must run unattended: boot, restore state, start the agent, start servers that were running, back up regularly.

## 3. Boot menu (the most important part visually)

I want it to feel **genuinely Apple-like**: black, quiet, huge type, almost nothing else. Study `1-boot-menu-dark.png` and `2-boot-menu-light.png`.

### Layout
- **Dark mode is the default.** Pure black background (`#000`), white text.
- **Title across the top, as large as it can possibly be**, on one line, edge to edge with a small margin: `Butter [logo] Os`.
  - "Butter" and "Os" are set in the **special display font: NType 82**. It is supplied as `ntype82.woff2` (licence: CC BY 4.0, credit "NType 82 via OnlineWebFonts"). Convert it to what your bootloader needs.
  - Between the two words sits the **Butter logo**: a butter stick drawn in 3/4 view (light top face, golden front face with a soft vertical gradient, darker right side face, a short white highlight on the front and one on the top, a 3.5 px indigo `#1D1A3A` outline). It is supplied as `logo.svg` (viewBox 242 x 142). Use that exact file (rasterise it for the bootloader); do not redraw it. The same logo is used on the website, the console and the web UI.
  - **Logo size and alignment:** the logo's height equals the cap height of "B" (about 0.70 em in NType 82); its bottom sits on the text baseline and its top lines up with the top of the capitals.
  - **Spacing:** the gap between "Butter" and the logo, and between the logo and "Os", are equal, about 0.15 em each (a normal word gap). Letter-spacing about -0.015 em with kerning on, because the type is huge.
  - **Normal word gaps only.** No letter-spacing tricks, no big holes.
  - **This is the only text in the special font.** Everything else in the menu uses a clean sans-serif (Inter, or the closest you can render).
- **Three entries at the bottom**, centred, in a smaller sans-serif that is still easy to read (about 2.5 percent of screen height). Vertical list, generous spacing:
  1. `Live USB` followed by a smaller dimmer note `1–2 servers`
  2. `Download OS`
  3. `Light mode` (when in light mode this entry reads `Dark mode`)
- **Selection indicator:** a **tiny solid triangle** (about 11 by 13 px at 1080p) immediately left of the selected entry. That is the only selection marker. No highlight bar, no box, no glow. The selected entry is full white (or black in light mode); the others are about 50 percent opacity.
- Light mode: background `#F5F5F7`, text `#1D1D1F`. Same layout.
- No other text, no borders, no progress bars, no timeouts shown.

### Behaviour
- Up/Down arrow keys move the triangle. Enter selects. Mouse and touch are optional.
- **`Live USB`**: boots the live system from the USB stick into RAM mode (section 5). It starts at most **1–2 servers** (see section 7 for how the limit is enforced).
- **`Download OS`**: I mean "get the full ButterOS onto this computer's internal disk." Implement it as: boot to the installer, show detected disks, let the user choose one, ask for explicit confirmation before erasing, download the latest image over the network (show progress and checksum verification), write it, then reboot. If you decide the bootloader should only chain into a tiny installer that does the network part, that is fine. **If this entry is ambiguous to you, state your interpretation at the top of the README.**
- **`Light mode` / `Dark mode`**: switches the whole menu instantly and **remembers the choice** across reboots (for GRUB, use `grubenv` with `save_env`; for others, an equivalent). Default stays dark on a fresh stick.

### Screen size and resolution detection (drivers)
- The menu must **detect the screen's native resolution automatically** and scale the layout (the title fits to the width; font sizes scale with height). It must look right at 1366x768, 1920x1080, 2560x1440 and 3840x2160, on 16:9 and 16:10 and on odd laptop panels.
- Use proper modes: UEFI GOP and VBE for the bootloader (e.g. GRUB `gfxmode=auto` with `gfxpayload=keep`), and kernel mode-setting for the running system. Include and test the KMS drivers for old and new graphics: `i915` (Intel), `amdgpu` and `radeon` (AMD), `nouveau` (NVIDIA), `simpledrm`/`efifb`/`vesafb` as the fallback.
- Read the display's EDID to pick the native mode. If detection fails, fall back to 1024x768 and still draw a usable menu.
- Show no resolution text on screen. Verify it with screenshots.
- Suggested implementation: GRUB with a custom `gfxmenu` theme (the title, the logo, the three entries, the triangle as theme images and fonts; fonts converted with `grub-mkfont`). If you can't reproduce the exact design in GRUB, use another approach (e.g. a tiny framebuffer program), but keep the same look and tell me what you changed and why.

## 4. After boot: the hoster console (for the person running the machine)

Mockups 3, 4 and 5. A full-screen text-mode interface on the machine's own display (framebuffer console, `kmscon` or similar). Dark, calm, keyboard-driven.

- **Home** (mockup 3): the title `Butter Os` in the special font at the top-left (render it as a bitmap if the console can't use TTF); memory bar split into OS, servers, worlds in RAM, free; server list with a ▶ marker on the selected row; CPU and temperature; backup status; online status (Discord login ready, the local web UI address); a key legend at the bottom.
- **Servers** (mockup 4): list on the left, details on the right (software, players, memory, join link, mods, world size), actions (start/stop, restart, console, mods, settings), live log below.
- **Backup** (mockup 5): RAM disk usage, a big "Safe to power off" state, history of backups with a restore option, "back up now", "eject USB safely".
- Everything except the title is in a monospace font. Colours: black background, off-white text, butter yellow `#FFD23F` as the single accent, green for healthy, orange for warnings.
- Must refuse unsafe actions politely (for example starting a third Java server when RAM is short).
- Language: short, plain, no jargon, no emoji.

## 5. RAM mode (for slow USB sticks)

Worlds and the API database run from a RAM disk (`tmpfs`), so the USB is not used while servers run. Backups go to the USB:

- Restore from the USB into RAM on boot.
- Back up every 5 minutes and on every shutdown. Before copying, tell running Minecraft servers to flush (`rcon-cli save-off`, `save-all flush`, then `save-on` after).
- **Copy to a temporary folder and swap it in only after a complete copy**, so a power cut mid-backup never leaves a half-written backup.
- Be honest in the UI: a sudden power cut loses up to 5 minutes of progress.
- Container images stay on the USB (only the first start of each server type reads them slowly). Size the RAM disk from total memory (about 25 percent on a 4 GB machine) and make it configurable.
- Reference implementation I already have (use or improve it): `os/ramsync`, `os/butterramsync.initd`, `os/install.sh --ram`. The API supports `WORLD_DIR` to put worlds in a folder instead of Docker volumes.

## 6. The local web UI (under 30 MB of RAM)

Mockups 6 and 7. Served by the machine itself at `http://butter.local:8080` (mDNS) and by IP. Reachable only on the local network by default.

- **Tiny.** Single static binary (Go or Rust) or a small C/BusyBox-style CGI. No Node, no Python, no large framework. Static HTML, CSS and a very small amount of JS, no build step. Report the resident memory of the whole web agent and show it in the sidebar ("This page is served by 19 MB of RAM (limit 30 MB)", with the real number).
- **Overview page:** servers running out of allowed, players online, memory used, CPU and temperature; a bar showing where memory goes (OS, each server, worlds in RAM, container runtime and agent); a **"Can I add another?" box** that gives a plain-language answer from real free memory; servers table; backup status.
- **Servers page:** table with name, type, state, players, memory bar, CPU, disk, join address, actions; start, stop, restart, console and settings; capacity notice.
- Other pages: Backup, Network, System (kernel, uptime, temps, disks).
- Design: dark indigo background `#0F0D26`, cards `#191640`, butter yellow `#FFD23F` for primary actions and the selected nav item, indigo `#9D94FF` for charts, green `#6FE0A8` for healthy. The page headings (`Butter Os`, `Overview`, `Servers`, card titles) use the special font NType 82; **all other text is system sans-serif**.
- Light and dark theme switch, default dark.
- Live updates every 3 to 5 seconds (polling is fine; no websockets needed).

## 7. Capacity logic (be honest and conservative)

- Compute free memory continuously. A Java Minecraft server (Paper, 1 GB heap) really needs about 1.3 to 1.5 GB; a Bedrock server about 0.5 to 0.75 GB; a static site almost nothing.
- Live USB mode starts at most 2 servers, and the capacity rule above still applies (refuse to start a server that would push free RAM under about 300 MB).
- Display the capacity advice in both the console and the web UI. Do not promise numbers you haven't measured. Where you only estimated, label it "estimate".
- Add an optional **auto-stop when empty** setting (the itzg `ENABLE_AUTOSTOP`) to save memory.

## 8. Integration with ButterHosting

The site and dashboard already exist (GitHub repo `alamarahuq-max/Butterhosting`, frontend on Vercel, zero-dependency Node API in `hosting-api/server.js`). On Butter Os:

- Run that API (or a small compatible rewrite) as a service. It needs `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `FRONTEND_URL`, `SESSION_SECRET`, and optionally `WORLD_DIR`, `DATA_DIR`, `PLAYIT_SECRET`.
- Configuration is entered once on the console (a first-run setup), stored on the USB, and never printed back in full.
- Java join links use Minekube Connect (no port forwarding). Bedrock needs a UDP tunnel such as playit.gg. Don't assume ports are open on the home router.
- Don't add telemetry or phone-home features.

## 9. Build and test requirements

1. Provide one command that builds the USB image (`.img` and/or `.iso`): `make usb` or `./build.sh`, runnable on a normal Linux PC. List the host packages it needs.
2. Test in **QEMU** (BIOS and UEFI, with `-vga std`, `virtio-gpu` and a few resolutions) and include screenshots of every boot menu state. Test light/dark persistence, Live USB, the console, and the web UI.
3. Show real memory numbers from QEMU with `-m 4096`: OS idle RAM, web agent RSS, RAM after starting one Java and one Bedrock server.
4. A test that kills power mid-backup (simulate it) and proves the previous backup is intact.
5. Write what you could not test (real hardware, real Discord, real Minekube or playit tunnels, real Minecraft clients).

## 10. Deliverables

- Full source tree and build scripts, with comments where a choice is non-obvious.
- The boot theme assets (title, logo, triangle, fonts), light and dark.
- The console UI and the web agent source.
- A README with: how to flash a USB stick (on Windows, macOS and Linux), first-run setup, how backups and restore work, how to switch to light mode, troubleshooting, and a **table of measured versus target numbers**.
- A short `LIMITS.md` listing every known limitation, plain and specific.

## 11. Rules of engagement

- Prefer the simplest thing that works over the cleverest. Keep dependencies few and small.
- Never claim "it works" without a command or screenshot that shows it.
- If a requirement conflicts with another (for example 200 MB and Docker), say so and propose the least-bad option rather than silently dropping one.
- Ask no questions unless something is truly blocking; otherwise make the most reasonable choice, write it at the top of the README, and keep going.
