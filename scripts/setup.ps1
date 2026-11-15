# First-time setup for self-hosted Laneway on Windows.
# Run it from the laneway folder in PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
# It writes .env with fresh random secrets (only if .env doesn't exist yet),
# then builds and starts Laneway with Docker Desktop.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function New-Secret([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  # URL-safe so it can sit inside the database address.
  return [Convert]::ToBase64String($buffer).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker isn't installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again."
  exit 1
}

if (Test-Path ".env") {
  Write-Host ".env already exists, keeping it."
} else {
  $content = Get-Content ".env.selfhost.example" -Raw
  $content = $content -replace "(?m)^BETTER_AUTH_SECRET=.*$", "BETTER_AUTH_SECRET=$(New-Secret 32)"
  $content = $content -replace "(?m)^POSTGRES_PASSWORD=.*$", "POSTGRES_PASSWORD=$(New-Secret 24)"
  # Windows names its time zones differently; newer .NET can translate them.
  $iana = $null
  try {
    $windowsId = (Get-TimeZone).Id
    $converted = ""
    if ([System.TimeZoneInfo]::TryConvertWindowsIdToIanaId($windowsId, [ref]$converted)) { $iana = $converted }
  } catch { }
  if ($iana) {
    $content = $content -replace "(?m)^TZ=.*$", "TZ=$iana"
  } else {
    Write-Host "Couldn't work out your time zone. Set TZ in .env (for example TZ=America/New_York) and run: docker compose up -d"
  }
  Set-Content -Path ".env" -Value $content -NoNewline
  Write-Host "Wrote .env with new secrets."
}

New-Item -ItemType Directory -Force -Path "backups" | Out-Null

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Laneway is starting. Open http://localhost:3000 and create your account."
Write-Host "For your Mac and iPhone, see the Tailscale section of SELF-HOSTING.md."
