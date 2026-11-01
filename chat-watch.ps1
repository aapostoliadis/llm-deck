# Claude Deck: reads the Claude and ChatGPT desktop app sidebars via UI Automation
# and writes ~/.claude-deck/apps.json every few seconds.
param([int]$ParentPid = 0, [int]$Interval = 5, [switch]$Once)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$out = Join-Path $env:USERPROFILE '.claude-deck\apps.json'
$A = [System.Windows.Automation.AutomationElement]
$CT = [System.Windows.Automation.ControlType]
$cond = New-Object System.Windows.Automation.OrCondition(
  (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $CT::Button)),
  (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $CT::ListItem)))

function Get-Win($rx) { Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match $rx } | Select-Object -First 1 }
function Get-Items($p) {
  $root = $A::FromHandle($p.MainWindowHandle)
  $els = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
  foreach ($e in $els) {
    try {
      $isLi = $e.Current.ControlType -eq $CT::ListItem
      $sel = $false
      if ($isLi) { $sp = $null; if ($e.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$sp)) { $sel = $sp.Current.IsSelected } }
      [pscustomobject]@{ li = $isLi; n = [string]$e.Current.Name; sel = $sel }
    } catch {}
  }
}

function Has-Composer($p) {
  $c = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $CT::Edit)
  foreach ($e in $A::FromHandle($p.MainWindowHandle).FindAll([System.Windows.Automation.TreeScope]::Descendants, $c)) { if ($e.Current.ClassName -match 'ProseMirror') { return $true } }
  return $false
}

function Read-Claude {
  $p = Get-Win '^claude$'
  if (-not $p) { return @{ open = $false } }
  $b = @(Get-Items $p | Where-Object { -not $_.li } | ForEach-Object n)
  $current = ''; $generating = $false; $waiting = $false
  $chats = [ordered]@{}
  for ($i = 0; $i -lt $b.Count; $i++) {
    $n = $b[$i]; if (-not $n) { continue }
    if ($n -match '^(.+), rename chat$') { $current = $Matches[1]; continue }
    if ($n -eq 'Stop response') { $generating = $true; continue }
    if ($n -match '^(Allow once|Always allow|Allow for this chat|Approve|Deny)$') { $waiting = $true; continue }
    if ($n -match '^Mark as read (.+?) (\d+) new$') {
      $t = $Matches[1]; $c = [int]$Matches[2]
      if (-not $chats.Contains($t)) { $chats[$t] = @{ title = $t; status = 'unread'; unread = $c } } else { $chats[$t].status = 'unread'; $chats[$t].unread = $c }
      continue
    }
    if ($n -match '^More options for (.+)$') {
      $t = $Matches[1]; $status = ''; $isProject = $false
      for ($k = $i - 1; $k -ge [math]::Max(0, $i - 3); $k--) {
        $m = $b[$k]
        if ($m -eq "Toggle chats for $t") { $isProject = $true; break }
        if ($m -like "* $t" -and $m -notlike 'Mark as*') { $status = $m.Substring(0, $m.Length - $t.Length - 1); break }
        if ($m -eq $t) { break }
      }
      if ($isProject) { continue }
      if (-not $chats.Contains($t)) { $chats[$t] = @{ title = $t; status = $(if ($status) { $status } else { 'Idle' }); unread = 0 } }
      elseif ($chats[$t].status -ne 'unread' -and $status) { $chats[$t].status = $status }
    }
  }
  return @{ open = $true; current = $current; generating = $generating; waiting = $waiting; composer = (Has-Composer $p); chats = @($chats.Values) }
}

function Read-ChatGPT {
  $p = Get-Win '^ChatGPT$'
  if (-not $p) { return @{ open = $false } }
  $items = @(Get-Items $p)
  $btn = @($items | Where-Object { -not $_.li } | ForEach-Object n)
  $unread = @{}; $current = ''
  foreach ($it in $items) {
    if (-not $it.li) { continue }
    if ($it.n -like 'Unread*') { $unread[$it.n.Substring(6)] = 1 }
    if ($it.sel) { $current = ($it.n -replace '^Unread', '') }
  }
  $docCond = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $CT::Document)
  $doc = $A::FromHandle($p.MainWindowHandle).FindFirst([System.Windows.Automation.TreeScope]::Descendants, $docCond)
  if ($doc -and $doc.Current.Name -and $doc.Current.Name -ne 'ChatGPT') { $current = $doc.Current.Name }
  $generating = [bool]($btn | Where-Object { $_ -match '^Stop( streaming| generating| response)?$' })
  $waiting = [bool]($btn | Where-Object { $_ -match '^(Approve|Allow|Confirm|Continue generating)$' })
  $chats = [ordered]@{}
  for ($i = 0; $i -lt $btn.Count - 1; $i++) {
    $n = $btn[$i]; if (-not $n) { continue }
    $pinned = $btn[$i + 1] -eq 'Unpin chat'
    $isChat = $btn[$i + 1] -eq 'Chat actions' -or ($pinned -and $i + 2 -lt $btn.Count -and $btn[$i + 2] -eq 'Chat actions')
    if (-not $isChat -or $chats.Contains($n) -or $n -in 'Unpin chat','Pin chat','Chat actions') { continue }
    $chats[$n] = @{ title = $n; status = $(if ($unread.ContainsKey($n)) { 'unread' } else { 'Idle' }); unread = 0; pinned = $pinned }
  }
  return @{ open = $true; current = $current; generating = $generating; waiting = $waiting; composer = (Has-Composer $p); chats = @($chats.Values) }
}

while ($true) {
  if ($ParentPid -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
  $state = @{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  try { $state.claude = Read-Claude } catch { $state.claude = @{ open = $false; error = $_.Exception.Message } }
  try { $state.chatgpt = Read-ChatGPT } catch { $state.chatgpt = @{ open = $false; error = $_.Exception.Message } }
  $json = $state | ConvertTo-Json -Depth 6 -Compress
  [System.IO.File]::WriteAllText("$out.tmp", $json, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item "$out.tmp" $out -Force
  if ($Once) { break }
  Start-Sleep -Seconds $Interval
}
