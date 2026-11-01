# Claude Deck: open the dashboard full screen on the touch display (F11 toggles full screen).
# Picks the smaller screen when more than one is connected, otherwise opens a normal app window.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DeckDpi {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int v);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT p, uint f);
  [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr m, int t, out uint x, out uint y);
}
"@
try { [DeckDpi]::SetProcessDpiAwareness(2) | Out-Null } catch {}
Add-Type -AssemblyName System.Windows.Forms

function Get-Scale($b) {
  # Windows 'Text size' also scales Edge windows
  $tsf = 1.0; try { $v = (Get-ItemProperty 'HKCU:\Software\Microsoft\Accessibility' -Name TextScaleFactor -ErrorAction Stop).TextScaleFactor; if ($v) { $tsf = $v / 100.0 } } catch {}
  try {
    $pt = New-Object DeckDpi+POINT; $pt.X = $b.X + [int]($b.Width / 2); $pt.Y = $b.Y + [int]($b.Height / 2)
    $m = [DeckDpi]::MonitorFromPoint($pt, 2); $dx = 0; $dy = 0
    if ([DeckDpi]::GetDpiForMonitor($m, 0, [ref]$dx, [ref]$dy) -eq 0 -and $dx -gt 0) { return ($dx / 96.0) * $tsf }
  } catch {}
  return $tsf
}

$url = 'http://localhost:7777'
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3 | Out-Null; break } catch { Start-Sleep 2 }
}
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Start-Process $url; exit }
$profileDir = Join-Path $env:USERPROFILE '.claude-deck\edge-profile'
$common = @("--user-data-dir=`"$profileDir`"", '--no-first-run', '--disable-features=Translate', '--overscroll-history-navigation=0', '--autoplay-policy=no-user-gesture-required', '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--no-default-browser-check')

$screens = @([System.Windows.Forms.Screen]::AllScreens)
$touch = if ($screens.Count -gt 1) { $screens | Sort-Object { $_.Bounds.Width * $_.Bounds.Height } | Select-Object -First 1 } else { $null }

if ($touch) {
  # Edge takes sizes in scaled units, so divide physical pixels by the display scale.
  $b = $touch.Bounds; $s = Get-Scale $b
  $w = [int]($b.Width * 0.75 / $s); $h = [int]($b.Height * 0.75 / $s)
  $x = [int](($b.X + $b.Width * 0.125) / $s); $y = [int](($b.Y + $b.Height * 0.125) / $s)
  $edgeArgs = $common + @("--window-position=$x,$y", "--window-size=$w,$h", "--app=$url", '--start-fullscreen')
} else {
  $edgeArgs = $common + @("--app=$url", '--window-size=1600,760', '--window-position=200,120')
}
Start-Process $edge -ArgumentList $edgeArgs
