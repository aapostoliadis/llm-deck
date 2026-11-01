' Claude Deck: start the watchdog (which starts and guards the server), then open the dashboard.
Set sh = CreateObject("WScript.Shell")
deck = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\.claude-deck"
sh.CurrentDirectory = deck
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & deck & "\watchdog.ps1""", 0, False
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & deck & "\open-deck.ps1""", 0, False
