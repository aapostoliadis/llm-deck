# Claude Deck: send a quick reply into a Claude or ChatGPT conversation.
# Opens the conversation (by chat title, or after a deep link already opened it), checks the app
# window is really in front, types into its message box and presses Enter. -DryRun types, checks, then clears.
param([ValidateSet('claude', 'chatgpt')][string]$App, [string]$Title = '', [string]$Text, [int]$WaitMs = 0, [switch]$DryRun)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DeckReply {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
if (-not $Text) { exit 4 }
$deck = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($Title) { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $deck 'focus-chat.ps1') -App $App -Title $Title; Start-Sleep -Milliseconds 1500 }
elseif ($WaitMs -gt 0) { Start-Sleep -Milliseconds $WaitMs }

$rx = if ($App -eq 'claude') { '^claude$' } else { '^ChatGPT$' }
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match $rx } | Select-Object -First 1
if (-not $p) { exit 1 }
$h = $p.MainWindowHandle
if ([DeckReply]::IsIconic($h)) { [DeckReply]::ShowWindow($h, 9) | Out-Null }
[DeckReply]::SwitchToThisWindow($h, $true); [DeckReply]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 400

$A = [System.Windows.Automation.AutomationElement]
$cond = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
$box = $null
foreach ($e in $A::FromHandle($h).FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
  $c = $e.Current
  if ($c.ClassName -match 'ProseMirror' -and $c.Name -match '(?i)prompt|ask|message|reply' -and -not $c.IsOffscreen) { $box = $e }
}
if (-not $box) { exit 2 }
$box.SetFocus(); Start-Sleep -Milliseconds 300
if ([DeckReply]::GetForegroundWindow() -ne $h) { exit 3 }   # never type into the wrong window

$escaped = ($Text -replace '([+^%~(){}\[\]])', '{$1}')
$ws = New-Object -ComObject WScript.Shell
$ws.SendKeys($escaped); Start-Sleep -Milliseconds 300
$vp = $null; $now = ''
if ($box.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) { $now = $vp.Current.Value }
if ($DryRun) {
  "typed ok: " + ($now -like "*$Text*")
  $ws.SendKeys('^a'); Start-Sleep -Milliseconds 100; $ws.SendKeys('{DEL}')
  exit 0
}
if ($now -and $now -notlike "*$Text*") { $ws.SendKeys('^a'); $ws.SendKeys('{DEL}'); exit 5 }
$ws.SendKeys('{ENTER}')
exit 0
