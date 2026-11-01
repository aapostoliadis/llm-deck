# Claude Deck: bring a desktop app to the front, or start it if closed.
# Usage: focus-app.ps1 -Proc '^claude$' -Package 'Claude'
param([string]$Proc, [string]$Package)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DeckWin {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
}
"@
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match $Proc } | Select-Object -First 1
if ($p) {
  $h = $p.MainWindowHandle
  if ([DeckWin]::IsIconic($h)) { [DeckWin]::ShowWindow($h, 9) | Out-Null }
  (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null
  [DeckWin]::SwitchToThisWindow($h, $true); [DeckWin]::SetForegroundWindow($h) | Out-Null
  exit
}
$pkg = Get-AppxPackage -Name $Package | Select-Object -First 1
if ($pkg) {
  $id = (Get-AppxPackageManifest $pkg).Package.Applications.Application | Select-Object -First 1 -ExpandProperty Id
  Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!$id"
}