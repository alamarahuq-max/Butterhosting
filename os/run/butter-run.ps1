# ButterOS in one command (Windows). No dual-boot, no reboot: downloads ButterOS once, runs it as a small
# virtual machine, creates a Minecraft server and prints how to join.
#   irm https://raw.githubusercontent.com/alamarahuq-max/Butterhosting/main/os/run/butter-run.ps1 | iex
# Options (set before the command, e.g.  $env:BUTTER_FLAVOR='vanilla'; $env:BUTTER_VERSION='1.16.5'; irm ... | iex):
#   BUTTER_NAME, BUTTER_FLAVOR (paper|vanilla|fabric|forge), BUTTER_VERSION, BUTTER_MEM (server MB), BUTTER_RAM (VM MB),
#   BUTTER_NOPERSIST=1, BUTTER_NOSHARE=1, BUTTER_WINDOW=1, BUTTER_ISO=<file>
$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'
function Say($m) { Write-Host "ButterOS " -NoNewline -ForegroundColor Yellow; Write-Host $m }
function Die($m) { Write-Host "ButterOS ERROR: $m" -ForegroundColor Red; throw $m }
function Opt($n, $d) { $v = [Environment]::GetEnvironmentVariable($n); if ($v) { $v } else { $d } }
$Repo = 'alamarahuq-max/Butterhosting'
$IsoUrl = Opt 'BUTTER_ISO_URL' "https://github.com/$Repo/releases/download/latest-iso/ButterOS.iso"
$Dir = Join-Path $env:LOCALAPPDATA 'ButterOS'; New-Item -ItemType Directory -Force $Dir | Out-Null
$Name = Opt 'BUTTER_NAME' 'minecraft'; $Flavor = Opt 'BUTTER_FLAVOR' 'paper'; $Ver = Opt 'BUTTER_VERSION' 'LATEST'
$Mem = Opt 'BUTTER_MEM' '1536'; $VmRam = Opt 'BUTTER_RAM' '4096'
$Persist = -not (Opt 'BUTTER_NOPERSIST' ''); $Share = if (Opt 'BUTTER_NOSHARE' '') { 'none' } else { 'internet' }
$HPort = [int](Opt 'BUTTER_WEB_PORT' '8080'); $MPort = [int](Opt 'BUTTER_MC_PORT' '25565'); $BPort = [int](Opt 'BUTTER_BEDROCK_PORT' '19132')

# 1) QEMU
function Find-Qemu {
  $c = Get-Command qemu-system-x86_64.exe -ErrorAction SilentlyContinue; if ($c) { return Split-Path $c.Source }
  foreach ($p in "$env:ProgramFiles\qemu", "${env:ProgramFiles(x86)}\qemu", "$env:LOCALAPPDATA\Programs\qemu") { if (Test-Path "$p\qemu-system-x86_64.exe") { return $p } }
  return $null
}
$Q = Find-Qemu
if (-not $Q) {
  Say 'QEMU (the program that runs the virtual machine) is missing. Installing it with winget (accept the prompt).'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Die 'Install QEMU from https://www.qemu.org/download/#windows and run this again.' }
  winget install -e --id SoftwareFreedomConservancy.QEMU --accept-package-agreements --accept-source-agreements
  $Q = Find-Qemu; if (-not $Q) { Die 'QEMU did not install. Install it from https://www.qemu.org/download/#windows and run this again.' }
}

# 2) the ISO
$Iso = Opt 'BUTTER_ISO' ''
if (-not $Iso) {
  $Iso = Join-Path $Dir 'ButterOS.iso'; $ShaFile = "$Iso.sha256"
  $new = $null; try { $new = (Invoke-WebRequest -UseBasicParsing "$IsoUrl.sha256").Content } catch { if (-not (Test-Path $Iso)) { Die "Could not reach $IsoUrl (no internet?)" } }
  if ($new) { $new = if ($new -is [byte[]]) { [Text.Encoding]::ASCII.GetString($new) } else { "$new" } }
  $old = if (Test-Path $ShaFile) { Get-Content $ShaFile -Raw } else { '' }
  if ($new -and ((-not (Test-Path $Iso)) -or ($new.Trim() -ne $old.Trim()))) {
    Say 'Downloading ButterOS (about 600 MB, once)'
    & curl.exe -fL --retry 3 -o "$Iso.part" $IsoUrl; if ($LASTEXITCODE -ne 0) { Die 'Download failed' }
    $want = ($new.Trim() -split '\s+')[0].ToLower(); $got = (Get-FileHash "$Iso.part" -Algorithm SHA256).Hash.ToLower()
    if ($want -ne $got) { Remove-Item "$Iso.part"; Die 'Checksum mismatch, download discarded' }
    Move-Item -Force "$Iso.part" $Iso; Set-Content $ShaFile $new
  } else { Say 'Using the ButterOS you already downloaded' }
}
if (-not (Test-Path $Iso)) { Die "ISO not found: $Iso" }

