# Butter app (no VM, no dual-boot)

The same Minecraft hosting as ButterOS, running natively on Linux, macOS and Windows with Docker: a terminal screen, a web page and the same servers.

## Install (one command; it installs Node.js and Docker if they are missing)
- **Linux / macOS:** `curl -fsSL https://raw.githubusercontent.com/alamarahuq-max/Butterhosting/main/app/install.sh | bash`
- **Windows (PowerShell):** `irm https://raw.githubusercontent.com/alamarahuq-max/Butterhosting/main/app/install.ps1 | iex`

Then run `butter` (terminal screen) or `butter web` (web page at http://localhost:8080, with a first-run setup wizard).

## Commands
`butter` · `butter web` · `butter setup` · `butter create <name> [--flavor paper|vanilla|fabric|forge] [--version 1.21.4] [--mem 1536]` · `butter play [name]` · `butter status` · `butter logs [server] [-f]` · `butter start|stop|restart` (the background agent) · `butter commercial on|off [--wallet 0x..] [--ram MB] [--servers N]` · `butter docker [--install]` · `butter update` · `butter uninstall [--purge]`

## What each system needs
- **Linux:** Docker Engine (the installer runs Docker's official script with sudo, after asking). Hardware acceleration is not needed.
- **macOS:** Docker Desktop (`brew install --cask docker`, open it once). Apple Silicon runs the x86 Minecraft images through emulation: slower.
- **Windows:** Docker Desktop (needs virtualization on in the BIOS and WSL 2; Windows may ask for a restart).

## Honest limits
- The web page and API only listen on this computer by default. `BUTTER_BIND=0.0.0.0 butter restart` opens them to your home network (private addresses only, no password).
- Bedrock / phones: the Java server carries Geyser; for friends outside your network the router must forward the Bedrock port (UDP+TCP 19132).
- The free internet link uses bore.pub, a public relay: the address changes when the server restarts.
- **Host commercially** is a proof of concept. The machine enrolls with the ButterHosting network, sends a heartbeat and earns server-hours; payouts are calculated but nothing is paid automatically yet, and customer servers only arrive when the site assigns them.
- Tested in CI: the Linux install and the API with real Docker (`.github/workflows/app-test.yml`). The Windows and macOS scripts are written but not tested on real machines.
