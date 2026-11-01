# Claude Deck: bring the Claude or ChatGPT desktop app forward and open one chat.
param([ValidateSet('claude', 'chatgpt')][string]$App, [string]$Title)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DeckWin2 {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
}
"@
$rx = if ($App -eq 'claude') { '^claude$' } else { '^ChatGPT$' }
$pkgName = if ($App -eq 'claude') { 'Claude' } else { 'OpenAI.ChatGPT-Desktop' }

$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match $rx } | Select-Object -First 1
if (-not $p) {
  $pkg = Get-AppxPackage -Name $pkgName | Select-Object -First 1
  if ($pkg) {
    $id = (Get-AppxPackageManifest $pkg).Package.Applications.Application | Select-Object -First 1 -ExpandProperty Id
    Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!$id"
  }
  for ($i = 0; $i -lt 20 -and -not $p; $i++) { Start-Sleep -Milliseconds 500; $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match $rx } | Select-Object -First 1 }
  if (-not $p) { exit 1 }
  Start-Sleep -Seconds 2
}
$h = $p.MainWindowHandle
if ([DeckWin2]::IsIconic($h)) { [DeckWin2]::ShowWindow($h, 9) | Out-Null }
(New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null
[DeckWin2]::SwitchToThisWindow($h, $true); [DeckWin2]::SetForegroundWindow($h) | Out-Null
if (-not $Title) { exit 0 }

$A = [System.Windows.Automation.AutomationElement]
$CT = [System.Windows.Automation.ControlType]
$root = $A::FromHandle($h)
$cond = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $CT::Button)
$target = $null
foreach ($e in $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
  $n = [string]$e.Current.Name
  if ($App -eq 'claude') {
    if ($n -like 'More options for*' -or $n -like 'Mark as*' -or $n -like '*, rename chat' -or $n -like 'Toggle chats*') { continue }
    if ($n -eq $Title -or $n -like "* $Title") { $target = $e; break }
  } else {
    if ($n -eq $Title) { $target = $e; break }
  }
}
if (-not $target) { exit 2 }
try { $target.ScrollIntoView() } catch {}
$ip = $null
if ($target.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$ip)) { $ip.Invoke(); Start-Sleep -Milliseconds 400; [DeckWin2]::SwitchToThisWindow($h, $true); [DeckWin2]::SetForegroundWindow($h) | Out-Null; exit 0 }
exit 3