# Met à jour MonExamEnLigne (MSI) silencieusement, sans droits pour l'élève.
# Source 1 : le serveur de l'école (version publiée par l'admin dans Comptes → Postes). Source 2 (secours) : Releases GitHub.
# À exécuter en SYSTEM (tâche planifiée créée par Installer-TachePlanifiee.ps1, ou script de démarrage GPO).
$ApiBase = "https://api-examen.champagneur.qc.ca"
$Repo = "infocollegechampagneur/sysexam"
$Log = "C:\ProgramData\MonExamEnLigne\mise-a-jour.log"
New-Item -ItemType Directory -Force -Path (Split-Path $Log) | Out-Null
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content $Log }

if (Get-Process -Name "MonExamEnLigne" -ErrorAction SilentlyContinue) { Log "Application ouverte : report."; exit 0 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$H = @{ "User-Agent" = "MonExamEnLigne-Updater" }

$latest = $null; $url = $null; $name = $null; $source = $null
try {
  $r = Invoke-RestMethod -Uri "$ApiBase/api/desktop/latest" -Headers $H -TimeoutSec 20
  if ($r.kind -eq "msi") { $latest = [version]$r.version; $url = "$ApiBase$($r.url)"; $name = $r.filename; $source = "serveur école" }
} catch { Log "Serveur école : aucune version publiée ($($_.Exception.Message))" }
if (-not $latest) {
  try {
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $H -TimeoutSec 30
    $asset = $rel.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
    if ($asset) { $latest = [version]($rel.tag_name -replace '^v', ''); $url = $asset.browser_download_url; $name = $asset.name; $source = "GitHub" }
  } catch { Log "GitHub injoignable : $($_.Exception.Message)" }
}
if (-not $latest) { Log "Aucune source disponible."; exit 0 }

$installed = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq "MonExamEnLigne" } | Select-Object -First 1
$current = if ($installed -and $installed.DisplayVersion) { [version]$installed.DisplayVersion } else { [version]"0.0.0" }
if ($current -ge $latest) { Log "À jour ($current, source $source)."; exit 0 }

$msi = Join-Path $env:TEMP $name
Log "Mise à jour $current -> $latest depuis $source : $url"
try { Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -Headers $H -TimeoutSec 600 } catch { Log "Téléchargement échoué : $($_.Exception.Message)"; exit 1 }
$p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
Remove-Item $msi -Force -ErrorAction SilentlyContinue
if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) { Log "Installé $latest (code $($p.ExitCode))." } else { Log "msiexec a échoué (code $($p.ExitCode))."; exit 1 }
