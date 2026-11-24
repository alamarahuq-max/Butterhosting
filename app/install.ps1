# Butter app installer for Windows. Installs Node.js and Docker Desktop if they are missing, downloads Butter, adds the `butter` command.
#   irm https://raw.githubusercontent.com/alamarahuq-max/Butterhosting/main/app/install.ps1 | iex
# Options (set before the command):  $env:BUTTER_NODOCKER='1'   $env:BUTTER_SRC='C:\path\to\checkout'
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Say($m) { Write-Host 'butter ' -NoNewline -ForegroundColor Yellow; Write-Host $m }
function Have($n) { return [bool](Get-Command $n -ErrorAction SilentlyContinue) }
function RefreshPath() { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

$Base = Join-Path $env:LOCALAPPDATA 'Butter'
$AppDir = Join-Path $Base 'app'
$BinDir = Join-Path $Base 'bin'
New-Item -ItemType Directory -Force -Path $Base, $BinDir | Out-Null

# ---------- Node.js ----------
function NodeOk() {
  if (-not (Have 'node')) { return $false }
  $v = (& node -p "process.versions.node.split('.')[0]") 2>$null
  return ([int]$v -ge 18)
}
if (-not (NodeOk)) {
  Say 'Node.js 18 or newer is missing. Installing it with winget.'
  if (-not (Have 'winget')) { throw 'winget is not available. Install Node.js LTS from https://nodejs.org and run this again.' }
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  RefreshPath
  if (-not (NodeOk)) { throw 'Node.js was installed, but this window cannot see it yet. Open a new PowerShell window and run the command again.' }
}
Say ('Node.js ' + (& node -v) + ' ok')

# ---------- files ----------
Say "Installing Butter into $AppDir"
$Tmp = Join-Path $env:TEMP ('butter-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
$Src = $null
if ($env:BUTTER_SRC) {
  $Src = $env:BUTTER_SRC
} else {
  $zip = Join-Path $Tmp 'butter.zip'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/alamarahuq-max/Butterhosting/archive/refs/heads/main.zip' -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $Tmp -Force
  $Src = (Get-ChildItem -Path $Tmp -Directory -Filter 'Butterhosting-*' | Select-Object -First 1).FullName
}
if (-not (Test-Path (Join-Path $Src 'app'))) { throw 'The download did not contain the Butter app files.' }
if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir 'os') | Out-Null
Copy-Item -Recurse -Force (Join-Path $Src 'app') (Join-Path $AppDir 'app')
Copy-Item -Recurse -Force (Join-Path $Src 'os\web') (Join-Path $AppDir 'os\web')
Copy-Item -Recurse -Force (Join-Path $Src 'os\tui') (Join-Path $AppDir 'os\tui')
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $AppDir 'os\web\cgi-bin')
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Tmp

$cmd = '@echo off' + "`r`n" + 'node "' + (Join-Path $AppDir 'app\bin\butter') + '" %*' + "`r`n"
Set-Content -Path (Join-Path $BinDir 'butter.cmd') -Value $cmd -Encoding ASCII
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $BinDir) {
  [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $BinDir), 'User')
  Say 'Added the butter command to your PATH. Open a new window to use it everywhere.'
}
$env:Path = $env:Path + ';' + $BinDir

# ---------- Docker Desktop ----------
$dockerOk = $false
if (Have 'docker') { & docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerOk = $true } }
if ($env:BUTTER_NODOCKER) {
  Say 'Skipping Docker. Servers cannot run until Docker works.'
} elseif ($dockerOk) {
  Say 'Docker ok'
} elseif (Have 'docker') {
  Say 'Docker is installed but not running. Open Docker Desktop and wait until it says it is running.'
} else {
  Say 'Docker Desktop is missing. Butter runs every Minecraft server inside Docker.'
  Say 'Windows needs virtualization turned on in the BIOS and the WSL 2 feature. Docker Desktop sets WSL 2 up for you, and Windows may ask for a restart.'
  if (-not (Have 'winget')) { Say 'winget is not available. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run: butter setup' }
  else {
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Say 'Docker Desktop is installed. Open it once, accept its terms, wait until it says it is running (restart Windows if it asks), then run: butter setup'
  }
}
Write-Host ''
if ($dockerOk -or $env:BUTTER_NODOCKER) { Say 'Installed. Starting setup. Later, just run: butter   (web page: butter web)'; & (Join-Path $BinDir 'butter.cmd') setup }
else { Say 'Installed. When Docker is running, run: butter setup   (later just: butter)' }
