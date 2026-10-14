Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = ScriptDir
WshShell.Run "cmd /c node server.js > vbs_error.log 2>&1", 0
Set WshShell = Nothing
Set FSO = Nothing
