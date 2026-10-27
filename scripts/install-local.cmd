@echo off
rem Installs the freshly built Komori for the current user and starts it.
rem Launched through explorer.exe so it runs outside any app sandbox.
taskkill /IM komori.exe /F >nul 2>&1
ping -n 2 127.0.0.1 >nul
"%~dp0..\src-tauri\target\release\bundle\nsis\Komori_0.1.0_x64-setup.exe" /S
start "" "%LOCALAPPDATA%\Komori\komori.exe"
echo %date% %time% > "%~dp0install-local.done"
