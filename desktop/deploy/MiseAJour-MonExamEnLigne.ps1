# Met à jour MonExamEnLigne (MSI) depuis la dernière Release GitHub, silencieusement.
# À exécuter en SYSTEM (tâche planifiée « Au démarrage » ou script de démarrage GPO). Aucun droit requis côté élève.
# Usage : powershell -ExecutionPolicy Bypass -File MiseAJour-MonExamEnLigne.ps1
$Repo = "infocollegechampagneur/sysexam"
$Log = "C:\ProgramData\MonExamEnLigne\mise-a-jour.log"
New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content $Log }

# Ne jamais mettre à jour pendant un examen
if (Get-Process -Name "MonExamEnLigne" -ErrorAction SilentlyContinue) { Log "Application ouverte : report."; exit 0 }

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "MonExamEnLigne-Updater" } -TimeoutSec 30
} catch { Log "GitHub injoignable : $_"; exit 0 }
$latest = [version]($rel.tag_name -replace '^v', '')
$asset = $rel.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
if (-not $asset) { Log "Aucun .msi dans la release $($rel.tag_name)"; exit 0 }

$installed = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq "MonExamEnLigne" } | Select-Object -First 1
$current = if ($installed -and $installed.DisplayVersion) { [version]$installed.DisplayVersion } else { [version]"0.0.0" }
if ($current -ge $latest) { Log "À jour ($current)."; exit 0 }

$msi = Join-Path $env:TEMP $asset.name
Log "Mise à jour $current -> $latest : téléchargement $($asset.browser_download_url)"
try { Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $msi -UseBasicParsing -TimeoutSec 300 } catch { Log "Téléchargement échoué : $_"; exit 1 }
$p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
Remove-Item $msi -Force -ErrorAction SilentlyContinue
if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) { Log "Installé $latest (code $($p.ExitCode))." } else { Log "msiexec a échoué (code $($p.ExitCode))."; exit 1 }