# 3) disk that keeps the world
$cfg = if ($Persist) { "butter;persist;auto" } else { "butter;auto" }
$cfg += ";flavor=$Flavor;ver=$Ver;mem=$Mem;name=$Name;share=$Share"
$qargs = @('-machine', 'q35', '-m', $VmRam, '-smp', '2', '-cdrom', $Iso, '-boot', 'd', '-smbios', "type=1,serial=$cfg")
if ($Persist) {
  $Disk = Join-Path $Dir 'data.qcow2'
  if (-not (Test-Path $Disk)) { & "$Q\qemu-img.exe" create -q -f qcow2 $Disk 24G | Out-Null }
  $qargs += @('-drive', "file=$Disk,if=virtio,format=qcow2")
}
$qargs += @('-netdev', "user,id=n,hostfwd=tcp::$HPort-:80,hostfwd=tcp::$MPort-:25565,hostfwd=tcp::$BPort-:19132,hostfwd=udp::$BPort-:19132", '-device', 'e1000,netdev=n',
            '-vga', 'std', '-serial', "file:$Dir\serial.log")
if (-not (Opt 'BUTTER_WINDOW' '')) { $qargs += @('-display', 'none') }
$MonPort = $HPort + 2000; $qargs += @('-monitor', "tcp:127.0.0.1:$MonPort,server,nowait")

# 4) acceleration: Windows Hypervisor Platform if it is on, otherwise slow software mode
$started = $null
foreach ($accel in @('whpx,kernel-irqchip=off', 'tcg')) {
  $cpu = if ($accel -like 'whpx*') { 'qemu64' } else { 'max' }
  $logf = Join-Path $Dir 'qemu.err'
  $p = Start-Process -FilePath "$Q\qemu-system-x86_64.exe" -ArgumentList ($qargs + @('-accel', $accel, '-cpu', $cpu)) -PassThru -WindowStyle Hidden -RedirectStandardError $logf
  Start-Sleep 6
  if (-not $p.HasExited) { $started = $p; Say "Starting ButterOS ($($accel.Split(',')[0]), $VmRam MB RAM). First boot takes about a minute."; if ($accel -eq 'tcg') { Say 'No hardware acceleration: turn on "Windows Hypervisor Platform" in Windows Features for much better speed. It works, but the first start can take 10+ minutes.' }; break }
}
if (-not $started) { Die "QEMU would not start: $(Get-Content $logf -Raw)" }

function Api($q) { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 "http://127.0.0.1:$HPort/cgi-bin/api?$q").Content } catch { '' } }
function Stop-Vm {
  Say 'Stopping the server and saving the world...'
  try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', $MonPort); $s = $c.GetStream(); $b = [Text.Encoding]::ASCII.GetBytes("system_powerdown`n"); $s.Write($b, 0, $b.Length); Start-Sleep 1; $c.Close() } catch {}
  for ($i = 0; $i -lt 30 -and -not $started.HasExited; $i++) { Start-Sleep 1 }
  if (-not $started.HasExited) { $started.Kill() }
  Say 'Stopped.'
}
try {
  Say 'Waiting for ButterOS to come up...'
  $t0 = Get-Date; $up = $false
  while (-not $started.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 900) { if ((Api 'a=ping') -match '"ok":true') { $up = $true; break }; Start-Sleep 3 }
  if (-not $up) { Die "ButterOS did not start (see $Dir\serial.log)" }
  Say 'ButterOS is running. Creating your server (the first run downloads about 500 MB inside it)...'
  $ready = $false; $last = ''
  while (-not $started.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt 2400) {
    $lg = Api "a=logs&n=$Name"
    if ($lg -match 'Done \(') { $ready = $true; break }
    $m = [regex]::Matches($lg, '[^\\]{3,110}'); if ($m.Count) { $l = $m[$m.Count - 1].Value; if ($l -ne $last) { Write-Host "  $l"; $last = $l } }
    Start-Sleep 5
  }
  if (-not $ready) { Die "The server did not finish starting. Look at $Dir\serial.log" }
  $join = ''
  for ($i = 0; $i -lt 12 -and $Share -ne 'none'; $i++) {
    $st = Api 'a=status'; if ($st -match '"name":"' + [regex]::Escape($Name) + '"[^}]*"join":"([^"]+)"' -or $st -match '"join":"([^"]+)"[^}]*"name":"' + [regex]::Escape($Name) + '"') { $join = $Matches[1]; break }
    Start-Sleep 5
  }
  $lan = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
  Write-Host ''; Write-Host 'Your server is running.' -ForegroundColor Yellow
  Write-Host "  Java, this PC:        localhost:$MPort" -ForegroundColor Cyan
  if ($lan) { Write-Host "  Java, same Wi-Fi:     ${lan}:$MPort" -ForegroundColor Cyan }
  if ($join) { Write-Host "  Java, from anywhere:  $join   (free link, works while this window stays open)" -ForegroundColor Cyan }
  Write-Host "  Phones / Bedrock:     $(if ($lan) { $lan } else { "this PC's address" })  port $BPort" -ForegroundColor Cyan
  Write-Host "  Manage it (web page): http://localhost:$HPort" -ForegroundColor Cyan
  if ($Persist) { Write-Host "  Your world is saved in $Dir" }
  Write-Host ''; Say 'Press Ctrl+C or close this window to stop the server.'
  while (-not $started.HasExited) { Start-Sleep 2 }
} finally { if (-not $started.HasExited) { Stop-Vm } }
