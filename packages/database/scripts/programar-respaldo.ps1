# ============================================================
# Programa el respaldo diario de la base en el Programador de tareas de
# Windows (servidor local). Ejecutar UNA vez en PowerShell, en la raíz del
# proyecto:
#   powershell -ExecutionPolicy Bypass -File packages\database\scripts\programar-respaldo.ps1
# Opcional: -Hora "23:30" -Carpeta "D:\OneDrive\Respaldos POS"
# Para quitarlo:  Unregister-ScheduledTask -TaskName "Respaldo POS" -Confirm:$false
# ============================================================
param(
  [string]$Hora = "23:30",
  [string]$Carpeta = ""
)

$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$entorno = if ($Carpeta) { "set RESPALDOS_DIR=$Carpeta&& " } else { "" }
$accion = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c cd /d `"$raiz`" && (if not exist backups mkdir backups) && $entorno`"$npm`" run db:respaldo >> backups\respaldo.log 2>&1"
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName "Respaldo POS" -Action $accion -Trigger $disparador -Settings $ajustes `
  -Description "Respaldo diario de la base de datos del punto de venta (npm run db:respaldo)" -Force | Out-Null
Write-Host "Listo: el respaldo se hará todos los días a las $Hora. Registro en backups\respaldo.log"
