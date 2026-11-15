# ButterOS (experimental)

A tiny Linux box that does one thing: run ButterHosting. Alpine Linux + Docker + the ButterHosting API, with a text menu (`butter-tui`) on the screen instead of a desktop.

> **Status: written but not booted.** These scripts passed a syntax check only. I could not build or boot an image in the environment where I wrote them, so treat the first run as a test and expect small fixes.

## Install (about 10 minutes)

1. Install **Alpine Linux** (Standard ISO) on the machine. Run `setup-alpine`, choose disk mode **sys** (not diskless, because diskless keeps everything in RAM).
2. Log in as root, then:
   ```sh
   wget -O install.sh https://raw.githubusercontent.com/alamarahuq-max/Butterhosting/main/os/install.sh   # or copy it over with a USB stick
   sh install.sh https://github.com/alamarahuq-max/Butterhosting.git
   reboot
   ```
3. The machine now boots into the ButterOS menu. Enter your Discord client ID, secret and your Vercel URL, then **Start / restart API**.
4. In the Discord developer portal, add the redirect URL the API prints in **API log**. Because the box is at home, the dashboard needs a public HTTPS address for the API. Use a free Cloudflare quick tunnel or a Codespace-style forward. Minecraft players do not need any of this: the join link uses an outbound tunnel.

## RAM budget (estimates, not measurements)

| Part | Idle RAM |
|---|---|
| Alpine kernel + busybox + OpenRC | 30 to 50 MB |
| Docker (dockerd + containerd) | 70 to 110 MB |
| ButterHosting API (Node) | 40 to 70 MB |
| Menu (`dialog`) | 1 to 2 MB |
| **Total** | **about 150 to 230 MB** |

That is close to your 200 MB goal, and can land on either side of it. If it comes in over, the first fix is replacing Docker with Podman (no always-on daemon, saves around 100 MB). The API only calls the `docker` CLI, so `podman-docker` should work, but that is untested too. Whatever the OS uses is taken from the memory available for game servers.

## What it can and can't be

- It is a purpose-built Alpine install, not a from-scratch kernel. Writing your own kernel is a multi-year job; Alpine already gives you the small footprint.
- Hardware needs: 64-bit CPU with virtualisation not required, wired network recommended, SSD strongly recommended (world saves).

## RAM mode (for slow USB sticks)

Install with `sh install.sh <repo> --ram /media/usb`. Worlds and the API database run from a RAM disk (`/ram`), so a slow USB stick is only touched for backups. `ramsync` copies them to `/media/usb/butter-backup`: restore on boot, a save every 5 minutes (it asks Minecraft to flush first, and swaps the backup in only after a full copy), and a final save on shutdown.

- **A power cut loses up to 5 minutes of progress**, because a backup only happens every 5 minutes. Shut down from the menu.
- Docker images (about 400 MB for Minecraft) stay on the USB. Only the first start of each server type reads them slowly.
- Size the RAM disk with `RAM_SIZE` (default `1g`). On a 4 GB machine, 1 GB for worlds is about right; each Java server also needs 1.3 to 1.5 GB of RAM to run.
- If you instead want the whole OS in RAM (Alpine's own diskless mode), that works too, but Docker plus Node unpacked in RAM costs roughly 300 to 400 MB. That is more than the 200 MB goal, so I use disk-backed OS files and put only the worlds in RAM.
- Not run on real hardware: syntax-checked only.

## Design files
`os/design/` has the boot-menu, console and web-UI mockups (PNG), the logo (`logo.svg`), the display font, and the prompt used to have an AI build the OS. The numbers in the mockups are placeholders.

## Building the bootable ISO (ButterOS Live)

The ISO is Alpine Linux (diskless = runs entirely from RAM) plus our files. It is built by GitHub, not on your PC:

1. GitHub -> Actions -> **Build ButterOS ISO** -> Run workflow (leave Alpine at 3.22).
2. When it finishes, download the **ButterOS** artifact: `ButterOS.iso`, its sha256, `build.log` and `shots/` (screenshots of a test boot in BIOS and UEFI mode).
3. Flash `ButterOS.iso` to the USB with balenaEtcher or Rufus (DD mode). On the same USB make a 3rd ext4 partition labelled `BUTTER` for Docker images + backups (optional, without it everything stays in RAM).

**Status: untested.** The build scripts were written without being able to run Alpine's tooling, so expect the first run to need a fix. If it fails, send `build.log`; if it builds, send the `shots/` pictures. The boot menu (big title, 3 entries, dark/light) lives in `os/build/brand-iso.sh` and falls back to Alpine's stock menu if branding fails, so the ISO should still boot.
The Minecraft server jar is downloaded on first start (Mojang EULA), not bundled.
