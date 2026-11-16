# ButterOS

A small RAM-only Linux (Alpine + Docker) that does one thing: host Minecraft servers (Java and Bedrock). No desktop, no accounts, no sign-in.

- **Console screen:** logo, loading bar, then a numbered menu: Play with friends, Open the web page, Install ButterOS on this PC, Be a backup node, Power off, Restart.
- **Web page** (`http://<machine address>`, local network only, under 30 MB RAM): overview, servers, a **+** button to make a server, a **Local** tab (players, kick/op/ban, plugins, free internet link), backup and system pages.
- **`butter play [name]`** in the terminal starts a server and prints a join address.
- **Backup node:** takes over the site's servers if the main server is down, then hands them back. Needs the private registry repo, a token and the same `SESSION_SECRET` as the main server (see `hosting-api/README.md`).
- **Storage:** label an ext4 partition `BUTTER` to keep images and worlds across reboots. Without it everything is in RAM and is lost at power off.

Built and tested by CI (`.github/workflows/build-iso.yml`): the ISO is booted in a VM, a Java server is created and pinged, and the installer is run. The latest results are in the `ci-shots` branch (`e2e/results.md`).

Known gaps: Bedrock ping test fails in CI (servers start; check with a real client); dual-boot is not built; no on-screen GUI.
