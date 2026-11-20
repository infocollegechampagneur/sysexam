# Crée la tâche planifiée qui met à jour MonExamEnLigne automatiquement (au démarrage + tous les jours à 7 h 15).
# À exécuter UNE fois en administrateur sur chaque poste, ou via GPO (script de démarrage) :
#   powershell -ExecutionPolicy Bypass -File Installer-TachePlanifiee.ps1
$Dest = "C:\ProgramData\MonExamEnLigne"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item (Join-Path $PSScriptRoot "MiseAJour-MonExamEnLigne.ps1") (Join-Path $Dest "MiseAJour-MonExamEnLigne.ps1") -Force
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Dest\MiseAJour-MonExamEnLigne.ps1`""
$triggers = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Daily -At 7:15am))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName "MonExamEnLigne - Mise à jour" -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName "MonExamEnLigne - Mise à jour"
Write-Host "Tâche planifiée créée. Journal : $Dest\mise-a-jour.log"
