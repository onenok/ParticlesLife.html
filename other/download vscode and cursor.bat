start "Chrome.exe" "https://code.visualstudio.com/docs/?dv=win64user"
start "Chrome.exe" "www.cursor.com"
Powershell.exe "Start-Sleep -Seconds 5; $wshell = New-Object -ComObject wscript.shell; for ($i=1; $i -le 10; $i++) { $wshell.SendKeys('{TAB}') }; $wshell.SendKeys('{ENTER}')"