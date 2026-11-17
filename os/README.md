# ButterOS

A small RAM-only Linux (Alpine + Docker) that does one thing: host Minecraft servers (Java and Bedrock). No desktop, no accounts, no sign-in.

- **Console screen:** logo, loading bar, then a numbered menu: Play with friends, Open the web page, Install ButterOS on this PC, Be a backup node, Power off, Restart.
- **Web page** (`http://<machine address>`, local network only, under 30 MB RAM): overview, servers, a **+** button to make a server, a **Local** tab (players, kick/op/ban, plugins, free internet link), backup and system pages.
- **`butter play [name]`** in the terminal starts a server and prints a join address.
- **Backup node:** takes over the site's servers if the main server is down, then hands them back. Needs the private registry repo, a token and the same `SESSION_SECRET` as the main server (see `hosting-api/README.md`).
- **Storage:** label an ext4 partition `BUTTER` to keep images and worlds across reboots. Without it everything is in RAM and is lost at power off.

Built and tested by CI (`.github/workflows/build-iso.yml`): the ISO is booted in a VM, a Java server is created and pinged, and the installer is run. The latest results are in the `ci-shots` branch (`e2e/results.md`).

## Dual-boot (no partition)
ButterOS can start from one ISO file on a disk you already use, next to Windows or Linux. The boot code reads the file straight off the disk (ext4, xfs, NTFS, exFAT, FAT) and runs from RAM.
- **Linux (tested in CI on a virtual BIOS + ext4 disk):** `sudo sh butter-dualboot-linux.sh` (add `--iso ButterOS.iso` if you already downloaded it, `--remove` to undo). Needs GRUB, ext4 or xfs (not LVM, not encrypted), Secure Boot off.
- **Windows (the boot path is tested in CI on a virtual UEFI + NTFS disk; the script itself is NOT tested on real Windows):** `install-windows.ps1` in an Administrator PowerShell, `-Remove` to undo. Needs UEFI, Secure Boot off, BitLocker off on C:. Try it on a spare PC first.
Both release files are in the `latest-iso` release next to the ISO.

Known gaps: Bedrock ping test fails in CI (servers start; check with a real client); no on-screen GUI.
