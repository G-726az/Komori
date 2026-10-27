# Builds the public installer: release\Komori-Setup-<version>.exe
# The neko stays out of the public build (it is being remade): its file is set
# aside during the build and put back afterwards, whatever happens.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$env:Path += ";$env:USERPROFILE\.cargo\bin"
$version = (Get-Content "$root\src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json).version
$neko = "$root\src\island\pet3d\pets\neko.ts"
$aside = "$root\neko.ts.release-aside"
$moved = $false
try {
  if (Test-Path $neko) { Move-Item $neko $aside; $moved = $true }
  npm run pack
  if ($LASTEXITCODE -ne 0) { throw "La compilación falló" }
} finally {
  if ($moved) { Move-Item $aside $neko -Force }
}
New-Item -ItemType Directory -Force "$root\release" | Out-Null
$built = Get-ChildItem "$root\src-tauri\target\release\bundle\nsis\*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$out = "$root\release\Komori-Setup-$version.exe"
Copy-Item $built.FullName $out -Force
$hash = (Get-FileHash $out -Algorithm SHA256).Hash
"Instalador listo: $out"
"SHA-256: $hash"
