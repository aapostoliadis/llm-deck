# Claude Deck watchdog: keeps the server running. Checks every 15 seconds and restarts it if it
# has stopped, or if it has stopped answering for more than 90 seconds. Only one copy runs at a time.
param([int]$Interval = 15)
$deck = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = 'C:\Program Files\nodejs\node.exe'
$log = Join-Path $deck 'watchdog.log'
$others = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*watchdog.ps1*' -and $_.ProcessId -ne $PID }
if ($others) { exit }

function Start-Server($why) {
  Start-Process -FilePath $node -ArgumentList "`"$deck\server.js`"" -WorkingDirectory $deck -WindowStyle Hidden
  Add-Content $log ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $why)
}

$badSince = $null
while ($true) {
  $ok = $false
  try { Invoke-WebRequest 'http://localhost:7777/api/state' -UseBasicParsing -TimeoutSec 20 | Out-Null; $ok = $true } catch {}
  if ($ok) { $badSince = $null }
  else {
    $running = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*claude-deck*server.js*' })
    if (-not $running.Count) { Start-Server 'server was not running, started it'; $badSince = $null }
    else {
      if (-not $badSince) { $badSince = Get-Date }
      elseif (((Get-Date) - $badSince).TotalSeconds -gt 90) {
        $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep 1; Start-Server 'server stopped answering, restarted it'; $badSince = $null
      }
    }
  }
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 200KB) { Get-Content $log -Tail 200 | Set-Content $log }
  Start-Sleep $Interval
}
