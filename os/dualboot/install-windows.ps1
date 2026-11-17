# ButterOS dual-boot for Windows (UEFI PCs). NOT YET TESTED ON REAL WINDOWS: try it on a spare PC first.
# No new partition: ButterOS is one file on C:\ButterOS plus a small boot entry on the EFI partition. Windows is not touched.
#   Run in an Administrator PowerShell:   .\install-windows.ps1            (add ButterOS to the boot menu)
#                                         .\install-windows.ps1 -Remove    (take it out again)
# Needs: UEFI boot, Secure Boot OFF, BitLocker OFF on C:, 1.5 GB free on C:.
param([switch]$Remove, [string]$Iso = "", [string]$IsoUrl = "https://github.com/alamarahuq-max/Butterhosting/releases/latest/download/ButterOS.iso",
      [string]$GrubUrl = "https://github.com/alamarahuq-max/Butterhosting/releases/latest/download/butter-grubx64.efi")
$ErrorActionPreference = "Stop"
function Die($m) { Write-Host "ButterOS: $m" -ForegroundColor Red; exit 1 }
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Die "open PowerShell as Administrator" }
$sb = $null; try { $sb = Confirm-SecureBootUEFI } catch { Die "this PC boots in legacy BIOS mode (or Secure Boot cannot be read); the Windows installer supports UEFI only" }
if ($sb) { Die "Secure Boot is on and ButterOS is not signed. Turn it off in the UEFI settings, then run this again." }
$bl = (manage-bde -status C: 2>$null | Out-String); if ($bl -match "Protection On") { Die "BitLocker is on for C:. ButterOS cannot read an encrypted drive. Turn BitLocker off first." }
$dir = "C:\ButterOS"; $esp = "S:"
function Mount-Esp { if (-not (Test-Path "$esp\")) { mountvol $esp /S | Out-Null }; if (-not (Test-Path "$esp\EFI")) { Die "could not open the EFI partition" } }
if ($Remove) {
  Mount-Esp
  $out = (bcdedit /enum all | Out-String); foreach ($m in [regex]::Matches($out, "identifier\s+(\{[0-9a-f-]+\})\r?\n(?:(?!identifier).*\r?\n)*?description\s+ButterOS")) { bcdedit /delete $m.Groups[1].Value | Out-Null }
  Remove-Item -Recurse -Force "$esp\EFI\ButterOS", $dir -ErrorAction SilentlyContinue; mountvol $esp /D; Write-Host "ButterOS removed."; exit 0
}
$free = (Get-PSDrive C).Free / 1MB; if ($free -lt 1500) { Die "need 1.5 GB free on C:, have $([int]$free) MB" }
if ((Get-Volume -DriveLetter C).FileSystem -ne "NTFS") { Die "C: is not NTFS" }
New-Item -ItemType Directory -Force $dir | Out-Null
if ($Iso -ne "") { Copy-Item $Iso "$dir\ButterOS.iso" -Force }
else {
  Write-Host "Downloading ButterOS (about 500 MB)..."; $ProgressPreference = "SilentlyContinue"
  try { Invoke-WebRequest $IsoUrl -OutFile "$dir\ButterOS.iso.part" } catch { Die "download failed (the repo may be private: download the ISO yourself and use -Iso)" }
  try { $sum = (Invoke-WebRequest "$IsoUrl.sha256").Content.Trim().Split(" ")[0].ToLower(); if ((Get-FileHash "$dir\ButterOS.iso.part" -Algorithm SHA256).Hash.ToLower() -ne $sum) { Remove-Item "$dir\ButterOS.iso.part"; Die "checksum does not match" } } catch [System.Net.WebException] {}
  Move-Item "$dir\ButterOS.iso.part" "$dir\ButterOS.iso" -Force
}
Mount-Esp; $e = "$esp\EFI\ButterOS"; New-Item -ItemType Directory -Force $e | Out-Null
$img = Mount-DiskImage "$dir\ButterOS.iso" -PassThru; $v = ($img | Get-Volume).DriveLetter
Copy-Item "${v}:\boot\vmlinuz-lts", "${v}:\boot\initramfs-lts" $e -Force; Dismount-DiskImage "$dir\ButterOS.iso" | Out-Null
if (-not (Test-Path "$e\vmlinuz-lts")) { Die "this ISO has no kernel" }
try { Invoke-WebRequest $GrubUrl -OutFile "$e\grubx64.efi" } catch { Die "could not download the boot loader (butter-grubx64.efi)" }
$serial = ((fsutil fsinfo ntfsinfo C: | Select-String "Serial Number").ToString() -replace ".*0x", "").Trim().ToUpper()
@"
set timeout=3
search --no-floppy --file --set=esp /EFI/ButterOS/vmlinuz-lts
menuentry "ButterOS (Minecraft hosting)" {
  linux (`$esp)/EFI/ButterOS/vmlinuz-lts butter_iso=UUID=${serial}:/ButterOS/ButterOS.iso modules=loop,squashfs,sd-mod,usb-storage quiet
  initrd (`$esp)/EFI/ButterOS/initramfs-lts
}
"@ | Set-Content -Encoding ascii "$e\grub.cfg"
$new = (bcdedit /copy "{bootmgr}" /d "ButterOS (Minecraft hosting)" | Out-String); $id = [regex]::Match($new, "\{[0-9a-f-]+\}").Value
if (-not $id) { Die "could not create the boot entry" }
bcdedit /set $id device partition=$esp | Out-Null; bcdedit /set $id path \EFI\ButterOS\grubx64.efi | Out-Null
bcdedit /set "{fwbootmgr}" displayorder $id /addlast | Out-Null
mountvol $esp /D
Write-Host "Done. Restart and pick 'ButterOS (Minecraft hosting)' in the boot menu (or the firmware's boot menu). To undo: .\install-windows.ps1 -Remove"
