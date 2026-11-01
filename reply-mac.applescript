-- LLM Deck (macOS): open a session link, make sure its app is in front, type a preset reply and send it.
-- Arguments: link, app name, reply text. Needs Accessibility permission (System Settings > Privacy & Security).
on run argv
	set theUrl to item 1 of argv
	set appName to item 2 of argv
	set msg to item 3 of argv
	open location theUrl
	delay 2.5
	tell application "System Events"
		set frontName to name of first application process whose frontmost is true
		if frontName is not appName and not (appName is "Codex" and frontName is "ChatGPT") then return "not-front"
		keystroke msg
		delay 0.2
		key code 36
	end tell
	return "ok"
end run
